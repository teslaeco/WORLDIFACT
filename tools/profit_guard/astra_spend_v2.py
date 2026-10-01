"""Cost-capped Astra output policy. Installed only by the reviewed tuner.

Keeps the same USD1.75 cap and job ledger. Completed, authenticated Responses
may release UNUSED conservative reservation; incomplete/uncertain calls never
release funds. This is an upper-cost ledger, not OpenAI invoice accounting.
"""
from contextlib import contextmanager
import fcntl
import hashlib
import os
from pathlib import Path
import re
import secrets
import time
import astra_spend as legacy

REVISION = 'astra-low-reconciled-v2'
CEILING_MICRO_USD = legacy.CEILING_MICRO_USD
VALID_UNTIL = legacy.VALID_UNTIL
MAX_INPUT = 65536
MAX_OUTPUT = 16000
# The enforced input ceiling is far below the 272K long-context threshold.
# Uncached short input + cache-write + regional uplift <= $13.75/M;
# short output + regional uplift <= $55/M. Do not change service tier.
INPUT_RATE = 14
# Verified 2026-09-30: GPT-6 Astra Standard short cached input is $1/M;
# 10% regional uplift is $1.10/M. Round UP to $2/M; do not assume hits.
# Noncached input still reserves $14/M (including possible cache writes).
# https://developers.openai.com/api/docs/models/gpt-6-astra
# https://developers.openai.com/api/docs/pricing
CACHED_INPUT_RATE = 2
CACHE_ACCOUNTING_REVISION = 'astra-confirmed-cache-v1'
OUTPUT_RATE = 55
SpendError = legacy.SpendError


def integer(value, minimum, maximum):
    return type(value) is int and minimum <= value <= maximum


def validate_state(value):
    if not isinstance(value, dict):
        raise SpendError('Invalid persistent budget.')
    if set(value) == {'revision', 'reserved', 'requests'} and value.get('revision') == legacy.REVISION:
        if not integer(value['reserved'], 0, CEILING_MICRO_USD) or not integer(value['requests'], 0, 32):
            raise SpendError('Invalid legacy budget.')
        # Never reclaim reservations made by the earlier policy.
        return {'revision': REVISION, 'legacyHeld': value['reserved'], 'requests': value['requests'], 'holds': {}}
    if set(value) != {'revision', 'legacyHeld', 'requests', 'holds'} or value.get('revision') != REVISION:
        raise SpendError('Unknown persistent budget revision.')
    if not integer(value['legacyHeld'], 0, CEILING_MICRO_USD) or not integer(value['requests'], 0, 32):
        raise SpendError('Invalid persistent budget.')
    holds = value['holds']
    if not isinstance(holds, dict) or len(holds) > value['requests'] or len(holds) > 32:
        raise SpendError('Invalid reservations.')
    ids = set()
    for token, hold in holds.items():
        if not isinstance(token, str) or not re.fullmatch('[0-9a-f]{32}', token) or not isinstance(hold, dict):
            raise SpendError('Invalid reservation identity.')
        if set(hold) not in ({'input', 'output', 'held'}, {'input', 'output', 'held', 'response'}):
            raise SpendError('Invalid reservation fields.')
        if (not integer(hold['input'], 2048, MAX_INPUT + 2048) or not integer(hold['output'], 256, MAX_OUTPUT)
                or not integer(hold['held'], 0, hold['input'] * INPUT_RATE + hold['output'] * OUTPUT_RATE)):
            raise SpendError('Invalid reserved amount.')
        if 'response' not in hold and hold['held'] != hold['input'] * INPUT_RATE + hold['output'] * OUTPUT_RATE:
            raise SpendError('Unconfirmed funds cannot be reduced.')
        if 'response' in hold:
            response = hold['response']
            if not isinstance(response, str) or not re.fullmatch('resp_[A-Za-z0-9_-]{1,190}', response) or response in ids:
                raise SpendError('Invalid completion identity.')
            ids.add(response)
    if used(value) > CEILING_MICRO_USD:
        raise SpendError('Budget exceeds the approved ceiling.')
    return value


def used(state):
    return state['legacyHeld'] + sum(hold['held'] for hold in state['holds'].values())


@contextmanager
def ledger(folder, ledger_root=None):
    root = legacy.ledger_folder(folder, ledger_root)
    fd = os.open(str(legacy.safe(root / '.worldifact-astra-spend.lock')), os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        path = root / legacy.STATE
        state = validate_state(legacy.read_json(path)) if path.exists() else {'revision': REVISION, 'legacyHeld': 0, 'requests': 0, 'holds': {}}
        yield path, state


def reserve(folder, counted_input, requested_output, now=None, ledger_root=None):
    if (time.time() if now is None else now) >= VALID_UNTIL:
        raise SpendError('Astra price review expired.')
    if not integer(counted_input, 0, MAX_INPUT) or not integer(requested_output, 1, 96000):
        raise SpendError('Unreviewed token allocation.')
    with ledger(folder, ledger_root) as (path, state):
        count = counted_input + 2048
        affordable = (CEILING_MICRO_USD - used(state) - count * INPUT_RATE) // OUTPUT_RATE
        output = min(MAX_OUTPUT, requested_output, affordable)
        if output < 256 or state['requests'] >= 32:
            raise SpendError('Astra job budget exhausted before another request.')
        token = secrets.token_hex(16)
        if token in state['holds']:
            raise SpendError('Reservation identity collision.')
        state['requests'] += 1
        state['holds'][token] = {'input': count, 'output': output, 'held': count * INPUT_RATE + output * OUTPUT_RATE}
        legacy.atomic(path, state)
        return token, output


def protect(folder, payload, headers, counter=None):
    try:
        if time.time() >= VALID_UNTIL:
            raise SpendError('Astra price review expired.')
        # Count the exact final request, including the reduced reasoning policy.
        payload['reasoning'] = {**payload.get('reasoning', {}), 'effort': 'low'}
        legacy.count_payload(payload)
        payload['store'] = False
        payload['service_tier'] = 'default'
        requested = payload.get('max_output_tokens')
        if not integer(requested, 1, 96000):
            raise SpendError('A bounded output allocation is required.')
        counted = (counter or legacy.count_tokens)(payload, headers)
        token, output = reserve(folder, counted, requested)
        payload['max_output_tokens'] = output
        return token
    except SpendError:
        raise
    except Exception:
        raise SpendError('Cost preflight failed; no model request was sent.') from None



def completed_upper_cost(usage, input_tokens, output_tokens):
    """Upper bound from authenticated completed usage; never predict a cache hit.

    Absence of the complete cache breakdown preserves the old expensive bound.
    Malformed/conflicting details retain the ORIGINAL reservation. All non-read
    tokens, including cache writes, stay at INPUT_RATE. This is not an invoice.
    https://developers.openai.com/api/docs/guides/prompt-caching
    """
    details = usage.get('input_tokens_details')
    if details is None:
        return input_tokens * INPUT_RATE + output_tokens * OUTPUT_RATE
    if not isinstance(details, dict):
        return None
    for field in ('cached_tokens', 'cache_write_tokens'):
        if field in details and not integer(details[field], 0, input_tokens):
            return None
    if 'cached_tokens' not in details or 'cache_write_tokens' not in details:
        return input_tokens * INPUT_RATE + output_tokens * OUTPUT_RATE
    cached, writes = details['cached_tokens'], details['cache_write_tokens']
    if cached + writes > input_tokens:
        return None
    return (input_tokens - cached) * INPUT_RATE + cached * CACHED_INPUT_RATE + output_tokens * OUTPUT_RATE


def settle_completed(folder, token, response, ledger_root=None):
    """Internal gateway only: response must come from the same authenticated HTTPS stream.

    Never expose this method as a public model/tool/HTTP action. Any uncertainty
    keeps the original reservation; duplicate events cannot credit it twice.
    """
    try:
        if (not isinstance(response, dict) or response.get('status') != 'completed'
                or response.get('model') != 'gpt-6-astra' or response.get('service_tier') not in (None, 'default')):
            return False
        response_id = response.get('id')
        if not isinstance(response_id, str) or not re.fullmatch('resp_[A-Za-z0-9_-]{1,190}', response_id):
            return False
        usage = response.get('usage')
        if not isinstance(usage, dict):
            return False
        input_tokens, output_tokens, total = (usage.get(key) for key in ('input_tokens', 'output_tokens', 'total_tokens'))
        if not integer(input_tokens, 0, MAX_INPUT + 2048) or not integer(output_tokens, 0, MAX_OUTPUT) or total != input_tokens + output_tokens or type(total) is not int:
            return False
        with ledger(folder, ledger_root) as (path, state):
            hold = state['holds'].get(token)
            if not hold or input_tokens > hold['input'] or output_tokens > hold['output']:
                return False
            if 'response' in hold:
                return hold['response'] == response_id
            if any(item.get('response') == response_id for item in state['holds'].values()):
                return False
            actual_upper = completed_upper_cost(usage, input_tokens, output_tokens)
            if actual_upper is None or actual_upper > hold['held']:
                return False
            hold['held'] = actual_upper
            hold['response'] = response_id
            legacy.atomic(path, state)
            return True
    except Exception:
        # A failed write or invalid response is not proof of unused funds.
        return False


def verified_health(root=None):
    try:
        source = legacy.safe(root if root is not None else Path(__file__).parent)
        proof = legacy.verified_health(source)
        receipt = legacy.read_json(source / legacy.RECEIPT)
        expected = receipt.get('outputPolicy')
        path = legacy.safe(source / 'astra_spend_v2.py')
        if (not proof or not isinstance(expected, dict) or set(expected) != {'revision', 'sha256'}
                or expected['revision'] != REVISION or path.stat().st_size > 1048576
                or hashlib.sha256(path.read_bytes()).hexdigest() != expected['sha256']):
            return {}
        return {**proof, 'astraOutputPolicy': REVISION, 'astraReasoningEffort': 'low', 'astraMaxOutputTokens': MAX_OUTPUT,
                'astraUsageSettlement': 'authenticated-completed-only',
                'astraCacheAccounting': CACHE_ACCOUNTING_REVISION}
    except Exception:
        return {}
