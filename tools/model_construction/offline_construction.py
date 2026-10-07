"""Genuine isolated phased STANDARD gate with inert provider responses only.

Run against a disposable, source-verified stage before its construction receipt
exists. The actual staged Gateway, JobTools, server Blender lifecycle and Podman
sandbox execute unchanged. Token-count/Responses replies and the initial health
check are explicit fixtures. No key/configuration is read and no native-Blender
fallback exists. The caller must enforce a 600-second process-group deadline.
"""
import argparse
import base64
import hashlib
import io
import json
import os
from pathlib import Path
import resource
import shutil
import signal
import sqlite3
import subprocess
import sys
import threading
import time
from urllib.parse import urlsplit
import urllib.request
from unittest.mock import patch
import uuid

SUCCESS = 'WORLDIFACT_PHASED_STANDARD_OFFLINE_VERIFIED'
FAILURE = 'WORLDIFACT_PHASED_STANDARD_OFFLINE_FAILED'
REVISION = 'worldifact-standard-construction-v1'
EVIDENCE = 'phased-standard-evidence.json'
WALL_SECONDS = 540
MAX_PAYLOAD = 32 * 1024**2
KEY = 'offline-unused-fixture-key'
PROMPT = 'Synthetic native-MCP transport box; no user model or likeness request.'
INSTRUCTIONS = 'WORLDIFACT STANDARD BUILD AND COMPLETION CONTRACT:\nBuild the exact public synthetic box fixture.'
VIEWS = ('front', 'side', 'back')
EDIT_CODE = 'body = bpy.data.objects.get("body")\nbody.scale.x *= 1.25'
SOURCES = frozenset(('server.py', 'codex_runner.py', 'blender_mcp.py', 'astra_spend_v2.py',
    'completion_policy.py', 'prebuild_policy.py', 'studio_pricing.py', 'terminal_budget.py',
    'context_policy.py', 'construction_policy.py', 'phased_controller.py', 'construction_payload.py',
    'runtime_controller.py', 'construction_health.py'))
SANDBOX = ('--rm', '--pull=never', '--network=none', '--read-only', '--cap-drop=ALL',
    '--security-opt=no-new-privileges', '--userns=keep-id', '--memory=4g', '--memory-swap=4g',
    '--cpus=2', '--pids-limit=256', '--shm-size=128m')


class Refused(ValueError):
    pass


def require(condition, reason):
    if not condition:
        raise Refused(reason)


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False)


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def read(path, maximum=2 * 1024**2):
    path = Path(path)
    require(not any(p.is_symlink() for p in (path, *path.parents)), 'LINKED_FIXTURE_PATH')
    require(path.is_file() and 0 < path.stat().st_size <= maximum, 'FIXTURE_FILE_REQUIRED')
    raw = path.read_bytes()
    require(0 < len(raw) <= maximum, 'FIXTURE_FILE_OVERSIZED')
    return raw


def record(path):
    value = json.loads(read(path))
    require(isinstance(value, dict), 'FIXTURE_RECORD_REQUIRED')
    return value


def scene():
    # Exact existing public codex_smoke.py box at MPC2 commit
    # d3f61b842dcfeda2ed794210caafc391919a75be; not a user model or quality claim.
    return {'version': 1, 'name': 'MCP export fixture',
        'materials': [{'name': 'blue', 'rgb': [.02, .2, .7], 'pattern': 'metal',
                       'roughness': .35, 'metallic': .2, 'emission': 0}],
        'parts': [{'kind': 'box', 'name': 'body', 'material': 'blue', 'center': [0, 0, 1],
                   'size': [1, 1, 2], 'rotation': [0, 0, 0]}]}


class Reply(io.BytesIO):
    status = 200


class Provider:
    def __init__(self, runner, mcp, spend, folder, accepted):
        self.runner, self.mcp, self.spend, self.folder = runner, mcp, spend, folder
        self.accepted = accepted
        self.phases = ('construction', 'inspection', 'reassessment') if accepted else ('construction', 'inspection')
        self.before_model, self.before_renders = None, None
        self.calls, self.counts, self.local_bytes, self.ports = [], [], [], set()
        self.render_hashes = {}
        self.gateway_instance = None

    def gateway(self, *args, **kwargs):
        value = self.runner.Gateway(*args, **kwargs)
        self.gateway_instance = value
        self.ports.add(value.server.server_address[1])
        return value

    def open(self, original_open, opener, request, *args, **kwargs):
        from construction_payload import strict_json
        require(isinstance(request, urllib.request.Request), 'EXPLICIT_HTTP_REQUEST_REQUIRED')
        url = urlsplit(request.full_url)
        if url.scheme == 'http' and url.hostname == '127.0.0.1' and url.port in self.ports:
            require(url.path == '/v1/responses' and not url.query and not url.fragment,
                    'UNEXPECTED_LOCAL_REQUEST')
            self.local_bytes.append(request.data)
            return original_open(opener, request, *args, **kwargs)
        require(request.full_url in ('https://api.openai.com/v1/responses',
                    'https://api.openai.com/v1/responses/input_tokens'), 'EXTERNAL_NETWORK_REFUSED')
        require(request.get_header('Authorization') == 'Bearer ' + KEY, 'FIXTURE_CREDENTIAL_CHANGED')
        wire = strict_json(request.data, MAX_PAYLOAD)
        require(isinstance(wire, dict) and wire.get('model') == 'gpt-6-astra', 'FIXTURE_MODEL_CHANGED')
        if url.path.endswith('/input_tokens'):
            require(len(self.counts) == len(self.calls) and len(self.calls) < len(self.phases), 'UNEXPECTED_COUNT_REQUEST')
            self.counts.append(wire)
            return Reply(b'{"object":"response.input_tokens","input_tokens":4096}')
        require(len(self.calls) < len(self.phases) and len(self.counts) == len(self.calls) + 1,
                'UNEXPECTED_PROVIDER_REQUEST')
        require(request.data == self.local_bytes[-1] and self.counts[-1] == self.spend.legacy.count_payload(wire),
                'COUNT_OR_ADMITTED_PAYLOAD_CHANGED')
        phase = self.phases[len(self.calls)]
        content = wire.get('input', [{}])[0].get('content', [])
        require(content and content[0].get('type') == 'input_text', 'COMPLETE_INPUT_MISSING')
        document = strict_json(content[0]['text'], MAX_PAYLOAD)
        require(document.get('phase') == phase and document.get('request', {}).get('prompt') == PROMPT
                and document['request'].get('instructions') == INSTRUCTIONS, 'ORIGINAL_BRIEF_CHANGED')
        require(wire.get('tools') == [] and wire.get('store') is False and wire.get('stream') is True
                and wire.get('service_tier') == 'default' and wire.get('reasoning') == {'effort': 'low'}
                and wire.get('truncation') == 'disabled'
                and wire.get('max_output_tokens') == {'construction': 8192, 'inspection': 3072, 'reassessment': 1536}[phase],
                'BOUNDED_PROVIDER_POLICY_CHANGED')
        required_schema = {'scene_json'} if phase == 'construction' else {'accepted', 'issues', 'summary', 'correction'}
        output = wire.get('text', {}).get('format', {})
        require(output.get('type') == 'json_schema' and output.get('strict') is True
                and output.get('schema', {}).get('additionalProperties') is False
                and set(output['schema'].get('properties', {})) == required_schema, 'STRICT_TYPED_OUTPUT_MISSING')
        from scene_repair import photo_schema
        require(document.get('modeling_contract', {}).get('scene_schema') == photo_schema(0), 'FULL_SCENE_SCHEMA_CHANGED')
        with self.spend.ledger(self.folder) as (_, state):
            require(state['requests'] == len(self.calls) + 1
                    and len([v for v in state['holds'].values() if 'response' not in v]) == 1
                    and self.spend.used(state) <= 1750000, 'ORIGINAL_RESERVATION_MISSING')
        if phase == 'construction':
            require(not (self.folder / 'candidates').exists(), 'FIRST_PLAN_DID_NOT_PRECEDE_BUILD')
            envelope = {'scene_json': canonical(scene())}
        else:
            current = self.mcp.current_candidate(self.folder)
            revision = 2 if phase == 'reassessment' else 1
            require(current is not None and current['info']['revision'] == revision, 'REAL_CURRENT_GLB_MISSING')
            labels = [strict_json(v['text'], MAX_PAYLOAD) for v in content[1:] if v.get('type') == 'input_text']
            images = [v for v in content if v.get('type') == 'input_image']
            require(len(images) == len(labels) == 3 and tuple(v.get('view') for v in labels) == VIEWS,
                    'ALL_CURRENT_IMAGES_REQUIRED')
            for label, image in zip(labels, images):
                prefix = 'data:image/png;base64,'
                require(isinstance(image.get('image_url'), str) and image['image_url'].startswith(prefix),
                        'ACTUAL_IMAGE_BLOCK_REQUIRED')
                raw = base64.b64decode(image['image_url'][len(prefix):], validate=True)
                actual = read(current['path'] / 'review' / (label['view'] + '.png'))
                require(raw == actual and len(raw) > 1000 and raw[:8] == b'\x89PNG\r\n\x1a\n'
                        and label.get('model_sha256') == current['identity'][1]
                        and label.get('revision') == revision, 'CURRENT_RENDER_BYTES_CHANGED')
                self.render_hashes[label['view']] = digest(raw)
            state = document.get('current_model', {})
            require(state.get('scene') == record(current['path'] / 'scene.json')
                    and isinstance(state.get('edits'), str)
                    and (EDIT_CODE in state['edits'] if revision == 2 else state['edits'] == '')
                    and state.get('report') == current['result']
                    and state.get('completion_contract', {}).get('structural_passed') is True,
                    'FULL_CURRENT_STATE_MISSING')
            correcting = self.accepted and phase == 'inspection'
            if correcting:
                self.before_model, self.before_renders = current['identity'][1], dict(self.render_hashes)
            if phase == 'reassessment':
                require(current['identity'][1] != self.before_model
                        and any(self.render_hashes[view] != self.before_renders[view] for view in VIEWS),
                        'ACTUAL_CORRECTED_MODEL_AND_IMAGES_REQUIRED')
                meshes = [v for v in current['result'].get('mesh_objects', []) if v.get('name') == 'body']
                require(len(meshes) == 1 and abs(meshes[0]['dimensions'][0] - 1.25) < 1e-6,
                        'ORIGINAL_SANDBOX_EDIT_NOT_APPLIED')
            envelope = {'accepted': self.accepted and not correcting,
                'issues': (['The scripted fixture asks for a 25 percent wider current box.'] if correcting else
                           [] if self.accepted else ['Explicit scripted rejection of this synthetic transport fixture.']),
                'summary': 'Scripted offline transport verdict only; no live AI visual-quality evaluation.',
                'correction': {'kind': 'edit', 'code': EDIT_CODE} if correcting else None}
        self.calls.append({'phase': phase, 'payload_sha256': digest(request.data)})
        response = {'id': 'resp_phased_' + self.folder.name.replace('-', '') + '_' + phase,
            'object': 'response', 'model': 'gpt-6-astra', 'status': 'completed', 'service_tier': 'default',
            'output': [{'type': 'message', 'id': 'message_' + phase, 'role': 'assistant', 'status': 'completed',
                'content': [{'type': 'output_text', 'text': canonical(envelope), 'annotations': []}]}],
            'usage': {'input_tokens': 4096, 'output_tokens': 300, 'total_tokens': 4396,
                'input_tokens_details': {'cached_tokens': 0, 'cache_write_tokens': 0},
                'output_tokens_details': {'reasoning_tokens': 20}}}
        return Reply(b'data: ' + canonical({'type': 'response.completed', 'response': response}).encode() + b'\n\n')


def no_remote(event, args):
    if event == 'socket.connect':
        address = args[1]
        require(isinstance(address, tuple) and address[0] in ('127.0.0.1', '::1'), 'EXTERNAL_NETWORK_REFUSED')
    if event == 'socket.getaddrinfo':
        require(args[0] in ('127.0.0.1', '::1', 'localhost'), 'EXTERNAL_NETWORK_REFUSED')


def preflight(source, workspace):
    root, workspace = Path(source).absolute(), Path(workspace).absolute()
    for path in (root, workspace):
        require(path.is_dir() and not any(p.is_symlink() for p in (path, *path.parents)), 'UNSAFE_STAGE_OR_WORKSPACE')
    require(root != workspace, 'SEPARATE_WORKSPACE_REQUIRED')
    require(not (root / 'state').exists() and not (root / 'state').is_symlink(), 'DISPOSABLE_STATELESS_STAGE_REQUIRED')
    require(not (workspace / EVIDENCE).exists() and not (workspace / EVIDENCE).is_symlink(), 'FRESH_EVIDENCE_PATH_REQUIRED')
    require(shutil.which('podman') is not None, 'PODMAN_REQUIRED_NO_NATIVE_FALLBACK')
    hashes = {name: digest(read(root / name, 1048576)) for name in SOURCES}
    read(root / 'runtime/run.py', 1048576)
    read(root / 'runtime/finalize.py', 1048576)
    return root, workspace, hashes


def create_jobs(root):
    state = root / 'state'
    state.mkdir(mode=0o700)
    folders = [state / 'jobs' / str(uuid.uuid4()) for _ in range(2)]
    for folder in folders:
        folder.mkdir(mode=0o700, parents=True)
    with sqlite3.connect(state / 'jobs.sqlite') as db:
        db.execute('CREATE TABLE jobs (id TEXT PRIMARY KEY, prompt TEXT NOT NULL, state TEXT NOT NULL, detail TEXT NOT NULL, created REAL NOT NULL, updated REAL NOT NULL)')
        now = time.time()
        for folder in folders:
            db.execute('INSERT INTO jobs VALUES (?,?,?,?,?,?)',
                (folder.name, PROMPT, 'generating', 'Synthetic isolated offline fixture.', now, now))
    return folders, state.stat().st_ino


def verify_case(folder, provider, mcp, spend, accepted):
    count = 3 if accepted else 2
    revision = 2 if accepted else 1
    require(len(provider.calls) == len(provider.counts) == len(provider.local_bytes) == count, 'COMPLETE_PHASE_REQUESTS_REQUIRED')
    outcome = mcp.completed_outcome(folder)
    require(outcome is not None and outcome.get('finished') is True and outcome.get('accepted') is accepted
            and outcome.get('revision') == revision and outcome.get('builds') == revision, 'VERIFIED_TERMINAL_OUTCOME_REQUIRED')
    current = mcp.current_candidate(folder, outcome['execution_id'])
    require(current is not None and current['identity'][1] == outcome['model_sha256'], 'CURRENT_MODEL_IDENTITY_CHANGED')
    for name in ('model.glb', 'model.blend', 'model.fbx', 'model.obj', 'model-mm.stl', 'model-ready.json'):
        read(folder / name, 50 * 1024**2)
    require(read(folder / 'model.glb', 50 * 1024**2) == read(current['path'] / 'model.glb', 50 * 1024**2),
            'EXPORTED_CURRENT_GLB_CHANGED')
    report = record(folder / 'result.json')
    require(report.get('interchange_exports', {}).get('status') == 'ready', 'ORIGINAL_FINAL_EXPORT_FAILED')
    completed = [c.get('tool') for c in record(folder / 'agent-tools.json')['calls'] if c.get('status') == 'completed']
    require(completed.count('build_model') == completed.count('finish_model') == 1
            and completed.count('edit_model') == (1 if accepted else 0)
            and completed.count('inspect_render') == 3 * revision, 'REAL_TOOL_SEQUENCE_INCOMPLETE')
    usage = record(folder / 'agent-usage.json')
    require(usage.get('requests') == count and usage.get('input_tokens') == 4096 * count and usage.get('output_tokens') == 300 * count
            and usage.get('unknown_usage') is False and usage.get('completed') is accepted,
            'AUTHENTICATED_USAGE_MISMATCH')
    if not accepted:
        require(usage.get('error_code') == 'WORLDIFACT_CONSTRUCTION_REJECTED', 'REJECTION_NOT_CLASSIFIED')
    with spend.ledger(folder) as (path, state):
        require(state['legacyHeld'] == 0 and state['requests'] == count and len(state['holds']) == count
                and all('response' in value for value in state['holds'].values())
                and spend.used(state) == 73844 * count, 'ORIGINAL_SETTLEMENT_NOT_VERIFIED')
        require(not (path.parent / spend.studio_pricing.TERMS).exists()
                and not spend.terminal_budget.sealed(path), 'ORIGINAL_LEGACY_TERMS_CHANGED')
    return {'accepted': accepted, 'revision': revision, 'correction': accepted, 'server_success_returned': accepted, 'model_sha256': outcome['model_sha256'],
            'render_sha256': provider.render_hashes, 'provider_requests': provider.calls,
            'before_correction_model_sha256': provider.before_model,
            'before_correction_render_sha256': provider.before_renders,
            'fixture_settled_micro_usd': 73844 * count, 'invoice_amount': False}


def cleanup(root, folders, processes, state_inode):
    ok = True
    deadline = time.monotonic() + 55
    def remaining(maximum):
        value = min(maximum, deadline - time.monotonic())
        require(value > 0, 'ISOLATED_CLEANUP_UNCONFIRMED')
        return value
    for folder in folders:
        name = 'froge-job-' + folder.name
        try:
            result = subprocess.run(['podman', 'container', 'exists', name], stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=remaining(10))
            if result.returncode == 0:
                removed = subprocess.run(['podman', 'rm', '--force', name], stdin=subprocess.DEVNULL,
                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=remaining(15))
                checked = subprocess.run(['podman', 'container', 'exists', name], stdin=subprocess.DEVNULL,
                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=remaining(10))
                ok = removed.returncode == 0 and checked.returncode == 1 and ok
            elif result.returncode != 1:
                ok = False
        except (OSError, subprocess.TimeoutExpired):
            ok = False
    for process in processes:
        try:
            process.wait(timeout=remaining(5))
        except (OSError, subprocess.TimeoutExpired):
            ok = False
    state = root / 'state'
    require(ok and state.is_dir() and not state.is_symlink() and state.stat().st_ino == state_inode,
            'ISOLATED_CLEANUP_UNCONFIRMED')
    shutil.rmtree(state)
    require(not state.exists(), 'ISOLATED_CLEANUP_UNCONFIRMED')


def run(source, workspace):
    root, workspace, hashes = preflight(source, workspace)
    sys.dont_write_bytecode = True
    sys.path.insert(0, str(root))
    sys.addaudithook(no_remote)
    import server
    import runtime_controller as runtime
    import construction_health
    import codex_runner as runner
    import blender_mcp as mcp
    import astra_spend_v2 as spend
    import runtime_check
    from phased_controller import RejectedForServer
    for module in (server, runtime, construction_health, runner, mcp, spend, runtime_check):
        require(Path(module.__file__).resolve().parent == root, 'STAGED_MODULE_MISMATCH')
    require(construction_health.REVISION == REVISION and runtime.REVISION == REVISION,
            'PHASED_STANDARD_RUNTIME_REQUIRED')
    # Read-only actual container probe, with the unchanged sandbox and no jobs.
    runtime_check.verify_runtime(4)
    folders, state_inode = create_jobs(root)
    cancelled = threading.Event()
    processes, commands, results = [], [], []
    original_popen = subprocess.Popen
    def tracked_popen(command, *args, **kwargs):
        names = {'froge-job-' + folder.name for folder in folders}
        if (isinstance(command, list) and ((len(command) == 3 and command[:2] == ['podman', 'kill']
                or len(command) == 4 and command[:3] == ['podman', 'rm', '--force'])
                and command[-1] in names)):
            # Preserve the original server's timeout/cancellation cleanup.
            return original_popen(command, *args, **kwargs)
        require(isinstance(command, list) and command[:2] == ['podman', 'run']
                and all(value in command for value in SANDBOX), 'ORIGINAL_PODMAN_SANDBOX_REQUIRED')
        job = next((folder for folder in folders if 'froge-job-' + folder.name in command), None)
        require(job is not None, 'UNKNOWN_FIXTURE_CONTAINER')
        final = command[-1] == '/runner/finalize.py'
        candidate = job / ('candidates/2' if job == folders[0] and any(
            item['job_id'] == job.name for item in commands) else 'candidates/1')
        require(command == server.blender_command(job.name, candidate, finalize=final), 'ORIGINAL_BLENDER_COMMAND_CHANGED')
        commands.append({'job_id': job.name, 'phase': 'finalize' if final else 'build', 'command_sha256': digest(canonical(command).encode())})
        process = original_popen(command, *args, **kwargs)
        processes.append(process)
        return process
    try:
        with patch.object(construction_health, 'verified_health',
                return_value={'worldifactStandardConstructionPolicy': REVISION}), \
             patch.object(subprocess, 'Popen', tracked_popen):
            for folder, accepted in zip(folders, (True, False)):
                provider = Provider(runner, mcp, spend, folder, accepted)
                original_open = urllib.request.OpenerDirector.open
                def intercepted(opener, request, *args, **kwargs):
                    return provider.open(original_open, opener, request, *args, **kwargs)
                with patch.object(urllib.request.OpenerDirector, 'open', intercepted):
                    try:
                        result = runtime.run(folder, PROMPT, INSTRUCTIONS, KEY, cancelled,
                                             lambda _: None, gateway_factory=provider.gateway)
                        require(accepted and result.get('accepted') is True, 'REJECTED_DRAFT_RETURNED_SUCCESS')
                    except RejectedForServer:
                        require(not accepted, 'ACCEPTED_FIXTURE_WAS_REJECTED')
                results.append(verify_case(folder, provider, mcp, spend, accepted))
        require(len(commands) == 5 and [item['phase'] for item in commands] == ['build', 'build', 'finalize', 'build', 'finalize'],
                'ACTUAL_CONTAINER_BUILDS_AND_EXPORTS_REQUIRED')
        require(hashes == {name: digest(read(root / name, 1048576)) for name in SOURCES}, 'STAGED_SOURCE_CHANGED')
    finally:
        cancelled.set()
        signal.setitimer(signal.ITIMER_REAL, 0)
        for signum in (signal.SIGTERM, signal.SIGHUP, signal.SIGALRM):
            signal.signal(signum, signal.SIG_IGN)
        cleanup(root, folders, processes, state_inode)
    evidence = {'revision': REVISION, 'source_sha256': hashes, 'cases': results, 'container_calls': commands,
        'isolated_podman_execution_verified': True, 'native_fallback': False,
        'provider_fixture': True, 'activation_receipt_fixture': True,
        'installed_runtime_receipt_written': False, 'live_provider_verified': False,
        'visual_quality_verified': False, 'cleanup_verified': True}
    descriptor = os.open(workspace / EVIDENCE, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, 'w', encoding='utf-8') as stream:
        stream.write(canonical(evidence)); stream.flush(); os.fsync(stream.fileno())


class Parser(argparse.ArgumentParser):
    def error(self, _message):
        raise Refused('INVALID_ARGUMENTS')


def main(argv=None):
    try:
        parser = Parser(description=__doc__)
        parser.add_argument('--source', required=True)
        parser.add_argument('--workspace', required=True)
        args = parser.parse_args(argv)
        def interrupted(*_):
            raise Refused('OFFLINE_GATE_INTERRUPTED')
        for signum in (signal.SIGTERM, signal.SIGHUP, signal.SIGALRM):
            signal.signal(signum, interrupted)
        signal.setitimer(signal.ITIMER_REAL, WALL_SECONDS)
        resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
        resource.setrlimit(resource.RLIMIT_CPU, (450, 480))
        resource.setrlimit(resource.RLIMIT_FSIZE, (128 * 1024**2, 128 * 1024**2))
        run(args.source, args.workspace)
        signal.setitimer(signal.ITIMER_REAL, 0)
        print(SUCCESS)
        return 0
    except (Exception, KeyboardInterrupt) as error:
        signal.setitimer(signal.ITIMER_REAL, 0)
        print(FAILURE + ' ' + (str(error) if isinstance(error, Refused) else 'OFFLINE_GATE_FAILED'))
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
