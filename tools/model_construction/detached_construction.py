"""Start one reviewed model installation in the VM's existing user manager.

The unit, private log and durable launch latch belong to the VM, not the SSH
session. Repeated launch calls only inspect the same attempt. An uncertain
dispatch never retries automatically. No credentials, jobs or runtime files are
read here; the separately pinned installer retains its full admission/rollback
transaction. Default is an inert plan. --status is read-only.
"""
import base64
import hashlib
import inspect
import json
import subprocess
import sys

import oracle_construction_launch as launch

REVISION = 'worldifact-detached-construction-v1'
STATES = ('started', 'running', 'finished', 'unconfirmed')


def safe_status(value, commit):
    if (not isinstance(value, dict)
            or set(value) != {'revision', 'source_commit', 'unit', 'state', 'result'}
            or value.get('revision') != REVISION or value.get('source_commit') != commit
            or value.get('unit') != 'worldifact-models-' + commit + '.service'
            or value.get('state') not in STATES):
        raise launch.LaunchError('Background installation status is unconfirmed. Do not repeat the installation.')
    if value['state'] == 'finished':
        launch.safe_result(value['result'])
    elif value['result'] is not None:
        raise launch.LaunchError('Conflicting background result.')
    return value


REMOTE = r'''
import base64,hashlib,json,os,pathlib,re,stat,subprocess,sys
unit='worldifact-models-'+COMMIT+'.service'
answer={'revision':DETACHED_REVISION,'source_commit':COMMIT,'unit':unit,'state':'unconfirmed','result':None}
def private_path(path, directory):
    for parent in (path,*path.parents):
        if parent.is_symlink():raise ValueError('unsafe path')
    info=path.lstat()
    if (info.st_uid!=os.getuid() or stat.S_IMODE(info.st_mode)&0o077
            or not (stat.S_ISDIR(info.st_mode) if directory else stat.S_ISREG(info.st_mode))):
        raise ValueError('private path required')
def create(path,raw):
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,'wb') as stream:stream.write(raw);stream.flush();os.fsync(stream.fileno())
def status(folder):
    private_path(folder,True)
    log=folder/'result.json'
    if log.exists():
        private_path(log,False)
        with log.open('rb') as stream:raw=stream.read(32769)
        if raw:
            if len(raw)>32768:raise ValueError('oversized result')
            value=safe_result(json.loads(raw))
            return {**answer,'state':'finished','result':value}
    reply=subprocess.run(['systemctl','--user','show',unit,'--property=ActiveState','--property=SubState'],
                         capture_output=True,text=True,timeout=15)
    if reply.returncode==0:
        props=dict(line.split('=',1) for line in reply.stdout.splitlines())
        if props.get('ActiveState') in ('active','activating') and props.get('SubState') not in ('exited','dead','failed'):
            return {**answer,'state':'running'}
    return answer
try:
    home=pathlib.Path.home()
    root=home/'.local/state/worldifact-astra-guard'
    folder=root/('detached-models-'+COMMIT)
    if any(p.is_symlink() for p in (folder,*folder.parents)):raise ValueError('unsafe path')
    if not START:
        if folder.exists():answer=status(folder)
    else:
        raw=base64.b64decode(PROGRAM,validate=True)
        if not 0<len(raw)<=8388608 or hashlib.sha256(raw).hexdigest()!=PROGRAM_SHA256:raise ValueError('invalid program')
        compile(raw,'reviewed-install.py','exec')
        root.mkdir(mode=0o700,parents=True,exist_ok=True)
        private_path(root,True)
        if folder.exists():
            # The folder itself is the durable once-only latch. Even an empty
            # folder left by an interrupted acknowledgement must not relaunch.
            answer=status(folder)
        else:
            linger=subprocess.run(['loginctl','show-user',str(os.getuid()),'--property=Linger','--value'],
                                  capture_output=True,text=True,timeout=15)
            if linger.returncode or linger.stdout.strip()!='yes':raise ValueError('existing lingering manager required')
            folder.mkdir(mode=0o700)
            parent_fd=os.open(root,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
            try:os.fsync(parent_fd)
            finally:os.close(parent_fd)
            create(folder/'run.py',raw)
            create(folder/'result.json',b'')
            directory_fd=os.open(folder,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
            try:os.fsync(directory_fd)
            finally:os.close(directory_fd)
            reply=subprocess.run(['systemd-run','--user','--quiet','--unit='+unit,'--service-type=exec',
                '--property=Restart=no','--property=RemainAfterExit=yes','--property=UMask=0077',
                '--property=RuntimeMaxSec=3540','--property=TimeoutStopSec=180','--property=KillMode=mixed',
                '--property=StandardOutput=append:'+str(folder/'result.json'),'--property=StandardError=null',
                '--working-directory='+str(folder),'--setenv=PYTHONDONTWRITEBYTECODE=1',
                '--',sys.executable,'-B',str(folder/'run.py')],
                stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=30)
            if reply.returncode==0:answer={**answer,'state':'started'}
except (Exception,KeyboardInterrupt):
    # A lost acknowledgement is not permission to restart. No private logs or
    # exception paths leave the VM; inspect the same commit with --status.
    pass
print(json.dumps(answer,sort_keys=True))
'''


def remote_script(commit, program=None):
    commit = launch.source_commit(commit)
    if program is not None and (not isinstance(program, str) or not 0 < len(program.encode()) <= 8388608):
        raise launch.LaunchError('Invalid reviewed installation program.')
    raw = program.encode() if program is not None else b''
    # Reuse the exact launcher's strict terminal-result schema, not log markers.
    return ('class LaunchError(RuntimeError): pass\n'
            + 'REVISION=' + repr(launch.REVISION) + '\n' + inspect.getsource(launch.safe_result)
            + '\nPHASES=' + repr(launch.PHASES) + '\nCOMMIT=' + repr(commit)
            + '\nDETACHED_REVISION=' + repr(REVISION) + '\nSTART=' + repr(program is not None)
            + '\nPROGRAM=' + repr(base64.b64encode(raw).decode())
            + '\nPROGRAM_SHA256=' + repr(hashlib.sha256(raw).hexdigest()) + '\n' + REMOTE)


def invoke(ssh, script, commit):
    try:
        reply = subprocess.run(ssh, input=script, text=True, stdout=subprocess.PIPE,
                               stderr=subprocess.DEVNULL, timeout=60)
        if reply.returncode or len(reply.stdout.encode()) > 32768:
            raise ValueError()
        return safe_status(json.loads(reply.stdout), commit)
    except (Exception, KeyboardInterrupt):
        raise launch.LaunchError('Background dispatch is unconfirmed. Use --status with the same commit; do not restart.') from None


def main(argv=None):
    parser = launch.PrivateArgumentParser(description=__doc__, allow_abbrev=False)
    parser.add_argument('--source-commit')
    parser.add_argument('--ssh-address', help='Existing trusted VM public IP; original SSH key and host checking are retained.')
    actions = parser.add_mutually_exclusive_group()
    actions.add_argument('--approve-service-maintenance', action='store_true')
    actions.add_argument('--status', action='store_true')
    parser.add_argument('--allow-cancelled-cleanup', action='store_true')
    parser.add_argument('--expected-cancelled-job')
    args = parser.parse_args(argv)
    if not args.approve_service_maintenance and (args.allow_cancelled_cleanup or args.expected_cancelled_job is not None):
        parser.error('cleanup is available only with the existing exact maintenance consent')
    if not args.approve_service_maintenance and not args.status:
        print('PLAN ONLY. No downloads, SSH, files, services or paid generation.')
        return
    commit = launch.source_commit(args.source_commit)
    program = None
    if args.approve_service_maintenance:
        # Validate consent before downloading the exact package.
        launch.script('validation-only', approved=True, update_models=True,
                      allow_cancelled_cleanup=args.allow_cancelled_cleanup, expected_cancelled_job=args.expected_cancelled_job)
        program = launch.script(launch.package(commit), approved=True, update_models=True,
                                allow_cancelled_cleanup=args.allow_cancelled_cleanup, expected_cancelled_job=args.expected_cancelled_job)
    script = remote_script(commit, program)
    value = invoke(launch.connection(address=args.ssh_address), script, commit)
    print(json.dumps(value, sort_keys=True))
    if value['state'] == 'unconfirmed':
        raise SystemExit(1)
    return value


if __name__ == '__main__':
    try:
        main()
    except launch.LaunchError as error:
        print('STOP: ' + str(error), file=sys.stderr)
        raise SystemExit(1)
