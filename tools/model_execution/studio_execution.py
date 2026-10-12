"""Immutable per-job Responses model/mode and independently capped cost ledger.

Legacy Astra jobs and their pricing/receipts are untouched. Only authenticated
admission can bind a fresh job. Models cannot select a different cap or provider.
Rates include cache writes and 10% regional uplift; input stays below 272K.
Reviewed official model pages 2026-10-12. No prediction of cache discounts.
"""
from contextlib import contextmanager
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import time
import urllib.request
import astra_spend as legacy
from astra_spend_v2 import SpendError

REVISION = 'studio-execution-v1'
POLICY = 'studio-model-budget-v1'
RECEIPT = '.worldifact-studio-execution-runtime.json'
TERMS = '.worldifact-studio-execution.json'
STATE = '.worldifact-studio-execution-spend.json'
SEAL = '.worldifact-studio-execution-seal.json'
LOCK = '.worldifact-studio-execution.lock'
SOURCES = ('server.py', 'codex_runner.py', 'studio_execution.py')
MODELS = {'astra': ('gpt-6-astra', 1750000, 13750, 55000),
          'sol': ('gpt-6.1-sol', 350000, 2750, 11000),
          'luna': ('gpt-6-luna', 100000, 138, 550)}
MAX_INPUT, MAX_OUTPUT, MAX_REQUESTS = 65536, 16000, 32
UUID = re.compile(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}')

def integer(x, low, high):
    return type(x) is int and low <= x <= high

def validate(value):
    if (not isinstance(value, dict) or set(value) != {'revision', 'model', 'mode'}
            or value.get('revision') != REVISION or value.get('model') not in MODELS
            or value.get('mode') not in ('standard', 'fast')):
        raise ValueError('Invalid immutable Studio execution selection.')
    return dict(value)

def admission(data, profile):
    if 'studioExecution' not in data: return None
    terms = validate(data['studioExecution'])
    if profile != 'standard' or any(k in data for k in ('studioPricing', 'sourceJobId', 'resumeImage3d')):
        raise ValueError('Execution selection requires a fresh detailed job.')
    return terms

def root_for(folder, ledger_root=None):
    job = legacy.safe(folder)
    if not job.is_dir(): raise ValueError('Invalid job folder.')
    key = hashlib.sha256(str(job.resolve(strict=True)).encode()).hexdigest()
    return legacy.safe(Path(ledger_root if ledger_root is not None else legacy.LEDGER_ROOT) / key)

def terms_at(root, job_id):
    path = legacy.safe(Path(root) / TERMS)
    try: path.lstat()
    except FileNotFoundError:
        if any(os.path.lexists(Path(root) / name) for name in (STATE, SEAL)):
            raise ValueError('Model ledger lost its immutable terms.')
        return None
    value = legacy.read_json(path)
    if not isinstance(value, dict) or set(value) != {'jobId', 'execution'} or value['jobId'] != job_id:
        raise ValueError('Invalid job model binding.')
    return validate(value['execution'])

def job_terms(folder, ledger_root=None):
    return terms_at(root_for(folder, ledger_root), Path(folder).name)

def model_for(folder):
    terms = job_terms(folder)
    return MODELS[terms['model']][0] if terms else 'gpt-6-astra'

def same_terms(folder, terms, ledger_root=None):
    try: return job_terms(folder, ledger_root) == terms
    except Exception: return False

def bind(folder, terms, ledger_root=None):
    if terms is None:
        if job_terms(folder, ledger_root) is not None: raise ValueError('Model binding cannot be removed.')
        return
    terms = validate(terms)
    if not UUID.fullmatch(Path(folder).name): raise ValueError('Invalid job identity.')
    root = legacy.ledger_folder(folder, ledger_root)
    # Shares the historical admission lock: legacy evidence cannot be upgraded.
    fd = os.open(legacy.safe(root / '.worldifact-astra-spend.lock'), os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        prior = terms_at(root, Path(folder).name)
        if prior is not None:
            if prior != terms: raise ValueError('The job model and mode are immutable.')
            return
        for name in (legacy.STATE, '.worldifact-astra-terminal-budget.json', '.worldifact-studio-pricing.json', STATE, SEAL):
            if os.path.lexists(root / name): raise ValueError('Existing job evidence cannot acquire new terms.')
        legacy.atomic(root / TERMS, {'jobId': Path(folder).name, 'execution': terms})
        legacy.atomic(root / STATE, {'revision': POLICY, 'execution': terms, 'holds': {}})

def cost(terms, inputs, outputs):
    _, _, input_rate, output_rate = MODELS[terms['model']]
    factor = 2 if terms['mode'] == 'fast' else 1
    return ((inputs * input_rate + outputs * output_rate) * factor + 999) // 1000

def validate_state(value, terms):
    if (not isinstance(value, dict) or set(value) != {'revision', 'execution', 'holds'}
            or value['revision'] != POLICY or value['execution'] != terms
            or not isinstance(value['holds'], dict) or len(value['holds']) > MAX_REQUESTS):
        raise ValueError('Invalid model cost ledger.')
    seen = set()
    for token, hold in value['holds'].items():
        if (not isinstance(token, str) or not re.fullmatch('[a-f0-9]{32}', token)
                or not isinstance(hold, dict) or set(hold) not in ({'input', 'output', 'held'}, {'input', 'output', 'held', 'response'})
                or not integer(hold['input'], 2048, MAX_INPUT + 2048) or not integer(hold['output'], 256, MAX_OUTPUT)
                or not integer(hold['held'], 0, cost(terms, hold['input'], hold['output']))):
            raise ValueError('Invalid request reservation.')
        if 'response' not in hold:
            if hold['held'] != cost(terms, hold['input'], hold['output']): raise ValueError('Uncertain usage must retain its hold.')
        else:
            response = hold['response']
            if not isinstance(response, str) or not re.fullmatch('resp_[A-Za-z0-9_-]{1,190}', response) or response in seen:
                raise ValueError('Invalid completed response.')
            seen.add(response)
    if used(value) > MODELS[terms['model']][1]: raise ValueError('Cost ceiling exceeded.')
    return value

def used(state): return sum(x['held'] for x in state['holds'].values())

@contextmanager
def ledger(folder, ledger_root=None):
    root = root_for(folder, ledger_root)
    fd = os.open(legacy.safe(root / LOCK), os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        terms = terms_at(root, Path(folder).name)
        if terms is None: raise ValueError('Missing immutable model terms.')
        yield root, terms, validate_state(legacy.read_json(root / STATE), terms)

def count_payload(payload, terms):
    if payload.get('model') != MODELS[terms['model']][0]: raise ValueError('Wrong provider model.')
    tier = 'fast' if terms['mode'] == 'fast' else 'default'
    if payload.get('service_tier') not in (None, tier): raise ValueError('Wrong provider service tier.')
    if any(payload.get(k) is not None for k in ('previous_response_id', 'conversation', 'prompt')) or payload.get('background'):
        raise ValueError('Hidden provider history is not allowed.')
    legacy.check_tools(payload.get('tools', []))
    for item in payload.get('input', []) if isinstance(payload.get('input'), list) else []:
        if isinstance(item, dict) and item.get('type') == 'additional_tools': legacy.check_tools(item.get('tools', []))
    names = ('model', 'instructions', 'input', 'tools', 'tool_choice', 'text', 'reasoning', 'parallel_tool_calls', 'truncation')
    result = {k: payload[k] for k in names if k in payload}
    if len(json.dumps(result).encode()) > 32 * 1024**2: raise ValueError('Payload too large.')
    return result

def count_tokens(payload, headers, terms):
    request = urllib.request.Request('https://api.openai.com/v1/responses/input_tokens',
        data=json.dumps(count_payload(payload, terms)).encode(), headers=headers, method='POST')
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), legacy.NoRedirect())
    with opener.open(request, timeout=15) as response:
        raw = response.read(16385)
        if response.status != 200 or len(raw) > 16384: raise ValueError('Token count unavailable.')
        value = json.loads(raw)
    if not isinstance(value, dict) or value.get('object') != 'response.input_tokens': raise ValueError('Invalid token count.')
    return value.get('input_tokens')

def protect(folder, payload, headers, counter=None, minimum_output=256, ledger_root=None):
    if time.time() >= legacy.VALID_UNTIL: raise SpendError('PRICING_EXPIRED', 'pricing')
    try:
        terms = job_terms(folder, ledger_root)
        if terms is None: raise ValueError('Missing model selection.')
        count_payload(payload, terms)
        payload['reasoning'] = {**payload.get('reasoning', {}), 'effort': 'low'}
        payload['store'] = False
        payload['service_tier'] = 'fast' if terms['mode'] == 'fast' else 'default'
        counted = counter(payload, headers) if counter else count_tokens(payload, headers, terms)
        requested = payload.get('max_output_tokens')
        if not integer(counted, 0, MAX_INPUT) or not integer(requested, 256, 96000) or not integer(minimum_output, 256, MAX_OUTPUT):
            raise ValueError('Invalid token bounds.')
        with ledger(folder, ledger_root) as (root, bound, state):
            if bound != terms or os.path.lexists(root / SEAL): raise SpendError('JOB_SEALED', 'admission')
            remaining = MODELS[terms['model']][1] - used(state)
            output = min(requested, MAX_OUTPUT)
            while output >= minimum_output and cost(terms, counted + 2048, output) > remaining:
                output -= min(256, output - minimum_output + 1)
            if len(state['holds']) >= MAX_REQUESTS: raise SpendError('REQUEST_LIMIT', 'admission')
            if output < minimum_output: raise SpendError('INSUFFICIENT_RESERVATION', 'admission',
                remaining_micro_usd=remaining, required_minimum_micro_usd=cost(terms, counted + 2048, minimum_output),
                requested_output=requested, minimum_output=minimum_output)
            token = secrets.token_hex(16)
            if token in state['holds']: raise ValueError('Reservation collision.')
            state['holds'][token] = {'input': counted + 2048, 'output': output, 'held': cost(terms, counted + 2048, output)}
            legacy.atomic(root / STATE, state)
            payload['max_output_tokens'] = output
            return token
    except SpendError: raise
    except Exception: raise SpendError('PREFLIGHT_UNKNOWN', 'preflight') from None

def settle_completed(folder, token, response, ledger_root=None):
    try:
        with ledger(folder, ledger_root) as (root, terms, state):
            if (not isinstance(response, dict) or response.get('model') != MODELS[terms['model']][0]
                    or response.get('status') != 'completed' or response.get('service_tier') not in
                    ((None, 'default') if terms['mode'] == 'standard' else ('fast',))): return False
            rid, usage = response.get('id'), response.get('usage')
            if not isinstance(rid, str) or not re.fullmatch('resp_[A-Za-z0-9_-]{1,190}', rid) or not isinstance(usage, dict): return False
            inputs, outputs = usage.get('input_tokens'), usage.get('output_tokens')
            hold = state['holds'].get(token)
            if (not hold or not integer(inputs, 0, hold['input']) or not integer(outputs, 0, hold['output'])
                    or type(usage.get('total_tokens')) is not int or usage['total_tokens'] != inputs + outputs): return False
            if 'response' in hold: return hold['response'] == rid
            if any(x.get('response') == rid for x in state['holds'].values()): return False
            hold.update(held=cost(terms, inputs, outputs), response=rid)
            legacy.atomic(root / STATE, state)
            return True
    except Exception: return False

def seal_terminal(folder, job_id, ledger_root=None):
    if Path(folder).name != job_id: raise ValueError('Wrong job identity.')
    with ledger(folder, ledger_root) as (root, terms, state):
        receipt = {'revision': 'worldifact-terminal-budget-v1', 'jobId': job_id,
                   'model': MODELS[terms['model']][0], 'policyRevision': POLICY + ':' + terms['mode'],
                   'capMicroUsd': MODELS[terms['model']][1], 'maximumLiabilityMicroUsd': used(state), 'sealed': True}
        receipt['sealId'] = hashlib.sha256(json.dumps({'state': state, 'receipt': receipt}, sort_keys=True).encode()).hexdigest()
        if os.path.lexists(root / SEAL):
            saved = legacy.read_json(root / SEAL)
            expected = {k: v for k, v in receipt.items() if k not in ('maximumLiabilityMicroUsd', 'sealId')}
            if (not isinstance(saved, dict) or set(saved) != set(receipt) or any(saved[k] != v for k, v in expected.items())
                    or not integer(saved['maximumLiabilityMicroUsd'], used(state), MODELS[terms['model']][1])
                    or not isinstance(saved['sealId'], str) or not re.fullmatch('[a-f0-9]{64}', saved['sealId'])):
                raise ValueError('Invalid immutable terminal receipt.')
            return saved
        legacy.atomic(root / SEAL, receipt)
        return receipt

def verified_health(root=None):
    try:
        root = legacy.safe(root if root is not None else Path(__file__).resolve().parent)
        proof = legacy.read_json(root / RECEIPT)
        if proof.get('revision') != REVISION or set(proof.get('sha256', {})) != set(SOURCES): return {}
        if (proof.get('offline_model_pipeline') is not True
                or proof.get('models') != list(MODELS) or proof.get('modes') != ['standard', 'fast']
                or proof.get('construction_receipt_sha256') != hashlib.sha256(
                    legacy.safe(root / '.worldifact-standard-construction.json').read_bytes()).hexdigest()): return {}
        for name, expected in proof['sha256'].items():
            if hashlib.sha256(legacy.safe(root / name).read_bytes()).hexdigest() != expected: return {}
        if time.time() >= legacy.VALID_UNTIL: return {}
        return {'studioExecutionRevision': REVISION, 'studioExecutionModels': list(MODELS), 'studioExecutionModes': ['standard', 'fast']}
    except Exception: return {}
