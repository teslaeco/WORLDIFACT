"""FAST-only monetary guard. STANDARD remains unchanged.

Reserve conservative worst-case API cost BEFORE the generation request. Never
refund a reservation on disconnect/restart. One job is capped at USD4, inside
the owner's USD5 API-test approval. Rates checked 2026-09-17 against:
https://developers.openai.com/api/docs/models/gpt-6-astra
https://developers.openai.com/api/docs/guides/token-counting
Use the official input-token counter on the same input/tools, then reserve
long-context cache-write input ($25/M) and output ($75/M). Force standard
service tier. Local tools only; no paid hosted tools, images or hidden history.
"""
import fcntl
import json
import os
from pathlib import Path
import tempfile
import time
import urllib.request

REVISION = 'fast-usd4-v1'
CEILING_MICRO_USD = 4_000_000
VALID_UNTIL = 1789714800  # 2026-09-18 07:00:00 UTC: recheck prices afterwards.

class SpendError(ValueError):
    pass

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None

def check_local_content(value):
    if isinstance(value, list):
        for item in value: check_local_content(item)
    elif isinstance(value, dict):
        if value.get('type') in ('input_image', 'image', 'input_file', 'input_audio', 'audio', 'video'):
            raise SpendError('The approved FAST test is text-only.')
        for item in value.values(): check_local_content(item)

def check_tools(tools):
    if not isinstance(tools, list): raise SpendError('Unverified tool catalog.')
    for tool in tools:
        if not isinstance(tool, dict): raise SpendError('Unverified tool.')
        if tool.get('type') == 'namespace': check_tools(tool.get('tools'))
        elif tool.get('type') not in ('custom', 'function'):
            raise SpendError('Hosted or remote tools are outside this test budget.')

def count_payload(payload):
    if payload.get('model') != 'gpt-6-astra': raise SpendError('Unreviewed model price.')
    if any(payload.get(key) is not None for key in ('previous_response_id', 'conversation', 'prompt')):
        raise SpendError('Hidden history is not allowed in the bounded test.')
    if payload.get('background'): raise SpendError('Background provider work is not enabled.')
    check_local_content(payload.get('input'))
    check_tools(payload.get('tools', []))
    for item in payload.get('input', []) if isinstance(payload.get('input'), list) else []:
        if isinstance(item, dict) and item.get('type') == 'additional_tools': check_tools(item.get('tools', []))
    result = {key: payload[key] for key in ('model', 'input', 'instructions', 'tools', 'text', 'reasoning', 'tool_choice', 'parallel_tool_calls', 'truncation') if key in payload}
    if len(json.dumps(result).encode()) > 2 * 1024 * 1024: raise SpendError('FAST context is too large.')
    return result

def input_tokens(payload, headers):
    request = urllib.request.Request('https://api.openai.com/v1/responses/input_tokens',
        data=json.dumps(count_payload(payload)).encode(), headers=headers, method='POST')
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    try:
        with opener.open(request, timeout=12) as response:
            data = response.read(16385)
            if len(data) > 16384: raise SpendError('Token-count response is too large.')
            result = json.loads(data)
    except Exception:
        raise SpendError('Token count unavailable. No further generation request was sent.') from None
    count = result.get('input_tokens')
    if result.get('object') != 'response.input_tokens' or type(count) is not int or not 0 <= count <= 1_050_000:
        raise SpendError('Invalid token count. No generation request was sent.')
    return count

def reserve(folder, counted_input, max_output, now=None):
    if (time.time() if now is None else now) >= VALID_UNTIL: raise SpendError('Test price review expired.')
    if type(counted_input) is not int or not 0 <= counted_input <= 1_050_000 or type(max_output) is not int or not 1 <= max_output <= 8192:
        raise SpendError('Unbounded token request.')
    # 2,048 extra tokens reserve framing/protocol headroom. Use higher long
    # context/cache-write prices even for uncached short requests; no refunds.
    worst = (counted_input + 2048) * 25 + max_output * 75
    folder = Path(folder)
    lockpath, path = folder / 'fast-spend.lock', folder / 'fast-spend.json'
    for p in (folder, lockpath, path):
        if p.is_symlink(): raise SpendError('Unsafe spend record path.')
    fd = os.open(str(lockpath), os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        state = {'revision': REVISION, 'reserved_micro_usd': 0, 'requests': 0}
        if path.exists():
            if path.stat().st_size > 4096: raise SpendError('Invalid spend record.')
            state = json.loads(path.read_text())
        used, calls = state.get('reserved_micro_usd'), state.get('requests')
        if state.get('revision') != REVISION or type(used) is not int or not 0 <= used <= CEILING_MICRO_USD or type(calls) is not int or not 0 <= calls <= 6:
            raise SpendError('Invalid spend record.')
        if calls >= 6 or used + worst > CEILING_MICRO_USD: raise SpendError('FAST test cost ceiling reached; no further provider request.')
        state = {'revision': REVISION, 'reserved_micro_usd': used + worst, 'requests': calls + 1,
                 'ceiling_micro_usd': CEILING_MICRO_USD, 'actual_cost': 'UNKNOWN_UNTIL_PROVIDER_USAGE'}
        fd, temporary = tempfile.mkstemp(prefix='.fast-spend-', dir=folder)
        try:
            with os.fdopen(fd, 'w') as out:
                os.fchmod(out.fileno(), 0o600); json.dump(state, out); out.flush(); os.fsync(out.fileno())
            os.replace(temporary, path)
            dfd = os.open(str(folder), os.O_RDONLY | os.O_DIRECTORY)
            try: os.fsync(dfd)
            finally: os.close(dfd)
        finally:
            if os.path.exists(temporary): os.unlink(temporary)
    return state

def protect(folder, payload, headers):
    # Called only for FAST, after developer guidance and before /responses.
    count_payload(payload)
    payload['service_tier'] = 'default'
    payload['background'] = False
    count = input_tokens(payload, headers)
    return reserve(folder, count, payload.get('max_output_tokens'))
