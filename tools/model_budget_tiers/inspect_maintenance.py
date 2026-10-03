"""Read-only Cloud Shell diagnostic for a refused Studio maintenance attempt.

Uses only the checksum-pinned original launcher's SSH connection discovery.
No installer, signal, restart, download, environment, process memory, prompt,
credential or configuration-file inspection. This is a live observation, not
an idle/frozen proof or permission to change anything on the worker.
"""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

LAUNCHER_SHA256 = 'd654c4ecc33440e82c92e41ad1028cc18353580abe630095bbecf4752cbffe5e'
OUTPUT_LIMIT = 32768

# Fixed reviewed diagnostic code. Never import or execute helpers from the VM.
REMOTE = r'''
import json, os, re, sqlite3, subprocess
from pathlib import Path

MAXIMUM = 262144
STATES = ('succeeded','failed','cancelled','queued','generating','retrying','building','other')
PROPERTIES = ('ActiveState','SubState','MainPID','InvocationID','NRestarts','ControlGroup',
              'StandardInput','StandardOutput','StandardError')
ACTIVE = {'active','inactive','activating','deactivating','failed','reloading','maintenance'}
SUB = {'running','dead','failed','start','start-pre','start-post','stop','stop-sigterm','stop-sigkill','exited','auto-restart'}
STDIO = {'null','tty','tty-force','tty-fail','socket','inherit','journal','journal-or-kmsg','kmsg','kmsg-or-journal'}

def read(path):
    with open(path, 'r', encoding='utf-8') as handle:
        result = handle.read(MAXIMUM + 1)
    if len(result) > MAXIMUM: raise ValueError()
    return result

def command(args):
    result = subprocess.run(args, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                            stderr=subprocess.DEVNULL, text=True, timeout=5)
    if result.returncode or len(result.stdout) > MAXIMUM: raise ValueError()
    return result.stdout

def unit(name):
    raw = command(['systemctl','--user','show',name,'--property='+','.join(PROPERTIES)])
    result = {}
    for line in raw.splitlines():
        key, sep, value = line.partition('=')
        if not sep or key not in PROPERTIES or key in result: raise ValueError()
        result[key] = value
    if set(result) != set(PROPERTIES): raise ValueError()
    return result

def proc_identity(properties):
    pid = properties.get('MainPID','')
    if not pid.isdigit() or int(pid) <= 1: raise ValueError()
    if not re.fullmatch('[a-f0-9]{32}', properties.get('InvocationID','')): raise ValueError()
    fields = read(Path('/proc') / pid / 'stat').rsplit(')',1)[1].split()
    return (pid, properties['InvocationID'], properties['NRestarts'], int(fields[19]))

def service_summary(before, after, first_identity, last_identity):
    if before is None:
        return {'visible':False,'active':'unknown','sub':'unknown','same_identity':None,
                'stdin':'unknown','stdout':'unknown','stderr':'unknown'}
    def safe(key, choices):
        return before[key] if before[key] in choices else 'unknown'
    return {'visible':True,'active':safe('ActiveState',ACTIVE),'sub':safe('SubState',SUB),
            'same_identity':None if first_identity is None or last_identity is None else first_identity == last_identity and before == after,
            'stdin':safe('StandardInput',STDIO),'stdout':safe('StandardOutput',STDIO),
            'stderr':safe('StandardError',STDIO)}

def classify_sockets(descriptors, tables):
    """Only aliases and classifications leave this function, never inode/address/path."""
    matches = {}
    for family, lines in tables.items():
        for line in lines.splitlines()[1:]:
            fields = line.split()
            if family == 'unix':
                if len(fields) < 7: raise ValueError()
                inode, state, listener = fields[6], None, False
            else:
                if len(fields) < 10: raise ValueError()
                inode = fields[9]
                state = fields[3] if family in ('tcp','tcp6') else None
                if state is not None and not re.fullmatch('[0-9A-F]{2}', state): raise ValueError()
                listener = (family == 'tcp' and fields[1] == '0100007F:223D'
                            and fields[2] == '00000000:0000' and state == '0A')
            matches.setdefault(inode, []).append((family,state,listener))
    grouped = {}
    for fd, target in descriptors.items():
        match = re.fullmatch(r'socket:\[([0-9]+)\]', target)
        if match: grouped.setdefault(match.group(1),[]).append(fd)
    if len(grouped) > 64: raise ValueError()
    result = []
    for number, (_inode, fds) in enumerate(sorted(grouped.items(), key=lambda pair:min(pair[1])),1):
        candidates = matches.get(_inode, [])
        family, state, listener = candidates[0] if len(candidates) == 1 else ('unknown',None,False)
        result.append({'alias':'socket_'+str(number),'family':family,'tcp_state':state,
                       'known_listener':listener,'fd_count':len(fds),
                       'stdio_fds':sorted(fd for fd in fds if fd in (0,1,2)),
                       'shared_output_error':1 in fds and 2 in fds,
                       'journal_proven':False})
    return result

def sockets(pid):
    root = Path('/proc') / pid
    paths = list((root / 'fd').iterdir())
    if len(paths) > 4096: raise ValueError()
    descriptors = {int(path.name):os.readlink(path) for path in paths}
    tables = {family:read(root / 'net' / family) for family in ('tcp','tcp6','unix','udp','udp6')}
    result = classify_sockets(descriptors,tables)
    after = list((root / 'fd').iterdir())
    if len(after)>4096: raise ValueError()
    stable = descriptors == {int(path.name):os.readlink(path) for path in after}
    return result, stable

def tasks(pid):
    paths = list((Path('/proc') / pid / 'task').iterdir())
    if not 0 < len(paths) <= 256: raise ValueError()
    children = set()
    default = unblocked = True
    pending = False
    mask = 1 << 14
    for path in paths:
        fields = dict(line.split(':',1) for line in read(path/'status').splitlines() if ':' in line)
        default = default and not ((int(fields['SigIgn'],16) | int(fields['SigCgt'],16)) & mask)
        unblocked = unblocked and not (int(fields['SigBlk'],16) & mask)
        pending = pending or bool(int(fields['SigPnd'],16) | int(fields['ShdPnd'],16))
        raw = read(path/'children').split()
        if any(not value.isdigit() for value in raw): raise ValueError()
        children.update(raw)
    stable = {p.name for p in paths} == {p.name for p in (Path('/proc')/pid/'task').iterdir()}
    return {'task_count':len(paths),'child_count':len(children),'term_default_all':default,
            'term_unblocked_all':unblocked,'any_pending_signal':pending},stable

def cgroup(properties):
    group = properties['ControlGroup']
    if not group.startswith('/') or '..' in group.split('/') or str(Path(group)) != group: raise ValueError()
    root = Path('/sys/fs/cgroup') / group.lstrip('/')
    if any(p.is_symlink() for p in (root,*root.parents)): raise ValueError()
    directories = [root]
    members = set()
    index = 0
    while index < len(directories):
        folder = directories[index]
        index += 1
        if index > 64: raise ValueError()
        raw = read(folder/'cgroup.procs').split()
        if any(not p.isdigit() for p in raw): raise ValueError()
        members.update(raw)
        for path in folder.iterdir():
            if path.is_symlink(): raise ValueError()
            if path.is_dir(): directories.append(path)
    return len(members)

def database(source):
    path = source/'state/jobs.sqlite'
    if any(p.is_symlink() for p in (path,*path.parents)) or not path.is_file(): raise ValueError()
    db = sqlite3.connect(path.as_uri()+'?mode=ro',uri=True,timeout=1)
    try:
        db.execute('PRAGMA query_only=ON')
        db.execute('BEGIN')
        rows = db.execute("SELECT CASE WHEN state IN ('succeeded','failed','cancelled','queued','generating','retrying','building') THEN state ELSE 'other' END, COUNT(*) FROM jobs GROUP BY 1").fetchall()
        counts = dict.fromkeys(STATES,0)
        counts.update(dict(rows))
        cancelled = db.execute("SELECT id FROM jobs WHERE state='cancelled' LIMIT 2").fetchall()
        valid = len(cancelled)==1 and isinstance(cancelled[0][0],str) and bool(re.fullmatch(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}',cancelled[0][0]))
        return {'visible':True,'read_only_snapshot':True,'counts':counts,'single_cancelled_uuid_valid':valid}
    finally:
        db.rollback()
        db.close()

def probe():
    result={'phase':'WORLDIFACT_MAINTENANCE_READONLY','read_only':True,'frozen':False,
            'paid_generation_requested':False,'changed_or_racy':None,'worker':{},'tunnel':{},
            'resources':{'task_count':None,'child_count':None,'cgroup_member_count':None,
                         'term_default_all':None,'term_unblocked_all':None,'any_pending_signal':None,
                         'socket_visibility':False,'sockets':[]},
            'database':{'visible':False,'read_only_snapshot':False,'counts':{},'single_cancelled_uuid_valid':None},
            'markers':{'pricing_maintenance':None,'terminal_maintenance':None,'pricing_receipt':None},
            'podman':{'containers':None,'pods':None}}
    before={}; after={}; identities={}; final_identities={}; stability=[]
    for key,name in (('worker','froge-worker.service'),('tunnel','froge-tunnel.service')):
        try:
            before[key]=unit(name)
            identities[key]=proc_identity(before[key])
        except Exception: pass
    source=Path.home()/'froge-connector'
    try: result['database']=database(source)
    except Exception: pass
    for key,name in (('pricing_maintenance','.worldifact-studio-pricing-maintenance.json'),
                     ('terminal_maintenance','.worldifact-terminal-budget-maintenance.json'),
                     ('pricing_receipt','.worldifact-studio-pricing-runtime.json')):
        try:
            if any(p.is_symlink() for p in (source,*source.parents)): raise ValueError()
            result['markers'][key]=os.path.lexists(source/name)
        except Exception: pass
    if 'worker' in identities:
        pid=identities['worker'][0]
        try:
            values,stable=tasks(pid);result['resources'].update(values);stability.append(stable)
        except Exception: stability.append(None)
        try: result['resources']['cgroup_member_count']=cgroup(before['worker'])
        except Exception: pass
        try:
            values,stable=sockets(pid)
            result['resources']['sockets']=values;result['resources']['socket_visibility']=True;stability.append(stable)
        except Exception: stability.append(None)
    for key,args in (('containers',['podman','ps','--all','--format','json']),('pods',['podman','pod','ps','--format','json'])):
        try:
            values=json.loads(command(args))
            if not isinstance(values,list): raise ValueError()
            result['podman'][key]=len(values)
        except Exception: pass
    for key,name in (('worker','froge-worker.service'),('tunnel','froge-tunnel.service')):
        try:
            after[key]=unit(name);final_identities[key]=proc_identity(after[key])
        except Exception: pass
        result[key]=service_summary(before.get(key),after.get(key),identities.get(key),final_identities.get(key))
        stability.append(result[key]['same_identity'])
    result['changed_or_racy']=True if False in stability else (None if None in stability else False)
    return result

if __name__ == '__main__':
    try: print(json.dumps(probe(),sort_keys=True))
    except Exception: raise SystemExit(1)
'''


class DiagnosticError(RuntimeError):
    """Fixed messages only; subprocess output and exception values stay private."""


def validate(value):
    """Reject unknown keys, arbitrary strings, identifiers and oversized output."""
    def exact(obj, keys):
        if type(obj) is not dict or set(obj) != set(keys): raise ValueError()
    def flag(item, nullable=False):
        if type(item) is not bool and not (nullable and item is None): raise ValueError()
    def count(item, nullable=True):
        if nullable and item is None: return
        if type(item) is not int or not 0 <= item <= 100000000: raise ValueError()
    def choice(item, choices):
        if type(item) is not str or item not in choices: raise ValueError()
    try:
        exact(value,('phase','read_only','frozen','paid_generation_requested','changed_or_racy','worker','tunnel','resources','database','markers','podman'))
        if value['phase']!='WORLDIFACT_MAINTENANCE_READONLY' or value['read_only'] is not True or value['frozen'] is not False or value['paid_generation_requested'] is not False: raise ValueError()
        flag(value['changed_or_racy'],True)
        for key in ('worker','tunnel'):
            item=value[key]
            exact(item,('visible','active','sub','same_identity','stdin','stdout','stderr'))
            flag(item['visible']);flag(item['same_identity'],True)
            choice(item['active'],{'unknown','active','inactive','activating','deactivating','failed','reloading','maintenance'})
            choice(item['sub'],{'unknown','running','dead','failed','start','start-pre','start-post','stop','stop-sigterm','stop-sigkill','exited','auto-restart'})
            for name in ('stdin','stdout','stderr'): choice(item[name],{'unknown','null','tty','tty-force','tty-fail','socket','inherit','journal','journal-or-kmsg','kmsg','kmsg-or-journal'})
        resources=value['resources']
        exact(resources,('task_count','child_count','cgroup_member_count','term_default_all','term_unblocked_all','any_pending_signal','socket_visibility','sockets'))
        for name in ('task_count','child_count','cgroup_member_count'): count(resources[name])
        for name in ('term_default_all','term_unblocked_all','any_pending_signal'): flag(resources[name],True)
        flag(resources['socket_visibility'])
        if type(resources['sockets']) is not list or len(resources['sockets'])>64: raise ValueError()
        for index,item in enumerate(resources['sockets'],1):
            exact(item,('alias','family','tcp_state','known_listener','fd_count','stdio_fds','shared_output_error','journal_proven'))
            if item['alias']!='socket_'+str(index): raise ValueError()
            choice(item['family'],{'tcp','tcp6','unix','udp','udp6','unknown'})
            if item['tcp_state'] is not None:
                choice(item['tcp_state'],{format(n,'02X') for n in range(256)})
            flag(item['known_listener']);flag(item['shared_output_error'])
            if item['journal_proven'] is not False: raise ValueError()
            count(item['fd_count'],False)
            if type(item['stdio_fds']) is not list or any(type(fd) is not int for fd in item['stdio_fds']) or item['stdio_fds'] not in ([],[0],[1],[2],[0,1],[0,2],[1,2],[0,1,2]): raise ValueError()
        db=value['database'];exact(db,('visible','read_only_snapshot','counts','single_cancelled_uuid_valid'))
        flag(db['visible']);flag(db['read_only_snapshot']);flag(db['single_cancelled_uuid_valid'],True)
        exact(db['counts'],('succeeded','failed','cancelled','queued','generating','retrying','building','other') if db['visible'] else ())
        for item in db['counts'].values(): count(item,False)
        exact(value['markers'],('pricing_maintenance','terminal_maintenance','pricing_receipt'))
        for item in value['markers'].values(): flag(item,True)
        exact(value['podman'],('containers','pods'))
        for item in value['podman'].values(): count(item)
        return value
    except (ValueError,TypeError,KeyError):
        raise DiagnosticError('STOP: diagnostic result was not validated; private output suppressed.') from None


def launcher_connection(path=Path('oracle_tiers_launch.py')):
    path=Path(path)
    if any(p.is_symlink() for p in (path,*path.parents)) or not path.is_file():
        raise DiagnosticError('STOP: original launcher is unavailable; no connection made.')
    with path.open('rb') as handle: raw=handle.read(262145)
    if hashlib.sha256(raw).hexdigest()!=LAUNCHER_SHA256:
        raise DiagnosticError('STOP: original launcher checksum mismatch; no connection made.')
    scope={'__name__':'readonly_launcher','__file__':str(path)}
    exec(compile(raw,str(path),'exec'),scope)
    return scope['connection']()


def summary(value):
    """Fixed compact rows for a phone screenshot, after full validated JSON."""
    value=validate(value)
    def word(item):
        return 'unknown' if item is None else ('yes' if item is True else ('no' if item is False else str(item)))
    worker=value['worker'];resources=value['resources'];db=value['database']
    lines=['READ-ONLY: no restart, maintenance or generation requested.',
           'Worker: '+worker['active']+'/'+worker['sub']+'; unchanged='+word(worker['same_identity'])+'; racy='+word(value['changed_or_racy']),
           'Stdio: '+worker['stdin']+'/'+worker['stdout']+'/'+worker['stderr']+'; journal identity UNKNOWN',
           'Tasks='+word(resources['task_count'])+'; children='+word(resources['child_count'])+'; cgroup='+word(resources['cgroup_member_count']),
           'TERM default='+word(resources['term_default_all'])+'; unblocked='+word(resources['term_unblocked_all'])+'; signals pending='+word(resources['any_pending_signal'])]
    if resources['socket_visibility']:
        for socket in resources['sockets']:
            lines.append(socket['alias']+': '+socket['family']+' state='+word(socket['tcp_state'])+' fd='+word(socket['fd_count'])+' stdio='+','.join(map(str,socket['stdio_fds']))+' listener='+word(socket['known_listener']))
    else: lines.append('Sockets: UNKNOWN visibility')
    lines.append('Jobs: '+(', '.join(key+'='+str(number) for key,number in db['counts'].items() if number) or ('none' if db['visible'] else 'UNKNOWN')))
    lines.append('Podman: containers='+word(value['podman']['containers'])+'; pods='+word(value['podman']['pods']))
    return '\n'.join(lines)


def main(argv=None):
    if (sys.argv[1:] if argv is None else argv):
        print('STOP: this read-only diagnostic takes no arguments.');return 1
    try:
        connection=launcher_connection()
        result=subprocess.run(connection,input=REMOTE,text=True,stdout=subprocess.PIPE,
                              stderr=subprocess.DEVNULL,timeout=90)
        if result.returncode or len(result.stdout.encode('utf-8'))>OUTPUT_LIMIT: raise ValueError()
        value=validate(json.loads(result.stdout))
    except (Exception,KeyboardInterrupt):
        print('STOP: read-only inspection unavailable; private output suppressed. No maintenance requested.')
        return 1
    print(json.dumps(value,sort_keys=True,separators=(',',':')))
    print(summary(value))
    return 0


if __name__=='__main__': raise SystemExit(main())
