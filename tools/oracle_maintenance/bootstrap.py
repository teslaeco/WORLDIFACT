"""One-time, owner-run Cloud Shell setup for two fixed Oracle operations.

The dedicated private key is created locally and is never read or printed by
this script. Its owner must enter it personally in GitHub's Production secrets.
No generator update is invoked during setup.
"""
import argparse
import base64
import fcntl
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import tempfile
import types
import urllib.request

UPDATE_COMMIT = 'b6dce84d1bd598ad88b0af934fa4384354271496'
LAUNCHER_SHA = '9ef5cd1fc648e192be196dc56fa7fe0ab0292975bc58abc445cd6180bb1df313'
PUBLIC_ROOT = 'https://raw.githubusercontent.com/teslaeco/WORLDIFACT/'
SETUP_FILES = {
    'receiver.py': '4801b8a82d13832c77087f4ecb6d47078912728a257249142bed539a245eaba5',
    'dispatcher.py': 'e7dc5beba6e3ce19b4737e6d99cac64c974e13b72ca593e2cf47d218ea89d7f8',
    'status.py': '13829c114a258b5fb385cdda4a7bfd283d1586ee636883a2058cecef630b8aac',
}
KEY_COMMENT = 'worldifact-maintenance-b6dce84d'
MAXIMUM = 262144


class SetupError(RuntimeError):
    pass


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def public_file(commit, path, expected):
    if not re.fullmatch(r'[0-9a-f]{40}', commit) or not re.fullmatch(r'[0-9a-f]{64}', expected):
        raise SetupError('unreviewed_package')
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    with opener.open(PUBLIC_ROOT + commit + '/' + path, timeout=30) as response:
        if response.status != 200:
            raise SetupError('package_unavailable')
        raw = response.read(MAXIMUM + 1)
    if not 0 < len(raw) <= MAXIMUM or hashlib.sha256(raw).hexdigest() != expected:
        raise SetupError('package_checksum')
    compile(raw, path, 'exec')
    return raw


def owned_path(path, directory=False):
    """Never follow a link or accept another user/group-writable key location."""
    for part in (path, *path.parents):
        info = part.lstat()
        if stat.S_ISLNK(info.st_mode) or info.st_mode & 0o022:
            raise SetupError('unsafe_local_path')
    info = path.lstat()
    if info.st_uid != os.getuid() or (directory and not stat.S_ISDIR(info.st_mode)):
        raise SetupError('unsafe_local_owner')
    return info


def dedicated_key(home, run=subprocess.run):
    folder = home / '.worldifact-maintenance-20261008'
    if not folder.exists():
        owned_path(home, True)
        folder.mkdir(mode=0o700)
    if owned_path(folder, True).st_mode & 0o077:
        raise SetupError('unsafe_key_directory')
    descriptor = os.open(folder / 'creation.lock', os.O_WRONLY | os.O_CREAT | os.O_NOFOLLOW | os.O_NONBLOCK, 0o600)
    try:
        info = os.fstat(descriptor)
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_nlink != 1 or info.st_mode & 0o077:
            raise SetupError('unsafe_key_lock')
        fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        return key_pair(folder, run)
    finally:
        os.close(descriptor)


def key_pair(folder, run):
    key = folder / 'id_rsa'
    public = folder / 'id_rsa.pub'
    if not key.exists() and not public.exists():
        result = run(['ssh-keygen', '-q', '-t', 'rsa', '-b', '4096', '-N', '',
                      '-C', KEY_COMMENT, '-f', str(key)], stdin=subprocess.DEVNULL,
                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=90)
        if result.returncode:
            raise SetupError('key_creation_failed')
    # An interrupted or unknown pair is never silently replaced or rotated.
    for path in (key, public):
        info = owned_path(path)
        if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_size > 16384:
            raise SetupError('unsafe_key_file')
    if key.stat().st_mode & 0o077:
        raise SetupError('unsafe_private_permissions')
    pub = public.read_text(encoding='ascii').strip()
    if not re.fullmatch(r'ssh-rsa [A-Za-z0-9+/]{500,2000}={0,2} ' + KEY_COMMENT, pub):
        raise SetupError('invalid_dedicated_public_key')
    # Only the public half is returned. ssh-keygen validates its RSA size.
    check = run(['ssh-keygen', '-l', '-f', str(public)], stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, timeout=10)
    if check.returncode or not re.fullmatch(r'4096 SHA256:[A-Za-z0-9+/]+ ' + KEY_COMMENT + r' \(RSA\)\n?', check.stdout):
        raise SetupError('invalid_public_fingerprint')
    pair = run(['ssh-keygen', '-y', '-f', str(key)], stdin=subprocess.DEVNULL,
               stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, timeout=10)
    expected = ' '.join(pub.split()[:2])
    if pair.returncode or pair.stdout.strip() not in (expected, expected + ' ' + KEY_COMMENT):
        raise SetupError('key_pair_mismatch')
    return key, pub


def check_restricted_status(key, host, known_hosts, run):
    """Prove the fixed SSH entrypoint works before declaring setup ready."""
    with tempfile.TemporaryDirectory(prefix='host-check-', dir=key.parent) as temp:
        trust = Path(temp) / 'known_hosts'
        trust.write_text(known_hosts + '\n', encoding='ascii')
        trust.chmod(0o600)
        algorithm = known_hosts.split()[1]
        algorithms = 'rsa-sha2-512,rsa-sha2-256' if algorithm == 'ssh-rsa' else algorithm
        command = ['ssh', '-F', '/dev/null', '-T', '-n', '-i', str(key),
                   '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes', '-o', 'IdentityAgent=none',
                   '-o', 'StrictHostKeyChecking=yes', '-o', 'GlobalKnownHostsFile=/dev/null',
                   '-o', 'UserKnownHostsFile=' + str(trust), '-o', 'HostKeyAlgorithms=' + algorithms,
                   '-o', 'UpdateHostKeys=no', '-o', 'ClearAllForwardings=yes',
                   '-o', 'ForwardAgent=no', '-o', 'PasswordAuthentication=no',
                   '-o', 'KbdInteractiveAuthentication=no', '-o', 'ConnectTimeout=15',
                   '-o', 'ConnectionAttempts=1', 'opc@' + host, 'status']
        answer = run(command, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                     stderr=subprocess.DEVNULL, text=True, timeout=60)
    if answer.returncode or len(answer.stdout) > 16384:
        raise SetupError('restricted_authentication_not_confirmed')
    observed = json.loads(answer.stdout)
    if (type(observed) is not dict or set(observed) != {'revision', 'action', 'result', 'status', 'installer'}
            or observed['revision'] != 'oracle-maintenance-b6dce84d-v1' or observed['action'] != 'status'
            or observed['result'] not in ('already_updated', 'ready_to_apply', 'busy', 'inconclusive')
            or observed['installer'] is not None or type(observed['status']) is not dict
            or observed['status'].get('read_only') is not True):
        raise SetupError('restricted_status_not_confirmed')
    return observed['result']


def setup(commit, home=None, run=subprocess.run, reader=public_file):
    home = Path.home() if home is None else Path(home)
    launcher_raw = reader(UPDATE_COMMIT, 'tools/model_construction/oracle_construction_launch.py', LAUNCHER_SHA)
    launcher = types.ModuleType('verified_setup_connection')
    exec(compile(launcher_raw, 'verified_setup_connection', 'exec'), launcher.__dict__)
    # Existing strict SSH authority is reused only to install this finite entrypoint.
    command = launcher.connection(home)
    address = command[-2].removeprefix('opc@')
    ip = ipaddress.ip_address(address)
    if ip.version != 4 or not ip.is_global or ip.is_multicast:
        raise SetupError('public_ipv4_required')
    source = {name: reader(commit, 'tools/oracle_maintenance/' + name, digest)
              for name, digest in SETUP_FILES.items()}
    package = json.loads(base64.b64decode(launcher.package(UPDATE_COMMIT), validate=True))
    package['oracle_construction_launch.py'] = base64.b64encode(launcher_raw).decode('ascii')
    files = {'update/' + name: value for name, value in package.items()}
    for name in ('dispatcher.py', 'status.py'):
        files[name] = base64.b64encode(source[name]).decode('ascii')
    key, public = dedicated_key(home, run)
    payload = {'files': files, 'public_key': public, 'host': address}
    remote = 'PAYLOAD = ' + repr(payload) + '\n' + source['receiver.py'].decode('utf8')
    result = run(command, input=remote, text=True, stdout=subprocess.PIPE,
                 stderr=subprocess.DEVNULL, timeout=180)
    if result.returncode or len(result.stdout) > 8192:
        raise SetupError('setup_not_confirmed')
    observed = json.loads(result.stdout)
    expected = {'phase', 'host', 'known_hosts', 'key_already_authorized', 'generator_changed'}
    if (type(observed) is not dict or set(observed) != expected
            or observed['phase'] != 'WORLDIFACT_RESTRICTED_ACCESS_READY'
            or observed['host'] != address or observed['generator_changed'] is not False
            or type(observed['key_already_authorized']) is not bool
            or not re.fullmatch(re.escape(address) + r' (ssh-ed25519|ssh-rsa) [A-Za-z0-9+/]{30,2000}={0,2}', observed['known_hosts'])):
        raise SetupError('unsafe_setup_result')
    observed['restricted_status_result'] = check_restricted_status(key, address, observed['known_hosts'], run)
    observed['restricted_authentication_verified'] = True
    observed['private_key_download_path'] = str(key)
    observed['github_ssh_reachability'] = 'NOT_YET_CHECKED'
    observed['private_key_handoff'] = 'OWNER_ONLY_AFTER_REACHABILITY_CHECK'
    return observed


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-commit', required=True)
    parser.add_argument('--approve-restricted-access', action='store_true')
    args = parser.parse_args()
    if not args.approve_restricted_access:
        parser.exit(2, 'STOP: explicit restricted-access approval required.\n')
    try:
        observed = setup(args.source_commit)
    except (Exception, KeyboardInterrupt):
        # No private exception, command output or key bytes may reach the terminal.
        parser.exit(1, 'STOP: restricted setup not confirmed. Preserve existing files; do not regenerate keys.\n')
    print(json.dumps(observed, sort_keys=True))


if __name__ == '__main__':
    main()
