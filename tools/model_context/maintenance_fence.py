"""Conservative, transient maintenance for the exact reviewed STANDARD context ancestors and rollback sources.

No mask, unit edit, database row edit, raw-PID signal, ptrace or process-memory
inspection. Only the pinned simple worker with Restart=on-failure, default TERM
disposition and no forced restart is supported. The exact proven process exits
through pidfd TERM+CONT; no name-addressed StopUnit is used. Exclusive authorized
maintenance remains required against concurrent administrators. The existing
quick tunnel stays running to preserve its URL: its origin is offline at yield,
but starting a worker exposes it before local health confirmation.

Kernel fixtures prove the pidfd/resumer mechanics only. They do not attest a
host's systemd, source ancestry, network, cgroups or Podman visibility.
"""
from contextlib import contextmanager
from dataclasses import dataclass
import hashlib
import json
import os
from pathlib import Path
import re
import select
import signal
import sqlite3
import stat
import subprocess
import sys
import time
import types

from context_patch import EXPECTED, reviewed_manifest

WORKER = 'froge-worker.service'
TUNNEL = 'froge-tunnel.service'
FREEZE_SECONDS = 20.0
COMMAND_SECONDS = 3.0
JOURNAL_SHA256 = '427f365b40264a71d1cdd208e94156617d3524518fc9f621485f4a91419fa54e'
BASELINE_THREADS = 2  # Exact server: main + its one immortal queue worker.
PROPERTIES = (
    'Id', 'LoadState', 'ActiveState', 'SubState', 'MainPID', 'InvocationID',
    'Type', 'Restart', 'WatchdogUSec', 'RuntimeMaxUSec', 'Job', 'TriggeredBy',
    'Triggers', 'ExecStart', 'ExecStartPre', 'ExecStartPost', 'ExecStop',
    'ExecStopPost', 'ExecReload', 'WorkingDirectory', 'RootDirectory',
    'RootImage', 'KillMode', 'KillSignal', 'SendSIGHUP', 'RemainAfterExit',
    'NeedDaemonReload', 'OnFailure', 'OnSuccess', 'PropagatesStopTo',
    'ConsistsOf', 'BoundBy', 'Upholds', 'UpheldBy', 'PartOf', 'ControlGroup',
    'FragmentPath', 'DropInPaths', 'NRestarts', 'StopWhenUnneeded',
    'RestartUSec', 'RestartForceExitStatus', 'RestartPreventExitStatus',
    'SuccessExitStatus', 'Result', 'ExecMainCode', 'ExecMainStatus',
    'ExecCondition', 'Wants', 'Requires', 'BindsTo', 'Conflicts', 'Slice',
    'StandardOutput', 'StandardError',
)
OPTIONAL_EXEC = ('ExecStartPre', 'ExecStartPost', 'ExecStop', 'ExecStopPost', 'ExecReload', 'ExecCondition')
IDENTITY = ('MainPID', 'InvocationID', 'NRestarts')
VOLATILE = {'ActiveState', 'SubState', 'MainPID', 'InvocationID', 'Job', 'NRestarts', 'ControlGroup', 'Result', 'ExecMainCode', 'ExecMainStatus'}


class FenceError(RuntimeError):
    def __init__(self, code, message):
        self.code = code
        super().__init__(message)


class FenceRefused(FenceError):
    """No installation lease was admitted; no unknown work may be stopped."""


class RecoveryRequired(FenceError):
    """Origin/marker state needs explicit recovery; the quick tunnel is untouched."""


def refuse(code, message):
    raise FenceRefused(code, message)


def _regular(path, maximum=8 * 1024 * 1024):
    path = Path(path)
    if any(p.is_symlink() for p in (path, *path.parents)):
        refuse('symlink_path', 'Maintenance paths must not contain symlinks.')
    info = path.stat()
    if not stat.S_ISREG(info.st_mode) or not 0 < info.st_size <= maximum:
        refuse('unsupported_file', 'A required regular file is unavailable.')
    return path.read_bytes(), info


def _source(source, started=None, expected_sources=None):
    for name, expected in (expected_sources or EXPECTED).items():
        raw, info = _regular(Path(source) / name)
        if hashlib.sha256(raw).hexdigest() != expected:
            refuse('source_changed', 'The exact reviewed worker source is required.')
        if started is not None and info.st_ctime >= started:
            refuse('loaded_source_unproven', 'Source changed since this process started.')


def allowed_job_history(connection, allow_cancelled_cleanup=False, expected_cancelled=None):
    """Permit only the single consented cancellation; never change a job row."""
    if type(allow_cancelled_cleanup) is not bool:
        refuse('cancelled_consent_invalid', 'Cancellation cleanup requires an explicit boolean consent.')
    row = connection.execute("SELECT COUNT(*) FROM jobs WHERE state IS NULL OR state NOT IN ('succeeded','failed','cancelled')").fetchone()
    if row is None or row[0] != 0:
        refuse('unsafe_job_history', 'Nonterminal or unknown jobs prevent maintenance.')
    rows = connection.execute("SELECT id FROM jobs WHERE state='cancelled' LIMIT 2").fetchall()
    if rows and not allow_cancelled_cleanup:
        refuse('unsafe_job_history', 'Cancelled jobs require explicit cleanup interruption consent.')
    identities = tuple(row[0] for row in rows)
    if len(identities) > 1 or any(not isinstance(value, str) or not re.fullmatch(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}', value) for value in identities):
        refuse('cancelled_scope_changed', 'Only one explicitly consented cancelled job is supported.')
    if expected_cancelled is not None and identities != expected_cancelled:
        refuse('cancelled_scope_changed', 'Cancelled job identity changed during maintenance.')
    return identities


@contextmanager
def database_gate(source, *, frozen=False, timeout=0.25, allow_cancelled_cleanup=False, expected_cancelled=None):
    """Never rewrites jobs, including cancelled history. Frozen gate holds admission."""
    path = Path(source) / 'state/jobs.sqlite'
    _regular(path, 128 * 1024 * 1024)
    connection = None
    try:
        connection = sqlite3.connect(path.as_uri() + ('?mode=rw' if frozen else '?mode=ro'),
                                     uri=True, timeout=timeout)
        if frozen:
            connection.execute('BEGIN IMMEDIATE')
        identities = allowed_job_history(connection, allow_cancelled_cleanup, expected_cancelled)
        yield identities
    except sqlite3.Error as error:
        raise FenceRefused('database_unproven', 'The job admission gate could not be proven.') from error
    finally:
        if connection is not None:
            connection.rollback()
            connection.close()


def _property_lines(output, permitted):
    result = {}
    for line in output.splitlines():
        key, separator, value = line.partition('=')
        if not separator or key in result or key not in permitted:
            refuse('unit_unreadable', 'The complete service properties are required.')
        result[key] = value
    return result


def _empty_exec_arrays(operations, name, missing):
    # v252 systemctl-show.c prints Exec arrays only inside its element loop.
    # Missing text is insufficient: require explicit, correctly typed empty
    # values from the manager for every omitted hook, including after freeze.
    objects = {WORKER: 'froge_2dworker_2eservice', TUNNEL: 'froge_2dtunnel_2eservice'}
    try:
        output = operations.command(['busctl', '--user', '--auto-start=no', 'get-property',
            'org.freedesktop.systemd1', '/org/freedesktop/systemd1/unit/' + objects[name],
            'org.freedesktop.systemd1.Service', *missing], timeout=COMMAND_SECONDS)
    except (OSError, subprocess.SubprocessError) as error:
        raise FenceRefused('unit_hooks_unproven', 'Explicit empty service hooks could not be verified.') from error
    if output.splitlines() != ['a(sasbttttuii) 0'] * len(missing):
        refuse('unit_hooks_unproven', 'Every omitted service hook must be an explicit typed empty array.')


def _app_slice(operations, unit, name):
    # v252 unit_add_slice_dependencies adds Requires for the configured Slice.
    # Permit only this fixed slice and prove its actual parent cgroup relation.
    if unit['Slice'] != 'app.slice':
        refuse('unit_slice_property_mismatch', 'The required application slice differs from the configured slice.')
    keys = ('Id', 'LoadState', 'ActiveState', 'ControlGroup')
    output = operations.command(['systemctl', '--user', 'show', 'app.slice',
        '--property=' + ','.join(keys)], timeout=COMMAND_SECONDS)
    parent = _property_lines(output, keys)
    if set(parent) != set(keys) or parent['Id'] != 'app.slice':
        refuse('unit_slice_identity_unproven', 'The implicit application slice could not be verified.')
    if parent['LoadState'] != 'loaded' or parent['ActiveState'] != 'active':
        refuse('unit_slice_not_active', 'The required application slice must be loaded and active.')
    group = parent['ControlGroup']
    if (not group.startswith('/') or '..' in group.split('/') or
            group != str(Path(group)) or Path(group).name != 'app.slice'):
        refuse('unit_slice_group_unproven', 'The application slice must have its canonical cgroup.')
    if unit['ControlGroup']:
        if unit['ControlGroup'] != group + '/' + name:
            refuse('unit_slice_service_group_mismatch', 'The service must be an immediate child of its verified application slice.')
    elif unit['MainPID'] != '0' or unit['ActiveState'] not in ('inactive', 'failed', 'deactivating'):
        refuse('unit_slice_service_group_missing', 'A running service must have its verified cgroup.')


def _unit(operations, name):
    if name not in (WORKER, TUNNEL):
        refuse('unit_unreadable', 'Only the two reviewed services are supported.')
    output = operations.command(['systemctl', '--user', 'show', name,
                                 '--property=' + ','.join(PROPERTIES)], timeout=COMMAND_SECONDS)
    result = _property_lines(output, PROPERTIES)
    missing = [key for key in PROPERTIES if key not in result]
    if any(key not in OPTIONAL_EXEC for key in missing):
        refuse('unit_unreadable', 'The complete service properties are required.')
    if missing:
        _empty_exec_arrays(operations, name, missing)
        result.update({key: '' for key in missing})
    if 'app.slice' in result['Requires'].split():
        _app_slice(operations, result, name)
    return result


def _configuration(unit):
    # ExecStart includes invocation-dependent status fields in systemctl show.
    return {key: (value.split(' ; start_time=', 1)[0] if key == 'ExecStart' else value)
            for key, value in unit.items() if key not in VOLATILE}


def _unit_files(unit):
    paths = [unit['FragmentPath'], *unit['DropInPaths'].split()]
    if not paths[0]:
        refuse('unit_source_unproven', 'The loaded service file is unavailable.')
    return {p: hashlib.sha256(_regular(p)[0]).hexdigest() for p in paths}


def _same_files(files):
    for path, digest in files.items():
        if hashlib.sha256(_regular(path)[0]).hexdigest() != digest:
            refuse('unit_changed', 'Service configuration changed during maintenance.')


def _unit_policy(unit, source, worker=True):
    name = WORKER if worker else TUNNEL
    required = {'Id': name, 'LoadState': 'loaded', 'Type': 'simple', 'Restart': 'on-failure',
                'RestartUSec': '5s' if worker else '10s',
                'WatchdogUSec': '0', 'RuntimeMaxUSec': 'infinity', 'KillMode': 'control-group',
                'KillSignal': '15', 'SendSIGHUP': 'no', 'RemainAfterExit': 'no',
                'NeedDaemonReload': 'no', 'StopWhenUnneeded': 'no'}
    for key, value in required.items():
        if unit[key] != value:
            refuse('unsupported_unit_' + key.lower(), 'Unsupported service semantics: ' + key + '.')
    for key in ('TriggeredBy', 'Triggers', 'ExecStartPre', 'ExecStartPost', 'ExecStop',
                'ExecStopPost', 'ExecReload', 'RootDirectory', 'RootImage', 'OnFailure',
                'OnSuccess', 'PropagatesStopTo', 'ConsistsOf', 'BoundBy', 'Upholds',
                'UpheldBy', 'PartOf', 'ExecCondition', 'BindsTo',
                'RestartForceExitStatus', 'RestartPreventExitStatus', 'SuccessExitStatus'):
        if unit[key]:
            refuse('unsupported_unit_' + key.lower(), 'Unsupported service semantics: ' + key + '.')
    if unit['Wants'] != ('froge-ollama.service' if worker else ''):
        refuse('unsupported_unit_wants', 'Only the pinned Ollama dependency is supported.')
    unknown = set(unit['Requires'].split()) - {'basic.target', 'sysinit.target', 'app.slice'}
    if unknown:
        # Fixed categories are sufficient for the refusal receipt; never print
        # arbitrary dependency names, which may contain private project data.
        kinds = {value.rsplit('.', 1)[-1] for value in unknown}
        kind = next(iter(kinds)) if len(kinds) == 1 else 'mixed'
        if kind not in ('service', 'target', 'slice', 'socket', 'mount', 'mixed'):
            kind = 'other'
        refuse('unit_requires_unknown_' + kind, 'An unreviewed dependency category prevents maintenance: ' + kind + '.')
    if not set(unit['Conflicts'].split()) <= {'shutdown.target'}:
        refuse('unsupported_unit_dependencies', 'Unreviewed activation dependencies prevent maintenance.')
    if 'app.slice' in unit['Requires'].split() and (
            unit['Slice'] != 'app.slice' or
            Path(unit['ControlGroup']).parts[-2:] != ('app.slice', name)):
        refuse('unit_slice_unproven', 'The running service must use its verified application slice.')
    if unit['Job'] not in ('', '0'):
        refuse('unit_job_pending', 'A pending service job prevents maintenance.')
    if worker:
        if unit['WorkingDirectory'] != str(source):
            refuse('wrong_worker_directory', 'Worker runs from another source directory.')
        expected = '{ path=/usr/bin/python3 ; argv[]=/usr/bin/python3 ' + str(source / 'server.py') + ' ; ignore_errors=no'
        if not unit['ExecStart'].startswith(expected + ' ;'):
            refuse('unsupported_worker_command', 'Only the reviewed direct Python worker is supported.')
    else:
        executable = str(source / 'bin/cloudflared')
        argv = executable + ' tunnel --no-autoupdate --protocol http2 --url http://127.0.0.1:8765 --logfile ' + str(source / 'state/tunnel.log')
        expected = '{ path=' + executable + ' ; argv[]=' + argv + ' ; ignore_errors=no'
        if not unit['ExecStart'].startswith(expected + ' ;'):
            refuse('unreviewed_ingress_command', 'The exact existing quick-tunnel command is required.')
    if unit['ActiveState'] != 'active' or unit['SubState'] != 'running':
        refuse('unit_not_running', 'Both original services must be active and running.')
    if not unit['MainPID'].isdigit() or int(unit['MainPID']) <= 1 or not unit['NRestarts'].isdigit() or not re.fullmatch('[a-f0-9]{32}', unit['InvocationID']):
        refuse('unit_identity_unproven', 'Service identity could not be established.')


def _proc_stat(pid):
    parts = (Path('/proc') / str(pid) / 'stat').read_text().rsplit(')', 1)[1].split()
    return int(parts[19]), int(parts[1])


def _process_start(pid):
    ticks, _ = _proc_stat(pid)
    # /proc/stat btime is rounded to whole seconds and would falsely reject a
    # newly written, immediately restarted reviewed worker during rollback.
    # Use a bounded clock sample; the tick-quantized lower bound is conservative.
    before = time.time()
    uptime = time.clock_gettime(time.CLOCK_BOOTTIME)
    after = time.time()
    if not 0 <= after - before < .1:
        refuse('process_start_unproven', 'A stable process-start clock sample is required.')
    return ticks, before - uptime + ticks / os.sysconf('SC_CLK_TCK')


def _tasks(pid):
    result = {}
    for task in (Path('/proc') / str(pid) / 'task').iterdir():
        fields = dict(line.split(':', 1) for line in (task / 'status').read_text().splitlines() if ':' in line)
        result[int(task.name)] = fields['State'].strip().split()[0]
    if not result:
        refuse('threads_unreadable', 'Worker thread state is unavailable.')
    return result


def _dead(pidfd):
    return bool(select.select([pidfd], [], [], 0)[0])


def _resume(pidfd):
    try:
        signal.pidfd_send_signal(pidfd, signal.SIGCONT)
    except ProcessLookupError:
        pass  # Never reopen or retry a numeric PID.


def _same_worker(operations, initial, pid, ticks, pidfd):
    current = _unit(operations, WORKER)
    if (_dead(pidfd) or _proc_stat(pid)[0] != ticks or
            any(current[k] != initial[k] for k in IDENTITY) or
            _configuration(current) != _configuration(initial) or
            current['ControlGroup'] != initial['ControlGroup']):
        refuse('worker_replaced', 'The exact original service process is no longer present.')
    if current['ActiveState'] != 'active' or current['SubState'] != 'running' or current['Job'] not in ('', '0'):
        refuse('worker_state_changed', 'Worker service changed state before admission.')


def _podman_empty(operations):
    for args in (['podman', 'ps', '--all', '--format', 'json'],
                 ['podman', 'pod', 'ps', '--format', 'json']):
        try:
            value = json.loads(operations.command(args, timeout=COMMAND_SECONDS))
        except (ValueError, OSError, subprocess.SubprocessError) as error:
            raise FenceRefused('podman_unproven', 'Podman resource visibility is required.') from error
        if value != []:
            refuse('podman_resources_present', 'Existing Podman resources prevent maintenance.')


def _baseline(pid):
    tasks = _tasks(pid)
    if len(tasks) != BASELINE_THREADS or set(tasks.values()) != {'T'}:
        refuse('worker_not_idle', 'Only the two fully stopped baseline threads are eligible.')
    return tasks


def _no_children(pid, tasks):
    for tid in tasks:
        # Missing kernel visibility is refusal, never a fallback to an incomplete ps.
        path = Path('/proc') / str(pid) / 'task' / str(tid) / 'children'
        if path.read_text().strip():
            refuse('worker_has_children', 'Descendants may still be doing model work.')


def _cgroup_only(pid, operations):
    group = _unit(operations, WORKER)['ControlGroup']
    if not group.startswith('/') or '..' in Path(group).parts:
        refuse('cgroup_unproven', 'Worker cgroup visibility is unavailable.')
    root = Path('/sys/fs/cgroup') / group.lstrip('/')
    groups = [root, *[p for p in root.rglob('*') if p.is_dir()]]
    members = set()
    for folder in groups:
        members.update(int(item) for item in (folder / 'cgroup.procs').read_text().split())
    if members != {pid}:
        refuse('worker_cgroup_not_empty', 'Other cgroup processes prevent maintenance.')


def _journal_helper():
    path = Path(__file__).resolve().with_name('journal_socket.py')
    raw, _ = _regular(path)
    if hashlib.sha256(raw).hexdigest() != JOURNAL_SHA256:
        refuse('journal_helper_unproven', 'The exact reviewed journal verifier is required.')
    module = types.ModuleType('_worldifact_journal_socket')
    exec(compile(raw, str(path), 'exec'), module.__dict__)
    return module


def _fd_sockets(pid):
    sockets = {}
    for fd in (Path('/proc') / str(pid) / 'fd').iterdir():
        target = os.readlink(fd)
        if target.startswith('socket:['):
            if not re.fullmatch(r'socket:\[[1-9][0-9]*\]', target) or not fd.name.isdigit():
                refuse('socket_unreadable', 'Complete socket descriptor visibility is required.')
            sockets[fd.name] = int(target[8:-1])
    return sockets


def _journal_snapshot(pid, unit, expected=None):
    before = _fd_sockets(pid)
    if not {'1', '2'} & before.keys():
        if expected is not None:
            refuse('journal_stdio_unproven', 'The previously proven journal descriptors disappeared.')
        return None
    if unit.get('StandardOutput') != 'journal' or unit.get('StandardError') not in ('inherit', 'journal'):
        refuse('unsupported_worker_stdio', 'Only inherited default-journal output streams are supported.')
    if not {'1', '2'} <= before.keys():
        refuse('journal_stdio_unproven', 'Both configured journal output descriptors must exist.')
    fds = {key: before[key] for key in ('1', '2')}
    if unit['StandardError'] == 'inherit' and fds['1'] != fds['2']:
        refuse('journal_inheritance_unproven', 'Inherited stderr must share the exact stdout socket.')
    try:
        result = _journal_helper().prove(fds, expected)
    except (OSError, ValueError, KeyError, TypeError, RuntimeError) as error:
        if isinstance(error, FenceError):
            raise
        raise FenceRefused('journal_peer_unproven', 'Kernel journal peer identity could not be established.') from error
    if _fd_sockets(pid) != before:
        refuse('socket_changed', 'Worker socket descriptors changed during journal verification.')
    return result


def _socket_idle(pid, unit=None, journal=None):
    # Only the exact inherited journal descriptors can be excluded. Accepted TCP
    # connections, socket duplicates on any other fd and unknown sockets remain
    # forbidden. Queued unaccepted connections cannot execute while frozen.
    sockets = _fd_sockets(pid)
    if journal is not None:
        _journal_snapshot(pid, unit, journal)
        if any(sockets.get(fd) != inode for fd, inode in journal['fds'].items()):
            refuse('socket_changed', 'Inherited journal descriptors changed before socket admission.')
        sockets = {fd: inode for fd, inode in sockets.items() if fd not in ('1', '2')}
    rows = []
    for kind in ('tcp', 'tcp6'):
        for line in (Path('/proc') / str(pid) / 'net' / kind).read_text().splitlines()[1:]:
            fields = line.split()
            if len(fields) < 10:
                refuse('socket_unreadable', 'Complete socket visibility is required.')
            if fields[9] in {str(inode) for inode in sockets.values()}:
                rows.append((kind, fields))
    if len(sockets) != 1 or len(rows) != 1:
        refuse('accepted_or_unknown_socket', 'Accepted, pending or unidentified connections prevent maintenance.')
    kind, row = rows[0]
    if (kind != 'tcp' or row[1] != '0100007F:223D' or row[2] != '00000000:0000' or
            row[3] != '0A' or int(row[9]) != next(iter(sockets.values()))):
        refuse('socket_not_idle_listener', 'The sole application socket must be the reviewed loopback listener.')


def _resources(pid, operations, worker=None, journal=None):
    try:
        _no_children(pid, _baseline(pid))
        _cgroup_only(pid, operations)
        _socket_idle(pid, worker, journal)
        _podman_empty(operations)
    except (OSError, ValueError, KeyError) as error:
        raise FenceRefused('resource_visibility_unproven', 'Complete kernel and resource visibility is required.') from error


def _running_identity(source, pid, expected_sources=None):
    ticks, started = _process_start(pid)
    _source(source, started, expected_sources)
    process = Path('/proc') / str(pid)
    if (process / 'cmdline').read_bytes().split(b'\0') != [b'/usr/bin/python3', str(source / 'server.py').encode(), b'']:
        refuse('worker_command_unproven', 'The running command differs from the reviewed unit.')
    for namespace in ('pid', 'mnt', 'net', 'user', 'cgroup'):
        if os.readlink(process / 'ns' / namespace) != os.readlink(Path('/proc/self/ns') / namespace):
            refuse('namespace_unproven', 'The worker must share the maintenance visibility namespaces.')
    return ticks, started


class _GuardOperations:
    def __init__(self, source):
        self.source = Path(source)

    def command(self, args, timeout=COMMAND_SECONDS):
        result = subprocess.run(args, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                stderr=subprocess.DEVNULL, text=True, timeout=timeout, check=True)
        return result.stdout.strip()


def _same_tunnel(operations, initial):
    tunnel = _unit(operations, TUNNEL)
    if (_configuration(tunnel) != _configuration(initial) or
            any(tunnel[k] != initial[k] for k in IDENTITY) or
            tunnel['ActiveState'] != 'active' or tunnel['SubState'] != 'running' or
            tunnel['Job'] not in ('', '0')):
        refuse('tunnel_changed', 'The original quick-tunnel invocation is no longer verified.')


def _default_term(pid):
    bit = 1 << (signal.SIGTERM - 1)
    for tid in _baseline(pid):
        fields = dict(line.split(':', 1) for line in (Path('/proc') / str(pid) / 'task' / str(tid) / 'status').read_text().splitlines() if ':' in line)
        if any(int(fields[key].strip(), 16) & bit for key in ('SigBlk', 'SigIgn', 'SigCgt')):
            refuse('term_disposition_unproven', 'TERM must have its default unblocked disposition in every thread.')
        if any(int(fields[key].strip(), 16) for key in ('SigPnd', 'ShdPnd')):
            refuse('pending_signal', 'A pending signal prevents exact-worker termination proof.')


def _guard_stop(config, pidfd, deadline):
    allow = config.get('allow_cancelled_cleanup', False)
    identities = config.get('cancelled_job_ids', [])
    if (type(allow) is not bool or not isinstance(identities, list) or len(identities) > 1
            or identities and not allow
            or any(not isinstance(value, str) or not re.fullmatch(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}', value) for value in identities)):
        refuse('cancelled_consent_invalid', 'The guarded stop requires the same bounded cleanup consent.')
    operations = _GuardOperations(config['source'])
    _same_files(config['files'])
    _source(operations.source, expected_sources=config['expected_sources'])
    _same_worker(operations, config['worker'], config['pid'], config['ticks'], pidfd)
    _same_tunnel(operations, config['tunnel'])
    _default_term(config['pid'])
    _socket_idle(config['pid'], config['worker'], config['journal'])
    if time.monotonic() + COMMAND_SECONDS + 1 >= deadline:
        refuse('freeze_deadline', 'Too little guarded time remains to verify a clean exit.')
    # Only the proven pidfd is targeted. Default SIGTERM is a clean exit for a
    # simple Restart=on-failure unit; force-restart status lists are forbidden.
    signal.pidfd_send_signal(pidfd, signal.SIGTERM)
    _resume(pidfd)
    while time.monotonic() < deadline:
        unit = _unit(operations, WORKER)
        if _configuration(unit) != _configuration(config['worker']):
            refuse('unit_changed', 'Worker unit changed while exiting.')
        if unit['NRestarts'] != config['worker']['NRestarts'] or unit['InvocationID'] not in ('', config['worker']['InvocationID']):
            refuse('worker_replaced', 'A replacement worker is never signalled.')
        if (unit['ActiveState'] == 'inactive' and unit['SubState'] == 'dead' and
                unit['MainPID'] == '0' and unit['Job'] in ('', '0') and _dead(pidfd)):
            if unit['Result'] != 'success' or unit['ExecMainCode'] != '2' or unit['ExecMainStatus'] != '15':
                refuse('clean_exit_unproven', 'A clean default-TERM service exit was not verified.')
            _same_tunnel(operations, config['tunnel'])
            return
        if unit['MainPID'] not in ('0', config['worker']['MainPID']):
            refuse('worker_replaced', 'A replacement worker is never signalled.')
        time.sleep(0.01)
    refuse('stop_timeout', 'Clean service exit was not verified before the deadline.')


def _guard_main(pidfd, control, reply, duration):
    """Independent session; exact inherited pidfd survives controller SIGKILL."""
    deadline = time.monotonic() + duration
    config = None
    stop_attempted = False
    frozen = False
    def expired(signum, frame):
        raise FenceRefused('guard_timeout', 'The bounded freeze lease expired.')
    signal.signal(signal.SIGALRM, expired)
    def send(value):
        try:
            os.write(reply, (json.dumps(value) + '\n').encode())
        except BrokenPipeError:
            pass
    try:
        with os.fdopen(control, 'rb', buffering=0) as stream:
            if not select.select([control], [], [], max(0, deadline - time.monotonic()))[0]:
                refuse('guard_timeout', 'Guard initialization timed out.')
            config = json.loads(stream.readline(65537))
            signal.pidfd_send_signal(pidfd, 0)
            send({'ready': True})
            while True:
                remaining = deadline - time.monotonic()
                if remaining <= 0 or not select.select([control], [], [], remaining)[0]:
                    refuse('guard_timeout', 'The bounded freeze lease expired.')
                command = stream.read(1)
                if command == b'F' and not frozen:
                    signal.setitimer(signal.ITIMER_REAL, max(.001, deadline - time.monotonic()))
                    signal.pidfd_send_signal(pidfd, signal.SIGSTOP)
                    frozen = True
                    send({'frozen': True})
                elif command == b'S' and frozen and config is not None:
                    stop_attempted = True  # An uncertain exact-process exit needs recovery.
                    _guard_stop(config, pidfd, deadline)
                    send({'stopped': True})
                    return 0
                elif command == b'R' or command == b'':
                    signal.setitimer(signal.ITIMER_REAL, 0)
                    _resume(pidfd)
                    send({'resumed': True})
                    return 0
                else:
                    refuse('guard_protocol', 'Unexpected guard state.')
    except BaseException as error:
        try:
            signal.setitimer(signal.ITIMER_REAL, 0)
            _resume(pidfd)
        except BaseException:
            send({'error': 'recovery_required'})
            return 2
        send({'error': error.code if isinstance(error, FenceError) else 'guard_failed',
              'stop_attempted': stop_attempted})
        return 2 if stop_attempted else 1
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
        os.close(pidfd)
        os.close(reply)


class _Guard:
    """Also used by disposable-process tests with config=None (no systemctl)."""
    def __init__(self, pidfd, config=None, duration=FREEZE_SECONDS):
        self.pidfd, self.process, self.control, self.reply = pidfd, None, None, None
        self.guard_pidfd = None
        read_control, write_control = os.pipe()
        read_reply, write_reply = os.pipe()
        try:
            self.process = subprocess.Popen([sys.executable, '-B', str(Path(__file__).resolve()),
                '--guard', str(pidfd), str(read_control), str(write_reply), str(duration)],
                pass_fds=(pidfd, read_control, write_reply), start_new_session=True,
                stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            self.guard_pidfd = os.pidfd_open(self.process.pid)
            self.control = os.fdopen(write_control, 'wb', buffering=0)
            self.reply = os.fdopen(read_reply, 'rb', buffering=0)
            self.control.write((json.dumps(config) + '\n').encode())
            self.expect('ready')
        except BaseException:
            if self.control is None:
                os.close(write_control)
            if self.reply is None:
                os.close(read_reply)
            self.close()
            raise
        finally:
            os.close(read_control)
            os.close(write_reply)

    def expect(self, key):
        if not select.select([self.reply], [], [], FREEZE_SECONDS + COMMAND_SECONDS)[0]:
            refuse('guard_unresponsive', 'Independent resume guard is unresponsive.')
        try:
            value = json.loads(self.reply.readline(65537))
        except (ValueError, OSError) as error:
            raise FenceRefused('guard_failed', 'Independent resume guard failed.') from error
        if value.get(key) is not True:
            refuse(value.get('error', 'guard_failed'), 'Independent resume guard refused maintenance.')

    def freeze(self, pid, ticks):
        self.control.write(b'F')
        self.expect('frozen')
        deadline = time.monotonic() + 1
        while time.monotonic() < deadline:
            if _dead(self.pidfd) or _proc_stat(pid)[0] != ticks or self.process.poll() is not None:
                refuse('worker_replaced', 'Worker identity or independent guard changed.')
            if set(_tasks(pid).values()) == {'T'}:
                return
            time.sleep(0.005)
        refuse('freeze_timeout', 'Not every worker thread entered the stopped state.')

    def stop(self):
        self.control.write(b'S')
        self.expect('stopped')

    def close(self):
        error = None
        try:
            if self.control is not None:
                self.control.close()
                self.control = None
            if self.process is not None:
                try:
                    self.process.wait(timeout=FREEZE_SECONDS + COMMAND_SECONDS)
                except subprocess.TimeoutExpired:
                    # Reap/disarm the guardian before fallback resume. Otherwise
                    # delayed guardian code could TERM the old process after it
                    # resumed and accepted new work.
                    if self.guard_pidfd is None:
                        raise RecoveryRequired('guard_unproven', 'Guardian identity is unavailable.')
                    try:
                        signal.pidfd_send_signal(self.guard_pidfd, signal.SIGKILL)
                    except ProcessLookupError:
                        pass
                    self.process.wait(timeout=COMMAND_SECONDS)
                    _resume(self.pidfd)
                    error = RecoveryRequired('guard_unresponsive', 'Exact-process resume completed after disarming the guard; review recovery.')
                if self.process.returncode not in (0, 1):
                    _resume(self.pidfd)
                    error = error or RecoveryRequired('guard_failed', 'Exact worker resume was attempted; service recovery requires review.')
                self.process = None
        finally:
            if self.reply is not None:
                self.reply.close()
                self.reply = None
            if self.guard_pidfd is not None:
                os.close(self.guard_pidfd)
                self.guard_pidfd = None
        if error is not None:
            raise error


@dataclass
class Lease:
    operations: object
    tunnel: dict
    files: dict
    worker: dict
    healthy: bool = False
    activation_committed: bool = False

    def confirm_activation_committed(self):
        """Latch possible activation before marker unlink; automatic rollback is no longer safe."""
        self.activation_committed = True
        return True

    def assert_no_work(self):
        """Before live writes/restart: inactive origin, no verification descendants."""
        proof = getattr(self.operations, 'assert_verifier_drained', None)
        if not callable(proof) or proof() is not True:
            raise RecoveryRequired('verification_scope_unproven', 'An owned verifier descendant scope must be proven drained.')
        worker = _unit(self.operations, WORKER)
        _same_tunnel(self.operations, self.tunnel)
        if worker['ActiveState'] != 'inactive' or worker['MainPID'] != '0' or worker['Job'] not in ('', '0'):
            raise RecoveryRequired('work_survived', 'The worker must remain inactive before writes or restart.')
        group = Path('/sys/fs/cgroup') / self.worker['ControlGroup'].lstrip('/')
        if group.exists():
            for path in [group, *[p for p in group.rglob('*') if p.is_dir()]]:
                if (path / 'cgroup.procs').read_text().strip():
                    raise RecoveryRequired('work_survived', 'Worker cgroup is not empty.')
        for tid in _tasks(os.getpid()):
            path = Path('/proc') / str(os.getpid()) / 'task' / str(tid) / 'children'
            if path.read_text().strip():
                raise RecoveryRequired('verification_children_present', 'Verification descendants remain.')
        _podman_empty(self.operations)

    def worker_identity(self):
        worker = _unit(self.operations, WORKER)
        if (worker['ActiveState'] != 'active' or worker['SubState'] != 'running' or
                worker['Job'] not in ('', '0') or not worker['MainPID'].isdigit() or
                int(worker['MainPID']) <= 1 or not worker['NRestarts'].isdigit() or
                not re.fullmatch('[a-f0-9]{32}', worker['InvocationID'])):
            raise RecoveryRequired('health_confirmation_state', 'An active worker invocation is required.')
        return {key: worker[key] for key in IDENTITY}

    def assert_worker_identity(self, expected):
        if not isinstance(expected, dict) or set(expected) != set(IDENTITY) or self.worker_identity() != expected:
            raise RecoveryRequired('health_worker_replaced', 'The worker invocation differs from the locally verified worker.')

    def confirm_healthy(self, expected_identity):
        """Caller verifies local health first. This never starts/stops the tunnel.

        Starting the worker has already exposed its handlers through the still
        running tunnel. On health failure, do not blindly kill it or roll back:
        a fresh admitted fence is required before another live-source write.
        """
        if self.healthy:
            return
        _same_files(self.files)
        _same_tunnel(self.operations, self.tunnel)
        self.assert_worker_identity(expected_identity)
        self.healthy = True


@contextmanager
def quiesce(operations):
    """Yield only after the exact old worker has cleanly exited and is inactive.

    Requires exclusive authorized maintenance. Explicit consent permits only
    the bound cancelled job; process/resource invariants remain unchanged.
    Unsupported target evidence is a typed, conservative refusal.
    """
    source = Path(operations.source)
    guard = None
    pidfd = None
    stop_attempted = False
    lease = None
    try:
        if not hasattr(os, 'pidfd_open') or not hasattr(signal, 'pidfd_send_signal'):
            refuse('pidfd_unavailable', 'Exact-process pidfd signals are required.')
        if source != Path(operations.home) / 'froge-connector' or not source.is_absolute():
            refuse('wrong_source_path', 'Unexpected worker source path.')
        expected_sources = dict(getattr(operations, 'expected_source_sha256', EXPECTED))
        if getattr(operations, 'expected_server_sha256', None) is not None:
            expected_sources['server.py'] = operations.expected_server_sha256
        if not reviewed_manifest(expected_sources):
            refuse('incomplete_reviewed_manifest', 'An exact reviewed source or rollback manifest is required.')
        _source(source, expected_sources=expected_sources)
        allow = getattr(operations, 'allow_cancelled_cleanup', False)
        with database_gate(source, allow_cancelled_cleanup=allow,
                           expected_cancelled=getattr(operations, 'cancelled_job_ids', None)) as identities:
            operations.cancelled_job_ids = identities
        worker, tunnel = _unit(operations, WORKER), _unit(operations, TUNNEL)
        _unit_policy(worker, source)
        _unit_policy(tunnel, source, worker=False)
        files = {**_unit_files(worker), **_unit_files(tunnel)}
        pid = int(worker['MainPID'])
        ticks, started = _running_identity(source, pid, expected_sources)
        pidfd = os.pidfd_open(pid)
        _same_worker(operations, worker, pid, ticks, pidfd)
        journal = _journal_snapshot(pid, worker)
        config = {'source': str(source), 'pid': pid, 'ticks': ticks,
                  'worker': worker, 'tunnel': tunnel, 'files': files,
                  'expected_sources': expected_sources, 'allow_cancelled_cleanup': allow,
                  'cancelled_job_ids': list(identities), 'journal': journal}
        guard = _Guard(pidfd, config)
        guard.freeze(pid, ticks)
        _same_worker(operations, worker, pid, ticks, pidfd)
        _same_files(files)
        _source(source, started, expected_sources)
        _resources(pid, operations, worker, journal)
        with database_gate(source, frozen=True, allow_cancelled_cleanup=allow, expected_cancelled=identities):
            _same_worker(operations, worker, pid, ticks, pidfd)
            stop_attempted = True
            guard.stop()
            stopped = _unit(operations, WORKER)
            if stopped['ActiveState'] != 'inactive' or stopped['MainPID'] != '0' or not _dead(pidfd):
                raise RecoveryRequired('stop_unproven', 'The exact worker stop could not be verified.')
        guard.close()
        guard = None
        lease = Lease(operations, tunnel, files, worker)
    except BaseException as error:
        if guard is not None:
            try:
                guard.close()
            except BaseException as recovery:
                raise RecoveryRequired('resume_unproven', 'Exact-worker recovery requires review.') from recovery
        if stop_attempted:
            raise RecoveryRequired(getattr(error, 'code', 'stop_failed'), 'Exact-worker exit is uncertain; do not write sources or restart automatically.') from error
        if isinstance(error, FenceError):
            raise
        raise FenceRefused('preflight_unproven', 'Maintenance evidence is unavailable; no lease was admitted.') from error
    finally:
        if pidfd is not None:
            os.close(pidfd)
    try:
        yield lease
    finally:
        if not lease.healthy and not lease.activation_committed:
            raise RecoveryRequired('health_not_confirmed', 'Worker health is unconfirmed. The quick tunnel remains running; do not blindly stop a replacement or roll back.')


if __name__ == '__main__':
    if len(sys.argv) != 6 or sys.argv[1] != '--guard':
        raise SystemExit('This module has no standalone installer.')
    raise SystemExit(_guard_main(int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4]), float(sys.argv[5])))
