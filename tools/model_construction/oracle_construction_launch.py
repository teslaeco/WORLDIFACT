"""Strict pinned OCI launcher for the bounded STANDARD construction transaction.

Default PLAN ONLY: no file reads, downloads, OCI lookup, SSH or worker changes.
Remote installation requires --approve-service-maintenance and an exact reviewed
40-hex --source-commit. Only the idle-only, backup/verify/rollback installer is
invoked, once. Existing SSH key and strict host checking are preserved.
No candidate/job inspection, paid generation, new credentials or payment changes.
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
ANCESTOR_COMMIT = '2380a7e2dad05a40b3753faf06c2635ed444be51'
CURRENT_PREFIXES = ('tools/model_context_upgrade/', 'tools/model_construction/')
LIMIT = 262144
OUTPUT_LIMIT = 32768
INSTALL_TIMEOUT = 3180
SSH_TIMEOUT = 3360
REVISION = 'worldifact-standard-construction-v1'
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


def file_commit(commit, path):
    commit = source_commit(commit)
    if path not in {item[0] for item in FILES.values()}:
        raise LaunchError('Unexpected package path; no connection made.')
    # New publication must not resurrect or overwrite historical installers on
    # current main. Their immutable dependencies come from the exact PR214 head.
    return commit if path.startswith(CURRENT_PREFIXES) else ANCESTOR_COMMIT


def read_public(commit, path):
    commit = file_commit(commit, path)
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


FILES.update({
    'context_policy.py': ('tools/model_context_upgrade/context_policy.py', '4b8189fe9ae22eb074e48db593bdbead55545bf3'),
    'upgrade_patch.py': ('tools/model_context_upgrade/upgrade_patch.py', '71c4cac9891e50257e92b05f9336ce853ba8cdfc'),
    'install_upgrade.py': ('tools/model_context_upgrade/install_upgrade.py', '843103b4a9fd6d239be076ebe5d89843c8d5140e'),
    'upgrade_fence.py': ('tools/model_context_upgrade/upgrade_fence.py', 'd5c810448d8d07999aa7c2baf703a4bc4994e3a2'),
    'verification_scope.py': ('tools/model_context/verification_scope.py', '677c577db69ece8d9757fa81bb62633bc134c17d'),
    'offline_standard.py': ('tools/model_context_upgrade/offline_standard.py', '726327ad50a994232786333a7b428ff1e3b1e7f1'),
    'journal_socket.py': ('tools/model_context/journal_socket.py', 'ef1161d629908e81c28f40ecf631b75564315194'),
    'studio_pricing.py': ('tools/model_budget_tiers/studio_pricing.py', 'd02a12d73ecc377801cc6ed1029c0a2949447e93'),
    'terminal_budget.py': ('tools/model_budget_tiers/terminal_budget.py', '315cb053f1fade24827b3da5859ce0dee590f9da'),
})

# Old package files retain exact historical pins. New activation bytes are
# pinned only after the complete local source and transaction review.
FILES['oracle_upgrade_launch.py'] = ('tools/model_context_upgrade/oracle_upgrade_launch.py', '6cf4f14acb5fb4e525d8e040fc0df6dc8f7e44a3')
NEW_FILES = ('construction_health.py', 'construction_payload.py', 'construction_policy.py', 'phased_controller.py', 'runtime_controller.py', 'construction_spend_patch.py', 'gateway_patch.py', 'runtime_patch.py', 'construction_manifest.py', 'construction_fence.py', 'install_construction.py', 'offline_legacy_standard.py', 'offline_construction.py')
FILES.update({'construction_fence.py': ('tools/model_construction/construction_fence.py',
                           '6f00159558709482cee93eca323c94c7663dbb4b'),
 'construction_health.py': ('tools/model_construction/construction_health.py',
                            '39e3c75e0be7288d87f18a2e48ef7dd9f41df36b'),
 'construction_manifest.py': ('tools/model_construction/construction_manifest.py',
                              '3233d5a90dcea79ee260195dc89880ffe0e078f7'),
 'construction_payload.py': ('tools/model_construction/construction_payload.py',
                             'a4d3db90b4934dbdd73bb311b8db19a469cf2628'),
 'construction_policy.py': ('tools/model_construction/construction_policy.py',
                            '52438f2ad153770f40666def51950bac3082db4b'),
 'construction_spend_patch.py': ('tools/model_construction/construction_spend_patch.py',
                                 '5c83a272b5b2207fbdf8ad510773b909e26c3499'),
 'gateway_patch.py': ('tools/model_construction/gateway_patch.py', '39095208cd1e90c03fc35f81f93a63535a0930b0'),
 'install_construction.py': ('tools/model_construction/install_construction.py',
                             '4a170dba7df5ac57f392e22af929ceffc99d3065'),
 'offline_construction.py': ('tools/model_construction/offline_construction.py',
                             '3f978bdce0d9158c1dd8d361b757d7b020a2f1ad'),
 'offline_legacy_standard.py': ('tools/model_construction/offline_legacy_standard.py',
                                'cc91dc779cfbefc61df5279a5d9bd66daebf8b98'),
 'phased_controller.py': ('tools/model_construction/phased_controller.py', 'bddb2d9c5159b4c52cbae8074832855fcabc4eab'),
 'runtime_controller.py': ('tools/model_construction/runtime_controller.py',
                           '6e8bdf205f7e044a677a59054e1d7cc99e9dae78'),
 'runtime_patch.py': ('tools/model_construction/runtime_patch.py', 'e32d5a2bfadb625a8c89f37f8c00015e64ae93df')})

PHASES = {'WORLDIFACT_STANDARD_CONSTRUCTION_VERIFIED', 'WORLDIFACT_STANDARD_CONSTRUCTION_NOT_CONFIRMED'}

def safe_result(value):
    if not isinstance(value, dict) or value.get('phase') not in PHASES:
        raise LaunchError('Unconfirmed maintenance result.')
    expected = {'phase', 'revision', 'paid_generation_requested', 'job_rows_changed',
                'provider_limits_changed', 'previous_source_restored', 'activation_committed'}
    if value['phase'] == 'WORLDIFACT_STANDARD_CONSTRUCTION_NOT_CONFIRMED':
        expected.add('refusal_code')
    if (set(value) != expected or value.get('revision') != REVISION
            or any(value.get(name) is not False for name in ('paid_generation_requested', 'job_rows_changed', 'provider_limits_changed'))
            or value.get('previous_source_restored') is not None and type(value['previous_source_restored']) is not bool
            or value.get('activation_committed') is not None and type(value.get('activation_committed')) is not bool
            or 'refusal_code' in value and (not isinstance(value['refusal_code'], str) or not re.fullmatch(r'[a-z_]{1,80}', value['refusal_code']))):
        raise LaunchError('Unconfirmed maintenance result.')
    if value['phase'] != 'WORLDIFACT_STANDARD_CONSTRUCTION_NOT_CONFIRMED' and (value['activation_committed'] is not True or value['previous_source_restored'] is not None):
        raise LaunchError('Unconfirmed maintenance result.')
    if value['activation_committed'] is True and value['previous_source_restored'] is not None:
        raise LaunchError('Conflicting maintenance result.')
    return value

REMOTE = r'''
import base64,hashlib,json,os,pathlib,re,signal,subprocess,sys,tempfile
failed={'phase':'WORLDIFACT_STANDARD_CONSTRUCTION_NOT_CONFIRMED','revision':REVISION,
        'paid_generation_requested':False,'job_rows_changed':False,'provider_limits_changed':False,
        'previous_source_restored':None,'activation_committed':None,'refusal_code':'unconfirmed'}
try:
    if APPROVED is not True:raise ValueError('approval absent')
    if type(ALLOW_CANCELLED_CLEANUP) is not bool:raise ValueError('invalid cleanup consent')
    if type(UPDATE_PAYLOAD) is not bool or type(UPDATE_INITIAL_EDIT) is not bool:raise ValueError('invalid update mode')
    if UPDATE_PAYLOAD:raise ValueError('historical payload package required')
    if (ALLOW_CANCELLED_CLEANUP and (not isinstance(EXPECTED_CANCELLED_JOB,str) or not re.fullmatch(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}',EXPECTED_CANCELLED_JOB))
            or not ALLOW_CANCELLED_CLEANUP and EXPECTED_CANCELLED_JOB is not None):raise ValueError('invalid cleanup identity')
    payload=json.loads(base64.b64decode(PAYLOAD,validate=True))
    if not isinstance(payload,dict) or set(payload)!=set(EXPECTED):raise ValueError('invalid package')
    files={}
    for name,digest in EXPECTED.items():
        raw=base64.b64decode(payload[name],validate=True)
        if not 0<len(raw)<=262144 or hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()!=digest:raise ValueError('invalid package bytes')
        compile(raw,name,'exec');files[name]=raw
    root=pathlib.Path.home()/'.local/state/worldifact-astra-guard'
    if any(p.is_symlink() for p in (root,*root.parents)):raise ValueError('unsafe package path')
    root.mkdir(mode=0o700,parents=True,exist_ok=True)
    folder=pathlib.Path(tempfile.mkdtemp(prefix='standard-construction-package-',dir=root))
    for name,raw in files.items():
        fd=os.open(str(folder/name),os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW,0o600)
        with os.fdopen(fd,'wb') as stream:stream.write(raw);stream.flush();os.fsync(stream.fileno())
    with tempfile.TemporaryFile() as output:
        process=subprocess.Popen([sys.executable,'-B',str(folder/'install_construction.py'),'--approve-service-maintenance'] +
            (['--allow-cancelled-cleanup','--expected-cancelled-job',EXPECTED_CANCELLED_JOB] if ALLOW_CANCELLED_CLEANUP else []) +
            (['--update-initial-edit'] if UPDATE_INITIAL_EDIT else []) +
            (['--update-response-phase'] if UPDATE_RESPONSE_PHASE else []),
            cwd=folder,stdin=subprocess.DEVNULL,stdout=output,stderr=subprocess.STDOUT)
        def relay(number,_frame):
            if process.poll() is None:process.send_signal(number)
        for number in (signal.SIGINT,signal.SIGTERM,signal.SIGHUP):signal.signal(number,relay)
        try:code=process.wait(timeout=INSTALL_TIMEOUT)
        except subprocess.TimeoutExpired:
            process.terminate()
            try:process.wait(timeout=120)
            except subprocess.TimeoutExpired:process.kill();process.wait(timeout=15)
            raise ValueError('timeout unconfirmed')
        output.seek(0);raw=output.read(OUTPUT_LIMIT+1)
    if len(raw)>OUTPUT_LIMIT:raise ValueError('output limit')
    lines=raw.decode().splitlines();observed=json.loads(lines[-1])
    # The outer pinned launcher performs full exact schema validation. Never
    # transmit preceding private logs or exceptions.
    if not isinstance(observed,dict) or observed.get('phase') not in ('WORLDIFACT_STANDARD_CONSTRUCTION_VERIFIED','WORLDIFACT_STANDARD_CONSTRUCTION_NOT_CONFIRMED'):raise ValueError('no result')
    keys={'phase','revision','paid_generation_requested','job_rows_changed','provider_limits_changed','previous_source_restored','activation_committed'}
    if observed['phase']=='WORLDIFACT_STANDARD_CONSTRUCTION_NOT_CONFIRMED':keys.add('refusal_code')
    if set(observed)!=keys or observed.get('revision')!=REVISION:raise ValueError('unsafe result')
    if any(observed.get(k) is not False for k in ('paid_generation_requested','job_rows_changed','provider_limits_changed')):raise ValueError('unsafe result')
    if any(observed.get(k) is not None and type(observed[k]) is not bool for k in ('previous_source_restored','activation_committed')):raise ValueError('unsafe result')
    if 'refusal_code' in observed and (not isinstance(observed['refusal_code'],str) or not re.fullmatch(r'[a-z_]{1,80}',observed['refusal_code'])):raise ValueError('unsafe result')
    if code not in (0,1) or (code==0)!=(observed['phase']!='WORLDIFACT_STANDARD_CONSTRUCTION_NOT_CONFIRMED'):raise ValueError('exit mismatch')
    print(json.dumps(observed,sort_keys=True),flush=True);raise SystemExit(code)
except (Exception,KeyboardInterrupt):
    print(json.dumps(failed,sort_keys=True),flush=True);raise SystemExit(1)
'''

def script(payload, approved=False, allow_cancelled_cleanup=False, expected_cancelled_job=None, update_payload=False, update_initial_edit=False, update_response_phase=False):
    if approved is not True:raise LaunchError('Explicit maintenance approval is required.')
    if any(type(mode) is not bool for mode in (update_payload, update_initial_edit, update_response_phase)):
        raise LaunchError('Explicit update modes must be boolean.')
    if sum((update_payload, update_initial_edit, update_response_phase)) > 1:raise LaunchError('Conflicting update modes; no connection made.')
    if update_payload:raise LaunchError('Payload update requires the historical pinned package; no connection made.')
    if type(allow_cancelled_cleanup) is not bool:raise LaunchError('Explicit cleanup consent must be boolean.')
    if (allow_cancelled_cleanup and (not isinstance(expected_cancelled_job,str) or not re.fullmatch(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}',expected_cancelled_job))
            or not allow_cancelled_cleanup and expected_cancelled_job is not None):
        raise LaunchError('Cleanup requires the exact approved cancelled job identity; no connection made.')
    return ('EXPECTED='+repr({name:item[1] for name,item in FILES.items()})+'\nPAYLOAD='+repr(payload)
            +'\nUPDATE_PAYLOAD='+repr(update_payload)+'\nUPDATE_INITIAL_EDIT='+repr(update_initial_edit)+'\nUPDATE_RESPONSE_PHASE='+repr(update_response_phase)+'\nAPPROVED=True\nALLOW_CANCELLED_CLEANUP='+repr(allow_cancelled_cleanup)+'\nEXPECTED_CANCELLED_JOB='+repr(expected_cancelled_job)+'\nREVISION='+repr(REVISION)+'\nINSTALL_TIMEOUT='+repr(INSTALL_TIMEOUT)
            +'\nOUTPUT_LIMIT='+repr(OUTPUT_LIMIT)+'\n'+REMOTE)

def invoke(ssh, program):
    try:
        process=subprocess.run(ssh,input=program,text=True,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,timeout=SSH_TIMEOUT)
        if not isinstance(process.stdout,str) or len(process.stdout.encode())>OUTPUT_LIMIT:raise ValueError()
        value=safe_result(json.loads(process.stdout))
        if process.returncode != (1 if value['phase']=='WORLDIFACT_STANDARD_CONSTRUCTION_NOT_CONFIRMED' else 0):raise ValueError()
        return value
    except (Exception,KeyboardInterrupt):
        raise LaunchError('STANDARD construction activation is unconfirmed. Preserve backups; do not retry automatically.') from None


def main(argv=None):
    parser = PrivateArgumentParser(description=__doc__, allow_abbrev=False)
    parser.add_argument('--source-commit')
    parser.add_argument('--approve-service-maintenance', action='store_true')
    updates = parser.add_mutually_exclusive_group()
    updates.add_argument('--update-payload', action='store_true')
    updates.add_argument('--update-initial-edit', action='store_true')
    updates.add_argument('--update-response-phase', action='store_true')
    parser.add_argument('--allow-cancelled-cleanup', action='store_true')
    parser.add_argument('--expected-cancelled-job')
    args = parser.parse_args(argv)
    if args.allow_cancelled_cleanup and not args.approve_service_maintenance:
        parser.error('cleanup requires maintenance approval')
    if (args.allow_cancelled_cleanup and (not isinstance(args.expected_cancelled_job, str)
            or not re.fullmatch(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}', args.expected_cancelled_job))
            or not args.allow_cancelled_cleanup and args.expected_cancelled_job is not None):
        parser.error('cleanup requires the exact approved cancelled job identity')
    if not args.approve_service_maintenance:
        print('PLAN ONLY. No download, OCI lookup, SSH, installation, service signal or model request.')
        return
    if args.update_payload:
        raise LaunchError('Payload update requires the historical pinned package; no connection made.')
    commit = source_commit(args.source_commit)
    payload = package(commit)
    program = script(payload, approved=True, allow_cancelled_cleanup=args.allow_cancelled_cleanup,
                     expected_cancelled_job=args.expected_cancelled_job, update_initial_edit=args.update_initial_edit,
                     update_response_phase=args.update_response_phase)
    print('Running the exact reviewed response decoder update. No paid model request.' if args.update_response_phase
          else 'Running the exact reviewed initial-edit update. No paid model request.' if args.update_initial_edit
          else 'Running the exact reviewed construction transaction. No paid model request.', flush=True)
    if args.allow_cancelled_cleanup:
        print('Explicit consent applies only to the single bound cancelled job. Its history and files are preserved.', flush=True)
    print('Four sequential offline gates and rollback protection must finish. Timing is unmeasured; keep this session open.', flush=True)
    value = invoke(connection(), program)
    print(json.dumps(value, sort_keys=True))
    if value['phase'] == 'WORLDIFACT_STANDARD_CONSTRUCTION_NOT_CONFIRMED':
        raise SystemExit(1)
    return value


if __name__ == '__main__':
    try:
        main()
    except LaunchError as error:
        print('STOP: ' + str(error), file=sys.stderr)
        raise SystemExit(1)
