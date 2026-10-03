"""Genuine STANDARD CLI/MCP/Blender gate with inert Responses/count fixtures.

Requires a disposable, source-verified worker stage with no state directory.
It never reads provider configuration or writes installation/health receipts.
The caller must enforce a 600-second process-group deadline. Blender retains
the original network-none, two-CPU, 4-GiB sandbox; this gate never relaxes it.
"""
import argparse
import base64
from collections import Counter
import hashlib
import io
import json
import os
from pathlib import Path
import re
import resource
import secrets
import shutil
import signal
import sqlite3
import struct
import subprocess
import sys
import threading
import uuid
from unittest.mock import patch

SUCCESS = 'STANDARD_FIRST_EXEC_REAL_PIPELINE_OK'
PROMPT = 'Create a synthetic rounded green marker on a small blue base. No people or reference images.'
INSTRUCTIONS = 'WORLDIFACT STANDARD BUILD AND COMPLETION CONTRACT:\nBuild the complete marker and base, inspect front, side and back, then finish honestly. No visual-fidelity acceptance is requested.'
ISSUES = ['Scripted offline transport fixture; no model visual-fidelity assessment was performed.']
SUMMARY = 'Synthetic STANDARD geometry, current image transport and terminal finish verification only.'
KEY = 'offline-unused-key'
VIEWS = ('front', 'side', 'back')
MODEL_URL = 'https://api.openai.com/v1/responses'
COUNT_URL = MODEL_URL + '/input_tokens'
MAX_PAYLOAD = 32 * 1024**2
MAX_IMAGE = 2 * 1024**2
WALL_SECONDS = 540
# Leave room below the unchanged runtime's 32-request ceiling. Each inert wait
# still crosses real count/admission/settlement and the original wall deadline.
MAX_WAIT_CALLS = 24
MAX_REQUESTS = 3 + MAX_WAIT_CALLS


class Refused(ValueError):
    pass


def read(path, maximum):
    path = Path(path)
    if any(part.is_symlink() for part in (path, *path.parents)):
        raise Refused('UNSAFE_FIXTURE_PATH')
    if not path.is_file() or not 0 < path.stat().st_size <= maximum:
        raise Refused('FIXTURE_EVIDENCE_MISSING')
    raw = path.read_bytes()
    if len(raw) > maximum:
        raise Refused('FIXTURE_EVIDENCE_OVERSIZED')
    return raw


def record(path, maximum=100000):
    value = json.loads(read(path, maximum))
    if not isinstance(value, dict):
        raise Refused('FIXTURE_EVIDENCE_INVALID')
    return value


def values(value, depth=0, decode_text=False):
    if depth > 30:
        raise Refused('FIXTURE_PAYLOAD_TOO_DEEP')
    yield value
    if isinstance(value, dict):
        for child in value.values():
            yield from values(child, depth + 1, decode_text)
    elif isinstance(value, list):
        for child in value:
            yield from values(child, depth + 1, decode_text)
    elif decode_text and isinstance(value, str):
        try:
            decoded = json.loads(value)
        except (ValueError, TypeError):
            # The pinned CLI may prefix text(value) with its status/Output
            # wrapper. Accept a complete (possibly pretty-printed) JSON body,
            # or individual JSON lines; never reinterpret text as image blocks.
            body = value.partition('\nOutput:\n')[2]
            for line in ([body] if body else []) + value.splitlines():
                if line.lstrip().startswith(('{', '[')):
                    try:
                        decoded = json.loads(line)
                    except ValueError:
                        continue
                    if isinstance(decoded, (dict, list)):
                        yield from values(decoded, depth + 1, decode_text)
            return
        if isinstance(decoded, (dict, list)):
            yield from values(decoded, depth + 1, decode_text)


def output_for(payload, call_id, kind='custom_tool_call_output'):
    outputs = [item for item in payload.get('input', []) if isinstance(item, dict)
               and item.get('type') in ('custom_tool_call_output', 'function_call_output')
               and item.get('call_id') == call_id]
    if len(outputs) != 1 or outputs[0].get('type') != kind:
        raise Refused('EXACT_EXEC_RESULT_MISSING')
    return outputs[0].get('output')


def cell_status(output):
    """Read only the pinned CLI's outer status text, never a quoted witness.

    Codex 0.154.0 exec/wait reports 'Script running with cell ID ...' and
    wait returns only new output. Keep every exact call's output until that
    same cell completes; a candidate file alone cannot advance the fixture.
    """
    blocks = [output] if isinstance(output, str) else output
    if not isinstance(blocks, list):
        raise Refused('CODE_MODE_STATUS_MISSING')
    texts = [item if isinstance(item, str) else item.get('text', '')
             for item in blocks if isinstance(item, str) or
             (isinstance(item, dict) and item.get('type') in ('text', 'input_text'))]
    if not texts or not isinstance(texts[0], str):
        raise Refused('CODE_MODE_STATUS_MISSING')
    # A script can print arbitrary lines. Only the first outer header owns the
    # status; an error/termination cannot be overridden by its Output body.
    header = texts[0].partition('\nOutput:\n')[0].splitlines()
    match = re.fullmatch(r'Script (completed|running with cell ID [A-Za-z0-9_-]{1,128})[ \t]*', header[0]) if header else None
    if match is None or sum(line.startswith('Script ') for line in header) != 1:
        raise Refused('CODE_MODE_STATUS_MISSING')
    status = match.group(1).rstrip()
    return None if status == 'completed' else status.removeprefix('running with cell ID ')


def contains(value, predicate):
    return any(isinstance(item, dict) and predicate(item) for item in values(value, decode_text=True))


def image_digests(payload):
    """Only real structured Responses image blocks count; text/URLs do not."""
    found = []
    for item in values(payload.get('input', [])):
        if not isinstance(item, dict) or item.get('type') != 'input_image':
            continue
        url = item.get('image_url')
        prefix = 'data:image/png;base64,'
        if not isinstance(url, str) or not url.startswith(prefix) or len(url) > MAX_IMAGE * 2:
            raise Refused('CURRENT_RENDER_IMAGE_INVALID')
        try:
            raw = base64.b64decode(url[len(prefix):], validate=True)
        except ValueError:
            raise Refused('CURRENT_RENDER_IMAGE_INVALID') from None
        if not 24 <= len(raw) <= MAX_IMAGE or raw[:8] != b'\x89PNG\r\n\x1a\n':
            raise Refused('CURRENT_RENDER_IMAGE_INVALID')
        found.append(hashlib.sha256(raw).hexdigest())
    return Counter(found)


def scene():
    return {'version': 2, 'name': 'Synthetic rounded marker', 'subject_type': 'object',
            'materials': [{'name': name, 'rgb': rgb, 'pattern': 'plain', 'roughness': .7, 'metallic': 0, 'emission': 0}
                          for name, rgb in [('green', [.2, .5, .25]), ('blue', [.05, .2, .65])]],
            'parts': [{'kind': 'box', 'name': 'base', 'material': 'blue', 'center': [0, 0, .1],
                       'size': [1.4, 1, .2], 'rotation': [0, 0, 0]},
                      {'kind': 'ellipsoid', 'name': 'marker', 'material': 'green',
                       'center': [0, 0, .7], 'radii': [.5, .3, .5]}], 'reference_views': []}


def programs(nonce):
    return [
        "const r=await tools.mcp__blender__get_modeling_contract({});"
        "if(r.isError)throw new Error('CONTRACT_FAILED');"
        "const c=JSON.parse(r.content.find(b=>b.type==='text').text);store('contract',c);"
        "if(c.revision!==0||c.references.length!==0||c.scene_schema.properties.parts.items.anyOf.length!==18)"
        "throw new Error('COMPLETE_STANDARD_CONTRACT_MISSING');"
        "const scene=" + json.dumps(scene(), separators=(',', ':')) + ";"
        "const built=await tools.mcp__blender__build_model({scene_json:JSON.stringify(scene),expected_revision:0});"
        "if(built.isError)throw new Error('FIRST_BUILD_FAILED');"
        "text({standard_first_exec:" + json.dumps(nonce) + ",built});",
        "if(load('contract')?.scene_schema.properties.parts.items.anyOf.length!==18)throw new Error('CONTRACT_STORE_LOST');"
        "let count=0;for(const view of ['front','side','back']){"
        "const r=await tools.mcp__blender__inspect_render({view,expected_revision:1});"
        "if(r.isError)throw new Error('CURRENT_RENDER_FAILED');"
        "for(const b of r.content||[]){if(b.type==='image'){image(b);count++;}}}"
        "const current=await tools.mcp__blender__get_current_model({section:'summary',expected_revision:1});"
        "if(current.isError)throw new Error('CURRENT_SUMMARY_FAILED');"
        "text({standard_review:" + json.dumps(nonce) + ",images:count,current});",
        "text(await tools.mcp__blender__finish_model({expected_revision:1,accepted:false,issues:"
        + json.dumps(ISSUES) + ",summary:" + json.dumps(SUMMARY) + "}));"
    ]


class Reply(io.BytesIO):
    status = 200


class Fixture:
    def __init__(self, runner, folder, initial_task, nonce):
        self.runner, self.folder, self.initial_task, self.nonce = runner, folder, initial_task, nonce
        self.requests = 0
        self.counts = 0
        self.review_images_verified = False
        self.phase = 0
        self.waits = 0
        self.last_call = None
        self.cell_id = None
        self.chunks = []

    def current(self):
        current = self.runner.current_candidate(self.folder)
        if current is None or current['info'].get('revision') != 1:
            raise Refused('CURRENT_CANDIDATE_MISSING')
        return current['path']

    def check_previous(self, payload, step, output=None):
        if output is None:
            output = output_for(payload, 'standard_' + self.nonce + '_' + str(step - 1))
        if step == 1:
            if not contains(output, lambda value: value.get('standard_first_exec') == self.nonce
                            and contains(value.get('built'), lambda v: v.get('revision') == 1
                                         and v.get('completion_contract', {}).get('structural_passed') is True)):
                raise Refused('FIRST_EXEC_BUILD_NOT_PROVEN')
            if contains(output, lambda value: 'scene_schema' in value):
                raise Refused('FULL_CONTRACT_WAS_PRINTED')
            self.current()
        elif step == 2:
            if not contains(output, lambda value: value.get('standard_review') == self.nonce and value.get('images') == 3
                            and contains(value.get('current'), lambda v: v.get('has_model') is True
                                         and v.get('revision') == 1 and set(v.get('inspected_views', [])) == set(VIEWS))):
                raise Refused('CURRENT_REVIEW_RESULT_MISSING')
            current = self.current()
            expected = Counter(hashlib.sha256(read(current / 'review' / (view + '.png'), MAX_IMAGE)).hexdigest()
                               for view in VIEWS)
            if image_digests({'input': output}) != expected:
                raise Refused('CURRENT_PIXELS_NOT_DELIVERED')
            self.review_images_verified = True
        else:
            raise Refused('UNEXPECTED_FIXTURE_REQUEST')

    def next_tool(self, payload):
        if self.last_call is not None:
            output = output_for(payload, *self.last_call)
            pending = cell_status(output)
            self.chunks.append(output)
            if len(json.dumps(self.chunks).encode()) > MAX_PAYLOAD:
                raise Refused('FIXTURE_EVIDENCE_OVERSIZED')
            if self.phase == 1 and contains(output, lambda value: 'scene_schema' in value):
                raise Refused('FULL_CONTRACT_WAS_PRINTED')
            if pending is not None:
                if self.cell_id is not None and pending != self.cell_id:
                    raise Refused('CODE_MODE_CELL_CHANGED')
                if self.waits >= MAX_WAIT_CALLS:
                    raise Refused('OFFLINE_WAIT_LIMIT')
                self.cell_id = pending
                self.waits += 1
                return 'wait', {'cell_id': pending, 'yield_time_ms': 120000, 'max_tokens': 12000}
            self.check_previous(payload, self.phase, self.chunks)
            self.chunks = []
            self.cell_id = None
        elif not any(isinstance(value, str) and self.initial_task in value for value in values(payload.get('input', []))):
            raise Refused('STANDARD_TASK_NOT_USED')
        program = programs(self.nonce)[self.phase]
        self.phase += 1
        return 'exec', '// @exec: {"yield_time_ms":120000,"max_output_tokens":12000}\n' + program

    def open(self, request, timeout):
        if request.get_method() != 'POST' or request.get_header('Authorization') != 'Bearer ' + KEY:
            raise Refused('UNEXPECTED_FIXTURE_REQUEST')
        if not isinstance(request.data, bytes) or not 0 < len(request.data) <= MAX_PAYLOAD:
            raise Refused('FIXTURE_PAYLOAD_INVALID')
        payload = json.loads(request.data)
        if not isinstance(payload, dict) or payload.get('model') != 'gpt-6-astra':
            raise Refused('FIXTURE_MODEL_CHANGED')
        if request.full_url == COUNT_URL:
            if self.counts != self.requests or self.counts >= MAX_REQUESTS:
                raise Refused('UNEXPECTED_COUNT_REQUEST')
            self.counts += 1
            return Reply(b'{"object":"response.input_tokens","input_tokens":100}')
        if request.full_url != MODEL_URL or self.requests >= MAX_REQUESTS or self.counts != self.requests + 1:
            raise Refused('UNEXPECTED_FIXTURE_REQUEST')
        name, argument = self.next_tool(payload)
        kind = 'custom' if name == 'exec' else 'function'
        namespace = next((ns for ns, tool in self.runner.request_tools(payload)
                          if tool.get('name') == name and tool.get('type') == kind), False)
        if namespace is False:
            raise Refused('REAL_CODE_MODE_MISSING')
        call_id = 'standard_' + self.nonce + '_' + str(self.requests)
        if name == 'exec':
            item = {'id': 'ctc_' + call_id, 'type': 'custom_tool_call', 'status': 'completed', 'call_id': call_id,
                    'name': name, 'input': argument}
            result_kind = 'custom_tool_call_output'
        else:
            item = {'id': 'fc_' + call_id, 'type': 'function_call', 'status': 'completed', 'call_id': call_id,
                    'name': name, 'arguments': json.dumps(argument)}
            result_kind = 'function_call_output'
        if namespace:
            item['namespace'] = namespace
        response = {'id': 'resp_' + call_id, 'object': 'response', 'created_at': 1789170000, 'status': 'completed',
                    'model': self.runner.MODEL, 'service_tier': 'default', 'output': [item],
                    'usage': {'input_tokens': 100, 'output_tokens': 100, 'total_tokens': 200}}
        events = [{'type': 'response.created', 'response': {**response, 'status': 'in_progress', 'output': []}},
                  {'type': 'response.output_item.done', 'output_index': 0, 'item': item},
                  {'type': 'response.completed', 'response': response}]
        self.requests += 1
        self.last_call = (call_id, result_kind)
        return Reply(''.join('data: ' + json.dumps(event) + '\n\n' for event in events).encode())


def no_remote(event, args):
    if event == 'socket.connect':
        address = args[1]
        if isinstance(address, tuple) and address[0] not in ('127.0.0.1', '::1'):
            raise Refused('EXTERNAL_NETWORK_REFUSED')
    if event == 'socket.getaddrinfo' and args[0] not in ('127.0.0.1', '::1', 'localhost'):
        raise Refused('EXTERNAL_NETWORK_REFUSED')


def verify_result(folder, fixture, runner, spend, completion):
    outcome = runner.completed_outcome(folder)
    if not 3 <= fixture.requests <= MAX_REQUESTS or fixture.counts != fixture.requests or fixture.phase != 3 or fixture.waits != fixture.requests - 3 or not fixture.review_images_verified:
        raise Refused('OFFLINE_SEQUENCE_INCOMPLETE')
    if not outcome or outcome.get('finished') is not True or outcome.get('accepted') is not False or outcome.get('revision') != 1 or outcome.get('builds') != 1:
        raise Refused('HONEST_FINISH_MISSING')
    request = record(folder / 'agent-request.json')
    if request.get('prompt') != PROMPT or request.get('instructions') != INSTRUCTIONS or completion.profile(request) != 'standard':
        raise Refused('FIXTURE_BRIEF_CHANGED')
    calls = record(folder / 'agent-tools.json')['calls']
    expected = ['get_modeling_contract', 'build_model', 'inspect_render', 'inspect_render', 'inspect_render', 'get_current_model', 'finish_model']
    if [v.get('tool') for v in calls if v.get('status') == 'completed'] != expected or any(v.get('status') == 'failed' for v in calls):
        raise Refused('REAL_TOOL_SEQUENCE_CHANGED')
    review = record(folder / 'visual-review.json')
    if review.get('issues') != ISSUES or review.get('summary') != SUMMARY or review.get('model_revision') != 1 or set(review.get('inspected_views', [])) != set(VIEWS) or review.get('accepted') is not False:
        raise Refused('CURRENT_REVIEW_NOT_SAVED')
    assessment = completion.assessment(request, folder)
    if not assessment or assessment.get('structural_passed') is not True:
        raise Refused('REAL_GLB_STRUCTURAL_CHECK_FAILED')
    if record(folder / 'scene.json') != scene():
        raise Refused('SYNTHETIC_GEOMETRY_CHANGED')
    ledger_path = spend.legacy.ledger_folder(folder) / spend.legacy.STATE
    ledger = spend.validate_state(record(ledger_path))
    if ledger['legacyHeld'] != 0 or ledger['requests'] != fixture.requests or len(ledger['holds']) != fixture.requests or any('response' not in hold for hold in ledger['holds'].values()) or spend.used(ledger) != 6900 * fixture.requests:
        raise Refused('CUMULATIVE_FIXTURE_ACCOUNTING_FAILED')
    usage = record(folder / 'agent-usage.json')
    if usage.get('requests') != fixture.requests or usage.get('input_tokens') != 100 * fixture.requests or usage.get('output_tokens') != 100 * fixture.requests or usage.get('unknown_usage') is not False or usage.get('completed') is not True or usage.get('error_code'):
        raise Refused('FIXTURE_USAGE_INCONSISTENT')


def preflight(source):
    root = Path(source).absolute()
    if any(part.is_symlink() for part in (root, *root.parents)) or not root.is_dir():
        raise Refused('UNSAFE_STAGE')
    if (root / 'state').exists() or (root / 'state').is_symlink():
        raise Refused('DISPOSABLE_STATELESS_STAGE_REQUIRED')
    for name in ('codex_runner.py', 'blender_mcp.py', 'server.py', 'context_policy.py', 'install_codex.py', 'runtime_check.py'):
        read(root / name, 1048576)
    return root


def cleanup(root, folder, processes, drain):
    ok = True
    for process in reversed(processes):
        ok = drain(process.pid) and ok
        try:
            process.wait(timeout=5)
        except (OSError, subprocess.TimeoutExpired):
            ok = False
    name = 'froge-job-' + folder.name
    try:
        result = subprocess.run(['podman', 'container', 'exists', name], stdin=subprocess.DEVNULL,
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=10)
        if result.returncode == 0:
            removed = subprocess.run(['podman', 'rm', '--force', name], stdin=subprocess.DEVNULL,
                                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=15)
            checked = subprocess.run(['podman', 'container', 'exists', name], stdin=subprocess.DEVNULL,
                                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=10)
            ok = removed.returncode == 0 and checked.returncode == 1 and ok
        elif result.returncode != 1:
            ok = False
    except (OSError, subprocess.TimeoutExpired):
        ok = False
    if not ok:
        raise Refused('CLEANUP_UNCONFIRMED')
    shutil.rmtree(root / 'state')
    if (root / 'state').exists():
        raise Refused('CLEANUP_UNCONFIRMED')


def run(source):
    root = preflight(source)
    sys.path.insert(0, str(root))
    sys.addaudithook(no_remote)
    import install_codex, codex_runner as runner, context_policy, completion_policy as completion
    import astra_spend_v2 as spend
    from runtime.scene_contract import parse_scene
    from runtime_check import sandbox_options
    for module in (install_codex, runner, context_policy, completion, spend):
        if Path(module.__file__).resolve().parent != root:
            raise Refused('STAGED_MODULE_MISMATCH')
    binary = install_codex.verified_runtime(root / 'tools/codex')
    if binary != root / 'tools/codex/codex':
        raise Refused('PINNED_CLI_RUNTIME_REQUIRED')
    options = sandbox_options(4)
    if not all(option in options for option in ('--network=none', '--read-only', '--cpus=2', '--memory=4g', '--memory-swap=4g', '--pids-limit=256')):
        raise Refused('BLENDER_RESOURCE_LIMITS_CHANGED')
    request = {'prompt': PROMPT, 'instructions': INSTRUCTIONS}
    if context_policy.REVISION != 'worldifact-standard-context-v1' or not context_policy.active(request):
        raise Refused('STANDARD_CONTEXT_POLICY_REQUIRED')
    if parse_scene(json.dumps(scene()), PROMPT) != scene():
        raise Refused('SYNTHETIC_SCENE_INVALID')
    state = root / 'state'; state.mkdir(mode=0o700)
    folder = state / 'jobs' / str(uuid.uuid4()); folder.mkdir(mode=0o700, parents=True)
    processes = []
    try:
        with sqlite3.connect(state / 'jobs.sqlite') as database:
            database.execute('CREATE TABLE jobs (id TEXT PRIMARY KEY, prompt TEXT NOT NULL, state TEXT NOT NULL, detail TEXT NOT NULL, created REAL NOT NULL, updated REAL NOT NULL)')
        fixture = Fixture(runner, folder, context_policy.initial_task(folder, request), secrets.token_hex(8))
        original_popen = runner.subprocess.Popen
        def track(*args, **kwargs):
            process = original_popen(*args, **kwargs)
            if kwargs.get('start_new_session'):
                processes.append(process)
            return process
        with patch.object(runner.urllib.request, 'build_opener', return_value=fixture), \
             patch.object(spend.legacy, 'LEDGER_ROOT', folder / 'fixture-ledgers'), \
             patch.object(runner.subprocess, 'Popen', track):
            runner.run(folder, PROMPT, INSTRUCTIONS, KEY, threading.Event(), lambda _message: None, binary=binary)
            verify_result(folder, fixture, runner, spend, completion)
    finally:
        # Reserve the caller's final 60 seconds for bounded cleanup. A second
        # soft signal must not interrupt cleanup between the process and
        # container checks. The installer's hard deadline remains authoritative.
        signal.setitimer(signal.ITIMER_REAL, 0)
        for signum in (signal.SIGTERM, signal.SIGHUP, signal.SIGALRM):
            signal.signal(signum, signal.SIG_IGN)
        cleanup(root, folder, processes, completion.drain_group)


class Parser(argparse.ArgumentParser):
    def error(self, _message):
        raise Refused('INVALID_ARGUMENTS')


def main(argv=None):
    try:
        parser = Parser(description=__doc__); parser.add_argument('--source', required=True)
        args = parser.parse_args(argv)
        def interrupted(*_):
            raise Refused('OFFLINE_GATE_INTERRUPTED')
        for signum in (signal.SIGTERM, signal.SIGHUP, signal.SIGALRM):
            signal.signal(signum, interrupted)
        signal.setitimer(signal.ITIMER_REAL, WALL_SECONDS)
        resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
        resource.setrlimit(resource.RLIMIT_CPU, (450, 480))
        resource.setrlimit(resource.RLIMIT_FSIZE, (128 * 1024**2, 128 * 1024**2))
        run(args.source)
        signal.setitimer(signal.ITIMER_REAL, 0)
        print(SUCCESS)
        return 0
    except (Exception, KeyboardInterrupt) as error:
        signal.setitimer(signal.ITIMER_REAL, 0)
        reason = str(error) if isinstance(error, Refused) else 'OFFLINE_GATE_FAILED'
        print('STANDARD_OFFLINE_FAILED ' + reason)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
