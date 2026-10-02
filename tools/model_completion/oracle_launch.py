"""One-command OCI Cloud Shell launcher for the reviewed model-completion repair.

Default: PLAN ONLY. With --approve-service-restart, resolve the existing
froge-blender VM, verify a pinned public package, and run the idle-only,
backup/verification/rollback installer through strict SSH. --diagnose-job UUID
runs only the safe ledger diagnostic when restart approval is absent. Every
remote mode requires an exact reviewed --source-commit. --stage-test-helper
only stages the verified package and prints its helper path; it cannot execute
the separate paid test.

No paid generation, no customer credit mutation, no Stripe/PayPal change,
no new cloud resource, and the SSH private key is never read or uploaded.
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

PUBLIC_ROOT = 'https://raw.githubusercontent.com/teslaeco/WORLDIFACT/'
LIMIT = 262144
FILES = {
    'install_completion.py': ('tools/model_completion/install_completion.py', '45e0e7bc7cdebe33c89d9bbea13ec38e2723e851'),
    'completion_policy.py': ('tools/model_completion/completion_policy.py', '7f318c7b61f7bf02416b149023dcd4734f2ce3fd'),
    'reviewed_direct_export.py': ('tools/model_completion/reviewed_direct_export.py', '385811ea2aeb8a817328ffed584ab79e48c10026'),
    'source_patch.py': ('tools/model_completion/source_patch.py', '729daad3c81c1368b3e68fa033615f06ff50b21a'),
    'install_request_timeout900.py': ('tools/profit_guard/install_request_timeout900.py', 'e9555d728271704578f19708da87528f31ba67d8'),
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
    # Staged only. No launcher mode executes this separately approved helper.
    'test_original_job_once.py': ('tools/model_completion/test_original_job_once.py', '9a1d836363f2b2746954208d3fe50c4f757bae29'),
}


class LaunchError(RuntimeError):
    pass


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def blob(raw):
    return hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()


def source_commit(value):
    """Only an immutable Git commit is accepted; no branch, tag or URL."""
    if not isinstance(value, str) or not re.fullmatch(r'[0-9a-fA-F]{40}', value):
        raise LaunchError('An exact reviewed 40-hex --source-commit is required; no connection made.')
    return value.lower()


def job_uuid(value):
    if not isinstance(value, str) or not re.fullmatch(r'[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}', value):
        raise LaunchError('An exact canonical --diagnose-job UUID is required; no connection made.')
    return value.lower()


def read_public(commit, path):
    commit = source_commit(commit)
    if path not in {item[0] for item in FILES.values()}:
        raise LaunchError('Unexpected package path; no connection made.')
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    try:
        with opener.open(PUBLIC_ROOT + commit + '/' + path, timeout=30) as response:
            if response.status != 200:
                raise LaunchError('Public package unavailable; no worker change.')
            raw = response.read(LIMIT + 1)
        if not 0 < len(raw) <= LIMIT:
            raise LaunchError('Invalid package size; no worker change.')
        return raw
    except LaunchError:
        raise
    except Exception:
        raise LaunchError('Public package download failed; no worker change.') from None


def package(commit, reader=None):
    commit = source_commit(commit)
    values = {}
    for name, (path, expected) in FILES.items():
        raw = reader(path) if reader is not None else read_public(commit, path)
        if not isinstance(raw, bytes) or not 0 < len(raw) <= LIMIT or blob(raw) != expected:
            raise LaunchError('Package checksum failed for ' + name + '; no worker change.')
        try:
            compile(raw, name, 'exec')
        except (SyntaxError, ValueError):
            raise LaunchError('Invalid Python package file: ' + name + '; no worker change.') from None
        values[name] = base64.b64encode(raw).decode('ascii')
    return base64.b64encode(json.dumps(values, sort_keys=True).encode()).decode('ascii')


def lookup(args):
    try:
        answer = subprocess.run(args, stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=60)
    except Exception:
        raise LaunchError('OCI lookup unavailable. Use the original Cloud Shell; no worker change.') from None
    if answer.returncode or len(answer.stdout) > 65536:
        raise LaunchError('OCI lookup failed; no worker change.')
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
        raise LaunchError('Original Cloud Shell SSH key is unavailable. Do not share or replace it.')
    oci = ['oci', '--region', 'eu-amsterdam-1']
    instance = lookup(oci + ['search', 'resource', 'structured-search', '--query-text',
        "query instance resources where displayName = 'froge-blender' && lifeCycleState = 'RUNNING'",
        '--query', 'data.items[].identifier', '--output', 'json'])
    if not re.fullmatch(r'ocid1\.instance\.[A-Za-z0-9._-]+', instance):
        raise LaunchError('Invalid instance identifier; no worker change.')
    address = lookup(oci + ['compute', 'instance', 'list-vnics', '--instance-id', instance, '--all',
        '--query', 'data[?"is-primary" == `true`]."public-ip"', '--output', 'json'])
    try:
        public_ip = ipaddress.ip_address(address)
        if not public_ip.is_global or public_ip.is_multicast or '%' in address:
            raise ValueError()
    except ValueError:
        raise LaunchError('Invalid public VM address; no worker change.') from None
    return ['ssh', '-F', '/dev/null', '-T', '-i', str(key), '-o', 'IdentitiesOnly=yes', '-o', 'StrictHostKeyChecking=yes',
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
folder = pathlib.Path(tempfile.mkdtemp(prefix='model-completion-package-', dir=root))
for name, raw in files.items():
    fd = os.open(str(folder/name), os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(raw); stream.flush(); os.fsync(stream.fileno())
if STAGE_TEST_HELPER:
    print(json.dumps({'phase': 'WORLDIFACT_MODEL_TEST_HELPER_STAGED',
        'helper_path': str(folder/'test_original_job_once.py'),
        'paid_generation_requested': False, 'service_restarted': False}, sort_keys=True), flush=True)
    raise SystemExit(0)
command = [sys.executable, '-B', str(folder/'install_completion.py')]
if APPROVED:
    command.append('--approve-service-restart')
    print('[3/3] On generator VM: exact-source check, idle check, backup, offline Codex/Blender verification, restart.', flush=True)
else:
    print('[3/3] On generator VM: read-only safe job-ledger diagnostic. No restart or runtime edit.', flush=True)
if DIAGNOSE_JOB is not None:
    command.extend(['--diagnose-job', DIAGNOSE_JOB])
print('No paid model request. Payment settings unchanged.', flush=True)
process = subprocess.Popen(command, cwd=folder, stdin=subprocess.DEVNULL)
interrupted = [False]
def relay(signum, _frame):
    if not interrupted[0]:
        interrupted[0] = True
        if process.poll() is None: process.send_signal(signum)
for sig in (signal.SIGHUP, signal.SIGTERM, signal.SIGINT): signal.signal(sig, relay)
code = process.wait()
if code or interrupted[0]:
    marker = 'WORLDIFACT_MODEL_COMPLETION_NOT_CONFIRMED' if APPROVED else 'WORLDIFACT_MODEL_COMPLETION_DIAGNOSTIC_NOT_CONFIRMED'
    print(marker + '. Preserve backups. Do not run a paid retry.', flush=True)
    raise SystemExit(code if code > 0 else 1)
marker = 'WORLDIFACT_MODEL_COMPLETION_VERIFIED' if APPROVED else 'WORLDIFACT_MODEL_COMPLETION_DIAGNOSTIC_COMPLETE'
print(marker + '. Payments unchanged. Paid generation NOT RUN.', flush=True)
'''


def script(payload, *, approved=False, diagnose_job=None, stage_test_helper=False):
    if stage_test_helper is True and (approved is True or diagnose_job is not None):
        raise LaunchError('Helper staging cannot be combined with maintenance or diagnostics; no connection made.')
    if approved is not True and diagnose_job is None and stage_test_helper is not True:
        raise LaunchError('No remote operation requested; no connection made.')
    diagnose_job = job_uuid(diagnose_job) if diagnose_job is not None else None
    expected = {name: value[1] for name, value in FILES.items()}
    return ('EXPECTED = ' + repr(expected) + '\nPAYLOAD = ' + repr(payload)
            + '\nAPPROVED = ' + repr(approved is True)
            + '\nDIAGNOSE_JOB = ' + repr(diagnose_job)
            + '\nSTAGE_TEST_HELPER = ' + repr(stage_test_helper is True) + '\n' + REMOTE)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--approve-service-restart', action='store_true')
    parser.add_argument('--source-commit', help='Exact reviewed public commit (40 hex); required for every remote operation.')
    parser.add_argument('--diagnose-job', help='Exact UUID for a safe job-ledger diagnostic; does not approve maintenance.')
    parser.add_argument('--stage-test-helper', action='store_true', help='Stage the verified helper only; no installation, diagnostic or paid execution.')
    args = parser.parse_args(argv)
    commit = source_commit(args.source_commit) if args.source_commit is not None else None
    diagnose_job = job_uuid(args.diagnose_job) if args.diagnose_job is not None else None
    if args.stage_test_helper and (args.approve_service_restart or diagnose_job is not None):
        raise LaunchError('Helper staging cannot be combined with maintenance or diagnostics; no connection made.')
    if not args.approve_service_restart and diagnose_job is None and not args.stage_test_helper:
        print('PLAN ONLY. No download, SSH, installation, restart, payment change or model generation.')
        return
    commit = source_commit(commit)
    print('[1/3] Resolving the existing froge-blender VM from OCI Cloud Shell.', flush=True)
    ssh = connection()
    print('[2/3] Downloading and verifying the pinned model-completion installer package.', flush=True)
    payload = package(commit)
    result = subprocess.run(ssh, input=script(payload, approved=args.approve_service_restart,
                            diagnose_job=diagnose_job, stage_test_helper=args.stage_test_helper), text=True)
    if result.returncode:
        operation = ('helper staging' if args.stage_test_helper else
                     'installation' if args.approve_service_restart else 'diagnostic')
        raise LaunchError('Oracle model-completion ' + operation + ' is NOT confirmed. Preserve backups; do not pay for another attempt.')


if __name__ == '__main__':
    try:
        main()
    except LaunchError as error:
        print('STOP: ' + str(error), file=sys.stderr)
        sys.exit(1)
    except (Exception, KeyboardInterrupt):
        print('STOP: maintenance interrupted or unconfirmed. Preserve backups. No automatic paid retry.', file=sys.stderr)
        sys.exit(1)
