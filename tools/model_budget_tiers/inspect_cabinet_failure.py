"""Read only the latest rolled-back synthetic cabinet verification failure.

The remote program never imports worker code or reads configuration, credentials,
model history, process state or agent output files. Raw log text stays on the VM.
"""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

LAUNCHER_SHA256 = '659468a67259cf06cea933a8322b5d0e8e83212362d8294b7fed662b3dd3a003'
OUTPUT_LIMIT = 16384
REMOTE = r'''
import json, os, re, stat, time
from pathlib import Path

FILES = {'offline_cabinet.py','codex_runner.py','codex_smoke.py','blender_mcp.py','server.py',
         'astra_spend.py','astra_spend_v2.py','completion_policy.py','prebuild_policy.py',
         'studio_pricing.py','terminal_budget.py','scene_contract.py','run.py','photo_input.py'}
FUNCTIONS = {'<module>','main','run','open','bounded','protect','has_value','request_tools',
             'run_blender','execute_job','call','build_model','finish_model','inspect_render',
             'assessment','parse_scene','read_photos','validate_photo_plan','completed_outcome',
             'references','references_unchanged','no_remote','do_POST','handle','dispatch',
             'status','update','write','read','validate','admission','job_terms','terms_at',
             'bind','same_terms','cap_and_revision','minimum_output','save_state','restore_state'}
EXCEPTIONS = {'ValueError','RuntimeError','TypeError','KeyError','AttributeError','AssertionError',
              'IndexError','StopIteration','FileNotFoundError','PermissionError','OSError',
              'TimeoutError','TimeoutExpired','CalledProcessError','OperationalError',
              'DatabaseError','IntegrityError','JSONDecodeError','ModuleNotFoundError','ImportError',
              'SyntaxError','UnicodeDecodeError','ConnectionError','BrokenPipeError'}
MARKERS = {
    'missing_jobs_table':'no such table: jobs',
    'tool_result_missing':'Cabinet actual tool result missing.',
    'first_exec_not_built':'First exec did not build without discovery-only round trip.',
    'model_not_complete':'Current model was not structurally complete and finished.',
    'fixture_images_changed':'Original ordered fixture images changed.',
    'fixture_instructions_changed':'Original fixture prompt or instructions changed.',
    'external_network_refused':'Offline verification refused external network',
    'contract_missing':'CONTRACT_MISSING',
}
PHASE = 'WORLDIFACT_CABINET_FAILURE_READONLY'
WORKSPACE = re.compile(r'studio-pricing-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{8}')


def safe_directory(path):
    path = Path(path).absolute()
    fd = os.open('/', os.O_RDONLY | os.O_DIRECTORY)
    try:
        for part in path.parts[1:]:
            child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            os.close(fd)
            fd = child
        return fd
    except BaseException:
        os.close(fd)
        raise


def identity(info):
    return (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns, info.st_ctime_ns)


def read_regular(folder, name, limit):
    fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=folder)
    try:
        before = os.fstat(fd)
        if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1 or before.st_uid != os.getuid() or before.st_size > limit:
            raise ValueError()
        chunks = []
        remaining = limit + 1
        while remaining:
            raw = os.read(fd, min(65536, remaining))
            if not raw: break
            chunks.append(raw)
            remaining -= len(raw)
        raw = b''.join(chunks)
        if len(raw) > limit or len(raw) != before.st_size or identity(before) != identity(os.fstat(fd)):
            raise ValueError()
        if identity(before) != identity(os.stat(name, dir_fd=folder, follow_symlinks=False)):
            raise ValueError()
        return raw, before
    finally:
        os.close(fd)


def sanitize(raw):
    text = raw.decode('utf-8', errors='replace')
    frames = []
    exceptions = set()
    for line in text.splitlines():
        match = re.fullmatch(r'  File "([^"\r\n]{1,4096})", line ([0-9]{1,6}), in ([A-Za-z_][A-Za-z_0-9]{0,63}|<module>)', line)
        if match:
            filename = match[1].rsplit('/', 1)[-1]
            if filename in FILES and len(frames) < 64:
                frames.append({'file':filename,'line':int(match[2]),
                               'function':match[3] if match[3] in FUNCTIONS else 'unknown'})
        match = re.match(r'^(?:[a-zA-Z_][a-zA-Z_0-9]*\.)?([a-zA-Z_][a-zA-Z_0-9]*):(?: |$)', line)
        if match and match[1] in EXCEPTIONS:
            exceptions.add(match[1])
    return {'traceback_frames':frames, 'exception_types':sorted(exceptions),
            'fixed_markers':sorted(key for key, marker in MARKERS.items() if marker in text),
            'success_marker':any(line.startswith('CABINET_FIRST_EXEC_REAL_PIPELINE_OK;') for line in text.splitlines()),
            'traceback_present':'Traceback (most recent call last):' in text}


def probe(home=None, now=None):
    home = Path.home() if home is None else Path(home)
    now = time.time() if now is None else now
    parent = safe_directory(home/'.local/state/worldifact-astra-guard')
    workspace = None
    try:
        names = os.listdir(parent)
        if len(names) > 4096: raise ValueError()
        matches = sorted(name for name in names if WORKSPACE.fullmatch(name))
        if not matches: raise ValueError()
        latest = matches[-1]
        workspace = os.open(latest, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent)
        folder_info = os.fstat(workspace)
        if folder_info.st_uid != os.getuid(): raise ValueError()
        summary_raw, summary_info = read_regular(workspace, 'INSTALL_STATUS.json', 16384)
        summary = json.loads(summary_raw)
        expected = {'phase':'WORLDIFACT_STUDIO_PRICING_NOT_CONFIRMED','revision':'studio-pricing-v1',
                    'refusal_code':'cabinet_pipeline_unverified','previous_source_restored':True,
                    'activation_committed':False,'paid_generation_requested':False,'job_rows_changed':False,
                    'provider_limits_changed':False,'legacy_provider_cap_micro_usd':1750000}
        if type(summary) is not dict or set(summary) != set(expected): raise ValueError()
        if any(type(summary[key]) is not type(value) or summary[key] != value for key, value in expected.items()): raise ValueError()
        if not 0 <= now - summary_info.st_mtime <= 86400: raise ValueError()
        raw, log_info = read_regular(workspace, 'offline-cabinet.log', 1048576)
        if log_info.st_mtime_ns > summary_info.st_mtime_ns: raise ValueError()
        result = sanitize(raw)
        after_raw, after_info = read_regular(workspace, 'INSTALL_STATUS.json', 16384)
        if after_raw != summary_raw or identity(after_info) != identity(summary_info): raise ValueError()
        if os.fstat(workspace).st_ino != os.stat(latest, dir_fd=parent, follow_symlinks=False).st_ino: raise ValueError()
        if sorted(name for name in os.listdir(parent) if WORKSPACE.fullmatch(name))[-1] != latest: raise ValueError()
        return {'phase':PHASE,'read_only':True,'paid_generation_requested':False,
                'restored_failure_confirmed':True, **result}
    finally:
        if workspace is not None: os.close(workspace)
        os.close(parent)


if __name__ == '__main__':
    try: print(json.dumps(probe(), sort_keys=True))
    except Exception: raise SystemExit(1)
'''

# Evaluate only the fixed local, reviewed definitions; __main__ is not executed.
_SCHEMA = {'__name__':'cabinet_diagnostic_schema'}
exec(compile(REMOTE, '<fixed-cabinet-diagnostic>', 'exec'), _SCHEMA)


def validate(value):
    keys = {'phase','read_only','paid_generation_requested','restored_failure_confirmed',
            'traceback_frames','exception_types','fixed_markers','success_marker','traceback_present'}
    if type(value) is not dict or set(value) != keys: raise ValueError()
    if value['phase'] != _SCHEMA['PHASE']: raise ValueError()
    for key, expected in (('read_only',True),('paid_generation_requested',False),('restored_failure_confirmed',True)):
        if value[key] is not expected: raise ValueError()
    for key in ('success_marker','traceback_present'):
        if type(value[key]) is not bool: raise ValueError()
    for key, allowed in (('exception_types',_SCHEMA['EXCEPTIONS']),('fixed_markers',_SCHEMA['MARKERS'])):
        items = value[key]
        if type(items) is not list or len(items) > len(allowed) or any(type(item) is not str or item not in allowed for item in items): raise ValueError()
        if items != sorted(set(items)): raise ValueError()
    frames = value['traceback_frames']
    if type(frames) is not list or len(frames) > 64: raise ValueError()
    for frame in frames:
        if type(frame) is not dict or set(frame) != {'file','line','function'}: raise ValueError()
        if frame['file'] not in _SCHEMA['FILES'] or frame['function'] not in _SCHEMA['FUNCTIONS'] | {'unknown'}: raise ValueError()
        if type(frame['line']) is not int or not 0 < frame['line'] <= 999999: raise ValueError()
    return value


def launcher_connection(path=Path('oracle_tiers_launch.py')):
    path = Path(path)
    if any(p.is_symlink() for p in (path,*path.parents)) or not path.is_file(): raise ValueError()
    with path.open('rb') as handle: raw = handle.read(262145)
    if hashlib.sha256(raw).hexdigest() != LAUNCHER_SHA256: raise ValueError()
    scope = {'__name__':'readonly_launcher','__file__':str(path)}
    exec(compile(raw,str(path),'exec'),scope)
    return scope['connection']()


def main(argv=None):
    if (sys.argv[1:] if argv is None else argv):
        print('STOP: this read-only diagnostic takes no arguments.'); return 1
    try:
        result = subprocess.run(launcher_connection(),input=REMOTE,text=True,stdout=subprocess.PIPE,
                                stderr=subprocess.DEVNULL,timeout=90)
        if result.returncode or len(result.stdout.encode('utf-8')) > OUTPUT_LIMIT: raise ValueError()
        value = validate(json.loads(result.stdout))
    except (Exception, KeyboardInterrupt):
        print('STOP: latest restored cabinet failure could not be verified; private output suppressed. No changes requested.')
        return 1
    print(json.dumps(value,sort_keys=True,separators=(',',':')))
    print('READ-ONLY: restored failure confirmed. No install, restart, retry or generation requested.')
    return 0


if __name__ == '__main__': raise SystemExit(main())
