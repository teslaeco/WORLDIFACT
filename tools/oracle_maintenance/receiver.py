"""Trusted-SSH bootstrap receiver. Never executes the generator updater."""
import base64
import fcntl
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import pwd
import re
import stat
import struct
import tempfile
import types

LAUNCHER_SHA = '9ef5cd1fc648e192be196dc56fa7fe0ab0292975bc58abc445cd6180bb1df313'
DISPATCHER_SHA = 'e7dc5beba6e3ce19b4737e6d99cac64c974e13b72ca593e2cf47d218ea89d7f8'
STATUS_SHA = '13829c114a258b5fb385cdda4a7bfd283d1586ee636883a2058cecef630b8aac'
COMMENT = 'worldifact-maintenance-b6dce84d'
ACCESS_ROOT = '.local/share/worldifact-maintenance'


def check_path(path, directory=False):
    for part in (path, *path.parents):
        info = part.lstat()
        if stat.S_ISLNK(info.st_mode) or info.st_mode & 0o022:
            raise ValueError('unsafe_path')
    info = path.lstat()
    if info.st_uid != os.getuid() or (directory and not stat.S_ISDIR(info.st_mode)):
        raise ValueError('unsafe_owner')
    return info


def private_directory(path):
    if not path.exists():
        check_path(path.parent, True)
        path.mkdir(mode=0o700)
    info = check_path(path, True)
    if info.st_mode & 0o077:
        raise ValueError('nonprivate_directory')


def regular_bytes(path, maximum):
    info = check_path(path)
    if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_size > maximum:
        raise ValueError('unsafe_file')
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        before = os.fstat(fd)
        raw = os.read(fd, maximum + 1)
        after = os.fstat(fd)
        identity = lambda s: (s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns, s.st_ctime_ns)
        if len(raw) > maximum or len(raw) != before.st_size or identity(info) != identity(before) or identity(before) != identity(after) or identity(after) != identity(path.lstat()):
            raise ValueError('changed_file')
        return raw
    finally:
        os.close(fd)


def recover_stage_link(path, raw, staging):
    """Recover only our exact immutable bytes with one surviving staging link."""
    if not path.exists() or path.is_symlink():
        return
    target = check_path(path)
    if target.st_nlink == 1:
        return
    if target.st_nlink != 2 or not stat.S_ISREG(target.st_mode):
        raise ValueError('unexpected_package_links')
    prefix = '.staged-' + hashlib.sha256(raw).hexdigest() + '-'
    names = list(staging.iterdir())
    if len(names) > 4096:
        raise ValueError('too_many_staging_files')
    matching = []
    for candidate in names:
        if not re.fullmatch(re.escape(prefix) + r'[a-z0-9_]{8}', candidate.name):
            continue
        info = check_path(candidate)
        if (info.st_dev, info.st_ino) == (target.st_dev, target.st_ino):
            matching.append(candidate)
    if len(matching) != 1:
        raise ValueError('unrecognized_package_link')
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        observed = os.fstat(descriptor)
        if (observed.st_dev, observed.st_ino, observed.st_nlink) != (target.st_dev, target.st_ino, 2) or observed.st_size != len(raw) or os.read(descriptor, len(raw) + 1) != raw:
            raise ValueError('changed_staging_link')
        stage = matching[0].lstat()
        if (stage.st_dev, stage.st_ino, stage.st_nlink) != (target.st_dev, target.st_ino, 2):
            raise ValueError('changed_staging_link')
        matching[0].unlink()
    finally:
        os.close(descriptor)


def install_immutable(path, raw, staging=None):
    staging = path.parent / '.staging' if staging is None else staging
    private_directory(staging)
    recover_stage_link(path, raw, staging)
    if path.exists() or path.is_symlink():
        if regular_bytes(path, 262144) != raw:
            raise ValueError('existing_package_differs')
        return
    check_path(path.parent, True)
    fd, temporary = tempfile.mkstemp(prefix='.staged-' + hashlib.sha256(raw).hexdigest() + '-', dir=staging)
    try:
        with os.fdopen(fd, 'wb', closefd=False) as output:
            output.write(raw)
            output.flush()
            os.fsync(fd)
        # Link only when absent: no existing package byte can be overwritten.
        os.link(temporary, path, follow_symlinks=False)
    finally:
        os.close(fd)
        os.unlink(temporary)


def public_key(value):
    if not isinstance(value, str) or not re.fullmatch(r'ssh-rsa [A-Za-z0-9+/]{500,2000}={0,2} ' + COMMENT, value):
        raise ValueError('invalid_public_key')
    raw = base64.b64decode(value.split()[1], validate=True)
    words = []
    for _ in range(3):
        if len(raw) < 4:
            raise ValueError('invalid_public_key')
        length = struct.unpack('>I', raw[:4])[0]
        if length > len(raw) - 4:
            raise ValueError('invalid_public_key')
        words.append(raw[4:4 + length])
        raw = raw[4 + length:]
    if raw or words[0] != b'ssh-rsa' or int.from_bytes(words[1], 'big') != 65537 or int.from_bytes(words[2], 'big').bit_length() != 4096:
        raise ValueError('invalid_public_key')
    return ' '.join(value.split()[:2])


def package_files(values):
    if type(values) is not dict or len(values) != 45:
        raise ValueError('invalid_package')
    decoded = {}
    for name, encoded in values.items():
        if not re.fullmatch(r'(?:update/)?[a-z_0-9]+\.py', name) or not isinstance(encoded, str):
            raise ValueError('invalid_package')
        raw = base64.b64decode(encoded, validate=True)
        if not 0 < len(raw) <= 262144:
            raise ValueError('invalid_package')
        compile(raw, name, 'exec')
        decoded[name] = raw
    for name, digest in [('dispatcher.py', DISPATCHER_SHA), ('status.py', STATUS_SHA),
                         ('update/oracle_construction_launch.py', LAUNCHER_SHA)]:
        if hashlib.sha256(decoded.get(name, b'')).hexdigest() != digest:
            raise ValueError('package_checksum')
    launcher = types.ModuleType('verified_maintenance_package')
    exec(compile(decoded['update/oracle_construction_launch.py'], 'verified_launcher', 'exec'), launcher.__dict__)
    if set(decoded) != {'dispatcher.py', 'status.py', 'update/oracle_construction_launch.py'} | {'update/' + n for n in launcher.FILES}:
        raise ValueError('package_members')
    for name, (_, expected) in launcher.FILES.items():
        if launcher.blob(decoded['update/' + name]) != expected:
            raise ValueError('package_checksum')
    return decoded


def trusted_host_key(host):
    # These are PUBLIC keys obtained inside the existing strict SSH connection.
    # Never use unauthenticated ssh-keyscan output to establish trust.
    # RSA SHA-2 is supported by the runner and Oracle Linux FIPS policy.
    for filename, algorithm in [('ssh_host_rsa_key.pub', 'ssh-rsa'), ('ssh_host_ed25519_key.pub', 'ssh-ed25519')]:
        path = Path('/etc/ssh') / filename
        if not path.exists():
            continue
        info = path.lstat()
        if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022 or info.st_size > 4096:
            raise ValueError('unsafe_host_public_key')
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
        try:
            raw = os.read(fd, 4097).decode('ascii').split()
        finally:
            os.close(fd)
        if len(raw) not in (2, 3) or raw[0] != algorithm or not re.fullmatch(r'[A-Za-z0-9+/]{30,2000}={0,2}', raw[1]):
            raise ValueError('invalid_host_public_key')
        base64.b64decode(raw[1], validate=True)
        return host + ' ' + ' '.join(raw[:2])
    raise ValueError('host_public_key_missing')


def authorize(ssh, line, key):
    """Append exactly once, preserving every existing authorized_keys byte."""
    target = ssh / 'authorized_keys'
    check_path(ssh, True)
    fd = os.open(target, os.O_RDWR | os.O_CREAT | os.O_APPEND | os.O_NOFOLLOW | os.O_NONBLOCK, 0o600)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_nlink != 1 or info.st_mode & 0o022 or info.st_size > 1048576:
            raise ValueError('unsafe_authorized_keys')
        before = os.read(fd, 1048577)
        relevant = [existing for existing in before.splitlines() if key.encode() in existing or COMMENT.encode() in existing]
        if relevant:
            if relevant == [line]:
                return True
            raise ValueError('existing_access_conflicts')
        current = target.lstat()
        if (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns) != (current.st_dev, current.st_ino, current.st_size, current.st_mtime_ns):
            raise ValueError('authorized_keys_changed')
        addition = (b'\n' if before and not before.endswith(b'\n') else b'') + line + b'\n'
        if os.write(fd, addition) != len(addition):
            raise ValueError('incomplete_key_append')
        os.fsync(fd)
        os.lseek(fd, 0, os.SEEK_SET)
        after = os.read(fd, 1048576 + len(addition) + 1)
        if after != before + addition or target.lstat().st_ino != info.st_ino:
            raise ValueError('key_append_unconfirmed')
        return False
    finally:
        os.close(fd)


def install(payload, home=None, host_key=trusted_host_key):
    selected_home = Path(pwd.getpwuid(os.getuid()).pw_dir)
    if home is None and selected_home != Path('/home/opc'):
        raise ValueError('unexpected_vm_account')
    home = selected_home if home is None else Path(home)
    if type(payload) is not dict or set(payload) != {'host', 'files', 'public_key'}:
        raise ValueError('invalid_setup')
    address = ipaddress.ip_address(payload['host'])
    if address.version != 4 or not address.is_global or address.is_multicast:
        raise ValueError('invalid_host')
    key = public_key(payload['public_key'])
    files = package_files(payload['files'])
    known_hosts = host_key(str(address))
    check_path(home, True)
    for part in (home / '.local', home / '.local/share'):
        if not part.exists():
            part.mkdir(mode=0o700)
        check_path(part, True)
    root = home / ACCESS_ROOT
    private_directory(root)
    lock = os.open(root / 'setup.lock', os.O_WRONLY | os.O_CREAT | os.O_NOFOLLOW | os.O_NONBLOCK, 0o600)
    try:
        lock_info = os.fstat(lock)
        if not stat.S_ISREG(lock_info.st_mode) or lock_info.st_nlink != 1 or lock_info.st_uid != os.getuid() or lock_info.st_mode & 0o077:
            raise ValueError('unsafe_setup_lock')
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        private_directory(root / 'update')
        private_directory(root / '.staging')
        for name, raw in files.items():
            install_immutable(root / name, raw, root / '.staging')
        ssh = home / '.ssh'
        if not ssh.exists():
            ssh.mkdir(mode=0o700)
        check_path(ssh, True)
        command = '/usr/bin/python3 -I -B ' + str(root / 'dispatcher.py')
        line = ('restrict,command="' + command + '" ' + key + ' ' + COMMENT).encode('ascii')
        existing = authorize(ssh, line, key)
    finally:
        os.close(lock)
    return {'phase': 'WORLDIFACT_RESTRICTED_ACCESS_READY', 'host': str(address),
            'known_hosts': known_hosts, 'key_already_authorized': existing,
            'generator_changed': False}


if 'PAYLOAD' in globals():
    try:
        print(json.dumps(install(PAYLOAD), sort_keys=True))
    except (Exception, KeyboardInterrupt):
        raise SystemExit('STOP: restricted setup not confirmed; preserve existing files.')
