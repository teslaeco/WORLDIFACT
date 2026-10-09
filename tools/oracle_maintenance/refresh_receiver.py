"""One owner-authorized grant refresh. Does not invoke any runtime updater.

The existing public grant, old immutable package and live source ancestry must
be exact. Only two entrypoint files are replaced, dispatcher last. Existing keys,
trust, services and runtime bytes are untouched. Exclusive owner maintenance is
required; unknown concurrent bytes are never overwritten during recovery.
"""
import base64
from contextlib import contextmanager, ExitStack
import ctypes
import fcntl
import hashlib
import json
import os
from pathlib import Path
import pwd
import re
import signal
import sqlite3
import stat
import struct
import tempfile
import types

OLD_DISPATCHER_SHA = 'e7dc5beba6e3ce19b4737e6d99cac64c974e13b72ca593e2cf47d218ea89d7f8'
OLD_STATUS_SHA = '13829c114a258b5fb385cdda4a7bfd283d1586ee636883a2058cecef630b8aac'
OLD_LAUNCHER_SHA = '9ef5cd1fc648e192be196dc56fa7fe0ab0292975bc58abc445cd6180bb1df313'
NEW_DISPATCHER_SHA = '7928add8cb1c6d95392af2a355adc7c7b4b0829124ba0d71096f97aadbfa7867'
NEW_STATUS_SHA = '83ed7b8cedcb42e12f7b84cc57fcc8bade648020859084fa2553414b863dcb99'
NEW_LAUNCHER_SHA = 'c87d9826480173dead7c175db75f0d4f143c8f8bc63fea753cc84ebc6e1e2f57'
SOURCE_COMMIT = '5e375f0f7d6f42d8c4d8944fa024bfb474143c04'
HOST_PUBLIC_SHA = 'dc28e426f5ae4f85279c65e2d1313cc9d616ebb728583761326ec14ec1ea82d5'
COMMENT = 'worldifact-maintenance-b6dce84d'
ACCESS_ROOT = '.local/share/worldifact-maintenance'
NEW_PACKAGE = 'update-initial-edit-v1'
BACKUP = '.initial-edit-grant-backup'
MAXIMUM = 262144
SOURCE_BEFORE = {
 'astra_spend_v2.py': '6ff61de4356388ecbec9d5eda1ae61f0ca2098deeb8ed10f1c2928dec67b3028',
 'blender_mcp.py': '85c4fe62f76aaa33e87a40ec0db03965e1ffac0a28b1459a73e3676bf66b020b',
 'codex_runner.py': 'ebcc149256ef3f54ad5b082b16f54719a30a66e6e2b94dfc2fe5f994f2f9f8fa',
 'completion_policy.py': '664e9f3b2326116fe9aeeb78e7a84aac254ca8a3054cdccdfb5224e112890110',
 'construction_health.py': 'f63c2731c501fa73037ea0205e8bbd73e8cc58f93ab6601d51ba7bd271ae56cf',
 'construction_payload.py': '3b7e5af5192724af4d7eb2943a09230c952fbd44905ec955f2ae2d7a6ec03a84',
 'construction_policy.py': '0d9e36b5034cf9d055aedda85d9bc052745adbfd07a8061d6c46137ca57a29fa',
 'context_policy.py': 'de55626504e39a1ac52b78de57995013761c824165b0f92f108ea09b9cb0a2f1',
 'phased_controller.py': '713917ad4bc5f249323258fa1093d5f9d177b130a1c42fc20d628e0e25c5d605',
 'prebuild_policy.py': 'b157f93ab4c68402f921576b897ea05f2b68454092167731c74fd9ee45b87033',
 'runtime_controller.py': '53f08644296c58b7c6c77f91a484f4852074ae720dec89129559dd698e1aac0e',
 'server.py': 'd401a99fc2b271b886fa8c629e802d107ec8f6f05eb3da99c27dab040abc4c97',
 'studio_pricing.py': 'ad765f9193e973146a8fd9e0761d13006ba939db7926275f628ad21c83350584',
 'terminal_budget.py': '3e8a1654aede456eeeb673bb67f508a56996602239c56127123ba7e71a5a39f0'}


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def identity(info):
    return (info.st_dev, info.st_ino, info.st_mode, info.st_nlink, info.st_uid,
            info.st_gid, info.st_size, info.st_mtime_ns, info.st_ctime_ns)


def path_info(path, home, directory=False, private=False):
    path, home = Path(path), Path(home)
    path.relative_to(home)
    for part in (path, *path.parents):
        info = part.lstat()
        if stat.S_ISLNK(info.st_mode):
            raise ValueError('linked_path')
        if part == home or home in part.parents:
            if info.st_uid != os.getuid() or info.st_mode & 0o022:
                raise ValueError('unsafe_owner_or_mode')
        if part == home:
            break
    info = path.lstat()
    if directory and not stat.S_ISDIR(info.st_mode) or private and info.st_mode & 0o077:
        raise ValueError('unsafe_private_path')
    return info


def read(path, home, maximum=MAXIMUM):
    info = path_info(path, home)
    if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_size > maximum:
        raise ValueError('unsafe_file')
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        if identity(info) != identity(os.fstat(descriptor)):
            raise ValueError('changed_file')
        raw = os.read(descriptor, maximum + 1)
        if len(raw) != info.st_size or identity(info) != identity(os.fstat(descriptor)) or identity(info) != identity(path.lstat()):
            raise ValueError('changed_file')
        return raw
    finally:
        os.close(descriptor)


def names(path, home):
    path_info(path, home, directory=True, private=True)
    with os.scandir(path) as entries:
        found = []
        for entry in entries:
            found.append(entry.name)
            if len(found) > 128:
                raise ValueError('too_many_files')
    return set(found)


def public_key(value):
    if type(value) is not str or not re.fullmatch(r'ssh-rsa [A-Za-z0-9+/]{500,2000}={0,2} ' + COMMENT, value):
        raise ValueError('invalid_public_key')
    encoded = value.split()[1]
    raw = base64.b64decode(encoded, validate=True)
    words = []
    for _ in range(3):
        if len(raw) < 4:
            raise ValueError('invalid_public_key')
        size = struct.unpack('>I', raw[:4])[0]
        if not 0 < size <= len(raw) - 4:
            raise ValueError('invalid_public_key')
        words.append(raw[4:4 + size])
        raw = raw[4 + size:]
    if raw or words[0] != b'ssh-rsa' or int.from_bytes(words[1], 'big') != 65537 or int.from_bytes(words[2], 'big').bit_length() != 4096:
        raise ValueError('invalid_public_key')
    return 'ssh-rsa ' + encoded


def known_grant(home, public):
    key = public_key(public)
    root = home / ACCESS_ROOT
    expected = ('restrict,command="/usr/bin/python3 -I -B ' + str(root / 'dispatcher.py') + '" ' + key + ' ' + COMMENT).encode('ascii')
    raw = read(home / '.ssh/authorized_keys', home, 1048576)
    relevant = [line for line in raw.splitlines() if key.encode() in line or COMMENT.encode() in line]
    if relevant != [expected]:
        raise ValueError('unknown_existing_grant')
    return raw


def host_public():
    path = Path('/etc/ssh/ssh_host_rsa_key.pub')
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_nlink != 1 or info.st_mode & 0o022 or info.st_size > 4096:
        raise ValueError('unsafe_host_public')
    if any(part.is_symlink() for part in path.parents):
        raise ValueError('linked_host_public')
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        raw = os.read(descriptor, 4097).decode('ascii').split()
        if identity(info) != identity(os.fstat(descriptor)) or identity(info) != identity(path.lstat()):
            raise ValueError('changed_host_public')
    finally:
        os.close(descriptor)
    if len(raw) not in (2, 3) or raw[0] != 'ssh-rsa' or sha((' '.join(raw[:2]) + '\n').encode()) != HOST_PUBLIC_SHA:
        raise ValueError('unrecognized_host_public')


def package(raws, launcher_pin):
    launcher = raws.get('oracle_construction_launch.py', b'')
    if sha(launcher) != launcher_pin:
        raise ValueError('launcher_checksum')
    module = types.ModuleType('verified_refresh_manifest')
    exec(compile(launcher, 'verified_refresh_manifest', 'exec'), module.__dict__)
    if type(module.FILES) is not dict or len(module.FILES) != 42 or set(raws) != set(module.FILES) | {'oracle_construction_launch.py'}:
        raise ValueError('package_members')
    for name, (_source, wanted) in module.FILES.items():
        if re.fullmatch(r'[a-z_0-9]+\.py', name) is None or module.blob(raws[name]) != wanted:
            raise ValueError('package_checksum')
        compile(raws[name], name, 'exec')
    return raws


def directory_package(path, home, pin):
    found = names(path, home)
    launcher = read(path / 'oracle_construction_launch.py', home)
    if sha(launcher) != pin:
        raise ValueError('launcher_checksum')
    module = types.ModuleType('verified_refresh_members')
    exec(compile(launcher, 'verified_refresh_members', 'exec'), module.__dict__)
    if type(module.FILES) is not dict or len(module.FILES) != 42 or found != set(module.FILES) | {'oracle_construction_launch.py'}:
        raise ValueError('package_members')
    return package({name: read(path / name, home) for name in found}, pin)


def decoded_package(payload):
    if (type(payload) is not dict or set(payload) != {'files', 'public_key'}
            or type(payload['files']) is not dict or len(payload['files']) != 45
            or re.fullmatch(r'[0-9a-f]{40}', SOURCE_COMMIT) is None
            or any(re.fullmatch(r'[0-9a-f]{64}', pin) is None for pin in
                   (NEW_DISPATCHER_SHA, NEW_STATUS_SHA, NEW_LAUNCHER_SHA))):
        raise ValueError('unreviewed_refresh')
    files = {}
    for name, encoded in payload['files'].items():
        if type(name) is not str or re.fullmatch(r'(?:update-initial-edit-v1/)?[a-z_0-9]+\.py', name) is None or type(encoded) is not str:
            raise ValueError('invalid_package')
        raw = base64.b64decode(encoded, validate=True)
        if not 0 < len(raw) <= MAXIMUM:
            raise ValueError('invalid_package')
        compile(raw, name, 'exec')
        files[name] = raw
    for name, pin in (('dispatcher.py', NEW_DISPATCHER_SHA), ('status.py', NEW_STATUS_SHA)):
        if sha(files.get(name, b'')) != pin:
            raise ValueError('grant_checksum')
    packaged = {name[len(NEW_PACKAGE) + 1:]: raw for name, raw in files.items() if name.startswith(NEW_PACKAGE + '/')}
    package(packaged, NEW_LAUNCHER_SHA)
    if set(files) != {'dispatcher.py', 'status.py'} | {NEW_PACKAGE + '/' + name for name in packaged}:
        raise ValueError('package_members')
    return files


@contextmanager
def existing_lock(path, home):
    before = path_info(path, home, private=True)
    if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1:
        raise ValueError('unsafe_lock')
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        if identity(before) != identity(os.fstat(descriptor)):
            raise ValueError('changed_lock')
        fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if identity(before) != identity(path.lstat()):
            raise ValueError('changed_lock')
        yield
    finally:
        os.close(descriptor)


@contextmanager
def idle_admission(home):
    """Hold job admission; read only an aggregate state count, never a job body."""
    path = home / 'froge-connector/state/jobs.sqlite'
    info = path_info(path, home)
    if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_size > 128 * 1024 * 1024:
        raise ValueError('unsafe_database')
    connection = sqlite3.connect(path.as_uri() + '?mode=rw', uri=True, timeout=0.25)
    try:
        connection.execute('BEGIN IMMEDIATE')
        row = connection.execute("SELECT COUNT(*) FROM jobs WHERE state IS NULL OR state NOT IN ('succeeded','failed','cancelled')").fetchone()
        if row != (0,) or (path.lstat().st_dev, path.lstat().st_ino) != (info.st_dev, info.st_ino):
            raise ValueError('active_work')
        yield
    finally:
        connection.rollback()
        connection.close()


def runtime_check(home, status_raw):
    api = types.ModuleType('verified_refresh_status')
    exec(compile(status_raw, 'verified_refresh_status', 'exec'), api.__dict__)
    source = home / 'froge-connector'
    hashes = {name: sha(read(source / name, home, 1048576)) for name in SOURCE_BEFORE}
    after = {**SOURCE_BEFORE, **api.HELPERS_AFTER}
    if hashes not in (SOURCE_BEFORE, after):
        raise ValueError('unknown_runtime')
    value = api.read_status(home)
    holders = value.get('observed_flock_holders')
    if type(holders) is not list or len(holders) != 1 or holders[0]['pid'] != os.getpid():
        raise ValueError('unexpected_lock_holders')
    value = {**value, 'observed_flock_holders': []}
    if api.classify(value) not in ('ready_to_apply', 'already_updated'):
        raise ValueError('unreconciled_runtime')
    return hashes, value['receipt_sha256']


def write_new(path, raw, home):
    path_info(path.parent, home, directory=True, private=True)
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(descriptor, 'wb', closefd=False) as stream:
            stream.write(raw)
            stream.flush()
            os.fsync(descriptor)
    finally:
        os.close(descriptor)
    if read(path, home) != raw:
        raise ValueError('staging_unconfirmed')


def sync_directory(path):
    descriptor = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def rename_absent(source, target):
    """Linux atomic no-replace; fail closed when the kernel lacks this primitive."""
    function = ctypes.CDLL(None, use_errno=True).renameat2
    function.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
    function.restype = ctypes.c_int
    if function(-100, os.fsencode(source), -100, os.fsencode(target), 1):
        raise OSError(ctypes.get_errno(), 'no_replace_failed')


def replace_known(path, current, replacement, home, stage):
    if read(path, home) != current:
        raise ValueError('unknown_concurrent_change')
    temporary = stage / (path.name + '.next')
    write_new(temporary, replacement, home)
    if read(path, home) != current:
        raise ValueError('unknown_concurrent_change')
    os.replace(temporary, path)
    sync_directory(path.parent)
    if read(path, home) != replacement:
        raise ValueError('replacement_unconfirmed')


def result(state):
    return {'phase': 'WORLDIFACT_GRANT_REFRESH_READY' if state in ('refreshed', 'already_refreshed') else 'WORLDIFACT_GRANT_REFRESH_NOT_CONFIRMED',
            'result': state, 'keys_changed': False, 'runtime_changed': False,
            'old_apply_retired': state in ('refreshed', 'already_refreshed')}


def refresh(payload, home=None):
    home = Path(pwd.getpwuid(os.getuid()).pw_dir) if home is None else Path(home)
    root = home / ACCESS_ROOT
    old, files, stage, touched = {}, {}, None, False
    locks = ExitStack()
    try:
        if home != Path('/home/opc') and 'PAYLOAD' in globals():
            raise ValueError('unexpected_vm_account')
        files = decoded_package(payload)
        path_info(root, home, directory=True, private=True)
        host_public()
        locks.enter_context(existing_lock(root / 'setup.lock', home))
        locks.enter_context(existing_lock(home / '.local/state/worldifact-fast/installation.lock', home))
        locks.enter_context(idle_admission(home))
        authorized = known_grant(home, payload['public_key'])
        allowed = {'dispatcher.py', 'status.py', 'update', '.staging', 'setup.lock', NEW_PACKAGE, BACKUP}
        if not names(root, home) <= allowed or names(root / '.staging', home):
            raise ValueError('unknown_maintenance_files')
        for forbidden in (root.parent / 'tools', root / 'fast_preview', root / 'model_context', root / 'model_context_upgrade'):
            if os.path.lexists(forbidden):
                raise ValueError('repository_fallback_present')
        directory_package(root / 'update', home, OLD_LAUNCHER_SHA)
        old = {name: read(root / name, home) for name in ('status.py', 'dispatcher.py')}
        old_pins = {'status.py': OLD_STATUS_SHA, 'dispatcher.py': OLD_DISPATCHER_SHA}
        new_current = all(old[name] == files[name] for name in old)
        if not new_current and any(sha(raw) != old_pins[name] for name, raw in old.items()):
            raise ValueError('unknown_current_grant')
        runtime_before = runtime_check(home, files['status.py'])
        if new_current:
            backup = root / BACKUP
            if names(backup, home) != set(old_pins) or any(sha(read(backup / name, home)) != pin for name, pin in old_pins.items()):
                raise ValueError('unknown_backup')
            directory_package(root / NEW_PACKAGE, home, NEW_LAUNCHER_SHA)
            if known_grant(home, payload['public_key']) != authorized:
                raise ValueError('grant_changed')
            return result('already_refreshed')
        backup = root / BACKUP
        if backup.exists() or backup.is_symlink():
            if names(backup, home) != set(old) or any(read(backup / name, home) != raw for name, raw in old.items()):
                raise ValueError('unknown_backup')
        else:
            backup.mkdir(mode=0o700)
            for name, raw in old.items():
                write_new(backup / name, raw, home)
            sync_directory(backup)
        stage = Path(tempfile.mkdtemp(prefix='.refresh-', dir=root))
        staged_package = stage / NEW_PACKAGE
        staged_package.mkdir(mode=0o700)
        for name, raw in files.items():
            if name.startswith(NEW_PACKAGE + '/'):
                write_new(stage / name, raw, home)
        directory_package(staged_package, home, NEW_LAUNCHER_SHA)
        sync_directory(staged_package)
        if (root / NEW_PACKAGE).exists() or (root / NEW_PACKAGE).is_symlink():
            directory_package(root / NEW_PACKAGE, home, NEW_LAUNCHER_SHA)
        else:
            rename_absent(staged_package, root / NEW_PACKAGE)
            sync_directory(root)
        if runtime_check(home, files['status.py']) != runtime_before:
            raise ValueError('runtime_changed')
        if known_grant(home, payload['public_key']) != authorized:
            raise ValueError('grant_changed')
        for name in ('status.py', 'dispatcher.py'):
            touched = True
            replace_known(root / name, old[name], files[name], home, stage)
        if runtime_check(home, files['status.py']) != runtime_before:
            raise ValueError('runtime_changed')
        directory_package(root / 'update', home, OLD_LAUNCHER_SHA)
        directory_package(root / NEW_PACKAGE, home, NEW_LAUNCHER_SHA)
        if known_grant(home, payload['public_key']) != authorized:
            raise ValueError('grant_changed')
        return result('refreshed')
    except (Exception, KeyboardInterrupt):
        # The original setup/install/admission locks remain held during recovery.
        if touched and stage is not None:
            restored = True
            try:
                for name in ('dispatcher.py', 'status.py'):
                    try:
                        current = read(root / name, home)
                        if current == old[name]:
                            continue
                        if current != files[name]:
                            restored = False
                            continue
                        replace_known(root / name, current, old[name], home, stage)
                    except (Exception, KeyboardInterrupt):
                        restored = False
                if any(read(root / name, home) != raw for name, raw in old.items()):
                    restored = False
                if known_grant(home, payload['public_key']) != authorized:
                    restored = False
                directory_package(root / 'update', home, OLD_LAUNCHER_SHA)
                if runtime_check(home, files['status.py']) != runtime_before:
                    restored = False
            except (Exception, KeyboardInterrupt):
                restored = False
            return result('rolled_back' if restored else 'unconfirmed')
        return result('refused')
    finally:
        # Delete only recognized staged bytes. Preserve unknown or partial data.
        if stage is not None:
            try:
                staging_package = stage / NEW_PACKAGE
                if staging_package.exists():
                    directory_package(staging_package, home, NEW_LAUNCHER_SHA)
                    for name in names(staging_package, home):
                        if read(staging_package / name, home) != files[NEW_PACKAGE + '/' + name]:
                            raise ValueError('changed_stage')
                        (staging_package / name).unlink()
                    staging_package.rmdir()
                for name in names(stage, home):
                    if name not in ('status.py.next', 'dispatcher.py.next'):
                        raise ValueError('unknown_stage')
                    key = name[:-5]
                    if read(stage / name, home) not in (files[key], old[key]):
                        raise ValueError('changed_stage')
                    (stage / name).unlink()
                stage.rmdir()
            except (Exception, KeyboardInterrupt):
                pass
        locks.close()


def main(payload):
    handlers = {}

    def interrupted(_number, _frame):
        raise KeyboardInterrupt()

    try:
        for number in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP):
            handlers[number] = signal.signal(number, interrupted)
        observed = refresh(payload)
    except (Exception, KeyboardInterrupt):
        observed = result('unconfirmed')
    finally:
        for number, previous in handlers.items():
            signal.signal(number, previous)
    print(json.dumps(observed, sort_keys=True))
    return 0 if observed['phase'] == 'WORLDIFACT_GRANT_REFRESH_READY' else 1


if 'PAYLOAD' in globals():
    raise SystemExit(main(PAYLOAD))
