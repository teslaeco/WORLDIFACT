"""One-command OCI Cloud Shell launcher for the reviewed PR156 cache fix.

Default: plan only. With explicit maintenance approval, resolve the existing
froge-blender VM, verify every public dependency, and invoke its idle-only,
backup/verification/rollback installer over strict SSH. No paid generation,
customer payment changes, copied private key, or new cloud resource.
"""
import argparse
import base64
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import urllib.request

SOURCE = '2ec02e9484a313bc40c0dcd9117a778fb1784696'
PUBLIC_ROOT = 'https://raw.githubusercontent.com/teslaeco/WORLDIFACT/'
LIMIT = 262144
FILES = {
    'install_cache_accounting.py': ('tools/profit_guard/install_cache_accounting.py', '270b8b080f33c595b5c487dec53d0ef147eaf2b5'),
    'install.py': ('tools/profit_guard/install.py', '099e77e4e9bb89145d80603e8cfe0bf0dad1069d'),
    'install_tuning.py': ('tools/profit_guard/install_tuning.py', '933f6a1597ebc5525c791495402fefcf6f260ed9'),
    'astra_spend.py': ('tools/profit_guard/astra_spend.py', 'c94fb0266ff0337294e4d9f348c93e5830d287f3'),
    'astra_spend_v2.py': ('tools/profit_guard/astra_spend_v2.py', '410a58d3210b18810a1a5134cf847bc2e146504f'),
    'install_v33.py': ('tools/fast_preview/install_v33.py', '1f5437a437cd6909967e7a73e824e860c366f370'),
    'installed_v33.py': ('tools/fast_preview/installed_v33.py', '00d99c4d89beae146aaece0d9940ddd55122e4ac'),
    'apply.py': ('tools/fast_preview/apply.py', '825f6877710169ae26f1a39ce3933232a1b3a574'),
    'completion.py': ('tools/fast_preview/completion.py', '7b026ef54dbe2719195d05349ca3927de039e287'),
    'fast_preview.py': ('tools/fast_preview/fast_preview.py', 'b350089e795e18d4b2e105cbd18a0a8f976ffa5c'),
}


class LaunchError(RuntimeError):
    pass


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def blob(raw):
    return hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()


def read_public(path):
    if path not in {item[0] for item in FILES.values()}:
        raise LaunchError('Unexpected package path; no connection made.')
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    try:
        with opener.open(PUBLIC_ROOT + SOURCE + '/' + path, timeout=30) as response:
            if response.status != 200:
                raise LaunchError('Public package unavailable; no worker change.')
            raw = response.read(LIMIT + 1)
        if not 0 < len(raw) <= LIMIT:
            raise LaunchError('Invalid package size; no worker change.')
        return raw
    except LaunchError:
        raise
    except Exception:
        raise LaunchError('Public package download failed; no worker change. No credentials are needed for this download.') from None


def package(reader=None):
    values = {}
    for name, (path, expected) in FILES.items():
        raw = (reader or read_public)(path)
        if not isinstance(raw, bytes) or not 0 < len(raw) <= LIMIT or blob(raw) != expected:
            raise LaunchError('Package checksum failed for ' + name + '; no worker change.')
        compile(raw, name, 'exec')  # Syntax only, never import an unverified file.
        values[name] = base64.b64encode(raw).decode('ascii')
    return base64.b64encode(json.dumps(values, sort_keys=True).encode()).decode('ascii')


def lookup(args):
    try:
        answer = subprocess.run(args, stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=60)
    except Exception:
        raise LaunchError('OCI lookup unavailable. Use the original Cloud Shell; no worker change.') from None
    if answer.returncode or len(answer.stdout) > 65536:
        raise LaunchError('OCI lookup failed; no worker change. No private errors are printed.')
    try:
        values = json.loads(answer.stdout)
    except ValueError:
        raise LaunchError('Invalid OCI lookup response; no worker change.') from None
    if not isinstance(values, list) or len(values) != 1 or not isinstance(values[0], str):
        raise LaunchError('Expected exactly one existing VM/address; no worker change.')
    return values[0]


def connection(home=None):
    home = Path.home() if home is None else Path(home)
    key = home / 'ssh-key-2026-09-06.key'
    if any(p.is_symlink() for p in (key, *key.parents)) or not key.is_file() or not os.access(key, os.R_OK):
        raise LaunchError('Original Cloud Shell SSH key is unavailable. Do not send the key or create an empty worker folder.')
    oci = ['oci', '--region', 'eu-amsterdam-1']
    instance = lookup(oci + ['search', 'resource', 'structured-search', '--query-text',
        "query instance resources where displayName = 'froge-blender' && lifeCycleState = 'RUNNING'",
        '--query', 'data.items[].identifier', '--output', 'json'])
    if not re.fullmatch(r'ocid1\.instance\.[A-Za-z0-9._-]+', instance):
        raise LaunchError('Invalid instance identifier; no worker change.')
    address = lookup(oci + ['compute', 'instance', 'list-vnics', '--instance-id', instance, '--all',
        '--query', 'data[?"is-primary" == `true`]."public-ip"', '--output', 'json'])
    try:
        if not ipaddress.ip_address(address).is_global:
            raise ValueError()
    except ValueError:
        raise LaunchError('Invalid public VM address; no worker change.') from None
    return ['ssh', '-T', '-i', str(key), '-o', 'IdentitiesOnly=yes', '-o', 'StrictHostKeyChecking=yes',
            '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20', '-o', 'ServerAliveInterval=15',
            '-o', 'ServerAliveCountMax=3', 'opc@' + address, 'PYTHONDONTWRITEBYTECODE=1 python3 -B -']


REMOTE = r'''
import base64, hashlib, json, os, pathlib, signal, subprocess, sys, tempfile
payload = json.loads(base64.b64decode(PAYLOAD, validate=True))
if not isinstance(payload, dict) or set(payload) != set(EXPECTED):
    raise SystemExit('STOP: invalid package names; no worker change.')
files = {}
for name, expected in EXPECTED.items():
    raw = base64.b64decode(payload[name], validate=True)
    if not 0 < len(raw) <= 262144 or hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest() != expected:
        raise SystemExit('STOP: invalid package bytes; no worker change.')
    compile(raw, name, 'exec')
    files[name] = raw
root = pathlib.Path.home()/'.local/state/worldifact-astra-guard'
if any(p.is_symlink() for p in (root,*root.parents)):
    raise SystemExit('STOP: unsafe staging path; no worker change.')
root.mkdir(mode=0o700, parents=True, exist_ok=True)
folder = pathlib.Path(tempfile.mkdtemp(prefix='cache-package-', dir=root))
for name, raw in files.items():
    fd = os.open(str(folder/name), os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(raw); stream.flush(); os.fsync(stream.fileno())
print('[3/3] On the generator VM: checking idle state, backups, offline Blender test and restart. No paid model request.', flush=True)
print('Private installer package: '+str(folder), flush=True)
process = subprocess.Popen([sys.executable, '-B', str(folder/'install_cache_accounting.py'), '--approve-service-restart'],
                           cwd=folder, stdin=subprocess.DEVNULL)
# Forward disconnection/interruption once; let the installer restore touched files.
interrupted = [False]
def relay(signum, _frame):
    if not interrupted[0]:
        interrupted[0] = True
        if process.poll() is None: process.send_signal(signum)
for sig in (signal.SIGHUP, signal.SIGTERM, signal.SIGINT): signal.signal(sig, relay)
code = process.wait()
if code or interrupted[0]:
    print('WORLDIFACT_CACHE_FIX_NOT_CONFIRMED. Keep private backups. Do not run a paid retry.', flush=True)
    raise SystemExit(code if code > 0 else 1)
print('WORLDIFACT_CACHE_FIX_INSTALLED. Payment settings unchanged. Paid character generation NOT TESTED.', flush=True)
'''


def script(payload):
    expected = {name: value[1] for name, value in FILES.items()}
    return 'EXPECTED = ' + repr(expected) + '\nPAYLOAD = ' + repr(payload) + '\n' + REMOTE


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--approve-service-restart', action='store_true')
    args = parser.parse_args(argv)
    if not args.approve_service_restart:
        print('PLAN ONLY. No download, SSH, installation, restart, payment change or model generation.')
        return
    print('[1/3] Resolving the existing froge-blender VM from OCI Cloud Shell.', flush=True)
    ssh = connection()
    print('[2/3] Downloading and verifying the ten pinned installer files.', flush=True)
    payload = package()
    result = subprocess.run(ssh, input=script(payload), text=True)
    if result.returncode:
        raise LaunchError('Oracle installation is NOT confirmed. Preserve backups; never disable host verification or pay for another attempt.')


if __name__ == '__main__':
    try:
        main()
    except LaunchError as error:
        print('STOP: ' + str(error), file=sys.stderr)
        sys.exit(1)
    except (Exception, KeyboardInterrupt):
        print('STOP: maintenance interrupted or unconfirmed. Preserve backups. No automatic paid retry.', file=sys.stderr)
        sys.exit(1)
