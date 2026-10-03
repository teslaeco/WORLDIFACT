"""Explicit read-only inspection of one authenticated existing Oracle job. Default inert."""
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
import hashlib, json, math, os, re, stat, urllib.request
from pathlib import Path
UUID = r'[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}'
CODES = ('WORLDIFACT_MODEL_INCOMPLETE','WORLDIFACT_RESPONSE_INCOMPLETE','WORLDIFACT_COMPLETION_TIMEOUT','WORLDIFACT_ASTRA_COST_GUARD','CODEX_TOOLS_MISSING','FORGE_REPEATED_CODE_ERROR','FORGE_REPEATED_TOOL_ERROR',
 'FORGE_UNCERTAIN_USAGE','FORGE_JOB_BUDGET','FORGE_STREAM_INTERRUPTED','FORGE_JOB_FINISHED',
 'OPENAI_RESPONSE_FAILED','rate_limit_exceeded','insufficient_quota','invalid_api_key',
 'context_length_exceeded','max_output_tokens','server_error','invalid_request_error',
 'ASTRA_BUDGET','ASTRA_COST_PREFLIGHT','FORGE_COMPLETION_REQUIRED')
TOKENS = {'astra_budget_exhausted':'Astra job budget exhausted before another request',
 'cost_preflight_failed':'Cost preflight failed', 'price_review_expired':'price review expired',
 'minimum_output_invalid':'Invalid minimum useful output allocation',
 'reference_error':'ReferenceError:', 'type_error':'TypeError:', 'syntax_error':'SyntaxError:',
 'timeout':'TimeoutError', 'export_limit':'Export limit:', 'no_current_model':'Brak poprawnego modelu z aktualnego uruchomienia',
 'no_model':'Codex nie wykonal modelu', 'structural_gate':'structural',
 'request_timeout':'timed out', 'connection_reset':'Connection reset',
 'memory_error':'MemoryError', 'killed':'Killed', 'no_space':'No space left on device'}
TOOLS = ('build_model','edit_model','inspect_model','finish_model','get_model_state','view_image','invalid_tool','get_modeling_contract','get_current_model','inspect_render')
PHASES = ('runtime_start','codex_mcp','astra_plan','astra_repair','local_plan','blender','visual_review','codex','codex_agent',
 'agent','initializing','core_export','interchange_exports','reviewed','needs_revision','not_completed')
NUMBERS = ('requests','input_tokens','output_tokens','output_token_limit','request_limit','seconds_limit',
 'build_limit','build_attempts','tool_failures','attempt','request','upstream_status','failed_calls','total_calls','failures','builds','attempts','revision',
 'blender_seconds','total_seconds','ai_seconds','planning_seconds','draft_characters','triangles','vertices',
 'objects','images','bytes','meshCount','primitiveCount','substantialMeshCount','materialCount','nodeCount','renderedTriangles',
 'seconds','elapsed_seconds','model_revision')
FLAGS = ('unknown_usage','unknown_error_code','completed','finished','accepted','assessment_completed','scene_saved','structural_passed')
FILES = ('failure.json','agent-usage.json','agent-execution.json','agent-tools.json','timing.json',
 'agent-candidate.json','agent-progress.json','agent-completion-state.json','result.json','visual-review.json','agent-outcome.json','model-ready.json')
GUARD_REASONS = ('PRICING_EXPIRED','PAYLOAD_POLICY_REJECTED','TOKEN_COUNT_UNAVAILABLE','TOKEN_COUNT_INVALID',
 'INPUT_LIMIT','OUTPUT_ALLOWANCE_BELOW_MINIMUM','REQUEST_LIMIT','INSUFFICIENT_RESERVATION',
 'LEDGER_INVALID','LEDGER_IO','RESERVATION_COLLISION','PREFLIGHT_UNKNOWN')
GUARD_STAGES = ('pricing','payload','count','ledger','admission','persistence','preflight')
GUARD_NUMBERS = {'counted_input':65536,'input_ceiling':67584,'requested_output':96000,'minimum_output':16000,
 'affordable_output':96000,'remaining_micro_usd':1750000,'required_minimum_micro_usd':1826176,'requests':32}

FRAME_FILES = ('codex_runner.py','blender_mcp.py','server.py','astra_spend.py','astra_spend_v2.py',
 'completion_policy.py','render_scene.py','render.py')

def read(path, limit=200000):
    path = Path(path).absolute()
    if any(p.is_symlink() for p in (path,*path.parents)) or '..' in path.parts: raise ValueError()
    fd = os.open(str(path), os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
    with os.fdopen(fd,'rb') as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or not 0 < info.st_size <= limit: raise ValueError()
        raw = stream.read(limit+1)
        if len(raw) != info.st_size or len(raw)>limit: raise ValueError()
        return raw

def record(path, limit=200000):
    value = json.loads(read(path,limit))
    if not isinstance(value,dict): raise ValueError()
    return value

def safe_summary(value):
    result = {}
    for key in NUMBERS:
        v=value.get(key)
        if type(v) in (int,float) and math.isfinite(v) and 0<=v<=1000000000: result[key]=v
    for key in FLAGS:
        if type(value.get(key)) is bool: result[key]=value[key]
    for key in ('phase','last_phase','status'):
        if value.get(key) in PHASES: result[key]=value[key]
    if value.get('kind')=='timeout': result['kind']='timeout'
    if value.get('error_source') in ('forge','openai'): result['error_source']=value['error_source']
    text='\n'.join(str(value[k])[:10000] for k in ('error_code','error','errors','last_error','detail','message','first_validation_error') if k in value)
    result['error_codes']=[code for code in CODES if re.search(r'(?<![A-Za-z0-9_])'+re.escape(code)+r'(?![A-Za-z0-9_])',text)]
    if value.get('error_code') and value.get('error_code') not in CODES: result['unknown_error_code']=True
    result['error_tokens']=[name for name,token in TOKENS.items() if token.lower() in text.lower()]
    guard=value.get('cost_guard')
    if isinstance(guard,dict):
        safe={}
        if guard.get('reason') in GUARD_REASONS: safe['reason']=guard['reason']
        if guard.get('stage') in GUARD_STAGES: safe['stage']=guard['stage']
        for key, maximum in GUARD_NUMBERS.items():
            number=guard.get(key)
            if type(number) is int and 0<=number<=maximum: safe[key]=number
        if safe: result['cost_guard']=safe
    result['code_frames']=[{'file':name,'line':int(line)} for name,line in re.findall(
        r'File "[^"\n]*/('+'|'.join(re.escape(x) for x in FRAME_FILES)+r')", line ([0-9]{1,6})',text)][:12]
    return result

def safe_record(path):
    try: return {'availability':'present',**safe_summary(record(path))}
    except FileNotFoundError: return {'availability':'missing'}
    except Exception: return {'availability':'unavailable'}

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs): return None

def status(root, job):
    config=record(root/'state/config.json',16384)
    token=config.get('token')
    if not isinstance(token,str) or not 32<=len(token)<=256 or any(ord(x)<33 or ord(x)>126 for x in token): raise ValueError()
    opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),NoRedirect())
    request=urllib.request.Request('http://127.0.0.1:8765/v1/jobs/'+job,
        headers={'Authorization':'Bearer '+token},method='GET')
    with opener.open(request,timeout=10) as response:
        if response.status!=200: raise ValueError()
        raw=response.read(1000001)
        if len(raw)>1000000: raise ValueError()
    value=json.loads(raw)
    if value.get('id')!=job or value.get('state') not in ('failed','cancelled','succeeded','queued','generating','building','retrying'): raise ValueError()
    return {'state':value['state'],**safe_summary(value)}

def budget(root,folder):
    path=root/'state/worldifact-astra-budgets'/hashlib.sha256(str(folder.resolve(strict=True)).encode()).hexdigest()/'.worldifact-astra-spend.json'
    try: value=record(path,16384)
    except FileNotFoundError: return {'availability':'missing'}
    if set(value)!={'revision','legacyHeld','requests','holds'}: raise ValueError()
    holds=value.get('holds'); legacy=value.get('legacyHeld'); requests=value.get('requests')
    if value.get('revision')!='astra-low-reconciled-v2' or not isinstance(holds,dict) or not 0<=len(holds)<=32: raise ValueError()
    if type(legacy)is not int or not 0<=legacy<=1750000 or type(requests)is not int or not len(holds)<=requests<=32: raise ValueError()
    result=[]; responses=set()
    for key,hold in holds.items():
        if not isinstance(key,str) or not re.fullmatch('[0-9a-f]{32}',key): raise ValueError()
        if not isinstance(hold,dict) or set(hold) not in ({'input','output','held'},{'input','output','held','response'}): raise ValueError()
        i,o,h=(hold[k] for k in ('input','output','held'))
        if any(type(x)is not int for x in (i,o,h)) or not 2048<=i<=67584 or not 256<=o<=16000 or not 0<=h<=i*14+o*55: raise ValueError()
        if 'response' not in hold and h!=i*14+o*55: raise ValueError()
        if 'response' in hold:
            response=hold['response']
            if not isinstance(response,str) or not re.fullmatch(r'resp_[A-Za-z0-9_-]{1,190}',response) or response in responses: raise ValueError()
            responses.add(response)
        result.append({'input_ceiling':i,'output_ceiling':o,'held_micro_usd':h,'settled':'response' in hold})
    held=legacy+sum(h['held_micro_usd'] for h in result)
    if held>1750000: raise ValueError()
    return {'availability':'present','requests':requests,'held_micro_usd':held,'remaining_micro_usd':1750000-held,
        'cap_micro_usd':1750000,'holds':result,'invoice_known':False}

def inspect(root,job):
    if not isinstance(job,str) or not re.fullmatch(UUID,job): raise ValueError()
    verified_job=status(root,job)
    folder=root/'state/jobs'/job
    if any(p.is_symlink() for p in (folder,*folder.parents)) or not folder.is_dir(): raise ValueError()
    report={'diagnostic':'ORACLE_JOB_READ_ONLY','job_identity_verified':True,'paid_requests_made':0,'files':{}}
    report['job']=verified_job
    for name in FILES: report['files'][name]=safe_record(folder/name)
    for name in ('agent-tools.json','agent-execution.json'):
        try:
            calls=record(folder/name).get('calls',[])
            if not isinstance(calls,list) or len(calls)>40: raise ValueError()
            report['files'][name]['calls']=[{**safe_summary(call),**({'tool':call['tool']} if call.get('tool') in TOOLS else {}),
                **({'call_status':call['status']} if call.get('status') in ('started','failed','completed','succeeded') else {})}
                for call in calls if isinstance(call,dict)]
        except Exception: pass
    try:
        current=record(folder/'agent-candidate.json',10000); relative=current.get('path')
        if not isinstance(relative,str) or not re.fullmatch(r'candidates/[1-9][0-9]{0,5}',relative): raise ValueError()
        report['candidate']={name:safe_record(folder/relative/name) for name in ('result.json','model-ready.json')}
    except Exception: report['candidate']={'availability':'unavailable'}
    try: report['budget']=budget(root,folder)
    except Exception: report['budget']={'availability':'unavailable'}
    return report

# Strict output grammar also runs locally. No arbitrary text, paths or IDs.
def validate(value):
    strings=set(GUARD_REASONS)|set(GUARD_STAGES)|set(CODES)|set(TOKENS)|set(TOOLS)|set(PHASES)|set(FILES)|set(FRAME_FILES)|{
        'ORACLE_JOB_READ_ONLY','present','missing','unavailable','forge','openai','timeout','failed','cancelled',
        'succeeded','queued','generating','building','retrying','started','completed'}
    keys=set(GUARD_NUMBERS)|{'cost_guard','reason','stage'}|set(NUMBERS)|set(FLAGS)|set(FILES)|{'diagnostic','job_identity_verified','paid_requests_made','files','job','candidate',
        'budget','availability','state','phase','last_phase','status','kind','error_source','error_codes','error_tokens',
        'code_frames','file','line','calls','tool','call_status','input_ceiling','output_ceiling','held_micro_usd',
        'remaining_micro_usd','cap_micro_usd','holds','settled','invoice_known'}
    def walk(x,depth=0):
        if depth>8: raise ValueError()
        if isinstance(x,dict):
            if len(x)>70 or not set(x)<=keys: raise ValueError()
            for v in x.values(): walk(v,depth+1)
        elif isinstance(x,list):
            if len(x)>40: raise ValueError()
            for v in x: walk(v,depth+1)
        elif isinstance(x,str):
            if x not in strings: raise ValueError()
        elif type(x)is bool: pass
        elif type(x) in (int,float):
            if not math.isfinite(x) or not 0<=x<=1000000000: raise ValueError()
        else: raise ValueError()
    walk(value)
    if value.get('diagnostic')!='ORACLE_JOB_READ_ONLY' or value.get('job_identity_verified') is not True or value.get('paid_requests_made')!=0: raise ValueError()
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
    parser.add_argument('--inspect-job',action='store_true')
    parser.add_argument('--source-commit'); parser.add_argument('--job')
    args=parser.parse_args(argv)
    if not args.inspect_job:
        print('{"diagnostic":"PLAN_ONLY","paid_requests_made":0}'); return
    if (not isinstance(args.source_commit,str) or not re.fullmatch('[0-9a-f]{40}',args.source_commit)
        or not isinstance(args.job,str) or not re.fullmatch(r'[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}',args.job)): raise ValueError()
    namespace=loader(args.source_commit)
    program=REMOTE+'\ntry:\n print(json.dumps(validate(inspect(Path.home()/"froge-connector",'+repr(args.job)+')),sort_keys=True))\nexcept BaseException:\n print(\'{"diagnostic":"EVIDENCE_UNAVAILABLE"}\')\n raise SystemExit(1)\n'
    process=subprocess.run(namespace['connection'](),input=program,text=True,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,timeout=75)
    if process.returncode or len(process.stdout.encode())>65536: raise ValueError()
    checks={'__name__':'diagnostic_validation'}; exec(REMOTE,checks)
    result=checks['validate'](json.loads(process.stdout)); print(json.dumps(result,sort_keys=True)); return result

if __name__=='__main__':
    try: main()
    except (Exception,KeyboardInterrupt):
        print('STOP: read-only diagnostic unavailable; no job or ledger was changed. No retry was submitted.',file=sys.stderr); sys.exit(1)
