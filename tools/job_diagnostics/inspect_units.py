"""Default-inert, read-only systemd compatibility projection. No unit changes.

Only fixed property names, types/match results, version numbers and unit/PID
state leave the VM. Commands, paths, dependencies, environment and raw errors
are never printed. Missing properties are observations, never assumed empty.
"""
import argparse
import hashlib
import json
import re
import subprocess
import sys
import urllib.request

LOADER_BLOB = 'ba7bb96db4fe1dd0b32f3cfb8c858bd1fd62230c'
PUBLIC_ROOT = 'https://raw.githubusercontent.com/teslaeco/WORLDIFACT/'
REMOTE = r'''
import json, re, signal, subprocess
from pathlib import Path
PROPERTIES = (
    'Id','LoadState','ActiveState','SubState','MainPID','InvocationID',
    'Type','Restart','WatchdogUSec','RuntimeMaxUSec','Job','TriggeredBy',
    'Triggers','ExecStart','ExecStartPre','ExecStartPost','ExecStop',
    'ExecStopPost','ExecReload','WorkingDirectory','RootDirectory',
    'RootImage','KillMode','KillSignal','SendSIGHUP','RemainAfterExit',
    'NeedDaemonReload','OnFailure','OnSuccess','PropagatesStopTo',
    'ConsistsOf','BoundBy','Upholds','UpheldBy','PartOf','ControlGroup',
    'FragmentPath','DropInPaths','NRestarts','StopWhenUnneeded',
    'RestartUSec','RestartForceExitStatus','RestartPreventExitStatus',
    'SuccessExitStatus','Result','ExecMainCode','ExecMainStatus',
    'ExecCondition','Wants','Requires','BindsTo','Conflicts')
EMPTY = ('TriggeredBy','Triggers','ExecStartPre','ExecStartPost','ExecStop',
    'ExecStopPost','ExecReload','RootDirectory','RootImage','OnFailure',
    'OnSuccess','PropagatesStopTo','ConsistsOf','BoundBy','Upholds',
    'UpheldBy','PartOf','ExecCondition','BindsTo','RestartForceExitStatus',
    'RestartPreventExitStatus','SuccessExitStatus')
SHAPES = ('empty','integer','boolean','infinity','structured','text')
ACTIVE = ('active','inactive','failed','activating','deactivating','reloading','unknown')
SUB = ('running','dead','failed','exited','start-pre','start','start-post','stop','stop-sigterm','stop-sigkill','stop-post','auto-restart','unknown')

def command(args):
    process=subprocess.run(args,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True,timeout=3)
    if process.returncode or len(process.stdout.encode())>65536: raise ValueError()
    return process.stdout

def version(manager=False):
    try:
        raw=command(['systemctl','--user','show','--property=Version','--value'] if manager else ['systemctl','--version'])
        match=re.match(r'^([0-9]{2,4})(?:\D|$)',raw.strip()) if manager else re.match(r'^systemd ([0-9]{2,4})(?:\D|$)',raw)
        if match: return int(match.group(1))
    except (OSError,ValueError,subprocess.SubprocessError): pass
    return None

def show(unit,all_values=False):
    args=['systemctl','--user','show',unit,'--property='+','.join(PROPERTIES)]
    if all_values: args.append('--all')
    try: raw=command(args)
    except (OSError,ValueError,subprocess.SubprocessError): return None,False,False,False
    result={}; malformed=False; duplicate=False; unexpected=False
    for line in raw.splitlines():
        key,separator,value=line.partition('=')
        if not separator: malformed=True; continue
        if key in result: duplicate=True; continue
        if key not in PROPERTIES: unexpected=True; continue
        result[key]=value
    return result,malformed,duplicate,unexpected

def shape(value):
    if value=='': return 'empty'
    if value.isdigit(): return 'integer'
    if value in ('yes','no','true','false'): return 'boolean'
    if value=='infinity': return 'infinity'
    if value.startswith('{ '): return 'structured'
    return 'text'

def pid_number(value):
    if not isinstance(value,str) or not re.fullmatch('[0-9]{1,10}',value): return None
    number=int(value)
    return number if number<=2147483647 else None

def matches(values,root,worker):
    unit='froge-worker.service' if worker else 'froge-tunnel.service'
    expected={'Id':unit,'LoadState':'loaded','Type':'simple','Restart':'on-failure',
        'RestartUSec':'5s' if worker else '10s','WatchdogUSec':'0','RuntimeMaxUSec':'infinity',
        'KillMode':'control-group','KillSignal':'15','SendSIGHUP':'no','RemainAfterExit':'no',
        'NeedDaemonReload':'no','StopWhenUnneeded':'no','ActiveState':'active','SubState':'running',
        **{key:'' for key in EMPTY},'Wants':'froge-ollama.service' if worker else ''}
    checks={key:values[key]==value for key,value in expected.items() if key in values}
    for key,permitted in (('Requires',{'basic.target','sysinit.target'}),('Conflicts',{'shutdown.target'})):
        if key in values: checks[key]=set(values[key].split())<=permitted
    if 'Job' in values: checks['Job']=values['Job'] in ('','0')
    if 'MainPID' in values:
        pid=pid_number(values['MainPID']); checks['MainPID']=pid is not None and pid>1
    if 'NRestarts' in values: checks['NRestarts']=values['NRestarts'].isdigit()
    if 'InvocationID' in values: checks['InvocationID']=bool(re.fullmatch('[a-f0-9]{32}',values['InvocationID']))
    if worker:
        if 'WorkingDirectory' in values: checks['WorkingDirectory']=values['WorkingDirectory']==str(root)
        expected_start='{ path=/usr/bin/python3 ; argv[]=/usr/bin/python3 '+str(root/'server.py')+' ; ignore_errors=no'
    else:
        executable=str(root/'bin/cloudflared')
        argv=executable+' tunnel --no-autoupdate --protocol http2 --url http://127.0.0.1:8765 --logfile '+str(root/'state/tunnel.log')
        expected_start='{ path='+executable+' ; argv[]='+argv+' ; ignore_errors=no'
    if 'ExecStart' in values: checks['ExecStart']=values['ExecStart'].startswith(expected_start+' ;')
    return checks

def unit_report(root,worker):
    unit='froge-worker.service' if worker else 'froge-tunnel.service'
    normal,bad_normal,duplicate_normal,extra_normal=show(unit)
    expanded,bad_all,duplicate_all,extra_all=show(unit,True)
    values=expanded if expanded is not None else normal or {}
    checks=matches(values,root,worker)
    pid=pid_number(values.get('MainPID'))
    return {'normal_available':normal is not None,'all_available':expanded is not None,
        'normal_malformed':bad_normal,'all_malformed':bad_all,
        'normal_duplicate_property':duplicate_normal,'all_duplicate_property':duplicate_all,
        'normal_unexpected_property':extra_normal,'all_unexpected_property':extra_all,
        'missing_normal':[name for name in PROPERTIES if normal is None or name not in normal],
        'missing_all':[name for name in PROPERTIES if expanded is None or name not in expanded],
        'empty_properties':[name for name in PROPERTIES if values.get(name,None)==''],
        'policy_matches':checks,
        'policy_mismatches':{key:shape(values[key]) for key,matched in checks.items() if not matched},
        'active':values.get('ActiveState') if values.get('ActiveState') in ACTIVE else 'unknown',
        'sub':values.get('SubState') if values.get('SubState') in SUB else 'unknown',
        'pid':pid}

def inspect(root):
    return {'diagnostic':'WORLDIFACT_UNIT_COMPATIBILITY_V1','read_only':True,'maintenance_safe':False,
        'systemctl_major':version(),'manager_major':version(True),
        'worker':unit_report(root,True),'tunnel':unit_report(root,False)}

def validate(value):
    if not isinstance(value,dict) or set(value)!={'diagnostic','read_only','maintenance_safe','systemctl_major','manager_major','worker','tunnel'}: raise ValueError()
    if value['diagnostic']!='WORLDIFACT_UNIT_COMPATIBILITY_V1' or value['read_only'] is not True or value['maintenance_safe'] is not False: raise ValueError()
    for key in ('systemctl_major','manager_major'):
        if value[key] is not None and (type(value[key])is not int or not 10<=value[key]<=9999): raise ValueError()
    flags=('normal_available','all_available','normal_malformed','all_malformed','normal_duplicate_property','all_duplicate_property','normal_unexpected_property','all_unexpected_property')
    for name in ('worker','tunnel'):
        report=value[name]
        if not isinstance(report,dict) or set(report)!={*flags,'missing_normal','missing_all','empty_properties','policy_matches','policy_mismatches','active','sub','pid'}: raise ValueError()
        if any(type(report[key])is not bool for key in flags): raise ValueError()
        for key in ('missing_normal','missing_all','empty_properties'):
            if not isinstance(report[key],list) or len(report[key])>len(PROPERTIES) or any(item not in PROPERTIES for item in report[key]) or len(set(report[key]))!=len(report[key]): raise ValueError()
        if not isinstance(report['policy_matches'],dict) or not set(report['policy_matches'])<=set(PROPERTIES) or any(type(v)is not bool for v in report['policy_matches'].values()): raise ValueError()
        if not isinstance(report['policy_mismatches'],dict) or not set(report['policy_mismatches'])<=set(PROPERTIES) or any(v not in SHAPES for v in report['policy_mismatches'].values()): raise ValueError()
        if report['active'] not in ACTIVE or report['sub'] not in SUB: raise ValueError()
        if report['pid'] is not None and (type(report['pid'])is not int or not 0<=report['pid']<=2147483647): raise ValueError()
    return value
'''

def blob(raw):
    return hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs): return None

class PrivateParser(argparse.ArgumentParser):
    def error(self,message): self.exit(2,'STOP: invalid diagnostic arguments.\n')

def loader(commit):
    opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),NoRedirect())
    with opener.open(PUBLIC_ROOT+commit+'/tools/model_completion/oracle_launch.py',timeout=30) as response:
        if response.status!=200: raise ValueError()
        raw=response.read(262145)
    if not 0<len(raw)<=262144 or blob(raw)!=LOADER_BLOB: raise ValueError()
    namespace={'__name__':'verified_read_only_connection','__file__':'oracle_launch.py'}
    exec(compile(raw,'oracle_launch.py','exec'),namespace)
    return namespace

def main(argv=None):
    parser=PrivateParser(description=__doc__,allow_abbrev=False)
    parser.add_argument('--inspect-units',action='store_true')
    parser.add_argument('--source-commit')
    args=parser.parse_args(argv)
    if not args.inspect_units:
        print('{"diagnostic":"PLAN_ONLY"}'); return
    if not isinstance(args.source_commit,str) or not re.fullmatch('[0-9a-f]{40}',args.source_commit): raise ValueError()
    namespace=loader(args.source_commit)
    program=REMOTE+'\ndef expired(*_): raise TimeoutError()\nsignal.signal(signal.SIGALRM,expired)\nsignal.alarm(25)\ntry:\n print(json.dumps(validate(inspect(Path.home()/"froge-connector")),sort_keys=True))\nexcept BaseException:\n print(\'{"diagnostic":"EVIDENCE_UNAVAILABLE"}\')\n raise SystemExit(1)\n'
    process=subprocess.run(namespace['connection'](),input=program,text=True,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,timeout=45)
    if process.returncode or len(process.stdout.encode())>16384: raise ValueError()
    checks={'__name__':'diagnostic_validation'}; exec(REMOTE,checks)
    result=checks['validate'](json.loads(process.stdout)); print(json.dumps(result,sort_keys=True)); return result

if __name__=='__main__':
    try: main()
    except (Exception,KeyboardInterrupt):
        print('STOP: read-only unit evidence unavailable. No service or application change was requested.',file=sys.stderr); sys.exit(1)
