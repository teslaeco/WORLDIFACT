"""Default-inert job-state counts. Application data stays read-only.

SQLite may update ordinary locking/WAL shared-memory metadata. No journal-mode
change, checkpoint, model call, service signal, or application-data write exists.
Counts are a point-in-time observation, never maintenance or historical proof.
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
import hashlib, json, os, signal, sqlite3, stat, subprocess, time
from pathlib import Path
EXPECTED = {
 'server.py':'3cb77049eb3693ea2b2dd018815797aab5c9b6716d1ed7dd06848a91e82bdf1c',
 'codex_runner.py':'bc8db1e2694cf3144bf19fa0b46fa93475624fa47f07b00daa886d15415d4412',
 'blender_mcp.py':'85c4fe62f76aaa33e87a40ec0db03965e1ffac0a28b1459a73e3676bf66b020b',
 'astra_spend_v2.py':'d76c2e30fa696713cceaa6178a9ae91b44592c403ad38ab66c50029498be8adc',
 'completion_policy.py':'664e9f3b2326116fe9aeeb78e7a84aac254ca8a3054cdccdfb5224e112890110',
 'prebuild_policy.py':'b157f93ab4c68402f921576b897ea05f2b68454092167731c74fd9ee45b87033'}
STATES = ('queued','generating','building','retrying','succeeded','failed','cancelled')
BUCKETS = (*STATES,'null','unknown')
ACTIVE = ('active','inactive','failed','activating','deactivating','reloading','unknown')
SUB = ('running','dead','failed','exited','start-pre','start','start-post','stop','stop-sigterm','stop-sigkill','stop-post','auto-restart','unknown')
REFUSALS = ('source_unverified','database_path_refused','database_size_refused','schema_refused','database_busy','query_refused','count_limit','source_changed')
MAX_ROWS = 10000

class Refused(Exception): pass

def regular(path, maximum):
    if any(p.is_symlink() for p in (path,*path.parents)): raise Refused('database_path_refused')
    info=path.stat()
    if not stat.S_ISREG(info.st_mode) or info.st_nlink!=1: raise Refused('database_path_refused')
    if not 0<info.st_size<=maximum: raise Refused('database_size_refused')
    return info

def sources(root):
    result={}
    for name,expected in EXPECTED.items():
        try:
            regular(root/name,2*1024**2)
            fd=os.open(root/name,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
            with os.fdopen(fd,'rb') as stream:
                raw=stream.read(2*1024**2+1)
            result[name]=expected if len(raw)<=2*1024**2 and hashlib.sha256(raw).hexdigest()==expected else 'different'
        except (OSError,Refused): result[name]='unavailable'
    return result

def services():
    result={}
    for key,unit in (('worker','froge-worker.service'),('tunnel','froge-tunnel.service')):
        value={'active':'unknown','sub':'unknown','pid':None}
        try:
            process=subprocess.run(['systemctl','--user','show',unit,'--property=ActiveState,SubState,MainPID'],
                stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True,timeout=3)
            if process.returncode or len(process.stdout)>1024: raise ValueError()
            parts=dict(line.split('=',1) for line in process.stdout.splitlines())
            if set(parts)!={'ActiveState','SubState','MainPID'}: raise ValueError()
            if parts['ActiveState'] not in ACTIVE or parts['SubState'] not in SUB: raise ValueError()
            pid=int(parts['MainPID'])
            if not 0<=pid<=2147483647: raise ValueError()
            value={'active':parts['ActiveState'],'sub':parts['SubState'],'pid':pid}
        except (OSError,ValueError,subprocess.SubprocessError): pass
        result[key]=value
    return result

def authorizer(action,arg1,arg2,_db,_source):
    if action==sqlite3.SQLITE_SELECT: return sqlite3.SQLITE_OK
    if action==sqlite3.SQLITE_READ and ((arg1=='jobs' and arg2 in ('state','')) or
        (arg1=='sqlite_master' and arg2 in ('type','name','tbl_name','sql'))): return sqlite3.SQLITE_OK
    if action==sqlite3.SQLITE_FUNCTION and arg2=='count': return sqlite3.SQLITE_OK
    if action==sqlite3.SQLITE_PRAGMA and arg1=='table_xinfo' and arg2=='jobs': return sqlite3.SQLITE_OK
    if action==sqlite3.SQLITE_TRANSACTION and arg1 in ('BEGIN','ROLLBACK'): return sqlite3.SQLITE_OK
    return sqlite3.SQLITE_DENY

def counts(root):
    path=root/'state/jobs.sqlite'
    before=regular(path,64*1024**2)
    # SQLite may read/create ordinary locking sidecars. Existing aliases or
    # non-regular sidecars are refused, never deleted or repaired.
    for suffix in ('-wal','-shm','-journal'):
        side=path.with_name(path.name+suffix)
        if side.exists() or side.is_symlink(): regular(side,128*1024**2)
    connection=None
    try:
        connection=sqlite3.connect(path.as_uri()+'?mode=ro',uri=True,timeout=1)
        connection.execute('PRAGMA query_only=ON')
        connection.execute('PRAGMA trusted_schema=OFF')
        connection.execute('PRAGMA temp_store=MEMORY')
        deadline=time.monotonic()+2
        remaining=[250]
        def progress():
            remaining[0]-=1
            return int(remaining[0]<=0 or time.monotonic()>deadline)
        connection.set_progress_handler(progress,1000)
        connection.set_authorizer(authorizer)
        connection.execute('BEGIN')
        schema=connection.execute('SELECT type,name,tbl_name,sql FROM sqlite_master').fetchmany(4)
        if len(schema)!=2 or {(r[0],r[1],r[2]) for r in schema}!={('table','jobs','jobs'),('index','sqlite_autoindex_jobs_1','jobs')}:
            raise Refused('schema_refused')
        columns=connection.execute('PRAGMA table_xinfo(jobs)').fetchall()
        if [(r[0],r[1],r[2],r[4],r[5],r[6]) for r in columns]!=[
            (0,'id','TEXT',None,1,0),(1,'prompt','TEXT',None,0,0),(2,'state','TEXT',None,0,0),
            (3,'detail','TEXT',None,0,0),(4,'created','REAL',None,0,0),(5,'updated','REAL',None,0,0)]:
            raise Refused('schema_refused')
        rows=connection.execute("SELECT CASE WHEN state IN (?,?,?,?,?,?,?) THEN state WHEN state IS NULL THEN 'null' ELSE 'unknown' END AS bucket,COUNT(*) FROM jobs GROUP BY bucket",STATES).fetchall()
        result=dict.fromkeys(BUCKETS,0)
        for bucket,number in rows:
            if bucket not in result or type(number)is not int or not 0<=number<=MAX_ROWS: raise Refused('count_limit')
            result[bucket]=number
        if sum(result.values())>MAX_ROWS: raise Refused('count_limit')
        after=regular(path,64*1024**2)
        if (before.st_dev,before.st_ino)!=(after.st_dev,after.st_ino): raise Refused('database_path_refused')
        return result
    except sqlite3.Error as error:
        code=getattr(error,'sqlite_errorcode',None)
        # Python before 3.11 need not expose error codes or their constants.
        raise Refused('database_busy' if type(code)is int and code&255 in (5,6) else 'query_refused') from None
    finally:
        if connection is not None:
            try: connection.rollback()
            finally: connection.close()

def inspect(root):
    before=services()
    fingerprints=sources(root)
    values=None; refusal=None
    try:
        if fingerprints!=EXPECTED: raise Refused('source_unverified')
        values=counts(root)
        if sources(root)!=fingerprints: raise Refused('source_changed')
    except (Refused,OSError) as error:
        values=None
        refusal=str(error) if isinstance(error,Refused) and str(error) in REFUSALS else 'query_refused'
    return {'diagnostic':'WORLDIFACT_HISTORY_COUNTS_V1','application_data_read_only':True,
        'sqlite_lock_metadata_may_change':True,'maintenance_safe':False,
        'source_fingerprints':fingerprints,'services_before':before,'services_after':services(),
        'counts':values,'refusal_code':refusal}

def validate(value):
    if not isinstance(value,dict) or set(value)!={'diagnostic','application_data_read_only','sqlite_lock_metadata_may_change','maintenance_safe','source_fingerprints','services_before','services_after','counts','refusal_code'}: raise ValueError()
    if value['diagnostic']!='WORLDIFACT_HISTORY_COUNTS_V1' or value['application_data_read_only'] is not True or value['sqlite_lock_metadata_may_change'] is not True or value['maintenance_safe'] is not False: raise ValueError()
    fingerprints=value['source_fingerprints']
    if not isinstance(fingerprints,dict) or set(fingerprints)!=set(EXPECTED) or any(fingerprints[n] not in (EXPECTED[n],'different','unavailable') for n in EXPECTED): raise ValueError()
    for key in ('services_before','services_after'):
        units=value[key]
        if not isinstance(units,dict) or set(units)!={'worker','tunnel'}: raise ValueError()
        for item in units.values():
            if not isinstance(item,dict) or set(item)!={'active','sub','pid'} or item['active'] not in ACTIVE or item['sub'] not in SUB or item['pid'] is not None and (type(item['pid'])is not int or not 0<=item['pid']<=2147483647): raise ValueError()
    values=value['counts']
    if values is None:
        if value['refusal_code'] not in REFUSALS: raise ValueError()
    elif not isinstance(values,dict) or set(values)!=set(BUCKETS) or any(type(n)is not int or not 0<=n<=MAX_ROWS for n in values.values()) or sum(values.values())>MAX_ROWS or value['refusal_code'] is not None or fingerprints!=EXPECTED: raise ValueError()
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
    parser.add_argument('--inspect-history',action='store_true')
    parser.add_argument('--source-commit')
    args=parser.parse_args(argv)
    if not args.inspect_history:
        print('{"diagnostic":"PLAN_ONLY"}'); return
    if not isinstance(args.source_commit,str) or not re.fullmatch('[0-9a-f]{40}',args.source_commit): raise ValueError()
    namespace=loader(args.source_commit)
    program=REMOTE+'\ndef expired(*_): raise TimeoutError()\nsignal.signal(signal.SIGALRM,expired)\nsignal.alarm(25)\ntry:\n print(json.dumps(validate(inspect(Path.home()/"froge-connector")),sort_keys=True))\nexcept BaseException:\n print(\'{"diagnostic":"EVIDENCE_UNAVAILABLE"}\')\n raise SystemExit(1)\n'
    process=subprocess.run(namespace['connection'](),input=program,text=True,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,timeout=45)
    if process.returncode or len(process.stdout.encode())>8192: raise ValueError()
    checks={'__name__':'diagnostic_validation'}; exec(REMOTE,checks)
    result=checks['validate'](json.loads(process.stdout)); print(json.dumps(result,sort_keys=True)); return result

if __name__=='__main__':
    try: main()
    except (Exception,KeyboardInterrupt):
        print('STOP: diagnostic evidence unavailable. No application-data write, service restart or retry was requested.',file=sys.stderr); sys.exit(1)
