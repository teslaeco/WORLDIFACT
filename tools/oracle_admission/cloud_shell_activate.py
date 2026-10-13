"""Start or inspect one source-pinned activation in the existing Oracle manager.

Default is an inert plan. This does not refresh or use a historical maintenance
grant. It uses the owner's existing Cloud Shell OCI identity, SSH key and strict
host trust. Exactly one durable VM attempt is allowed for this release; losing
SSH or rerunning this launcher never starts a replacement attempt. Native gates
and all production changes remain inside the separately reviewed installer.
"""
import argparse
import base64
from concurrent.futures import ThreadPoolExecutor
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import urllib.request

RELEASE = '7f357323fafb362bd72cf05799a4bba8f5100d52'
LOCK_SHA256 = '2b49888f04a3a00fef2294dac9dc6ac699829b02204b7ead168f36a43528f21f'
REVISION = 'oracle-durable-admission-v1'
BASE = 'https://raw.githubusercontent.com/teslaeco/WORLDIFACT/'
LIMIT = 262144
PACKAGE_LIMIT = 8 * 1024**2
SUCCESS = 'WORLDIFACT_DURABLE_ADMISSION_VERIFIED'
FAILURE = 'WORLDIFACT_DURABLE_ADMISSION_NOT_CONFIRMED'


class Refused(ValueError):
    pass


def need(value, code):
    if not value:
        raise Refused(code)


def checksum(raw):
    return hashlib.sha256(raw).hexdigest()


def safe_result(value):
    fields = {'phase', 'revision', 'paid_generation_requested', 'job_rows_changed',
              'provider_limits_changed', 'previous_source_restored', 'activation_committed'}
    need(isinstance(value, dict) and value.get('phase') in (SUCCESS, FAILURE), 'INVALID_RESULT')
    expected = fields | ({'refusal_code'} if value['phase'] == FAILURE else set())
    need(set(value) == expected and value['revision'] == REVISION
         and all(value[n] is False for n in ('paid_generation_requested', 'job_rows_changed', 'provider_limits_changed'))
         and all(value[n] is None or type(value[n]) is bool for n in ('previous_source_restored', 'activation_committed')),
         'INVALID_RESULT')
    if value['phase'] == SUCCESS:
        need(value['activation_committed'] is True and value['previous_source_restored'] is None, 'INVALID_RESULT')
    else:
        need(isinstance(value['refusal_code'], str) and re.fullmatch('[a-z_]{1,80}', value['refusal_code']), 'INVALID_RESULT')
    need(value['activation_committed'] is not True or value['previous_source_restored'] is None, 'INVALID_RESULT')
    return value


def parse_installer_result(raw, returncode):
    """Read a single terminal result, including the installer's pretty JSON.

    A nonzero child exit cannot establish success. Partial, duplicate or
    nonterminal records stay uncertain; they never authorize a retry.
    """
    need(isinstance(raw, bytes) and 0 < len(raw) <= 65536
         and type(returncode) is int, 'INVALID_RESULT')
    text = raw.decode('utf-8', errors='strict')
    decoder = json.JSONDecoder()
    candidates = []
    offset = 0
    for line in text.splitlines(keepends=True):
        if line.startswith('{'):
            try:
                value, end = decoder.raw_decode(text, offset)
            except (ValueError, TypeError):
                value = None
            if isinstance(value, dict) and value.get('phase') in (SUCCESS, FAILURE):
                candidates.append((safe_result(value), end))
        offset += len(line)
    need(len(candidates) == 1, 'INVALID_RESULT')
    value, end = candidates[0]
    need(not text[end:].strip(), 'INVALID_RESULT')
    need(value['phase'] != SUCCESS or returncode == 0, 'INVALID_RESULT')
    return value


def download(commit, path):
    need(re.fullmatch('[a-f0-9]{40}', commit) and re.fullmatch(r'tools/[a-z_]+/[a-z_0-9]+\.(py|json)', path), 'INVALID_PUBLIC_PATH')
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(BASE + commit + '/' + path, timeout=25) as response:
        need(response.status == 200 and response.geturl() == BASE + commit + '/' + path, 'PUBLIC_REDIRECT_REFUSED')
        raw = response.read(LIMIT + 1)
    need(0 < len(raw) <= LIMIT, 'PUBLIC_FILE_SIZE')
    return raw


def package(source_commit, cancelled=None, reader=download):
    need(isinstance(source_commit, str) and re.fullmatch('[a-f0-9]{40}', source_commit), 'EXACT_SOURCE_COMMIT_REQUIRED')
    need(cancelled is None or isinstance(cancelled, str) and re.fullmatch(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}', cancelled), 'EXACT_CANCELLED_ID_REQUIRED')
    lock_raw = reader(source_commit, 'tools/oracle_admission/activation_release.json')
    need(checksum(lock_raw) == LOCK_SHA256, 'PACKAGE_LOCK_CHANGED')
    lock = json.loads(lock_raw)
    need(lock['source_commit'] == RELEASE and lock['revision'] == 'oracle-admission-activation-package-v1'
         and len(lock['files']) == 59, 'PACKAGE_LOCK_INVALID')
    def fetch(item):
        name, info = item
        need(re.fullmatch(r'[a-z_][a-z_0-9]*\.py', name), 'PACKAGE_NAME_INVALID')
        raw = reader(info['commit'], info['path'])
        need(checksum(raw) == info['sha256'], 'PACKAGE_FILE_CHANGED')
        compile(raw, name, 'exec')
        return name, {'sha256': info['sha256'], 'data': base64.b64encode(raw).decode()}
    with ThreadPoolExecutor(max_workers=6) as executor:
        files = dict(executor.map(fetch, sorted(lock['files'].items())))
    encoded = json.dumps({'release': RELEASE, 'files': files, 'cancelled': cancelled}, sort_keys=True).encode()
    need(len(encoded) <= PACKAGE_LIMIT, 'PACKAGE_TOO_LARGE')
    return encoded


RUNNER = r'''
import base64,hashlib,json,os,pathlib,subprocess,sys,traceback
folder=pathlib.Path(__file__).resolve().parent
payload=json.loads(base64.b64decode(PAYLOAD,validate=True))
result={'phase':'WORLDIFACT_DURABLE_ADMISSION_NOT_CONFIRMED','revision':'oracle-durable-admission-v1',
        'paid_generation_requested':False,'job_rows_changed':False,'provider_limits_changed':False,
        'previous_source_restored':None,'activation_committed':None,'refusal_code':'launcher_unconfirmed'}
def create(path,raw):
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,'wb') as stream:stream.write(raw);stream.flush();os.fsync(stream.fileno())
try:
    if payload['release']!=RELEASE or len(payload['files'])!=59:raise ValueError('package invalid')
    code=folder/'package'
    code.mkdir(mode=0o700)
    for name,item in payload['files'].items():
        if not re.fullmatch(r'[a-z_][a-z_0-9]*\.py',name):raise ValueError('package name')
        raw=base64.b64decode(item['data'],validate=True)
        if hashlib.sha256(raw).hexdigest()!=item['sha256']:raise ValueError('package hash')
        compile(raw,name,'exec')
        create(code/name,raw)
    descriptor=os.open(code,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
    try:os.fsync(descriptor)
    finally:os.close(descriptor)
    args=[sys.executable,'-B',str(code/'activation.py'),'--approve-service-maintenance']
    if payload['cancelled'] is not None:
        args+=['--allow-cancelled-cleanup','--expected-cancelled-job',payload['cancelled']]
    env={k:v for k,v in os.environ.items() if k in ('PATH','HOME','USER','LOGNAME','LANG','XDG_RUNTIME_DIR','DBUS_SESSION_BUS_ADDRESS','TMPDIR')}
    env['PYTHONDONTWRITEBYTECODE']='1'
    with (folder/'installer.log').open('xb') as log:
        os.chmod(folder/'installer.log',0o600)
        process=subprocess.run(args,cwd=code,env=env,stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT)
    with (folder/'installer.log').open('rb') as log:
        log.seek(0,2);size=log.tell();log.seek(max(0,size-65536));tail=log.read()
    result=parse_installer_result(tail,process.returncode)
except (Exception,KeyboardInterrupt):
    pass
# This result is deliberately UNKNOWN on timeout: a lost process result cannot
# prove rollback or permit a second execution. Native output stays private.
try:
    create(folder/'result.json',json.dumps(safe_result(result),sort_keys=True).encode())
    descriptor=os.open(folder,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
    try:os.fsync(descriptor)
    finally:os.close(descriptor)
except Exception:pass
'''

REMOTE = r'''
import base64,hashlib,json,os,pathlib,re,stat,subprocess,sys
unit='worldifact-admission-'+RELEASE+'.service'
answer={'revision':REVISION,'release':RELEASE,'unit':unit,'state':'unconfirmed','result':None}
def private(path,directory):
    if any(p.is_symlink() for p in (path,*path.parents)):raise ValueError('unsafe path')
    info=path.lstat()
    if info.st_uid!=os.getuid() or stat.S_IMODE(info.st_mode)&0o077 or not (stat.S_ISDIR(info.st_mode) if directory else stat.S_ISREG(info.st_mode)):
        raise ValueError('private path required')
def sync(path):
    descriptor=os.open(path,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
    try:os.fsync(descriptor)
    finally:os.close(descriptor)
def create(path,raw):
    descriptor=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    with os.fdopen(descriptor,'wb') as stream:stream.write(raw);stream.flush();os.fsync(stream.fileno())
def status(folder):
    private(folder,True)
    result=folder/'result.json'
    if result.exists():
        private(result,False)
        with result.open('rb') as stream:raw=stream.read(32769)
        if not 0<len(raw)<=32768:raise ValueError('invalid result size')
        return {**answer,'state':'finished','result':safe_result(json.loads(raw))}
    response=subprocess.run(['systemctl','--user','show',unit,'--property=ActiveState','--property=SubState'],
        stdin=subprocess.DEVNULL,capture_output=True,text=True,timeout=15)
    if response.returncode==0:
        props=dict(line.split('=',1) for line in response.stdout.splitlines())
        if props.get('ActiveState') in ('active','activating') and props.get('SubState') not in ('exited','dead','failed'):
            return {**answer,'state':'running'}
    return answer
try:
    home=pathlib.Path.home()
    root=home/'.local/state/worldifact-admission-activation'
    folder=root/RELEASE
    if any(p.is_symlink() for p in (folder,*folder.parents)):raise ValueError('unsafe path')
    if not START:
        if folder.exists():answer=status(folder)
    else:
        program=base64.b64decode(PROGRAM,validate=True)
        if not 0<len(program)<=16777216 or hashlib.sha256(program).hexdigest()!=PROGRAM_SHA256:raise ValueError('program hash')
        compile(program,'reviewed-activation.py','exec')
        root.mkdir(mode=0o700,parents=True,exist_ok=True)
        private(root,True)
        if folder.exists():
            answer=status(folder)
        else:
            response=subprocess.run(['loginctl','show-user',str(os.getuid()),'--property=Linger','--value'],
                stdin=subprocess.DEVNULL,capture_output=True,text=True,timeout=15)
            if response.returncode or response.stdout.strip()!='yes':raise ValueError('existing lingering manager required')
            # The exclusive folder, fsynced before dispatch, is the once-only
            # latch. An interrupted or empty existing attempt is never rerun.
            folder.mkdir(mode=0o700);sync(root)
            create(folder/'run.py',program);sync(folder)
            response=subprocess.run(['systemd-run','--user','--quiet','--unit='+unit,'--service-type=exec',
                '--property=Restart=no','--property=RemainAfterExit=yes','--property=UMask=0077',
                '--property=RuntimeMaxSec=3900','--property=TimeoutStopSec=180','--property=KillMode=mixed',
                '--property=StandardOutput=null','--property=StandardError=null',
                '--working-directory='+str(folder),'--setenv=PYTHONDONTWRITEBYTECODE=1',
                '--',sys.executable,'-B',str(folder/'run.py')],stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,timeout=30)
            if response.returncode==0:answer={**answer,'state':'started'}
except (Exception,KeyboardInterrupt):
    pass
print(json.dumps(answer,sort_keys=True))
'''


def common():
    import inspect
    return ('import re\nclass Refused(ValueError): pass\n' + inspect.getsource(need)
            + '\nREVISION=' + repr(REVISION) + '\nRELEASE=' + repr(RELEASE)
            + '\nSUCCESS=' + repr(SUCCESS) + '\nFAILURE=' + repr(FAILURE)
            + '\n' + inspect.getsource(safe_result)
            + '\n' + inspect.getsource(parse_installer_result) + '\n')


def remote_program(values=None):
    program = common() + 'PAYLOAD=' + repr(base64.b64encode(values).decode()) + '\n' + RUNNER if values is not None else ''
    encoded = program.encode()
    return (common() + 'START=' + repr(values is not None) + '\nPROGRAM=' + repr(base64.b64encode(encoded).decode())
            + '\nPROGRAM_SHA256=' + repr(checksum(encoded)) + '\n' + REMOTE)


def connection():
    home = Path.home()
    key = home / 'ssh-key-2026-09-06.key'
    need(key.is_file() and not any(p.is_symlink() for p in (key, *key.parents)), 'ORIGINAL_SSH_KEY_REQUIRED')
    need(Path('/etc/oci/config').is_file(), 'EXISTING_CLOUD_SHELL_IDENTITY_REQUIRED')
    env = {**os.environ, 'OCI_CLI_CONFIG_FILE': '/etc/oci/config', 'OCI_CLI_AUTH': 'instance_obo_user', 'OCI_CLI_PROFILE': 'eu-amsterdam-1'}
    def lookup(args):
        result = subprocess.run(['oci', '--region', 'eu-amsterdam-1'] + args, env=env,
                                stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=60)
        need(result.returncode == 0 and len(result.stdout) <= 65536, 'OCI_LOOKUP_FAILED')
        value = json.loads(result.stdout)
        need(isinstance(value, list) and len(value) == 1 and isinstance(value[0], str), 'EXACT_VM_REQUIRED')
        return value[0]
    instance = lookup(['search', 'resource', 'structured-search', '--query-text',
        "query instance resources where displayName = 'froge-blender' && lifeCycleState = 'RUNNING'",
        '--query', 'data.items[].identifier', '--output', 'json'])
    need(re.fullmatch(r'ocid1\.instance\.[A-Za-z0-9._-]+', instance), 'INVALID_VM_ID')
    address = lookup(['compute', 'instance', 'list-vnics', '--instance-id', instance, '--all',
                     '--query', 'data[?"is-primary" == `true`]."public-ip"', '--output', 'json'])
    ip = ipaddress.ip_address(address)
    need(ip.is_global and not ip.is_multicast and '%' not in address, 'INVALID_VM_ADDRESS')
    return ['ssh', '-F', '/dev/null', '-T', '-i', str(key), '-o', 'IdentitiesOnly=yes',
            '-o', 'StrictHostKeyChecking=yes', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20',
            '-o', 'ServerAliveInterval=10', '-o', 'ServerAliveCountMax=2', 'opc@' + address, 'python3 -B -']


def safe_status(value):
    need(isinstance(value, dict) and set(value) == {'revision', 'release', 'unit', 'state', 'result'}
         and value['revision'] == REVISION and value['release'] == RELEASE
         and value['unit'] == 'worldifact-admission-' + RELEASE + '.service'
         and value['state'] in ('started', 'running', 'finished', 'unconfirmed'), 'INVALID_STATUS')
    if value['state'] == 'finished':
        safe_result(value['result'])
    else:
        need(value['result'] is None, 'INVALID_STATUS')
    return value


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, allow_abbrev=False)
    parser.add_argument('--source-commit')
    action = parser.add_mutually_exclusive_group()
    action.add_argument('--approve-service-maintenance', action='store_true')
    action.add_argument('--status', action='store_true')
    parser.add_argument('--allow-cancelled-cleanup', action='store_true')
    parser.add_argument('--expected-cancelled-job')
    args = parser.parse_args(argv)
    need(not args.allow_cancelled_cleanup or args.approve_service_maintenance and args.expected_cancelled_job is not None,
         'CANCELLED_SCOPE_CONSENT_REQUIRED')
    need(args.expected_cancelled_job is None or args.allow_cancelled_cleanup, 'CANCELLED_SCOPE_CONSENT_REQUIRED')
    if not args.approve_service_maintenance and not args.status:
        print('PLAN ONLY. No downloads, SSH, service changes or paid generation.')
        return
    values = package(args.source_commit, args.expected_cancelled_job) if args.approve_service_maintenance else None
    reply = subprocess.run(connection(), input=remote_program(values), text=True,
                           stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=90)
    need(reply.returncode == 0 and len(reply.stdout.encode()) <= 32768, 'DISPATCH_UNCONFIRMED_NO_RETRY')
    value = safe_status(json.loads(reply.stdout))
    print(json.dumps(value, sort_keys=True))
    if value['state'] == 'unconfirmed':
        raise SystemExit(1)
    return value


if __name__ == '__main__':
    try:
        main()
    except (Exception, KeyboardInterrupt):
        print('STOP: activation or its status is unconfirmed. Use --status; do not create a replacement attempt.', file=sys.stderr)
        raise SystemExit(1)