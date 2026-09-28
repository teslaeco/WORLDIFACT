"""ASTRA v2: reserve before work, reconcile only verified completed usage.

This original gateway module fixes high-reasoning truncation without raising
USD1.75/job. Unknown/disconnected/failed usage is never released. Short-context
rates are valid only because the exact counted input is capped at 65,536 tokens.
Reviewed 2026-09-29: developers.openai.com/api/docs/models/gpt-6-astra .
"""
import contextlib
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import tempfile
import time
import urllib.request
import uuid

REVISION = 'astra-usd175-v2'
CEILING_MICRO_USD = 1_750_000
VALID_UNTIL = 1793145600
MAX_INPUT = 65536
MAX_OUTPUT = 32768
INPUT_RATE = 14  # >= $10 * 1.25 cache write * 1.10 regional per million
OUTPUT_RATE = 55  # $50 * 1.10; reasoning is INCLUDED in output_tokens
STATE = '.worldifact-astra-spend.json'
RECEIPT = '.worldifact-astra-guard.json'
LEDGER_ROOT = Path(__file__).parent / 'state' / 'worldifact-astra-budgets'
class SpendError(RuntimeError): pass

def integer(value, maximum):
    return type(value) is int and 0 <= value <= maximum

def safe(path):
    path = Path(path).absolute()
    if any(p.is_symlink() for p in (path, *path.parents)):
        raise SpendError('Unsafe budget path.')
    return path

def read_json(path):
    fd = os.open(str(safe(path)), os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, 'rb') as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or not 1 <= info.st_size <= 65536:
            raise SpendError('Invalid persistent budget.')
        return json.loads(stream.read(65537))

def atomic(path, value):
    path = safe(path)
    fd, name = tempfile.mkstemp(prefix='.wf-budget-', dir=path.parent)
    try:
        with os.fdopen(fd, 'w') as stream:
            os.fchmod(stream.fileno(), 0o600)
            json.dump(value, stream, sort_keys=True)
            stream.flush(); os.fsync(stream.fileno())
        os.replace(name, path)
        directory = os.open(str(path.parent), os.O_RDONLY | os.O_DIRECTORY)
        try: os.fsync(directory)
        finally: os.close(directory)
    finally:
        if os.path.exists(name): os.unlink(name)

def ledger_folder(folder, ledger_root=None):
    job = safe(folder)
    if not job.is_dir(): raise SpendError('Existing job directory required.')
    root = safe(ledger_root if ledger_root is not None else LEDGER_ROOT)
    target = safe(root / hashlib.sha256(str(job.resolve(strict=True)).encode()).hexdigest())
    target.mkdir(mode=0o700, parents=True, exist_ok=True)
    return target

def validate_state(value):
    if not isinstance(value, dict): raise SpendError('Invalid persistent budget.')
    if value.get('revision') == 'astra-usd175-v1':
        if set(value) != {'revision', 'reserved', 'requests'} or not integer(value.get('reserved'), CEILING_MICRO_USD) or not integer(value.get('requests'), 32):
            raise SpendError('Invalid legacy budget; do not reset it.')
        # Every v1 reservation stays spent/held. A version upgrade cannot mint funds.
        return {'revision': REVISION, 'legacyReserved': value['reserved'], 'legacyRequests': value['requests'], 'entries': [], 'breach': False}
    if (set(value) != {'revision', 'legacyReserved', 'legacyRequests', 'entries', 'breach'} or value.get('revision') != REVISION
            or not integer(value.get('legacyReserved'), CEILING_MICRO_USD) or not integer(value.get('legacyRequests'), 32)
            or type(value.get('breach')) is not bool or not isinstance(value.get('entries'), list)
            or len(value['entries']) + value['legacyRequests'] > 32):
        raise SpendError('Invalid persistent budget; no paid request allowed.')
    ids, responses = set(), set()
    for item in value['entries']:
        if (not isinstance(item, dict) or set(item) != {'id', 'inputLimit', 'outputLimit', 'held', 'settledBound', 'responseId'}
                or not isinstance(item['id'], str) or not re.fullmatch('[0-9a-f]{32}', item['id']) or item['id'] in ids
                or not integer(item['inputLimit'], MAX_INPUT + 2048) or not integer(item['outputLimit'], MAX_OUTPUT)
                or item['outputLimit'] < 256 or item['held'] != item['inputLimit'] * INPUT_RATE + item['outputLimit'] * OUTPUT_RATE):
            raise SpendError('Invalid reservation record.')
        ids.add(item['id'])
        if item['settledBound'] is None:
            if item['responseId'] is not None: raise SpendError('Invalid reservation state.')
        else:
            if (not integer(item['settledBound'], item['held']) or not isinstance(item['responseId'], str)
                    or not re.fullmatch('resp_[A-Za-z0-9_-]{1,190}', item['responseId']) or item['responseId'] in responses):
                raise SpendError('Invalid settled reservation.')
            responses.add(item['responseId'])
    if reserved_total(value) > CEILING_MICRO_USD: raise SpendError('Persistent job ceiling exceeded.')
    return value

def reserved_total(state):
    return state['legacyReserved'] + sum(item['held'] if item['settledBound'] is None else item['settledBound'] for item in state['entries'])

@contextlib.contextmanager
def locked(folder, ledger_root=None):
    root = ledger_folder(folder, ledger_root)
    fd = os.open(str(safe(root / '.worldifact-astra-spend.lock')), os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        path = root / STATE
        state = validate_state(read_json(path)) if path.exists() else {'revision': REVISION, 'legacyReserved': 0, 'legacyRequests': 0, 'entries': [], 'breach': False}
        yield path, state

def reserve(folder, input_tokens, requested_output, now=None, ledger_root=None):
    if (time.time() if now is None else now) >= VALID_UNTIL: raise SpendError('Price review expired.')
    if not integer(input_tokens, MAX_INPUT) or not integer(requested_output, 96000) or requested_output < 1:
        raise SpendError('Token allowance outside reviewed range.')
    with locked(folder, ledger_root) as (path, state):
        if state['breach'] or len(state['entries']) + state['legacyRequests'] >= 32:
            raise SpendError('Job stopped; manual review required.')
        input_limit = input_tokens + 2048
        remaining = CEILING_MICRO_USD - reserved_total(state) - input_limit * INPUT_RATE
        output_limit = min(requested_output, MAX_OUTPUT, remaining // OUTPUT_RATE)
        if output_limit < 256: raise SpendError('ASTRA job budget exhausted before another API call.')
        reservation = {'id': uuid.uuid4().hex, 'inputLimit': input_limit, 'outputLimit': output_limit,
                       'held': input_limit * INPUT_RATE + output_limit * OUTPUT_RATE, 'settledBound': None, 'responseId': None}
        state['entries'].append(reservation); atomic(path, state)
        return reservation['id'], output_limit

def reconcile(folder, reservation_id, response, event_type, ledger_root=None):
    """Trusted gateway calls this on its authenticated provider stream, NEVER client input.
    No usage on incomplete/failed events, malformed data, or retries is refunded.
    The released difference is unused job-local reservation, not user points.
    """
    if event_type != 'response.completed' or not isinstance(response, dict): return False
    if response.get('status') != 'completed' or response.get('model') != 'gpt-6-astra' or response.get('service_tier') != 'default': return False
    rid, usage = response.get('id'), response.get('usage')
    if not isinstance(rid, str) or not re.fullmatch('resp_[A-Za-z0-9_-]{1,190}', rid) or not isinstance(usage, dict): return False
    incoming, outgoing, total = (usage.get(name) for name in ('input_tokens', 'output_tokens', 'total_tokens'))
    if not all(integer(value, 10_000_000) for value in (incoming, outgoing, total)) or total != incoming + outgoing: return False
    details = usage.get('output_tokens_details')
    if details is not None and (not isinstance(details, dict) or not integer(details.get('reasoning_tokens'), outgoing)): return False
    with locked(folder, ledger_root) as (path, state):
        record = next((item for item in state['entries'] if item['id'] == reservation_id), None)
        if record is None: return False
        amount = incoming * INPUT_RATE + outgoing * OUTPUT_RATE
        if record['settledBound'] is not None:
            return record['responseId'] == rid and record['settledBound'] == amount
        if any(item['responseId'] == rid for item in state['entries']): return False
        if incoming > record['inputLimit'] or outgoing > record['outputLimit'] or amount > record['held']:
            state['breach'] = True; atomic(path, state); return False
        record['settledBound'] = amount; record['responseId'] = rid
        atomic(path, state)
        return True

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs): return None

def check_tools(tools, depth=0):
    if depth > 8 or not isinstance(tools, list) or len(tools) > 256: raise SpendError('Unreviewed tools.')
    for tool in tools:
        if not isinstance(tool, dict): raise SpendError('Invalid tool schema.')
        if tool.get('type') == 'namespace': check_tools(tool.get('tools'), depth + 1)
        elif tool.get('type') not in ('function', 'custom'): raise SpendError('Paid hosted tools are not permitted.')

def count_payload(payload):
    if not isinstance(payload, dict) or payload.get('model') != 'gpt-6-astra': raise SpendError('Unreviewed model.')
    if any(payload.get(k) is not None for k in ('previous_response_id', 'conversation', 'prompt')) or payload.get('background'):
        raise SpendError('Hidden history or background work is not permitted.')
    if payload.get('service_tier') not in (None, 'default'): raise SpendError('Only Standard processing is reviewed.')
    check_tools(payload.get('tools', []))
    if isinstance(payload.get('input'), list):
        for item in payload['input']:
            if isinstance(item, dict) and item.get('type') == 'additional_tools': check_tools(item.get('tools', []))
    result = {k: payload[k] for k in ('model', 'instructions', 'input', 'tools', 'tool_choice', 'text', 'reasoning', 'parallel_tool_calls', 'truncation') if k in payload}
    if len(json.dumps(result).encode()) > 32 * 1024 * 1024: raise SpendError('Context exceeds reviewed size.')
    return result

def count_tokens(payload, headers):
    request = urllib.request.Request('https://api.openai.com/v1/responses/input_tokens', data=json.dumps(count_payload(payload)).encode(), headers=headers, method='POST')
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    with opener.open(request, timeout=15) as response:
        raw = response.read(16385)
        if response.status != 200 or len(raw) > 16384: raise SpendError('Token count unavailable.')
        value = json.loads(raw)
    if not isinstance(value, dict) or value.get('object') != 'response.input_tokens': raise SpendError('Invalid token count.')
    return value.get('input_tokens')

def protect(folder, payload, headers, counter=None):
    try:
        if time.time() >= VALID_UNTIL: raise SpendError('Price review expired.')
        count_payload(payload)
        requested = payload.get('max_output_tokens')
        if not integer(requested, 96000) or requested < 1: raise SpendError('Bounded output is required.')
        reasoning = payload.get('reasoning') or {}
        if not isinstance(reasoning, dict): raise SpendError('Invalid reasoning configuration.')
        # Replace the old runner's forced high effort BEFORE exact input counting.
        payload['reasoning'] = {**reasoning, 'effort': 'low'}
        payload['store'] = False; payload['service_tier'] = 'default'
        counted = (counter or count_tokens)(payload, headers)
        handle, output = reserve(folder, counted, requested)
        payload['max_output_tokens'] = output
        return handle
    except SpendError: raise
    except Exception: raise SpendError('Cost preflight failed; no generation requested.') from None

def verified_health(root=None):
    try:
        source = safe(root if root is not None else Path(__file__).parent)
        receipt = read_json(source / RECEIPT)
        if receipt.get('revision') != REVISION or time.time() >= VALID_UNTIL: return {}
        hashes = receipt.get('sha256')
        if not isinstance(hashes, dict) or set(hashes) != {'codex_runner.py', 'fast_preview.py', 'astra_spend.py'}: return {}
        for name, digest in hashes.items():
            path = safe(source / name)
            if not path.is_file() or path.stat().st_size > 1048576 or hashlib.sha256(path.read_bytes()).hexdigest() != digest: return {}
        return {'astraBudgetRevision': REVISION, 'astraBudgetMaxUsd': 1.75, 'astraBudgetPreflight': 'input-tokens',
                'astraBudgetExpiry': VALID_UNTIL, 'astraUsageSettlement': 'verified-completed-only', 'astraReasoningEffort': 'low'}
    except Exception: return {}
