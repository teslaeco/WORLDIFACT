"""Oracle Cloud Shell launcher for the reviewed no-AI post-hoc export patch.

Default is plan-only. --status observes the single recorded maintenance attempt.
--approve-service-restart may launch exactly once on the known froge-blender VM.
The existing Cloud Shell SSH key is used by ssh and is never read, uploaded,
printed or stored in GitHub. No Astra/OpenAI request or model generation occurs.
"""
import argparse
import base64
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import urllib.request

SOURCE = "81521fa275525b3369e0b876f05c3cfab257321a"
FILES = {
    "patch_server.py": "e034736a4123bd16e973aa52843dff04aa367cc0",
    "install_export_prepare.py": "0532b2a1b51f57e727cf8b54023f790849579158",
}
TERMINAL = {
    "INSTALLED_AND_LOCALLY_VERIFIED",
    "ALREADY_INSTALLED_AND_VERIFIED",
    "STOPPED_OR_ROLLED_BACK",
    "RECOVERY_REQUIRED",
    "LAUNCH_FAILED",
    "NOT_STARTED",
}

REMOTE = r'''
import base64,fcntl,hashlib,json,os,pwd,re,stat,subprocess,sys
from pathlib import Path

RUNNER = r"""
import json
import os
from pathlib import Path
import subprocess
import sys

job=Path(__file__).resolve().parent
result_path=job/'result.json'
try:
    completed=subprocess.run(
        ['/usr/bin/python3','-B',str(job/'install_export_prepare.py'),'--approve-service-restart'],
        cwd=job,stdin=subprocess.DEVNULL,capture_output=True,text=True
    )
    try:
        payload=json.loads(completed.stdout)
        if not isinstance(payload,dict): raise ValueError()
    except Exception:
        payload={'phase':'LAUNCH_FAILED','paidGenerationRequested':False}
    payload['runnerExitCode']=completed.returncode
except BaseException:
    payload={'phase':'LAUNCH_FAILED','paidGenerationRequested':False,'runnerExitCode':127}
tmp=job/'result.json.tmp'
tmp.write_text(json.dumps(payload,separators=(',',':')))
os.chmod(tmp,0o600)
os.replace(tmp,result_path)
sys.exit(0 if payload.get('phase') in ('INSTALLED_AND_LOCALLY_VERIFIED','ALREADY_INSTALLED_AND_VERIFIED') else 1)
"""

def command(args,timeout=30):
    value=subprocess.run(args,stdin=subprocess.DEVNULL,capture_output=True,text=True,timeout=timeout)
    if value.returncode: raise RuntimeError('Maintenance command failed.')
    return value.stdout.strip()

def safe(path):
    path=Path(path)
    if path.is_symlink() or any(parent.is_symlink() for parent in path.parents):
        raise RuntimeError('Unsafe symlink; stopped.')
    return path

def read(path,maximum=524288):
    path=safe(path);info=path.stat()
    if not stat.S_ISREG(info.st_mode) or info.st_size>maximum:
        raise RuntimeError('Unexpected maintenance file.')
    return path.read_bytes()

def git_blob_sha(raw):
    header=('blob '+str(len(raw))+'\0').encode()
    return hashlib.sha1(header+raw).hexdigest()

def state(unit,field='ActiveState'):
    try:
        value=command(['systemctl','--user','show',unit,'--property='+field,'--value'])
        return value if re.fullmatch(r'[a-zA-Z0-9_-]{1,40}',value) else 'unknown'
    except Exception:
        return 'unknown'

def observe(job,unit,commit):
    result={
        'phase':'NOT_STARTED',
        'source_commit':commit,
        'paidGenerationRequested':False,
        'generationRequested':False,
        'worker_service':state('froge-worker.service'),
        'tunnel_service':state('froge-tunnel.service'),
    }
    marker=job/'launch.json'
    if not marker.exists():
        return result
    launch=json.loads(read(marker))
    if launch.get('source')!=commit or launch.get('unit')!=unit:
        raise RuntimeError('Maintenance identity mismatch.')
    outcome=job/'result.json'
    if outcome.exists():
        payload=json.loads(read(outcome))
        phase=payload.get('phase')
        if phase in ('INSTALLED_AND_LOCALLY_VERIFIED','ALREADY_INSTALLED_AND_VERIFIED','STOPPED_OR_ROLLED_BACK','LAUNCH_FAILED'):
            result.update({k:v for k,v in payload.items() if k in (
                'phase','source_sha256','backup','connectorVersion','projectFilesRevision',
                'posthocExportRevision','runnerExitCode','paidGenerationRequested'
            )})
    active=state(unit);substate=state(unit,'SubState')
    result['maintenance_service']=active
    if result['phase']=='NOT_STARTED':
        if active in ('activating','deactivating') or (active=='active' and substate!='exited'):
            result['phase']='INSTALLATION_RUNNING'
        elif outcome.exists():
            result['phase']='LAUNCH_FAILED'
        else:
            result['phase']='INSTALLATION_RUNNING'
    if result['phase'] in ('INSTALLED_AND_LOCALLY_VERIFIED','ALREADY_INSTALLED_AND_VERIFIED'):
        if result['worker_service']!='active' or result['tunnel_service']!='active':
            result['phase']='RECOVERY_REQUIRED'
    return result

def run(mode,commit,expected,encoded):
    if pwd.getpwuid(os.getuid()).pw_name!='opc':
        raise RuntimeError('Use the approved Oracle opc session.')
    home=Path.home()
    unit='worldifact-export-prepare-'+commit[:12]+'.service'
    job=safe(home/'.local/state/worldifact-export-prepare-launch'/commit)
    if mode=='status':
        return observe(job,unit,commit)
    if mode!='apply':
        raise RuntimeError('Unknown maintenance mode.')
    if set(encoded)!=set(expected):
        raise RuntimeError('Incomplete reviewed package.')
    decoded={}
    for name,blob_sha in expected.items():
        raw=base64.b64decode(encoded[name],validate=True)
        if len(raw)>262144 or git_blob_sha(raw)!=blob_sha:
            raise RuntimeError('Package checksum failed; nothing launched.')
        compile(raw,name,'exec')
        decoded[name]=raw
    if command(['loginctl','show-user',str(os.getuid()),'--property=Linger','--value'])!='yes':
        raise RuntimeError('Persistent user service manager not confirmed.')
    job.mkdir(parents=True,exist_ok=True,mode=0o700)
    if stat.S_IMODE(job.stat().st_mode)&0o077:
        raise RuntimeError('Maintenance directory must be private.')
    fd=os.open(str(safe(job/'launch.lock')),os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,'w') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX)
        if (job/'launch.json').exists():
            return observe(job,unit,commit)
        for name,raw in decoded.items():
            target=safe(job/name)
            out=os.open(str(target),os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
            with os.fdopen(out,'wb') as stream:
                stream.write(raw);stream.flush();os.fsync(stream.fileno())
        runner=(job/'runner.py')
        runner.write_text(RUNNER)
        os.chmod(runner,0o600)
        marker=safe(job/'launch.json')
        out=os.open(str(marker),os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW,0o600)
        with os.fdopen(out,'w') as stream:
            json.dump({'source':commit,'unit':unit,'approval':'service-restart-only-no-paid-generation'},stream)
            stream.flush();os.fsync(stream.fileno())
        args=[
            'systemd-run','--user','--unit='+unit,'--property=Type=exec',
            '--property=RemainAfterExit=yes','--property=UMask=0077',
            '--property=WorkingDirectory='+str(job),
            '--setenv=PYTHONDONTWRITEBYTECODE=1',
            '/usr/bin/python3','-B',str(runner)
        ]
        try:
            command(args,timeout=30)
        except Exception:
            pass
    return observe(job,unit,commit)

try:
    print(json.dumps(run(MODE,COMMIT,EXPECTED,ENCODED)))
except Exception:
    print(json.dumps({
        'phase':'STOPPED_BEFORE_LAUNCH_OR_OBSERVATION_FAILED',
        'source_commit':COMMIT,
        'paidGenerationRequested':False,
        'generationRequested':False,
        'message':'Keep the recorded maintenance state; do not bypass host checks or relaunch manually.'
    }))
    sys.exit(1)
'''

class LaunchError(RuntimeError):
    pass

def invoke(args,data=None,timeout=90):
    try:
        result=subprocess.run(args,input=data,capture_output=True,text=True,timeout=timeout)
    except (OSError,subprocess.TimeoutExpired):
        raise LaunchError('Connection unavailable. Re-run --status; do not start another installer.') from None
    if result.returncode:
        raise LaunchError('Connection or maintenance check failed. Do not share keys or disable host verification.')
    if len(result.stdout)>65536:
        raise LaunchError('Unexpectedly large maintenance response.')
    return result.stdout

def one(text,label):
    value=json.loads(text)
    if not isinstance(value,list) or len(value)!=1 or not isinstance(value[0],str) or not value[0]:
        raise LaunchError('Expected exactly one '+label+'. Nothing launched.')
    return value[0]

def git_blob_sha(raw):
    return hashlib.sha1(('blob '+str(len(raw))+'\0').encode()+raw).hexdigest()

def connection():
    key=Path.home()/'ssh-key-2026-09-06.key'
    if not key.is_file() or not os.access(key,os.R_OK):
        raise LaunchError('Existing SSH key missing in Cloud Shell. Do not upload or paste it into chat.')
    prefix=['oci','--region','eu-amsterdam-1']
    instance=one(invoke(prefix+[
        'search','resource','structured-search','--query-text',
        "query instance resources where displayName = 'froge-blender' && lifeCycleState = 'RUNNING'",
        '--query','data.items[].identifier','--output','json'
    ]),'running Froge VM')
    if not instance.startswith('ocid1.instance.') or any(c.isspace() for c in instance):
        raise LaunchError('Invalid instance identifier.')
    address=one(invoke(prefix+[
        'compute','instance','list-vnics','--instance-id',instance,'--all',
        '--query','data[?"is-primary" == `true`]."public-ip"','--output','json'
    ]),'primary IP')
    ipaddress.ip_address(address)
    return [
        'ssh','-T','-i',str(key),'-o','IdentitiesOnly=yes','-o','StrictHostKeyChecking=yes',
        '-o','BatchMode=yes','-o','ConnectTimeout=20','-o','ServerAliveInterval=15',
        '-o','ServerAliveCountMax=3','opc@'+address,'PYTHONDONTWRITEBYTECODE=1 python3 -'
    ]

def package():
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self,*args,**kwargs):
            return None
    opener=urllib.request.build_opener(NoRedirect())
    output={}
    for name,expected in FILES.items():
        url='https://raw.githubusercontent.com/teslaeco/WORLDIFACT/'+SOURCE+'/tools/export_prepare/'+name
        with opener.open(url,timeout=45) as response:
            raw=response.read(262145)
        if len(raw)>262144 or git_blob_sha(raw)!=expected:
            raise LaunchError('Pinned maintenance package failed Git blob verification.')
        compile(raw,name,'exec')
        output[name]=base64.b64encode(raw).decode('ascii')
    return output

def probe(ssh,mode,files):
    data='MODE='+repr(mode)+'\nCOMMIT='+repr(SOURCE)+'\nEXPECTED='+repr(FILES)+'\nENCODED='+repr(files)+'\n'+REMOTE
    result=json.loads(invoke(ssh,data=data,timeout=120))
    if not isinstance(result,dict) or result.get('source_commit')!=SOURCE:
        raise LaunchError('Unexpected maintenance response.')
    if result.get('paidGenerationRequested') is not False:
        raise LaunchError('Maintenance response violated the no-paid-generation contract.')
    return result

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    mode=parser.add_mutually_exclusive_group()
    mode.add_argument('--approve-service-restart',action='store_true')
    mode.add_argument('--status',action='store_true')
    args=parser.parse_args()
    if not args.approve_service_restart and not args.status:
        print(json.dumps({
            'phase':'PLAN_ONLY',
            'source_commit':SOURCE,
            'paidGenerationRequested':False,
            'generationRequested':False,
            'note':'No connection, restart, generation or install was performed.'
        },indent=2))
        return
    ssh=connection()
    current=probe(ssh,'status',{})
    if args.approve_service_restart and current['phase']=='NOT_STARTED':
        current=probe(ssh,'apply',package())
    started=time.monotonic()
    while current['phase'] not in TERMINAL and time.monotonic()-started<600:
        print('Status: '+current['phase']+' | worker: '+current.get('worker_service','unknown')+' | tunnel: '+current.get('tunnel_service','unknown'),flush=True)
        time.sleep(10)
        current=probe(ssh,'status',{})
    print(json.dumps(current,indent=2))
    if current['phase'] in ('INSTALLED_AND_LOCALLY_VERIFIED','ALREADY_INSTALLED_AND_VERIFIED'):
        if current.get('posthocExportRevision')!=1:
            raise LaunchError('Installer returned success without posthocExportRevision=1.')
        print('EXPORT_PREPARE_INSTALLED. Existing saved jobs can be finalized without a new AI generation.')
    elif current['phase']=='NOT_STARTED':
        print('NOT_STARTED. Use --approve-service-restart only when you intend to install the reviewed patch.')
    else:
        print('STOP. Keep rollback/maintenance records and inspect this summary before any retry.')

if __name__=='__main__':
    try:
        main()
    except (LaunchError,ValueError,urllib.error.URLError) as error:
        print('STOP: '+str(error)[:400],file=sys.stderr)
        sys.exit(1)
