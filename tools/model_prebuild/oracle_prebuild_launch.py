"""Strict pinned OCI Cloud Shell launcher for the unpaid prebuild upgrade.

Default PLAN ONLY: no file reads, downloads, OCI lookup, SSH or worker changes.
Remote installation requires --approve-service-restart and an exact reviewed
40-hex --source-commit. Only the idle-only, backup/verify/rollback installer is
invoked, once. Existing SSH key and strict host checking are preserved.
No paid generation, diagnosis, job helper, new credentials or payment changes.
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
OUTPUT_LIMIT = 32768
INSTALL_TIMEOUT = 1800
SSH_TIMEOUT = 2100
REVISION = 'worldifact-cabinet-prebuild-v1'
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
    'install_prebuild.py': ('tools/model_prebuild/install_prebuild.py', '2ad31e406f7c1f27b6355963d27c35d63648fdc1'),
    'prebuild_policy.py': ('tools/model_prebuild/prebuild_policy.py', '6ebd1eb54523ad0fa1d198bace5836b739a42e05'),
    'prebuild_patch.py': ('tools/model_prebuild/prebuild_patch.py', '4a635376266c4e603271eaa768af187147850385'),
    'offline_cabinet.py': ('tools/model_prebuild/offline_cabinet.py', 'd30f21d49a4eb73f9ddb278901f7938f68c6f21c'),
}


class LaunchError(RuntimeError):
    """Fixed public diagnostics only; private subprocess output is suppressed."""


class PrivateArgumentParser(argparse.ArgumentParser):
    def error(self, message):
        self.exit(2, 'STOP: invalid launcher arguments; no connection made.\n')


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


def read_public(commit, path):
    commit = source_commit(commit)
    if path not in {item[0] for item in FILES.values()}:
        raise LaunchError('Unexpected package path; no connection made.')
    try:
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
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
    if any(not re.fullmatch(r'[0-9a-f]{40}', item[1]) for item in FILES.values()):
        raise LaunchError('Reviewed package pins are unavailable; no connection made.')
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


SAFE_RESULT_CODE = r'''
FAILURE_PHASES = {'PACKAGE', 'STAGING', 'INSTALLER', 'OFFLINE_VERIFICATION', 'RESULT', 'SSH'}
FAILURE_CODES = {'ACTIVE_JOB', 'SOURCE_REFUSED', 'RECEIPT_REFUSED', 'VERIFICATION_ROLLED_BACK',
                 'RECOVERY_REQUIRED', 'TIMEOUT', 'INTERRUPTED', 'PACKAGE_REJECTED', 'UNCONFIRMED'}
RESTORED = 'STOP: Prebuild verification failed; previous working source restored.'
KNOWN_FAILURES = {
    'STOP: A model job is active. Nothing is cancelled automatically.': 'ACTIVE_JOB',
    'STOP: A job appeared before maintenance. No update applied.': 'ACTIVE_JOB',
    'STOP: Unexpected source or expired pricing review.': 'SOURCE_REFUSED',
    'STOP: Unexpected prebuild source set.': 'SOURCE_REFUSED',
    'STOP: Reviewed prebuild patch context differs.': 'SOURCE_REFUSED',
    'STOP: Unknown existing prebuild helper; no overwrite.': 'SOURCE_REFUSED',
    'STOP: Original guard differs.': 'SOURCE_REFUSED',
    'STOP: FAST guard differs.': 'SOURCE_REFUSED',
    'STOP: Offline verifier differs.': 'SOURCE_REFUSED',
    'STOP: Existing completion/runtime receipt is invalid.': 'RECEIPT_REFUSED',
    'STOP: Unsafe prebuild receipt; no service stopped.': 'RECEIPT_REFUSED',
    'STOP: Completion receipt differs from immutable reviewed ancestor.': 'RECEIPT_REFUSED',
    'STOP: Guard receipt differs from immutable reviewed ancestor.': 'RECEIPT_REFUSED',
    'STOP: Prebuild source/runtime receipt mismatch.': 'RECEIPT_REFUSED',
    'STOP: Recovery requires review; preserve private backups.': 'RECOVERY_REQUIRED',
    RESTORED: 'VERIFICATION_ROLLED_BACK',
}
for name in ('server.py', 'codex_runner.py', 'blender_mcp.py', 'astra_spend_v2.py', 'completion_policy.py'):
    KNOWN_FAILURES['STOP: Unreviewed completion source: '+name+'; no service stopped.'] = 'SOURCE_REFUSED'

def failure_result(phase, code='UNCONFIRMED', restored=None):
    return {'phase': 'WORLDIFACT_PREBUILD_NOT_CONFIRMED', 'failure_phase': phase,
            'failure_code': code, 'previous_source_restored': restored,
            'paid_generation_requested': False}

def safe_result(value):
    if isinstance(value, dict) and value.get('phase') == 'WORLDIFACT_PREBUILD_NOT_CONFIRMED':
        phase, code, restored = (value.get(k) for k in
                                ('failure_phase', 'failure_code', 'previous_source_restored'))
        if (not isinstance(phase, str) or phase not in FAILURE_PHASES
                or not isinstance(code, str) or code not in FAILURE_CODES
                or restored is not None and restored is not True
                or restored is True and code not in {'VERIFICATION_ROLLED_BACK', 'TIMEOUT', 'INTERRUPTED'}
                or code == 'VERIFICATION_ROLLED_BACK' and restored is not True):
            raise ValueError('Invalid failure evidence')
        expected = failure_result(phase, code, restored)
        if value != expected or value.get('paid_generation_requested') is not False:
            raise ValueError('Unexpected failure evidence')
        return expected
    return verified_result(value)

def installer_failure(raw, phase, forced_code=None):
    result = failure_result(phase, forced_code or 'UNCONFIRMED')
    if not isinstance(raw, bytes) or not 0 < len(raw) <= OUTPUT_LIMIT:
        return result
    try:
        lines = raw.decode('utf-8').split('\n')
    except UnicodeError:
        return result
    if lines and lines[-1] == '':
        lines.pop()
    # Match whole fixed lines only. Never emit raw text or infer restoration
    # from a partial/older marker, timeout, or a successful process exit.
    if 'Offline Codex/Blender verification in progress; this can take several minutes. No paid model request.' in lines:
        phase = 'OFFLINE_VERIFICATION'
    last = lines[-1] if lines else ''
    code = forced_code or KNOWN_FAILURES.get(last, 'UNCONFIRMED')
    restored = True if last == RESTORED else None
    return failure_result(phase, code, restored)

def verified_result(value):
    if (not isinstance(value, dict)
            or value.get('phase') not in ('WORLDIFACT_PREBUILD_VERIFIED', 'ALREADY_VERIFIED')
            or value.get('revision') != REVISION
            or value.get('paid_generation_requested') is not False):
        raise ValueError('Unverified installation result')
    return {'phase': 'WORLDIFACT_PREBUILD_VERIFIED', 'revision': REVISION,
            'paid_generation_requested': False, 'quality_test': 'NOT_RUN'}

def installer_result(raw):
    if not isinstance(raw, bytes) or not 0 < len(raw) <= OUTPUT_LIMIT:
        raise ValueError('Invalid installation output size')
    output = raw.decode('utf-8').strip()
    # The installer prints its final JSON after fixed progress text. Never
    # forward that text, exception details, paths or unknown result fields.
    start = output.rfind('\n{') + 1
    return verified_result(json.loads(output[start:]))
'''


REMOTE = r'''
import base64, hashlib, json, os, pathlib, re, signal, subprocess, sys, tempfile
phase = 'PACKAGE'
result = failure_result(phase, 'PACKAGE_REJECTED')
process = None
interrupted = [False]
def relay(signum, _frame):
    if not interrupted[0]:
        interrupted[0] = True
        if process is not None and process.poll() is None:
            process.send_signal(signum)
try:
    payload = json.loads(base64.b64decode(PAYLOAD, validate=True))
    if not isinstance(payload, dict) or len(payload) != 19 or set(payload) != set(EXPECTED):
        raise ValueError('Invalid package names')
    files = {}
    for name, expected in EXPECTED.items():
        if not re.fullmatch(r'[a-z0-9_]+\.py', name):
            raise ValueError('Invalid package name')
        raw = base64.b64decode(payload[name], validate=True)
        if not 0 < len(raw) <= 262144 or hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest() != expected:
            raise ValueError('Invalid package bytes')
        compile(raw, name, 'exec')
        files[name] = raw
    phase = 'STAGING'
    result = failure_result(phase)
    root = pathlib.Path.home()/'.local/state/worldifact-astra-guard'
    if any(p.is_symlink() for p in (root,*root.parents)):
        raise ValueError('Unsafe staging path')
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    folder = pathlib.Path(tempfile.mkdtemp(prefix='prebuild-package-', dir=root))
    for name, raw in files.items():
        fd = os.open(str(folder/name), os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, 'wb') as stream:
            stream.write(raw); stream.flush(); os.fsync(stream.fileno())
    for sig in (signal.SIGHUP, signal.SIGTERM, signal.SIGINT):
        signal.signal(sig, relay)
    # Suppress raw installer output. An anonymous private temporary file avoids
    # pipe deadlocks and is bounded on read; the installer owns recovery logs.
    with tempfile.TemporaryFile(mode='w+b', dir=folder) as output:
        phase = 'INSTALLER'
        result = failure_result(phase)
        process = subprocess.Popen([sys.executable, '-B', str(folder/'install_prebuild.py'),
            '--approve-service-restart'], cwd=folder, stdin=subprocess.DEVNULL,
            stdout=output, stderr=subprocess.STDOUT)
        try:
            code = process.wait(timeout=INSTALL_TIMEOUT)
        except BaseException as error:
            reason = 'TIMEOUT' if isinstance(error, subprocess.TimeoutExpired) else 'INTERRUPTED'
            result = failure_result(phase, reason)
            try:
                if process.poll() is None:
                    process.send_signal(signal.SIGTERM)
                    try:
                        process.wait(timeout=120)
                    except subprocess.TimeoutExpired:
                        process.kill(); process.wait(timeout=10)
            finally:
                output.seek(0)
                result = installer_failure(output.read(OUTPUT_LIMIT + 1), phase, reason)
            raise
        output.seek(0)
        raw = output.read(OUTPUT_LIMIT + 1)
        if code or interrupted[0]:
            result = installer_failure(raw, phase, 'INTERRUPTED' if interrupted[0] else None)
        else:
            result = failure_result('RESULT')
            result = installer_result(raw)
except BaseException:
    pass
print(json.dumps(result, sort_keys=True), flush=True)
raise SystemExit(0 if result['phase'] == 'WORLDIFACT_PREBUILD_VERIFIED' else 1)
'''


def script(payload, *, approved=False):
    if approved is not True:
        raise LaunchError('Service maintenance approval is required; no connection made.')
    expected = {name: value[1] for name, value in FILES.items()}
    return ('EXPECTED = ' + repr(expected) + '\nPAYLOAD = ' + repr(payload)
            + '\nREVISION = ' + repr(REVISION) + '\nOUTPUT_LIMIT = ' + repr(OUTPUT_LIMIT)
            + '\nINSTALL_TIMEOUT = ' + repr(INSTALL_TIMEOUT) + '\nimport json\n'
            + SAFE_RESULT_CODE + '\n' + REMOTE)


def invoke(ssh, program):
    try:
        process = subprocess.run(ssh, input=program, text=True, stdout=subprocess.PIPE,
                                 stderr=subprocess.DEVNULL, timeout=SSH_TIMEOUT)
        if (not isinstance(process.stdout, str)
                or len(process.stdout.encode()) > OUTPUT_LIMIT):
            raise ValueError()
        namespace = {'json': json, 'REVISION': REVISION, 'OUTPUT_LIMIT': OUTPUT_LIMIT}
        exec(SAFE_RESULT_CODE, namespace)
        observed = json.loads(process.stdout)
        result = namespace['safe_result'](observed)
        expected_code = 1 if result['phase'] == 'WORLDIFACT_PREBUILD_NOT_CONFIRMED' else 0
        if observed != result or process.returncode != expected_code:
            raise ValueError()
        return result
    except (Exception, KeyboardInterrupt):
        raise LaunchError('Prebuild installation NOT confirmed. Preserve backups; no automatic retry or paid generation.') from None


def main(argv=None):
    parser = PrivateArgumentParser(description=__doc__, allow_abbrev=False)
    parser.add_argument('--source-commit', help='Exact reviewed public commit (40 hex).')
    parser.add_argument('--approve-service-restart', action='store_true')
    args = parser.parse_args(argv)
    commit = source_commit(args.source_commit) if args.source_commit is not None else None
    if not args.approve_service_restart:
        print('PLAN ONLY. No reads, downloads, OCI lookup, SSH, installation, restart or paid generation.')
        return
    commit = source_commit(commit)
    print('[1/3] Verifying the pinned public prebuild package.', flush=True)
    payload = package(commit)
    program = script(payload, approved=True)
    print('[2/3] Resolving the existing VM with its original strict SSH connection.', flush=True)
    ssh = connection()
    print('[3/3] Idle-only backup, offline CLI/MCP/Blender verification and restart. No paid request.', flush=True)
    result = invoke(ssh, program)
    print(json.dumps(result, sort_keys=True), flush=True)
    if result['phase'] == 'WORLDIFACT_PREBUILD_NOT_CONFIRMED':
        raise SystemExit(1)
    return result


if __name__ == '__main__':
    try:
        main()
    except LaunchError as error:
        print('STOP: ' + str(error), file=sys.stderr)
        sys.exit(1)
    except (Exception, KeyboardInterrupt):
        print('STOP: maintenance unconfirmed. Preserve backups. No automatic retry or paid generation.', file=sys.stderr)
        sys.exit(1)
