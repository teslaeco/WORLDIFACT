"""Strict server/worker envelope. LLM text is data, never executable commands."""
from __future__ import annotations
import copy, hashlib, json, re, time
REVISION = 'astra-runpod-blender-v1'
QUALITY_REVISION = 'astra-runpod-blender-v3'
UUID = re.compile(r'[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}')
SHA = re.compile(r'[a-f0-9]{64}')

class Rejected(ValueError):
    pass

def exact(v, fields):
    return type(v) is dict and set(v) == set(fields)

def integer(v, low, high):
    return type(v) is int and low <= v <= high

def text(v, limit):
    return type(v) is str and 0 < len(v.strip()) <= limit and not any(ord(c) < 9 for c in v)

def validate_job(v, now_ms=None):
    now_ms = int(time.time()*1000) if now_ms is None else now_ms
    if not exact(v, ('revision','jobId','scope','reference','mask','planner','plan','settings','budget')):
        raise Rejected('INVALID_JOB_FIELDS')
    if v['revision'] not in (REVISION,QUALITY_REVISION) or not isinstance(v['jobId'],str) or not UUID.fullmatch(v['jobId']) or not isinstance(v['scope'],str) or not SHA.fullmatch(v['scope']):
        raise Rejected('INVALID_JOB_IDENTITY')
    prefix = f"jobs/{v['scope']}/{v['jobId']}/"
    for name in ('reference','mask'):
        item=v[name]
        if not exact(item, ('key','sha256')) or item['key'] != prefix+name+'.png' or not isinstance(item['sha256'],str) or not SHA.fullmatch(item['sha256']):
            raise Rejected('INVALID_SOURCE_OBJECT')
    evidence=v['planner']
    if not exact(evidence,('model','responseId','referenceSha256')) or evidence['model']!='gpt-6-astra' or not isinstance(evidence['responseId'],str) or not re.fullmatch(r'resp_[a-zA-Z0-9_-]{1,120}',evidence['responseId']) or evidence['referenceSha256']!=v['reference']['sha256']:
        raise Rejected('PLANNER_PROVENANCE_MISMATCH')
    p=v['plan']
    if not exact(p, ('subject','description','preserve','unseenSurfaces','makeStatus')) or p['subject'] not in ('robot','person','prop') or not text(p['description'],1200) or type(p['preserve']) is not list or not 1 <= len(p['preserve']) <= 16 or not all(text(s,200) for s in p['preserve']) or not text(p['unseenSurfaces'],800) or p['makeStatus']!='NOT_VALIDATED':
        raise Rejected('INVALID_CHARACTER_PLAN')
    s=v['settings']
    quality=v['revision']==QUALITY_REVISION
    if not exact(s, ('seed','resolution','textureSize','targetFaces')) or not integer(s['seed'],0,2**31-1) or type(s['resolution']) is not int or s['resolution'] not in (512,1024,1536) or type(s['textureSize']) is not int or s['textureSize'] not in (2048,4096) or not integer(s['targetFaces'],100000,1000000 if quality else 500000):
        raise Rejected('INVALID_SETTINGS')
    # A separate bounded owner profile; no expansion of legacy customer jobs.
    if quality and (s['resolution'],s['textureSize'],s['targetFaces'])!=(1536,4096,1000000):
        raise Rejected('INVALID_QUALITY_PROFILE')
    b=v['budget']
    limits={'maxGpuMicroUsd':(1,20000000),'rateMicroUsdPerSecond':(1,100000),'executionSeconds':(5,900),
            'coldStartAllowanceSeconds':(0,600),'idleSeconds':(0,5),'expiresAt':(now_ms+1,now_ms+3600000)}
    if quality:
        limits.update(maxGpuMicroUsd=(1,2100000),executionSeconds=(5,1800),
                      rateMicroUsdPerSecond=(1,834))
    if not exact(b, limits) or not all(integer(b[k],*r) for k,r in limits.items()):
        raise Rejected('INVALID_OR_EXPIRED_BUDGET')
    if b['expiresAt']-now_ms < b['executionSeconds']*1000+10000:raise Rejected('INSUFFICIENT_JOB_TTL')
    exposure=(b['executionSeconds']+b['coldStartAllowanceSeconds']+b['idleSeconds'])*b['rateMicroUsdPerSecond']
    if exposure>b['maxGpuMicroUsd']: raise Rejected('GPU_BUDGET_EXCEEDED')
    return copy.deepcopy(v)

def fingerprint(job):
    """Match server/runpodPipeline.ts fixed-order projection, including Unicode."""
    j=job;p=j['plan'];s=j['settings'];b=j['budget']
    values=[j['revision'],j['jobId'],j['scope'],j['reference']['key'],j['reference']['sha256'],j['mask']['key'],j['mask']['sha256'],
        j['planner']['model'],j['planner']['responseId'],j['planner']['referenceSha256'],
        p['subject'],p['description'],p['preserve'],p['unseenSurfaces'],p['makeStatus'],
        s['seed'],s['resolution'],s['textureSize'],s['targetFaces'],b['maxGpuMicroUsd'],b['rateMicroUsdPerSecond'],
        b['executionSeconds'],b['coldStartAllowanceSeconds'],b['idleSeconds'],b['expiresAt']]
    return hashlib.sha256(json.dumps(values,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()
