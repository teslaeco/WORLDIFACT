"""Resumable one-job Oracle GLB/PBR/FBX/BLEND verification.

Exactly one job id is persisted before submission. Re-running after a dropped
SSH/Cloud Shell connection resumes that SAME job and never creates another
generation automatically. A terminal E2E_FAILED result is not retried.
"""
import hashlib,json,os,struct,sys,time,urllib.error,urllib.request,uuid
from pathlib import Path

ROOT=Path.home()/"froge-connector"
OUT=Path.home()/".local/state/worldifact-direct-export-v4/e2e"
RESULT=OUT/"result.json"
BASE="http://127.0.0.1:8765"
PROMPT=("Create one simple small blue cube-shaped game prop with bevelled edges, clean UVs and one neutral PBR material. "
        "Keep geometry intentionally low complexity. This is only a technical export verification model, not manufacturing-ready.")

def atomic(value):
    OUT.mkdir(parents=True,exist_ok=True,mode=0o700);os.chmod(OUT,0o700)
    tmp=OUT/"result.json.tmp";tmp.write_text(json.dumps(value,separators=(",",":")));os.chmod(tmp,0o600);os.replace(tmp,RESULT)
def load():
    if RESULT.is_symlink() or not RESULT.is_file() or RESULT.stat().st_size>262144:return None
    try:
        v=json.loads(RESULT.read_text());return v if isinstance(v,dict) else None
    except Exception:return None
def token():
    path=ROOT/"state/config.json"
    if path.is_symlink() or not path.is_file() or path.stat().st_size>16384:raise RuntimeError("Worker config unavailable.")
    v=json.loads(path.read_text()).get("token")
    if not isinstance(v,str) or not 20<=len(v)<=256:raise RuntimeError("Worker token invalid.")
    return v
TOKEN=token()
OPENER=urllib.request.build_opener(urllib.request.ProxyHandler({}))
def request(path,method="GET",body=None,timeout=30,expect_binary=False):
    raw=json.dumps(body).encode() if body is not None else None
    headers={"Authorization":"Bearer "+TOKEN,"Accept":"application/octet-stream" if expect_binary else "application/json"}
    if raw is not None:headers["Content-Type"]="application/json"
    req=urllib.request.Request(BASE+path,data=raw,headers=headers,method=method)
    try:
        with OPENER.open(req,timeout=timeout) as r:return r.status,r.headers,r.read(512*1024*1024+1)
    except urllib.error.HTTPError as e:return e.code,e.headers,e.read(65536)
def json_request(path,method="GET",body=None,timeout=30):
    status,headers,raw=request(path,method,body,timeout)
    try:value=json.loads(raw)
    except Exception:raise RuntimeError(path+" returned invalid JSON")
    return status,value
def sha(raw):return hashlib.sha256(raw).hexdigest()
def save(job_id,name,raw):
    folder=OUT/job_id;folder.mkdir(parents=True,exist_ok=True,mode=0o700)
    path=folder/name;path.write_bytes(raw);os.chmod(path,0o600);return str(path)
def verify_glb(raw):
    if len(raw)<20:raise RuntimeError("GLB too small")
    magic,version,length=struct.unpack("<III",raw[:12])
    if magic!=0x46546c67 or version!=2 or length!=len(raw):raise RuntimeError("Invalid GLB")
def verify_zip(raw):
    if len(raw)<4 or raw[:2]!=b"PK":raise RuntimeError("PBR response is not ZIP")
def verify_fbx(raw):
    if not (raw.startswith(b"Kaydara FBX Binary") or b"FBX" in raw[:64]):raise RuntimeError("Invalid FBX header")
def verify_blend(raw):
    if not raw.startswith(b"BLENDER"):raise RuntimeError("Invalid BLEND header")

prior=load()
if prior and prior.get("phase")=="E2E_PASS":
    print(json.dumps(prior,indent=2));sys.exit(0)
if prior and prior.get("phase")=="E2E_FAILED":
    print(json.dumps(prior,indent=2));sys.exit(1)
if prior and prior.get("phase")=="E2E_RUNNING" and isinstance(prior.get("jobId"),str):
    JOB_ID=prior["jobId"];submitted=prior.get("submitted") is True
else:
    JOB_ID=str(uuid.uuid4());submitted=False
    atomic({"phase":"E2E_RUNNING","jobId":JOB_ID,"submitted":False,"paidGenerationRequested":True,
      "generationRequested":True,"automaticGenerationRetries":0})

try:
    hs,h=json_request("/v1/health")
    if hs!=200 or h.get("ready") is not True or h.get("connectorVersion")!=33 or h.get("posthocExportRevision")!=2 or h.get("legacyGlbExportRecoveryRevision")!=1:
        raise RuntimeError("Oracle export capability is not ready.")
    if not submitted:
        check,state=json_request("/v1/jobs/"+JOB_ID,timeout=25)
        if check==404:
            status,state=json_request("/v1/jobs","POST",{"id":JOB_ID,"prompt":PROMPT},45)
            if status not in (200,202) or state.get("id")!=JOB_ID:raise RuntimeError("Oracle rejected the one explicit test generation.")
        elif check!=200:
            raise RuntimeError("Could not reconcile the persisted test job id.")
        atomic({"phase":"E2E_RUNNING","jobId":JOB_ID,"submitted":True,"paidGenerationRequested":True,
          "generationRequested":True,"automaticGenerationRetries":0})
    deadline=time.monotonic()+900
    while True:
        s,state=json_request("/v1/jobs/"+JOB_ID,timeout=35)
        if s!=200:raise RuntimeError("Oracle job status read failed.")
        if state.get("state") in ("succeeded","failed","cancelled"):break
        if time.monotonic()>=deadline:raise RuntimeError("Oracle test job did not finish within the bounded wait.")
        time.sleep(12)
    if state.get("state")!="succeeded":raise RuntimeError("Oracle test generation ended as "+str(state.get("state"))+": "+str(state.get("detail","")))
    artifacts=[]
    s,headers,model=request("/v1/jobs/"+JOB_ID+"/model",timeout=180,expect_binary=True)
    if s!=200 or len(model)>512*1024*1024:raise RuntimeError("GLB download failed.")
    verify_glb(model);artifacts.append({"format":"glb","bytes":len(model),"sha256":sha(model),"path":save(JOB_ID,"model.glb",model)})
    missing=[];downloaded={}
    for name in ("pbr","fbx","blend"):
        s,headers,raw=request("/v1/jobs/"+JOB_ID+"/exports/"+name,timeout=180,expect_binary=True)
        if s==200:downloaded[name]=raw
        elif s in (404,409):missing.append(name)
        else:raise RuntimeError(name+" export HTTP "+str(s))
    if missing:
        s,prep=json_request("/v1/jobs/"+JOB_ID+"/exports/prepare","POST",{},330)
        if s!=200:raise RuntimeError("Post-hoc export preparation failed: "+str(prep.get("error","unknown")))
        for name in missing:
            s,headers,raw=request("/v1/jobs/"+JOB_ID+"/exports/"+name,timeout=180,expect_binary=True)
            if s!=200:raise RuntimeError(name+" export still unavailable after prepare.")
            downloaded[name]=raw
    verify_zip(downloaded["pbr"]);verify_fbx(downloaded["fbx"]);verify_blend(downloaded["blend"])
    for name,filename in (("pbr","textures-pbr.zip"),("fbx","model.fbx"),("blend","model.blend")):
        raw=downloaded[name];artifacts.append({"format":name,"bytes":len(raw),"sha256":sha(raw),"path":save(JOB_ID,filename,raw)})
    result={"phase":"E2E_PASS","jobId":JOB_ID,"state":"succeeded","submitted":True,"paidGenerationRequested":True,
      "generationRequested":True,"automaticGenerationRetries":0,"artifacts":artifacts}
    atomic(result);print(json.dumps(result,indent=2))
except BaseException as exc:
    result={"phase":"E2E_FAILED","jobId":JOB_ID,"submitted":submitted,"paidGenerationRequested":True,
      "generationRequested":True,"automaticGenerationRetries":0,"error":str(exc)[:900]}
    atomic(result);print(json.dumps(result,indent=2));sys.exit(1)
