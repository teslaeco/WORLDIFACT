"""Actual staged HTTP/SQLite/ledger acceptance over three fresh processes.

No worker thread or model is started. Each child denies external sockets and
subprocesses, uses only synthetic credentials in fresh private stage state, and
executes the unchanged candidate Handler and real immutable model-term binder.
This proves isolated ingress/restart behavior, not a paid provider or a VM reboot.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import signal
import sqlite3
import subprocess
import sys
import threading
import time
import urllib.request
import uuid

import activation_manifest as manifest

SUCCESS = 'WORLDIFACT_DURABLE_INGRESS_OFFLINE_VERIFIED'
HERE = Path(__file__).resolve().parent
SOURCE_MAX = 2 * 1024**2


def require(value):
    if not value:
        raise ValueError('ISOLATED_INGRESS_NOT_VERIFIED')


def regular(path, maximum=SOURCE_MAX):
    path = Path(path).absolute()
    require(not any(p.is_symlink() for p in (path, *path.parents)))
    require(path.is_file() and 0 < path.stat().st_size <= maximum)
    raw = path.read_bytes()
    require(0 < len(raw) <= maximum)
    return raw


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def sources(root):
    result = {n: digest(regular(root / n)) for n in manifest.final_manifest()}
    require(result == manifest.final_manifest())
    return result


def write_new(path, raw):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(raw)
        stream.flush()
        os.fsync(stream.fileno())


def deny_external(event, args):
    if event in ('subprocess.Popen', 'os.system', 'os.posix_spawn', 'os.exec', 'os.fork', 'os.forkpty'):
        raise ValueError('PROVIDER_OR_EXECUTION_FORBIDDEN')
    if event == 'socket.connect':
        address = args[1]
        require(isinstance(address, tuple) and address[0] == '127.0.0.1')


def child(root, case_file, phase):
    sources(root)
    case = json.loads(regular(case_file, 8192))
    require(set(case) == {'id', 'owner', 'fingerprint', 'payload', 'payload_sha256', 'nonce'})
    raw = case['payload'].encode()
    require(digest(raw) == case['payload_sha256'])
    state = root / 'state'
    marker = state / '.worldifact-inert-admission'
    if phase == 'stage':
        require(not os.path.lexists(state))
        state.mkdir(mode=0o700)
        write_new(marker, case['nonce'].encode())
        write_new(state / 'ai-provider.json', b'{"provider":"openai","api_key":"inert-unused-no-provider-key"}')
    else:
        require(regular(marker, 256) == case['nonce'].encode())
    sys.path.insert(0, str(root))
    sys.dont_write_bytecode = True
    sys.addaudithook(deny_external)
    import server
    import studio_execution
    import durable_admission
    require(Path(server.__file__).resolve().parent == root
            and Path(studio_execution.__file__).resolve().parent == root
            and Path(durable_admission.__file__).resolve().parent == root)
    server.initialize()
    actual = server.health()
    require(actual.get('ready') is True and actual.get('studioAdmissionRevision') == manifest.REVISION)
    token = json.loads(regular(state / 'config.json', 16384))['token']
    http = server.ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
    thread = threading.Thread(target=http.serve_forever, daemon=True)
    thread.start()
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    def request(path, body):
        req = urllib.request.Request('http://127.0.0.1:%d%s' % (http.server_address[1], path), data=body,
            headers={'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token,
                     'X-WORLDIFACT-Owner': case['owner'], 'X-WORLDIFACT-Fingerprint': case['fingerprint']})
        with opener.open(req, timeout=10) as response:
            require(response.status == 202)
            value = json.loads(response.read(65537))
            require(value['id'] == case['id'] and value['admission']['payloadSha256'] == case['payload_sha256'])
            return value['admission']
    try:
        if phase == 'stage':
            accepted = request('/v1/jobs/stage', raw)
            require(accepted['phase'] == 'staged')
            with server.database() as db:
                require(db.execute('SELECT COUNT(*) FROM jobs').fetchone()[0] == 0)
            require(not any((state / 'jobs').iterdir()))
        elif phase == 'start':
            accepted = request('/v1/jobs/stage', raw)
            require(accepted['phase'] == 'staged')
            authority = json.dumps({'id': case['id'], 'payloadSha256': case['payload_sha256'],
                                    'deadline': int((time.time() + 60) * 1000)}).encode()
            one = request('/v1/jobs/start', authority)
            two = request('/v1/jobs/start', authority)
            require(one == two and one['phase'] == 'authorized')
            server.ADMISSIONS.drain()
            server.ADMISSIONS.drain()
            folder = state / 'jobs' / case['id']
            terms = studio_execution.job_terms(folder)
            require(terms == {'revision': 'studio-execution-v1', 'model': 'astra', 'mode': 'standard'})
            ledger = studio_execution.root_for(folder)
            record = json.loads(regular(ledger / studio_execution.STATE, 16384))
            require(record['holds'] == {})
        elif phase == 'reopen':
            fd = durable_admission.process_lock(state)
            try:
                with server.database() as db:
                    durable_admission.recover_after_restart(db)
                server.ADMISSIONS.drain()
                authority = json.dumps({'id': case['id'], 'payloadSha256': case['payload_sha256'],
                                        'deadline': int((time.time() + 60) * 1000)}).encode()
                accepted = request('/v1/jobs/start', authority)
                require(accepted['phase'] == 'queued')
            finally:
                os.close(fd)
        else:
            raise ValueError('UNKNOWN_INERT_PHASE')
        if phase != 'stage':
            with server.database() as db:
                rows = db.execute('SELECT id,state FROM jobs').fetchall()
            require([tuple(row) for row in rows] == [(case['id'], 'queued')])
            row = server.ADMISSIONS.inbox.read(case['id'])
            require(row['phase'] == 'queued' and row['payloadSha256'] == case['payload_sha256'])
            with sqlite3.connect((state / 'admissions.sqlite').as_uri() + '?mode=ro', uri=True) as db:
                payload, count = db.execute('SELECT payload,preparations FROM admissions WHERE id=?', (case['id'],)).fetchone()
                require(payload == raw and count == 1)
            folder = state / 'jobs' / case['id']
            require(studio_execution.job_terms(folder) == json.loads(raw)['studioExecution'])
            holds = json.loads(regular(studio_execution.root_for(folder) / studio_execution.STATE, 16384))['holds']
            require(holds == {})
        require(not server.RUNNING and not server.CANCEL)
        sources(root)
        print(json.dumps({'phase': phase, 'passed': True, 'provider_requested': False}, sort_keys=True))
    finally:
        http.shutdown()
        thread.join(timeout=5)
        http.server_close()
        require(not thread.is_alive())


def verify(root, workspace):
    root, workspace = Path(root).absolute(), Path(workspace).absolute()
    for path in (root, workspace):
        require(path.is_dir() and not any(p.is_symlink() for p in (path, *path.parents)))
    require(root != workspace and not os.path.lexists(root / 'state'))
    before = sources(root)
    job_id = str(uuid.uuid4())
    nonce = uuid.uuid4().hex
    payload = json.dumps({'id': job_id, 'prompt': 'Synthetic ingress-only fixture; never render or contact a provider.',
        'agentInstructions': '', 'studioExecution': {'revision': 'studio-execution-v1', 'model': 'astra', 'mode': 'standard'}}, sort_keys=True)
    case = {'id': job_id, 'owner': digest(b'isolated-owner'), 'fingerprint': digest(payload.encode()),
            'payload': payload, 'payload_sha256': digest(payload.encode()), 'nonce': nonce}
    case_file = workspace / 'admission-private-case.json'
    evidence_file = workspace / 'admission-evidence.json'
    require(not os.path.lexists(case_file) and not os.path.lexists(evidence_file))
    write_new(case_file, json.dumps(case, sort_keys=True).encode())
    env = {k: v for k, v in os.environ.items() if k in ('PATH', 'HOME', 'USER', 'LOGNAME', 'LANG',
                                                     'XDG_RUNTIME_DIR', 'DBUS_SESSION_BUS_ADDRESS', 'TMPDIR')}
    env['PYTHONDONTWRITEBYTECODE'] = '1'
    state_identity = None
    try:
        for phase in ('stage', 'start', 'reopen'):
            process = subprocess.Popen([sys.executable, '-B', str(Path(__file__).resolve()), '--source', str(root),
                                        '--case', str(case_file), '--phase', phase],
                                       cwd=root, env=env, stdin=subprocess.DEVNULL,
                                       stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
            try:
                output, errors = process.communicate(timeout=40)
            except BaseException:
                if process.poll() is None:
                    os.killpg(process.pid, signal.SIGTERM)
                    try:
                        process.communicate(timeout=5)
                    except subprocess.TimeoutExpired:
                        os.killpg(process.pid, signal.SIGKILL)
                        process.communicate(timeout=5)
                raise
            require(process.returncode == 0 and len(output) <= 4096 and len(errors) <= 4096)
            require(json.loads(output) == {'phase': phase, 'passed': True, 'provider_requested': False})
            state = root / 'state'
            require(regular(state / '.worldifact-inert-admission', 256) == nonce.encode())
            identity = (state.stat().st_dev, state.stat().st_ino)
            if state_identity is None:
                state_identity = identity
            require(state_identity == identity)
            require(sources(root) == before)
    finally:
        # Only synthetic state created by these children can be removed. The
        # installer separately verifies cleanup and every unchanged source byte.
        state = root / 'state'
        if os.path.lexists(state):
            require(not state.is_symlink() and regular(state / '.worldifact-inert-admission', 256) == nonce.encode())
            if state_identity is not None:
                require((state.stat().st_dev, state.stat().st_ino) == state_identity)
            shutil.rmtree(state)
    require(not os.path.lexists(root / 'state') and sources(root) == before)
    value = {'revision': manifest.REVISION, 'source_sha256': before, 'stage_survived_restart': True,
             'start_idempotent': True, 'queue_row_preserved': True, 'input_hash_verified': True,
             'model_terms_verified': True, 'no_provider_calls': True, 'cleanup_verified': True}
    write_new(evidence_file, (json.dumps(value, sort_keys=True) + '\n').encode())
    return value


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, allow_abbrev=False)
    parser.add_argument('--source', required=True)
    parser.add_argument('--workspace')
    parser.add_argument('--case')
    parser.add_argument('--phase', choices=('stage', 'start', 'reopen'))
    args = parser.parse_args(argv)
    root = Path(args.source).absolute()
    if args.phase and args.case and not args.workspace:
        child(root, Path(args.case).absolute(), args.phase)
    else:
        require(args.workspace and not args.case and not args.phase)
        verify(root, args.workspace)
        print(SUCCESS)


if __name__ == '__main__':
    try:
        main()
    except (Exception, KeyboardInterrupt):
        print('WORLDIFACT_DURABLE_INGRESS_OFFLINE_FAILED')
        raise SystemExit(1)
