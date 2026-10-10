"""Run unchanged offline Blender gates on a fresh copy; never install it."""
import json
import os
from pathlib import Path
import shutil
import signal
import sqlite3
import subprocess
import sys

import repair


def main(package, source, workspace, resume=False):
    package, source, workspace = map(Path, (package, source, workspace))
    sys.path.insert(0, str(package))
    import install_construction as installer
    legacy, base = installer.legacy, installer.base
    installer.frozen_dependencies()
    originals = {name: base.read_regular(source / name) for name in repair.EXPECTED}
    patched = repair.patch_sources(originals)
    stage = workspace / 'runtime'
    if resume:
        base.safe_path(workspace)
        copied = json.loads(base.read_regular(workspace / 'copied-source.json', 65536))
        for name, digest in copied.items():
            maximum = 300 * 1024**2 if name in installer.EXECUTABLE_FILES else 2 * 1024**2
            if installer.digest(base.read_regular(source / name, maximum)) != digest:
                raise ValueError('Production source changed since stage creation')
            if base.read_regular(stage / name, maximum) != patched.get(name, base.read_regular(source / name, maximum)):
                raise ValueError('Staged dependency changed')
    else:
        workspace.mkdir(mode=0o700, exist_ok=False)
        copied = legacy.stage_runtime(source, stage, patched, {})
        (workspace / 'copied-source.json').write_text(json.dumps(copied, sort_keys=True))
    if {n: installer.digest(base.read_regular(stage / n)) for n in installer.policy.SOURCES} != installer.manifest.transport_manifest():
        raise ValueError('Exact transport release is required')

    def fresh_state():
        state = stage / 'state'
        state.mkdir(mode=0o700)
        with sqlite3.connect(state / 'jobs.sqlite') as db:
            db.execute('CREATE TABLE jobs (id TEXT PRIMARY KEY, prompt TEXT NOT NULL, state TEXT NOT NULL, detail TEXT NOT NULL, created REAL NOT NULL, updated REAL NOT NULL)')

    if not resume:
        fresh_state()
        generic = legacy.install_completion.Operations(stage, Path.home())
        generic.verify(workspace)
    elif 'ASTRA_GUARD_OFFLINE_ROUNDTRIP_OK' not in base.read_regular(workspace / 'offline-verification.log', 1048576).decode():
        raise ValueError('Completed original generic gate evidence is required')
    if not base.receipt_matches(stage):
        raise ValueError('Generic real Blender gate did not bind the source')
    generic_receipt = base.read_regular(stage / base.RECEIPT, 16384)
    shutil.rmtree(stage / 'state')
    env = {key: value for key, value in os.environ.items() if key in
           ('PATH', 'HOME', 'USER', 'LOGNAME', 'LANG', 'XDG_RUNTIME_DIR', 'DBUS_SESSION_BUS_ADDRESS', 'TMPDIR')}
    env.update(PYTHONDONTWRITEBYTECODE='1', FROGE_FAST_DRAFT_V1='0')
    for name, (expected, marker) in installer.GATE_FILES.items():
        verifier = package / name
        if base.blob_sha(base.read_regular(verifier)) != expected:
            raise ValueError('Historical gate bytes changed')
        if name == 'offline_cabinet.py':
            fresh_state()
        args = [sys.executable, '-B', str(verifier), '--source', str(stage)]
        proof = workspace / name.removesuffix('.py')
        if name != 'offline_cabinet.py':
            proof.mkdir(mode=0o700)
            args += ['--workspace', str(proof)]
        print('RUN', name, flush=True)
        log = workspace / (name + '.log')
        with log.open('xb') as output:
            process = subprocess.Popen(args, cwd=stage, env=env, stdin=subprocess.DEVNULL,
                                       stdout=output, stderr=subprocess.STDOUT, start_new_session=True)
            try:
                code = process.wait(timeout=600)
            except BaseException:
                if process.poll() is None:
                    os.killpg(process.pid, signal.SIGTERM)
                    try:
                        process.wait(timeout=20)
                    except subprocess.TimeoutExpired:
                        os.killpg(process.pid, signal.SIGKILL)
                        process.wait(timeout=10)
                raise
        if code != 0 or marker not in base.read_regular(log, 1048576).decode():
            raise ValueError('Offline gate failed: ' + name)
        if name == 'offline_construction.py':
            installer.validate_phased_evidence(base.read_regular(proof / 'phased-standard-evidence.json', 65536), transport=True)
        elif name == 'offline_legacy_standard.py':
            installer.validate_legacy_evidence(base.read_regular(proof / 'legacy-standard-evidence.json', 65536), transport=True)
        if (stage / 'state').exists():
            shutil.rmtree(stage / 'state')
        if base.read_regular(stage / base.RECEIPT, 16384) != generic_receipt:
            raise ValueError('Generic evidence changed')
        print('PASS', name, flush=True)
    for name, digest in copied.items():
        maximum = 300 * 1024**2 if name in installer.EXECUTABLE_FILES else 2 * 1024**2
        if installer.digest(base.read_regular(source / name, maximum)) != digest:
            raise ValueError('Production source changed while checking stage')
    if any(base.read_regular(stage / name) != raw for name, raw in patched.items()):
        raise ValueError('Stage source changed')
    proof = {'source_sha256': {name: installer.digest(base.read_regular(stage / name))
                              for name in installer.policy.SOURCES},
             'generic_receipt_sha256': installer.digest(generic_receipt),
             'gates': sorted(installer.REQUIRED_GATES), 'provider_fixture': True,
             'installed': False, 'live_provider_verified': False}
    (workspace / 'transport-verification.json').write_text(json.dumps(proof, sort_keys=True))
    print('TRANSPORT_STAGED_GATES_PASSED; production unchanged; no paid API', flush=True)


if __name__ == '__main__':
    main(*sys.argv[1:4], resume=sys.argv[4:] == ['--resume'])
