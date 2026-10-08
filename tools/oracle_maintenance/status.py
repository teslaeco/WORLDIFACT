"""Bounded read-only reconciliation for one reviewed Oracle payload update.

Only the checksum-pinned pure attestation helper is executed. No server module,
provider client, prompt, credential, job row, command line or raw log is read.
The installer's own lock, source checks, idle fence and gates remain authoritative.
"""
import hashlib
import json
import os
from pathlib import Path
import pwd
import re
import stat
import subprocess


REVISION = 'worldifact-standard-construction-v1'
OLD_PARSER = 'fb47f6038cf7e43eb98371fdaaa9ad9e34e8fa06075a94a6653338747878fca1'
NEW_PARSER = '3b7e5af5192724af4d7eb2943a09230c952fbd44905ec955f2ae2d7a6ec03a84'
HEALTH_HASH = 'f63c2731c501fa73037ea0205e8bbd73e8cc58f93ab6601d51ba7bd271ae56cf'
SUCCESS = 'WORLDIFACT_STANDARD_CONSTRUCTION_VERIFIED'
FAILURE = 'WORLDIFACT_STANDARD_CONSTRUCTION_NOT_CONFIRMED'
STAGED = {'phase': 'STANDARD_CONSTRUCTION_STAGED_NOT_INSTALLED',
          'paid_generation_requested': False}
NO_REPORT = 'NO_REPORT_PREWORK_OR_INTERRUPTED'
ATTEMPT = re.compile(r'standard-construction-(\d{8}T\d{6}Z)-[0-9a-f]{8}')
FIRST_UPDATE_ATTEMPT = '20261008T085127Z'
CHANGED_COMPONENTS = frozenset(('source_or_receipt', 'maintenance_marker',
    'recent_attempts', 'attempt_selection', 'installer_lock', 'lock_holders', 'worker'))


def account_home():
    """Ignore caller-controlled HOME, USER, PATH and Python environment values."""
    return Path(pwd.getpwuid(os.getuid()).pw_dir)


def clean_environment(home):
    uid = os.getuid()
    return {'HOME': str(home), 'USER': 'opc', 'LOGNAME': 'opc',
            'PATH': '/usr/local/bin:/usr/bin:/bin', 'LANG': 'C.UTF-8',
            'XDG_RUNTIME_DIR': '/run/user/' + str(uid),
            'DBUS_SESSION_BUS_ADDRESS': 'unix:path=/run/user/' + str(uid) + '/bus',
            'PYTHONDONTWRITEBYTECODE': '1'}


def identity(info):
    return (info.st_dev, info.st_ino, info.st_mode, info.st_nlink, info.st_uid,
            info.st_gid, info.st_size, info.st_mtime_ns, info.st_ctime_ns)


def directory(path):
    path = Path(path)
    if not path.is_absolute() or '..' in path.parts:
        raise ValueError('unsafe_directory')
    fd = os.open('/', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        for part in path.parts[1:]:
            child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            os.close(fd)
            fd = child
        return fd
    except BaseException:
        os.close(fd)
        raise


class Reader:
    def __init__(self):
        self.watch = {}

    def inspect(self, path, limit=None, *, proc=False, component='source_or_receipt'):
        path = Path(path)
        parent = directory(path.parent)
        try:
            try:
                before = os.stat(path.name, dir_fd=parent, follow_symlinks=False)
            except FileNotFoundError:
                if not proc:
                    self.watch.setdefault(path, (None, component))
                return None, None
            if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1:
                raise ValueError('unsafe_file')
            if not proc:
                self.watch.setdefault(path, (identity(before), component))
            if limit is None:
                return None, before
            fd = os.open(path.name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=parent)
            try:
                if identity(before) != identity(os.fstat(fd)) or before.st_size > limit:
                    raise ValueError('changed_file')
                with os.fdopen(fd, 'rb', closefd=False) as stream:
                    raw = stream.read(limit + 1)
                if (len(raw) > limit or (not proc and len(raw) != before.st_size)
                        or identity(before) != identity(os.fstat(fd))
                        or identity(before) != identity(os.stat(path.name, dir_fd=parent, follow_symlinks=False))):
                    raise ValueError('changed_file')
                return raw, before
            finally:
                os.close(fd)
        finally:
            os.close(parent)

    def changed(self):
        changed = set()
        for path, (before, component) in list(self.watch.items()):
            _, now = self.inspect(path, component=component)
            if before != (identity(now) if now is not None else None):
                changed.add(component)
        return changed


def unique(pairs):
    value = {}
    for key, item in pairs:
        if key in value:
            raise ValueError('duplicate_key')
        value[key] = item
    return value


def parse_json(raw):
    value = json.loads(raw, object_pairs_hook=unique)
    if type(value) is not dict:
        raise ValueError('unsafe_json')
    return value


def digest(raw):
    return hashlib.sha256(raw).hexdigest() if raw is not None else None


def scalar(value, pattern):
    if value is not None and (type(value) is not str or not re.fullmatch(pattern, value)):
        raise ValueError('unsafe_scalar')
    return value


def safe_result(value):
    """Same complete result contract as the immutable reviewed launcher."""
    if type(value) is not dict or value.get('phase') not in (SUCCESS, FAILURE):
        raise ValueError('unsafe_result')
    expected = {'phase', 'revision', 'paid_generation_requested', 'job_rows_changed',
                'provider_limits_changed', 'previous_source_restored', 'activation_committed'}
    if value['phase'] == FAILURE:
        expected.add('refusal_code')
    if (set(value) != expected or value.get('revision') != REVISION
            or any(value.get(key) is not False for key in
                   ('paid_generation_requested', 'job_rows_changed', 'provider_limits_changed'))
            or any(value.get(key) is not None and type(value[key]) is not bool
                   for key in ('previous_source_restored', 'activation_committed'))
            or 'refusal_code' in value and (type(value['refusal_code']) is not str
                or re.fullmatch(r'[a-z_]{1,80}', value['refusal_code']) is None)
            or value['phase'] == SUCCESS and (value['activation_committed'] is not True
                or value['previous_source_restored'] is not None)
            or value['activation_committed'] is True and value['previous_source_restored'] is not None):
        raise ValueError('unsafe_result')
    return value


def attempts(root):
    fd = directory(root)
    try:
        before = identity(os.fstat(fd))
        # Stop enumeration at the bound rather than first materializing an unbounded list.
        names = []
        with os.scandir(fd) as entries:
            for entry in entries:
                names.append(entry.name)
                if len(names) > 4096:
                    raise ValueError('too_many_attempts')
        if before != identity(os.fstat(fd)):
            raise ValueError('directory_changed')
        selected = [name for name in names if ATTEMPT.fullmatch(name)
                    and ATTEMPT.fullmatch(name)[1] >= FIRST_UPDATE_ATTEMPT]
        return sorted(selected, reverse=True)[:2]
    finally:
        os.close(fd)


def health(reader, source):
    raw, _ = reader.inspect(source / 'construction_health.py', 1048576)
    if digest(raw) != HEALTH_HASH:
        return False
    namespace = {'__name__': 'verified_construction_attestation',
                 '__file__': str(source / 'construction_health.py')}
    exec(compile(raw, 'verified_construction_attestation', 'exec'), namespace)
    names = namespace['SOURCES'] | namespace['CHAIN_RECEIPTS'] | {'fast_preview.py', 'astra_spend.py'}
    for name in sorted(names):
        reader.inspect(source / name)
    return namespace['verified_health'](source) == {'worldifactStandardConstructionPolicy': REVISION}


def lock_holders(reader, lock):
    raw, _ = reader.inspect('/proc/locks', 1048576, proc=True)
    holders = []
    for line in raw.decode('ascii').splitlines():
        fields = line.split()
        if len(fields) > 1 and fields[1] == '->':
            fields.pop(1)
        if lock is None or len(fields) != 8 or fields[1] != 'FLOCK':
            continue
        match = re.fullmatch(r'([0-9a-fA-F]+):([0-9a-fA-F]+):(\d+)', fields[5])
        if not match or tuple(int(v, b) for v, b in zip(match.groups(), (16, 16, 10))) != (
                os.major(lock.st_dev), os.minor(lock.st_dev), lock.st_ino):
            continue
        if not re.fullmatch(r'[1-9]\d{0,9}', fields[4]):
            raise ValueError('unknown_lock_holder')
        pid = int(fields[4])
        process, _ = reader.inspect('/proc/' + str(pid) + '/stat', 8192, proc=True)
        state, start = None, None
        if process is not None:
            values = process.rsplit(b') ', 1)[-1].split()
            state = scalar(values[0].decode('ascii'), r'[RSDZTWtXxKWPIN]')
            if len(values) < 20 or not re.fullmatch(rb'\d{1,20}', values[19]):
                raise ValueError('unsafe_process_metadata')
            start = int(values[19])
        holders.append({'pid': pid, 'state': state, 'start_ticks': start})
        if len(holders) > 16:
            raise ValueError('too_many_lock_holders')
    return sorted(holders, key=lambda value: value['pid'])


def worker_status(home):
    worker = subprocess.run(['/usr/bin/systemctl', '--user', 'show', 'froge-worker.service',
                             '--property=ActiveState,SubState,MainPID'],
                            stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                            text=True, timeout=10, env=clean_environment(home), cwd='/')
    if worker.returncode or len(worker.stdout) > 1024:
        raise ValueError('worker_unavailable')
    pairs = [line.split('=', 1) for line in worker.stdout.splitlines()]
    if any(len(pair) != 2 for pair in pairs):
        raise ValueError('unsafe_worker_metadata')
    properties = unique(pairs)
    if (set(properties) != {'ActiveState', 'SubState', 'MainPID'}
            or any(not re.fullmatch(r'[a-z-]{1,40}', properties[key]) for key in ('ActiveState', 'SubState'))
            or not re.fullmatch(r'\d{1,10}', properties['MainPID'])):
        raise ValueError('unsafe_worker_metadata')
    return properties


def read_status(home=None):
    try:
        home = account_home() if home is None else Path(home)
        source, root = home / 'froge-connector', home / '.local/state/worldifact-astra-guard'
        reader = Reader()
        parser, _ = reader.inspect(source / 'construction_payload.py', 1048576)
        receipt_raw, _ = reader.inspect(source / '.worldifact-standard-construction.json', 16384)
        receipt = parse_json(receipt_raw) if receipt_raw is not None else {}
        hashes, update = receipt.get('sha256', {}), receipt.get('payload_update', {})
        if type(hashes) is not dict or type(update) is not dict:
            raise ValueError('unsafe_receipt')
        _, marker = reader.inspect(source / '.worldifact-standard-maintenance.json', component='maintenance_marker')
        selected, reports = attempts(root), []
        for name in selected:
            raw, _ = reader.inspect(root / name / 'INSTALL_STATUS.json', 16384, component='recent_attempts')
            report = parse_json(raw) if raw is not None else NO_REPORT
            if report != NO_REPORT:
                if report == STAGED:
                    # Python equality treats 0 as False; preserve the strict public type.
                    if report['paid_generation_requested'] is not False:
                        raise ValueError('unsafe_staged_result')
                else:
                    safe_result(report)
            reports.append({'attempt_utc': ATTEMPT.fullmatch(name)[1], 'report': report})
        _, lock = reader.inspect(home / '.local/state/worldifact-fast/installation.lock', component='installer_lock')
        holders = lock_holders(reader, lock)
        verified, worker = health(reader, source), worker_status(home)
        changed = reader.changed()
        if selected != attempts(root):
            changed.add('attempt_selection')
        if holders != lock_holders(reader, lock):
            changed.add('lock_holders')
        if worker != worker_status(home):
            changed.add('worker')
        parser_hash = digest(parser)
        return {'read_only': True, 'snapshot_stable': not changed, 'changed_components': sorted(changed),
                'parser_sha256': parser_hash,
                'parser_version': {OLD_PARSER: 'previous', NEW_PARSER: 'updated'}.get(parser_hash, 'unknown'),
                'receipt_sha256': digest(receipt_raw),
                'receipt_revision': scalar(receipt.get('revision'), REVISION),
                'receipt_parser_sha256': scalar(hashes.get('construction_payload.py'), r'[0-9a-f]{64}'),
                'payload_update_revision': scalar(update.get('revision'), r'responses-reasoning-content-v1'),
                'construction_health_verified': verified, 'maintenance_present': marker is not None,
                'recent_attempts': reports, 'lock_file_present': lock is not None,
                'observed_flock_holders': holders, 'worker': worker}
    except (Exception, KeyboardInterrupt):
        return {'read_only': True, 'snapshot_stable': False, 'refusal': 'unsafe_or_unavailable_read'}


def classify(value):
    """Conservative admission; this is never a substitute for installer gates."""
    if value.get('maintenance_present') or value.get('observed_flock_holders'):
        return 'busy'
    if (value.get('snapshot_stable') is not True or value.get('construction_health_verified') is not True
            or value.get('lock_file_present') is not True or value.get('receipt_revision') != REVISION
            or value.get('receipt_parser_sha256') != value.get('parser_sha256')):
        return 'inconclusive'
    worker = value.get('worker', {})
    if worker.get('ActiveState') != 'active' or worker.get('SubState') != 'running' or int(worker.get('MainPID', '0')) <= 0:
        return 'inconclusive'
    recent = value.get('recent_attempts', [])
    latest = recent[0]['report'] if recent else None
    if latest is not None:
        if type(latest) is not dict or latest == STAGED:
            return 'inconclusive'
        if latest['phase'] == FAILURE and (latest['previous_source_restored'] is not True
                                           or latest['activation_committed'] is not False):
            return 'inconclusive'
    if value.get('parser_version') == 'updated':
        return ('already_updated' if value.get('payload_update_revision') == 'responses-reasoning-content-v1'
                and type(latest) is dict and latest['phase'] == SUCCESS else 'inconclusive')
    if (value.get('parser_version') == 'previous' and value.get('payload_update_revision') is None
            and (latest is None or latest['phase'] == FAILURE)):
        return 'ready_to_apply'
    return 'inconclusive'
