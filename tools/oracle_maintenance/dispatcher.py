"""Forced-command entry point for exactly two literal maintenance commands.

Run with Python -I -B and an absolute path from an OpenSSH restricted key. The
caller cannot supply paths, installer options, shell syntax or Python input.
Bootstrap installs these files privately and checks their release hashes.
"""
import importlib.util
import json
import os
import re
from pathlib import Path
import signal
import stat
import subprocess
import sys
import tempfile


REVISION = 'oracle-maintenance-initial-edit-v1'
SOURCE_COMMIT = '5e375f0f7d6f42d8c4d8944fa024bfb474143c04'
LAUNCHER_HASH = 'c87d9826480173dead7c175db75f0d4f143c8f8bc63fea753cc84ebc6e1e2f57'
COMMANDS = frozenset(('status', 'apply-initial-edit-v1'))
INSTALL_TIMEOUT = 3180
OUTPUT_LIMIT = 32768
WIRE_LIMIT = 16384
INSTALL_FLAGS = ('--update-initial-edit', '--approve-service-maintenance',
                 '--allow-cancelled-cleanup', '--expected-cancelled-job',
                 'f91612e5-eb5a-4fec-9585-1ce08c9f38ad')
# -I retains stdlib isolation; only the validated, fixed package enters sys.path.
INSTALL_ENTRY = ('import runpy,sys;sys.path.insert(0,sys.argv[1]);'
                 'sys.argv=sys.argv[2:];runpy.run_path(sys.argv[0],run_name="__main__")')


def load_status():
    location = Path(__file__).absolute().parent / 'status.py'
    spec = importlib.util.spec_from_file_location('oracle_maintenance_status', location)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def envelope(action, result, snapshot=None, installer=None):
    return {'revision': REVISION, 'action': action, 'result': result,
            'status': snapshot, 'installer': installer}


def private_path(path, home):
    """Refuse links and another account's writable package or parent directory."""
    path, home = Path(path), Path(home)
    path.relative_to(home)
    for item in (path, *path.parents):
        info = item.lstat()
        if stat.S_ISLNK(info.st_mode):
            raise ValueError('linked_package')
        if item == home or home in item.parents:
            if info.st_uid != os.getuid() or info.st_mode & 0o022:
                raise ValueError('unsafe_package_permissions')
        if item == home:
            break


def reject_repository_fallbacks(package):
    """Keep the pinned installers on their verified flattened-package branch.

    Historical installers support a repository layout by prepending/appending
    ../.. / tools/{profit_guard,model_completion,model_prebuild,model_context,
    model_budget_tiers,model_context_upgrade}. install.py also selects the
    sibling fast_preview directory. The two sibling context directories are
    helper-file fallbacks. Reject even dangling links, without reading, editing
    or importing any of these outside locations.
    """
    package = Path(package)
    forbidden = (package.parents[1] / 'tools', package.parent / 'fast_preview',
                 package.parent / 'model_context', package.parent / 'model_context_upgrade')
    if any(os.path.lexists(path) for path in forbidden):
        raise ValueError('repository_fallback_present')


def verified_package(api, home):
    if not re.fullmatch(r'[0-9a-f]{40}', SOURCE_COMMIT) or not re.fullmatch(r'[0-9a-f]{64}', LAUNCHER_HASH):
        raise ValueError('unfrozen_release')
    package = home / '.local/share/worldifact-maintenance/update-initial-edit-v1'
    private_path(package, home)
    reject_repository_fallbacks(package)
    reader = api.Reader()
    launcher_path = package / 'oracle_construction_launch.py'
    private_path(launcher_path, home)
    raw, _ = reader.inspect(launcher_path, 262144)
    if api.digest(raw) != LAUNCHER_HASH:
        raise ValueError('unverified_launcher')
    namespace = {'__name__': 'pinned_package_manifest', '__file__': str(launcher_path)}
    exec(compile(raw, 'pinned_package_manifest', 'exec'), namespace)
    expected = namespace['FILES']
    if type(expected) is not dict or len(expected) != 42:
        raise ValueError('unexpected_package')
    fd = api.directory(package)
    try:
        names = os.listdir(fd)
    finally:
        os.close(fd)
    if set(names) != set(expected) | {'oracle_construction_launch.py'}:
        raise ValueError('unexpected_package_files')
    for name, (_source, wanted) in expected.items():
        path = package / name
        private_path(path, home)
        raw, _ = reader.inspect(path, 262144)
        if raw is None or not raw or namespace['blob'](raw) != wanted:
            raise ValueError('unverified_package')
        compile(raw, name, 'exec')
    if reader.changed():
        raise ValueError('package_changed')
    return package


def run_installer(api, package, home):
    argv = ['/usr/bin/python3', '-I', '-B', '-c', INSTALL_ENTRY, str(package),
            str(package / 'install_construction.py'), *INSTALL_FLAGS]
    with tempfile.TemporaryFile() as output:
        reject_repository_fallbacks(package)
        process = subprocess.Popen(argv, cwd=package, env=api.clean_environment(home),
                                   stdin=subprocess.DEVNULL, stdout=output, stderr=subprocess.STDOUT,
                                   close_fds=True)
        handlers = {}

        def relay(number, _frame):
            if process.poll() is None:
                process.send_signal(number)

        try:
            for number in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP):
                handlers[number] = signal.signal(number, relay)
            try:
                code = process.wait(timeout=INSTALL_TIMEOUT)
            except subprocess.TimeoutExpired:
                process.terminate()
                try:
                    process.wait(timeout=120)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=15)
                raise ValueError('timeout_unconfirmed') from None
            output.seek(0)
            raw = output.read(OUTPUT_LIMIT + 1)
        finally:
            for number, previous in handlers.items():
                signal.signal(number, previous)
    if len(raw) > OUTPUT_LIMIT:
        raise ValueError('output_limit')
    lines = raw.decode('utf-8').splitlines()
    if not lines:
        raise ValueError('missing_result')
    observed = api.safe_result(api.parse_json(lines[-1]))
    if code not in (0, 1) or (code == 0) != (observed['phase'] == api.SUCCESS):
        raise ValueError('exit_mismatch')
    return observed


def dispatch(command, *, api=None):
    # Exact comparison rejects options, whitespace, newlines, shell operators,
    # subsystem requests and an empty interactive session without executing them.
    if type(command) is not str or command not in COMMANDS:
        return envelope(None, 'refused'), 1
    api = load_status() if api is None else api
    home = api.account_home()
    before = api.read_status(home)
    state = api.classify(before)
    if command == 'status':
        return envelope(command, state, before), 0
    if state == 'already_updated':
        return envelope(command, state, before), 0
    if state != 'ready_to_apply':
        return envelope(command, state, before), 1
    observed = None
    try:
        package = verified_package(api, home)
        # Package validation can take time. Reconcile again before entering the
        # unchanged installer, which acquires its own existing nonblocking lock.
        before = api.read_status(home)
        state = api.classify(before)
        if state != 'ready_to_apply':
            return envelope(command, state, before), 0 if state == 'already_updated' else 1
        observed = run_installer(api, package, home)
    except (Exception, KeyboardInterrupt):
        after = api.read_status(home)
        return envelope(command, 'not_confirmed', after), 1
    after = api.read_status(home)
    if observed['phase'] == api.SUCCESS and api.classify(after) == 'already_updated':
        return envelope(command, 'updated', after, observed), 0
    return envelope(command, 'not_confirmed', after, observed), 1


def main(argv=None, environ=None):
    argv = sys.argv[1:] if argv is None else argv
    environ = os.environ if environ is None else environ
    command = environ.get('SSH_ORIGINAL_COMMAND') if not argv else None
    try:
        value, code = dispatch(command)
        raw = json.dumps(value, sort_keys=True, separators=(',', ':'))
        if len(raw.encode('utf-8')) + 1 > WIRE_LIMIT:
            raise ValueError('wire_limit')
    except (Exception, KeyboardInterrupt):
        raw, code = json.dumps(envelope(None, 'refused'), sort_keys=True), 1
    print(raw, flush=True)
    return code


if __name__ == '__main__':
    raise SystemExit(main())
