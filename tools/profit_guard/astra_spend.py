"""ASTRA-only, per-job pre-reservation guard. No provider call on import.

Rates reviewed 2026-09-28: official GPT-6 Astra model/pricing pages.
28/83 micro-USD per token conservatively cover long context, cache writes
and 10% regional processing. This is a reservation, not an actual invoice.
"""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import stat
import tempfile
import time
import urllib.request

REVISION = 'astra-usd175-v1'
CEILING_MICRO_USD = 1_750_000
VALID_UNTIL = 1793145600  # 2026-10-28T00:00:00Z
MAX_OUTPUT = 8192
MAX_INPUT = 65536
INPUT_RATE = 28
OUTPUT_RATE = 83
RECEIPT = '.worldifact-astra-guard.json'
STATE = '.worldifact-astra-spend.json'
LEDGER_ROOT = Path(__file__).parent / 'state' / 'worldifact-astra-budgets'


class SpendError(RuntimeError):
    pass


def safe(path):
    path = Path(path).absolute()
    if any(p.is_symlink() for p in (path, *path.parents)):
        raise SpendError('Unsafe cost-guard path.')
    return path


def read_json(path):
    path = safe(path)
    info = path.stat()
    if not stat.S_ISREG(info.st_mode) or not 1 <= info.st_size <= 16384:
        raise SpendError('Invalid cost-guard state.')
    return json.loads(path.read_text())


def atomic(path, value):
    path = safe(path)
    fd, name = tempfile.mkstemp(prefix='.wf-spend-', dir=path.parent)
    try:
        with os.fdopen(fd, 'w') as f:
            os.fchmod(f.fileno(), 0o600)
            json.dump(value, f, sort_keys=True)
            f.flush()
            os.fsync(f.fileno())
        os.replace(name, path)
        directory = os.open(str(path.parent), os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def ledger_folder(folder, ledger_root=None):
    job = safe(folder)
    if not job.is_dir():
        raise SpendError('The existing job folder is required.')
    # Keep provider funds OUTSIDE the directory mounted into generated Blender jobs.
    key = hashlib.sha256(str(job.resolve(strict=True)).encode()).hexdigest()
    root = safe(ledger_root if ledger_root is not None else LEDGER_ROOT)
    target = safe(root / key)
    target.mkdir(mode=0o700, parents=True, exist_ok=True)
    return target


def reserve(folder, counted_input, requested_output, now=None, ledger_root=None):
    """Reserve BEFORE generation; disconnects, errors and restarts never refund it."""
    if (time.time() if now is None else now) >= VALID_UNTIL:
        raise SpendError('Model pricing review expired.')
    if type(counted_input) is not int or not 0 <= counted_input <= MAX_INPUT:
        raise SpendError('Input token count is outside the reviewed range.')
    if type(requested_output) is not int or not 1 <= requested_output <= 96000:
        raise SpendError('Invalid output token ceiling.')
    root = ledger_folder(folder, ledger_root)
    lock_path = safe(root / '.worldifact-astra-spend.lock')
    fd = os.open(str(lock_path), os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        path = root / STATE
        state = read_json(path) if path.exists() else {'revision': REVISION, 'reserved': 0, 'requests': 0}
        used, requests = state.get('reserved'), state.get('requests')
        if (set(state) != {'revision', 'reserved', 'requests'} or state.get('revision') != REVISION
                or type(used) is not int or not 0 <= used <= CEILING_MICRO_USD
                or type(requests) is not int or not 0 <= requests <= 32):
            raise SpendError('Invalid persistent budget; manual review required.')
        input_cost = (counted_input + 2048) * INPUT_RATE
        affordable = (CEILING_MICRO_USD - used - input_cost) // OUTPUT_RATE
        output = min(requested_output, MAX_OUTPUT, affordable)
        if output < 256 or requests >= 32:
            raise SpendError('ASTRA job budget exhausted before another API call.')
        amount = input_cost + output * OUTPUT_RATE
        atomic(path, {'revision': REVISION, 'reserved': used + amount, 'requests': requests + 1})
        return output


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def count_tokens(payload, headers):
    allowed = ('model', 'instructions', 'input', 'tools', 'tool_choice', 'text', 'reasoning', 'parallel_tool_calls')
    counter = {key: payload[key] for key in allowed if key in payload}
    request = urllib.request.Request('https://api.openai.com/v1/responses/input_tokens',
        data=json.dumps(counter).encode(), headers=headers, method='POST')
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    with opener.open(request, timeout=15) as response:
        raw = response.read(16385)
        if response.status != 200 or len(raw) > 16384:
            raise SpendError('Token count unavailable.')
        value = json.loads(raw)
    if value.get('object') != 'response.input_tokens':
        raise SpendError('Invalid token count response.')
    return value.get('input_tokens')


def protect(folder, payload, headers, counter=None):
    """Only the runner's final HTTPS Responses request calls this method."""
    try:
        if time.time() >= VALID_UNTIL:
            raise SpendError('Model pricing review expired.')
        if payload.get('model') != 'gpt-6-astra':
            raise SpendError('Unreviewed model; no fallback allowed.')
        if any(payload.get(k) for k in ('previous_response_id', 'conversation', 'background', 'prompt')):
            raise SpendError('Hidden history or background jobs are not permitted.')
        if payload.get('service_tier') not in (None, 'default'):
            raise SpendError('Only reviewed Standard pricing is allowed.')
        tools = payload.get('tools', [])
        if not isinstance(tools, list) or any(not isinstance(t, dict) or t.get('type') not in ('function', 'custom') for t in tools):
            raise SpendError('Paid hosted tools are outside this budget.')
        payload['service_tier'] = 'default'
        payload['store'] = False
        requested = payload.get('max_output_tokens')
        if type(requested) is not int or not 1 <= requested <= 96000:
            raise SpendError('A bounded max_output_tokens value is required.')
        counted = (counter or count_tokens)(payload, headers)
        payload['max_output_tokens'] = reserve(folder, counted, requested)
    except SpendError:
        raise
    except Exception:
        raise SpendError('Cost preflight failed. No generation request was sent.') from None


def verified_health(root=None):
    """Do not advertise a guard when source files/receipt no longer match."""
    try:
        source = safe(root if root is not None else Path(__file__).parent)
        receipt = read_json(source / RECEIPT)
        if receipt.get('revision') != REVISION or time.time() >= VALID_UNTIL:
            return {}
        expected = receipt.get('sha256')
        if not isinstance(expected, dict) or set(expected) != {'codex_runner.py', 'fast_preview.py', 'astra_spend.py'}:
            return {}
        for name, digest in expected.items():
            path = safe(source / name)
            if not path.is_file() or path.stat().st_size > 1048576 or hashlib.sha256(path.read_bytes()).hexdigest() != digest:
                return {}
        return {'astraBudgetRevision': REVISION, 'astraBudgetMaxUsd': CEILING_MICRO_USD / 1000000,
                'astraBudgetPreflight': 'input-tokens', 'astraBudgetExpiry': VALID_UNTIL}
    except Exception:
        return {}
