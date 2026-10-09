"""Owner-run, checksum-pinned refresh of one existing maintenance grant.

Default PLAN_ONLY does not inspect local files or use the network. Both explicit
approvals are required because the new grant admits a later initial-edit apply
with cleanup bound to one cancelled job. This refresh never invokes that apply.
Existing private keys are only passed to SSH; their contents are never opened,
derived, copied, generated, rotated, or printed by this launcher.
"""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import types
import urllib.request


SOURCE_COMMIT = '5e375f0f7d6f42d8c4d8944fa024bfb474143c04'
NEW_LAUNCHER_SHA = 'c87d9826480173dead7c175db75f0d4f143c8f8bc63fea753cc84ebc6e1e2f57'
REFRESH_FILES = {
    'refresh_receiver.py': '08ae4915baf63159fdaa4a833ecf0b571089de684270dcb1e890ec5eddf9a65c',
    'dispatcher.py': '7928add8cb1c6d95392af2a355adc7c7b4b0829124ba0d71096f97aadbfa7867',
    'status.py': '83ed7b8cedcb42e12f7b84cc57fcc8bade648020859084fa2553414b863dcb99',
}
PUBLIC_ROOT = 'https://raw.githubusercontent.com/teslaeco/WORLDIFACT/'
TARGET = '141.148.242.30'
SERVER_RSA_SHA256 = 'dc28e426f5ae4f85279c65e2d1313cc9d616ebb728583761326ec14ec1ea82d5'
KEY_COMMENT = 'worldifact-maintenance-b6dce84d'
CANCELLED_JOB = 'f91612e5-eb5a-4fec-9585-1ce08c9f38ad'
LAUNCHER_PATH = 'tools/model_construction/oracle_construction_launch.py'
LIMIT = 262144
WIRE_LIMIT = 16384
READY = 'WORLDIFACT_GRANT_REFRESH_READY'
NOT_CONFIRMED = 'WORLDIFACT_GRANT_REFRESH_NOT_CONFIRMED'
SSH_ENV = {'PATH': '/usr/bin:/bin', 'LANG': 'C', 'LC_ALL': 'C'}


class RefreshError(RuntimeError):
    """Only fixed diagnostics are exposed by main, never exception contents."""


class PrivateArgumentParser(argparse.ArgumentParser):
    def error(self, message):
        self.exit(2, 'STOP: invalid refresh arguments; no connection made.\n')


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def exact_hex(value, length):
    return type(value) is str and re.fullmatch('[0-9a-f]{' + str(length) + '}', value) is not None


def frozen(commit):
    # Commit B contains the grant. Its exact file hashes are independent of B,
    # avoiding a self-referential commit pin. Commit A pins the runtime package.
    if (not exact_hex(commit, 40) or not exact_hex(SOURCE_COMMIT, 40)
            or not exact_hex(NEW_LAUNCHER_SHA, 64)
            or set(REFRESH_FILES) != {'refresh_receiver.py', 'dispatcher.py', 'status.py'}
            or any(not exact_hex(value, 64) for value in REFRESH_FILES.values())):
        raise RefreshError('unfrozen_release')


def verified_bytes(raw, expected):
    if (type(raw) is not bytes or not 0 < len(raw) <= LIMIT
            or not exact_hex(expected, 64) or hashlib.sha256(raw).hexdigest() != expected):
        raise RefreshError('package_checksum')
    compile(raw, 'verified_refresh_source', 'exec')
    return raw


def public_file(commit, path, expected):
    paths = {LAUNCHER_PATH} | {'tools/oracle_maintenance/' + name for name in REFRESH_FILES}
    if not exact_hex(commit, 40) or not exact_hex(expected, 64) or path not in paths:
        raise RefreshError('unreviewed_package')
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    with opener.open(PUBLIC_ROOT + commit + '/' + path, timeout=30) as response:
        if response.status != 200:
            raise RefreshError('package_unavailable')
        raw = response.read(LIMIT + 1)
    return verified_bytes(raw, expected)


def identity(info):
    return (info.st_dev, info.st_ino, info.st_mode, info.st_nlink, info.st_uid,
            info.st_gid, info.st_size, info.st_mtime_ns, info.st_ctime_ns)


def owned_path(path, home, *, private=False, directory=False):
    path, home = Path(path), Path(home)
    if (not home.is_absolute() or '..' in home.parts
            or re.search(r'[\s\x00\x7f\"\'\\%$]', str(home)) is not None):
        raise RefreshError('unsafe_home')
    path.relative_to(home)
    for part in (path, *path.parents):
        info = part.lstat()
        if stat.S_ISLNK(info.st_mode):
            raise RefreshError('linked_local_path')
        if part == home or home in part.parents:
            if info.st_uid != os.getuid() or info.st_mode & 0o022:
                raise RefreshError('unsafe_local_owner')
        if part != path and not stat.S_ISDIR(info.st_mode):
            raise RefreshError('unsafe_parent')
    info = path.lstat()
    if (directory and not stat.S_ISDIR(info.st_mode)
            or not directory and (not stat.S_ISREG(info.st_mode) or info.st_nlink != 1)
            or private and info.st_mode & 0o077):
        raise RefreshError('unsafe_local_file')
    return info


def read_public(path, home, maximum):
    """Read only a checked public key or the existing public trust file."""
    allowed = {home / '.worldifact-maintenance-20261008/id_rsa.pub', home / '.ssh/known_hosts'}
    if path not in allowed:
        raise RefreshError('nonpublic_read_refused')
    before = owned_path(path, home)
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        if before.st_size > maximum or identity(before) != identity(os.fstat(descriptor)):
            raise RefreshError('changed_public_file')
        with os.fdopen(descriptor, 'rb', closefd=False) as stream:
            raw = stream.read(maximum + 1)
        if (not 0 < len(raw) <= maximum or len(raw) != before.st_size
                or identity(before) != identity(os.fstat(descriptor))
                or identity(before) != identity(owned_path(path, home))):
            raise RefreshError('changed_public_file')
        return raw
    finally:
        os.close(descriptor)


def public_key(raw):
    text = raw.decode('ascii')
    match = re.fullmatch(r'ssh-rsa ([A-Za-z0-9+/]+={0,2}) ' + KEY_COMMENT + r'\n?', text)
    if match is None:
        raise RefreshError('invalid_public_key')
    encoded = match[1]
    blob = base64.b64decode(encoded, validate=True)
    if base64.b64encode(blob).decode('ascii') != encoded:
        raise RefreshError('invalid_public_key')
    fields, offset = [], 0
    for _ in range(3):
        if offset + 4 > len(blob):
            raise RefreshError('invalid_public_key')
        size = int.from_bytes(blob[offset:offset + 4], 'big')
        offset += 4
        if not 0 < size <= len(blob) - offset:
            raise RefreshError('invalid_public_key')
        fields.append(blob[offset:offset + size])
        offset += size
    algorithm, exponent, modulus = fields
    if (offset != len(blob) or algorithm != b'ssh-rsa' or len(exponent) > 8
            or exponent[0] == 0 or exponent[0] >= 128
            or int.from_bytes(exponent, 'big') != 65537
            or len(modulus) != 513 or modulus[0] != 0 or modulus[1] < 128
            or int.from_bytes(modulus, 'big').bit_length() != 4096):
        raise RefreshError('invalid_public_key')
    return text.removesuffix('\n')


def trusted_server(known_hosts, run):
    # -F reads existing trust, including hashed host names; it never scans a host
    # or writes known_hosts. All returned data stays private to this process.
    answer = run(['/usr/bin/ssh-keygen', '-F', TARGET, '-f', str(known_hosts)],
                 stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                 text=True, timeout=10, env=SSH_ENV, cwd='/')
    if answer.returncode != 0 or type(answer.stdout) is not str or len(answer.stdout) > 1048576:
        raise RefreshError('existing_host_trust_unavailable')
    found = False
    for line in answer.stdout.splitlines():
        if not line or line.startswith('#'):
            continue
        parts = line.split()
        if len(parts) < 3 or parts[0].startswith('@'):
            raise RefreshError('invalid_existing_host_trust')
        if parts[1] == 'ssh-rsa':
            canonical = (parts[1] + ' ' + parts[2] + '\n').encode('ascii')
            if hashlib.sha256(canonical).hexdigest() != SERVER_RSA_SHA256:
                raise RefreshError('server_key_mismatch')
            found = True
    if not found:
        raise RefreshError('server_key_missing')


def connection(key, known_hosts, command):
    if command not in ('/usr/bin/python3 -I -B -', 'status'):
        raise RefreshError('invalid_remote_command')
    options = ['BatchMode=yes', 'IdentitiesOnly=yes', 'IdentityAgent=none',
        'StrictHostKeyChecking=yes', 'UserKnownHostsFile=' + str(known_hosts),
        'GlobalKnownHostsFile=/dev/null', 'HostKeyAlgorithms=rsa-sha2-512,rsa-sha2-256',
        'UpdateHostKeys=no', 'VerifyHostKeyDNS=no', 'CheckHostIP=yes',
        'PreferredAuthentications=publickey', 'PasswordAuthentication=no',
        'KbdInteractiveAuthentication=no', 'GSSAPIAuthentication=no',
        'HostbasedAuthentication=no', 'CertificateFile=none', 'AddKeysToAgent=no',
        'ForwardAgent=no', 'ForwardX11=no', 'ClearAllForwardings=yes', 'Tunnel=no',
        'RequestTTY=no', 'PermitLocalCommand=no', 'ProxyCommand=none', 'ProxyJump=none',
        'ControlMaster=no', 'ControlPath=none', 'ControlPersist=no', 'EscapeChar=none',
        'ConnectTimeout=10', 'ConnectionAttempts=1', 'ServerAliveInterval=5',
        'ServerAliveCountMax=2', 'LogLevel=QUIET']
    return (['/usr/bin/ssh', '-F', '/dev/null', '-T', '-p', '22', '-l', 'opc', '-i', str(key)]
            + (['-n'] if command == 'status' else [])
            + [item for option in options for item in ('-o', option)]
            + ['--', TARGET, command])


def unique(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise RefreshError('duplicate_response_key')
        result[key] = value
    return result


def parse_result(raw):
    if type(raw) is not str or len(raw.encode('utf-8')) > WIRE_LIMIT:
        raise RefreshError('unsafe_response')
    return json.loads(raw, object_pairs_hook=unique)


def safe_result(value, code):
    if (type(value) is not dict or set(value) != {'phase', 'result', 'keys_changed',
            'runtime_changed', 'old_apply_retired'}
            or value['phase'] not in (READY, NOT_CONFIRMED)
            or value['result'] not in ('refreshed', 'already_refreshed', 'rolled_back', 'unconfirmed', 'refused')
            or value['keys_changed'] is not False or value['runtime_changed'] is not False
            or type(value['old_apply_retired']) is not bool
            or type(code) is not int or code not in (0, 1)
            or (value['phase'] == READY) != (value['result'] in ('refreshed', 'already_refreshed'))
            or (code == 0) != (value['phase'] == READY)
            or value['phase'] == READY and value['old_apply_retired'] is not True):
        raise RefreshError('unsafe_refresh_result')
    return value


def package_files(launcher_raw):
    launcher = types.ModuleType('verified_refresh_package')
    exec(compile(launcher_raw, 'verified_refresh_package', 'exec'), launcher.__dict__)
    expected = launcher.FILES
    if (type(expected) is not dict or len(expected) != 42
            or any(type(name) is not str or not re.fullmatch(r'[a-z][a-z0-9_]*\.py', name)
                   or name == 'oracle_construction_launch.py' for name in expected)):
        raise RefreshError('unexpected_package')
    encoded = launcher.package(SOURCE_COMMIT)
    if type(encoded) is not str or len(encoded) > 42 * LIMIT * 2:
        raise RefreshError('unexpected_package')
    package = json.loads(base64.b64decode(encoded, validate=True), object_pairs_hook=unique)
    if type(package) is not dict or set(package) != set(expected):
        raise RefreshError('unexpected_package')
    for name, entry in expected.items():
        if type(entry) not in (tuple, list) or len(entry) != 2 or not exact_hex(entry[1], 40):
            raise RefreshError('unreviewed_package')
        if type(package[name]) is not str or len(package[name]) > LIMIT * 2:
            raise RefreshError('invalid_package_file')
        raw = base64.b64decode(package[name], validate=True)
        if (not 0 < len(raw) <= LIMIT
                or base64.b64encode(raw).decode('ascii') != package[name]
                or hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest() != entry[1]):
            raise RefreshError('invalid_package_file')
        compile(raw, name, 'exec')
    package['oracle_construction_launch.py'] = base64.b64encode(launcher_raw).decode('ascii')
    return {'update-initial-edit-v1/' + name: value for name, value in package.items()}


def check_restricted_status(key, known_hosts, run):
    answer = run(connection(key, known_hosts, 'status'), stdin=subprocess.DEVNULL,
                 stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True,
                 timeout=60, env=SSH_ENV, cwd='/')
    value = parse_result(answer.stdout)
    if (answer.returncode != 0 or type(value) is not dict
            or set(value) != {'revision', 'action', 'result', 'status', 'installer'}
            or value['revision'] != 'oracle-maintenance-initial-edit-v1'
            or value['action'] != 'status' or value['installer'] is not None
            or value['result'] not in ('already_updated', 'ready_to_apply', 'busy', 'inconclusive')
            or type(value['status']) is not dict or value['status'].get('read_only') is not True):
        raise RefreshError('restricted_status_not_confirmed')


def refresh(commit, *, home=None, run=None, reader=None):
    frozen(commit)
    run = subprocess.run if run is None else run
    reader = public_file if reader is None else reader
    home = Path.home() if home is None else Path(home)
    folder = home / '.worldifact-maintenance-20261008'
    key, public = folder / 'id_rsa', folder / 'id_rsa.pub'
    admin, known_hosts = home / 'ssh-key-2026-09-06.key', home / '.ssh/known_hosts'
    owned_path(folder, home, private=True, directory=True)
    # Stat-only checks: never derive a public key from either private identity.
    watched = {path: identity(owned_path(path, home, private=True)) for path in (key, admin)}
    public_raw, trust_raw = read_public(public, home, 16384), read_public(known_hosts, home, 1048576)
    dedicated_public = public_key(public_raw)
    trusted_server(known_hosts, run)
    source = {name: verified_bytes(reader(commit, 'tools/oracle_maintenance/' + name, digest), digest)
              for name, digest in REFRESH_FILES.items()}
    launcher_raw = verified_bytes(reader(SOURCE_COMMIT, LAUNCHER_PATH, NEW_LAUNCHER_SHA), NEW_LAUNCHER_SHA)
    files = package_files(launcher_raw)
    files.update({name: base64.b64encode(source[name]).decode('ascii')
                  for name in ('dispatcher.py', 'status.py')})
    if len(files) != 45:
        raise RefreshError('unexpected_package')
    payload = {'files': files, 'public_key': dedicated_public}
    program = 'PAYLOAD = ' + repr(payload) + '\n' + source['refresh_receiver.py'].decode('utf-8')

    def preserved():
        for path, before in watched.items():
            if before != identity(owned_path(path, home, private=True)):
                raise RefreshError('local_identity_changed')
        if (read_public(public, home, 16384) != public_raw
                or read_public(known_hosts, home, 1048576) != trust_raw):
            raise RefreshError('local_public_files_changed')

    preserved()
    try:
        answer = run(connection(admin, known_hosts, '/usr/bin/python3 -I -B -'),
                     input=program, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                     text=True, timeout=180, env=SSH_ENV, cwd='/')
        observed = safe_result(parse_result(answer.stdout), answer.returncode)
        if observed['phase'] == READY:
            preserved()
            check_restricted_status(key, known_hosts, run)
        return observed
    finally:
        preserved()


def main(argv=None):
    parser = PrivateArgumentParser(description=__doc__, allow_abbrev=False)
    parser.add_argument('--source-commit')
    parser.add_argument('--approve-grant-refresh', action='store_true')
    parser.add_argument('--approve-exact-cancelled-cleanup', action='store_true',
                        help='Authorize the later command bound only to cancelled job ' + CANCELLED_JOB)
    args = parser.parse_args(argv)
    if args.approve_grant_refresh != args.approve_exact_cancelled_cleanup:
        parser.error('both approvals required')
    if not args.approve_grant_refresh:
        print(json.dumps({'phase': 'PLAN_ONLY', 'keys_changed': False, 'runtime_changed': False}, sort_keys=True))
        return 0
    try:
        observed = refresh(args.source_commit)
    except (Exception, KeyboardInterrupt):
        observed = {'phase': NOT_CONFIRMED, 'result': 'unconfirmed', 'keys_changed': False,
                    'runtime_changed': False, 'old_apply_retired': False}
    print(json.dumps(observed, sort_keys=True))
    return 0 if observed['phase'] == READY else 1


if __name__ == '__main__':
    raise SystemExit(main())
