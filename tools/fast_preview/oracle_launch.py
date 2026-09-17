"""Cloud Shell launcher for the approved exact-v33 maintenance; no paid AI.

Default: plan only. --approve-service-restart launches once through the VM's
user service manager and waits for a safe summary. Repeating the same command
only observes the recorded attempt. --status never starts an installation.
The existing SSH key is used by SSH, never read or uploaded by this program.
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

SOURCE = 'a1dfc7b847043d6f0f9f682ddd9db6137c5e5d9b'
FILES = {
    'apply.py': '89b28067ad1b5ba298f22f4fc42f8ddd66b293ec087931bd20b4c0fc63eaac2a',
    'completion.py': 'b07c36df110af8800fd956068fd861fb0bfdfe39206117d9a427d30c4cc8bf1d',
    'fast_preview.py': 'fd3552893a2a080f764f1420498f20f307d8a511dbbca5661025d6df7f4e2449',
    'installed_v33.py': '9ae9465d89f6a2ab6c8ef52e3b217bb5ceaed7c2a239e4ff6efcf162e120c842',
    'install_v33.py': '6d05ed75d40ea17f8352f42331399d6bb84aca45bc8eac242bc91536f7ca2341',
}
TERMINAL = {'INSTALLED_AND_LOCALLY_VERIFIED', 'ROLLED_BACK', 'RECOVERY_REQUIRED',
            'STOPPED_BEFORE_INSTALL', 'LAUNCH_FAILED', 'NOT_STARTED'}

# No model token, SSH secret or configuration enters this source payload.
REMOTE = r'''
import base64,fcntl,hashlib,json,os,pwd,re,stat,subprocess,sys
from pathlib import Path

def command(args, timeout=20):
    value=subprocess.run(args,stdin=subprocess.DEVNULL,capture_output=True,text=True,timeout=timeout)
    if value.returncode: raise RuntimeError('Service command failed; no private logs are displayed.')
    return value.stdout.strip()
def safe(path):
    if any(p.is_symlink() for p in (path,*path.parents)): raise RuntimeError('Unsafe symlink; stopped.')
    return path
def read(path, maximum=65536):
    safe(path); info=path.stat()
    if not stat.S_ISREG(info.st_mode) or info.st_size>maximum: raise RuntimeError('Unexpected maintenance file.')
    return path.read_bytes()
def state(unit, field='ActiveState'):
    try:
        value=command(['systemctl','--user','show',unit,'--property='+field,'--value'])
        return value if re.fullmatch(r'[a-zA-Z0-9_-]{1,40}',value) else 'unknown'
    except Exception:return 'unknown'

def observe(job, unit, commit):
    result={'phase':'NOT_STARTED','source_commit':commit,'paid_generation_requested':False,
            'site_deployed':False,'worker_service':state('froge-worker.service'),
            'tunnel_service':state('froge-tunnel.service')}
    marker=job/'launch.json'
    if not marker.exists():return result
    launch=json.loads(read(marker))
    if launch.get('source')!=commit or launch.get('unit')!=unit:raise RuntimeError('Maintenance identity mismatch.')
    result['phase']='INSTALLATION_RUNNING'
    log=job/'console.log'
    text=read(log,262144).decode('utf-8',errors='replace') if log.exists() else ''
    match=re.search(r'^Maintenance workspace: (.+)$',text,re.M)
    if match:
        workspace=safe(Path(match.group(1)))
        expected=Path.home()/'.local/state/worldifact-fast'
        if workspace.parent!=expected or not re.fullmatch(r'[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8}',workspace.name):
            raise RuntimeError('Unexpected rollback workspace.')
        status=workspace/'INSTALL_STATUS.json'
        if status.exists():
            data=json.loads(read(status))
            phase=data.get('phase')
            if phase in ('STAGED_NOT_INSTALLED','INSTALLING','INSTALLED_AND_LOCALLY_VERIFIED','ROLLED_BACK','RECOVERY_REQUIRED'):
                result['phase']=phase
            result['rollback_directory']=str(workspace)
    # A recorded success is current only when the services are running now.
    if result['phase']=='INSTALLED_AND_LOCALLY_VERIFIED' and (result['worker_service']!='active' or result['tunnel_service']!='active'):
        result['phase']='RECOVERY_REQUIRED'
    active,substate=state(unit),state(unit,'SubState')
    result['maintenance_service']=active
    running=active in ('activating','deactivating') or (active=='active' and substate!='exited')
    if not running and result['phase'] not in ('INSTALLED_AND_LOCALLY_VERIFIED','ROLLED_BACK','RECOVERY_REQUIRED'):
        if result['phase']=='INSTALLING':result['phase']='RECOVERY_REQUIRED'
        elif 'STOP:' in text:result['phase']='STOPPED_BEFORE_INSTALL'
        else:result['phase']='LAUNCH_FAILED'
    return result

def run(mode,commit,expected,encoded):
    home=Path.home(); unit='worldifact-fast-v33-'+commit[:12]+'.service'
    job=safe(home/'.local/state/worldifact-fast-launch'/commit)
    if mode=='status':return observe(job,unit,commit)
    if mode!='apply' or pwd.getpwuid(os.getuid()).pw_name!='opc':raise RuntimeError('Use the approved Oracle opc session.')
    if set(encoded)!=set(expected):raise RuntimeError('Incomplete reviewed package.')
    decoded={}
    for name,checksum in expected.items():
        raw=base64.b64decode(encoded[name],validate=True)
        if len(raw)>262144 or hashlib.sha256(raw).hexdigest()!=checksum:raise RuntimeError('Package checksum failed; no installation launched.')
        compile(raw,name,'exec');decoded[name]=raw
    # Existing linger must keep the service manager alive after phone disconnect.
    if command(['loginctl','show-user',str(os.getuid()),'--property=Linger','--value'])!='yes':
        raise RuntimeError('Persistent user service manager not confirmed; no installation launched.')
    job.mkdir(parents=True,exist_ok=True,mode=0o700)
    if stat.S_IMODE(job.stat().st_mode)&0o077:raise RuntimeError('Maintenance directory must be private.')
    fd=os.open(str(safe(job/'launch.lock')),os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,'w') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX)
        if (job/'launch.json').exists():return observe(job,unit,commit)
        for name,raw in decoded.items():
            target=safe(job/name)
            if target.exists():
                if read(target,262144)!=raw:raise RuntimeError('Existing package differs; not overwritten.')
            else:
                out=os.open(str(target),os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
                with os.fdopen(out,'wb') as stream:stream.write(raw);stream.flush();os.fsync(stream.fileno())
        out=os.open(str(safe(job/'console.log')),os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW,0o600)
        os.close(out)
        # Persist intent before launch; lost acknowledgement cannot launch twice.
        out=os.open(str(safe(job/'launch.json')),os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW,0o600)
        with os.fdopen(out,'w') as stream:
            json.dump({'source':commit,'unit':unit,'approval':'service-restart-only-no-paid-generation'},stream)
            stream.flush();os.fsync(stream.fileno())
        args=['systemd-run','--user','--unit='+unit,'--property=Type=exec',
              '--property=RemainAfterExit=yes','--property=UMask=0077',
              '--property=WorkingDirectory='+str(job),
              '--property=StandardOutput=append:'+str(job/'console.log'),
              '--property=StandardError=append:'+str(job/'console.log'),
              '--setenv=PYTHONDONTWRITEBYTECODE=1',
              '/usr/bin/python3','-B',str(job/'install_v33.py'),'--approve-service-restart']
        try:command(args,timeout=30)
        except Exception:pass  # Query the SAME recorded unit; never relaunch.
    return observe(job,unit,commit)
try:
    print(json.dumps(run(MODE,COMMIT,EXPECTED,ENCODED)))
except Exception:
    print(json.dumps({'phase':'STOPPED_BEFORE_LAUNCH_OR_OBSERVATION_FAILED',
                     'paid_generation_requested':False,
                     'message':'Inspect this result; do not bypass host checks or delete the maintenance record.'}))
    sys.exit(1)
'''

class LaunchError(RuntimeError):
    pass

def invoke(args,data=None,timeout=75):
    try:
        result=subprocess.run(args,input=data,capture_output=True,text=True,timeout=timeout)
    except (OSError,subprocess.TimeoutExpired):
        raise LaunchError('Connection unavailable. Repeat this same command to check the recorded attempt; do not start another installer.') from None
    if result.returncode:
        raise LaunchError('Connection or maintenance check failed. Keep the saved record; no automatic second installation. Do not share private keys or disable host verification.')
    if len(result.stdout)>65536:raise LaunchError('Unexpectedly large response. Private logs are not displayed.')
    return result.stdout

def one(text,label):
    value=json.loads(text)
    if not isinstance(value,list) or len(value)!=1 or not isinstance(value[0],str) or not value[0]:
        raise LaunchError('Expected exactly one '+label+'. No installation launched.')
    return value[0]

def connection():
    key=Path.home()/'ssh-key-2026-09-06.key'
    if not key.is_file() or not os.access(key,os.R_OK):raise LaunchError('Existing SSH key missing in Cloud Shell. Do not upload or paste it into chat.')
    prefix=['oci','--region','eu-amsterdam-1']
    instance=one(invoke(prefix+['search','resource','structured-search','--query-text',"query instance resources where displayName = 'froge-blender' && lifeCycleState = 'RUNNING'",'--query','data.items[].identifier','--output','json']),'running Froge VM')
    if not instance.startswith('ocid1.instance.') or any(c.isspace() for c in instance):raise LaunchError('Invalid instance identifier.')
    address=one(invoke(prefix+['compute','instance','list-vnics','--instance-id',instance,'--all','--query','data[?"is-primary" == `true`]."public-ip"','--output','json']),'primary IP')
    ipaddress.ip_address(address)
    return ['ssh','-T','-i',str(key),'-o','IdentitiesOnly=yes','-o','StrictHostKeyChecking=yes',
            '-o','BatchMode=yes','-o','ConnectTimeout=20','-o','ServerAliveInterval=15','-o','ServerAliveCountMax=3',
            'opc@'+address,'PYTHONDONTWRITEBYTECODE=1 python3 -']

def package():
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self,*args,**kwargs):return None
    opener=urllib.request.build_opener(NoRedirect())
    output={}
    for name,expected in FILES.items():
        url='https://raw.githubusercontent.com/teslaeco/WORLDIFACT/'+SOURCE+'/tools/fast_preview/'+name
        with opener.open(url,timeout=45) as response:raw=response.read(262145)
        if len(raw)>262144 or hashlib.sha256(raw).hexdigest()!=expected:raise LaunchError('Downloaded package failed its checksum. Nothing launched.')
        compile(raw,name,'exec');output[name]=base64.b64encode(raw).decode('ascii')
    return output

def probe(ssh,mode,files):
    data='MODE='+repr(mode)+'\nCOMMIT='+repr(SOURCE)+'\nEXPECTED='+repr(FILES)+'\nENCODED='+repr(files)+'\n'+REMOTE
    result=json.loads(invoke(ssh,data=data,timeout=100))
    if not isinstance(result,dict) or result.get('source_commit')!=SOURCE or result.get('paid_generation_requested') is not False:
        raise LaunchError('Unexpected maintenance response. Do not discard the saved installation record.')
    return result

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    mode=parser.add_mutually_exclusive_group()
    mode.add_argument('--approve-service-restart',action='store_true')
    mode.add_argument('--status',action='store_true')
    args=parser.parse_args()
    if not args.approve_service_restart and not args.status:
        print('PLAN ONLY. No connection, install, restart or AI call.');return
    ssh=connection()
    current=probe(ssh,'status',{})
    if args.approve_service_restart and current['phase']=='NOT_STARTED':
        print('Downloading the reviewed package. Existing model/job/secret data is not uploaded.',flush=True)
        current=probe(ssh,'apply',package())
    started=time.monotonic()
    while current['phase'] not in TERMINAL and time.monotonic()-started<780:
        print('Status: '+current['phase']+' | worker: '+current['worker_service']+' | tunnel: '+current['tunnel_service'],flush=True)
        time.sleep(10);current=probe(ssh,'status',{})
    print(json.dumps(current,indent=2))
    if current['phase'] not in TERMINAL:print('Still running. The VM service is independent of this tab. Repeat this same command to check, not reinstall.')
    elif current['phase']=='INSTALLED_AND_LOCALLY_VERIFIED':print('FAST_INSTALLED. Generator restarted and locally checked. Website release and paid benchmark remain separate.')
    elif current['phase']=='ROLLED_BACK':print('FAST not installed. The installer reports the previous generator restored; send this summary.')
    else:print('STOP. Send this summary only; keep rollback files and do not start another installer.')

if __name__=='__main__':
    try:main()
    except (LaunchError,ValueError,urllib.error.URLError) as error:
        print('STOP: '+str(error)[:400],file=sys.stderr);sys.exit(1)
