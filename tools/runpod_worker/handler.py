"""RunPod Serverless queue handler. One expensive inference per durable app UUID.
An unfinished claim never causes automatic re-inference. Completed results are
private object references, not a giant GLB in /status or a public customer URL.
"""
from __future__ import annotations
import hashlib, io, json, os, tempfile, time
from contextlib import contextmanager
from pathlib import Path
from contracts import Rejected,validate_job,fingerprint
from storage import S3Store,validate_glb

@contextmanager
def deadline(seconds):
    # Thread-safe soft guard. The RunPod executionTimeout is the independent
    # hard termination control; Python signals cannot be installed on SDK threads.
    start=time.monotonic()
    yield
    if time.monotonic()-start>seconds:raise TimeoutError('JOB_EXECUTION_DEADLINE')

def checked_image(store,item,out,mask=False):
    from PIL import Image
    raw=store.read(item['key'],12*1024*1024)
    if raw is None or hashlib.sha256(raw).hexdigest()!=item['sha256']:raise Rejected('REFERENCE_HASH_MISMATCH')
    with Image.open(io.BytesIO(raw)) as im:
        if im.format!='PNG' or im.width*im.height>16000000 or min(im.size)<32 or getattr(im,'n_frames',1)!=1:
            raise Rejected('INVALID_REFERENCE_IMAGE')
        im.load();size=im.size
        if mask:
            counts=im.convert('L').histogram();fraction=sum(counts[205:])/(im.width*im.height)
            if not .01<fraction<.98:raise Rejected('INVALID_FOREGROUND_MASK')
    out.write_bytes(raw)
    return size

def execute(envelope,store,engine,postprocess,progress=lambda *_:None,now_ms=None,enabled=False):
    if not enabled:raise Rejected('GPU_WORKER_DISABLED')
    if type(envelope) is not dict or 'input' not in envelope:raise Rejected('INVALID_RUNPOD_ENVELOPE')
    j=validate_job(envelope['input'],now_ms);fp=fingerprint(j)
    durable_exports=j['revision']=='astra-runpod-blender-v3'
    prefix=f"jobs/{j['scope']}/{j['jobId']}/";result_key=prefix+'result.json'
    # CAS survives scale-to-zero and RunPod redelivery; no process-local lock illusion.
    created=store.create_json(prefix+'claim.json',{'fingerprint':fp,'revision':j['revision']})
    if not created:
        raw=store.read(prefix+'claim.json',262144)
        if raw is None or json.loads(raw).get('fingerprint')!=fp:raise Rejected('JOB_ID_REUSED_WITH_DIFFERENT_INPUT')
        cached=store.read(result_key,262144)
        if cached:
            result=json.loads(cached)
            if result.get('fingerprint')!=fp:raise Rejected('RESULT_FINGERPRINT_MISMATCH')
            return result
        raise Rejected('EXISTING_INCOMPLETE_JOB_RECONCILIATION_REQUIRED')
    started=time.monotonic();artifacts=[];stage='REFERENCE';receipt=None
    def checkpoint(relative,path,mime):
        artifact=store.put_file(prefix+relative,path,mime)
        artifacts.append(artifact)
        if durable_exports:
            # Each small receipt is immutable and independently recoverable
            # even if provider termination prevents the final result commit.
            saved_receipt={'revision':j['revision'],'jobId':j['jobId'],
                'fingerprint':fp,'state':'ARTIFACT_DURABLE','artifact':artifact}
            if not store.create_json(prefix+'checkpoints/'+relative+'.json',saved_receipt):
                raise Rejected('CHECKPOINT_COMMIT_CONFLICT')
        return artifact
    try:
        # Applies to loading, source fetch, inference, export and uploads. RunPod
        # executionTimeout is the independent external kill guard. Neither is an invoice cap.
        with deadline(j['budget']['executionSeconds']),tempfile.TemporaryDirectory(prefix='worldifact-') as temp:
            root=Path(temp);reference=root/'reference.png';mask=root/'mask.png'
            progress(stage)
            a=checked_image(store,j['reference'],reference);b=checked_image(store,j['mask'],mask,True)
            if a!=b:raise Rejected('MASK_DIMENSIONS_DIFFER')
            stage='RECONSTRUCTION';progress(stage)
            saved=set()
            raw_types={'decoder.npz':'application/octet-stream','original.glb':'model/gltf-binary','engine.json':'application/json'}
            def preserve(path):
                if path.name not in raw_types or path.resolve().parent != (root/'neural').resolve() or path.name in saved:
                    raise Rejected('INVALID_CHECKPOINT_PATH')
                if path.suffix=='.glb':validate_glb(path)
                checkpoint('raw/'+path.name,path,raw_types[path.name])
                saved.add(path.name)
            raw=engine(reference,mask,j,root/'neural',preserve)
            # The native engine checkpoints shape+PBR BEFORE costly export.
            if raw.get('geometryEngine')!='microsoft/TRELLIS.2-4B':raise Rejected('UNAPPROVED_GEOMETRY_ENGINE')
            if saved != set(raw_types):raise Rejected('RAW_OUTPUT_MISSING')
            stage='BLENDER';progress(stage)
            remaining=max(1,j['budget']['executionSeconds']-int(time.monotonic()-started))
            export_dir=root/'exports'
            required={'game.glb':'model/gltf-binary','source.blend':'application/octet-stream','qa.json':'application/json'}
            if durable_exports:
                required['qa.initial.json']='application/json'
                required['scene-report.json']='application/json'
            for view in ('front','three_quarter','side','back'):
                for kind in ('clay','pbr'):required[f'{kind}_{view}.png']='image/png'
            exported=set()
            def preserve_export(path):
                if (path.name not in required or path.is_symlink()
                        or path.resolve().parent!=export_dir.resolve() or path.name in exported
                        or not path.is_file()):
                    raise Rejected('INVALID_EXPORT_CHECKPOINT_PATH')
                if path.suffix=='.glb':validate_glb(path)
                if path.suffix=='.json':
                    if path.stat().st_size>262144:raise Rejected('QA_REPORT_TOO_LARGE')
                    report=json.loads(path.read_text())
                    if report.get('printReady') is not False or report.get('visualAccepted') is not False:
                        raise Rejected('FALSE_APPROVAL')
                    if durable_exports and report.get('supplierAccepted') is not False:
                        raise Rejected('FALSE_SUPPLIER_APPROVAL')
                checkpoint('outputs/'+path.name,path,required[path.name])
                exported.add(path.name)
            if durable_exports:
                # The native Blender wrapper acknowledges each completed file
                # only AFTER this callback has durably saved it and its receipt.
                profiles={'person':'halloween','robot':'robot'}
                if j['plan']['subject'] not in profiles:raise Rejected('INVALID_OWNER_EXPORT_PROFILE')
                postprocess(root/'neural'/'original.glb',export_dir,remaining,
                    preserve=preserve_export,profile=profiles[j['plan']['subject']])
            else:
                postprocess(root/'neural'/'original.glb',export_dir,remaining)
            for filename,mime in required.items():
                p=export_dir/filename
                if not p.is_file():raise Rejected('EXPORT_OR_RENDER_MISSING')
                if filename not in exported:
                    if durable_exports:raise Rejected('EXPORT_CHECKPOINT_NOT_ACKNOWLEDGED')
                    preserve_export(p)
            qa=json.loads((export_dir/'qa.json').read_text())
            if qa.get('printReady') is not False or qa.get('visualAccepted') is not False:raise Rejected('FALSE_APPROVAL')
            receipt={'revision':j['revision'],'jobId':j['jobId'],'fingerprint':fp,'state':'REVIEW_REQUIRED',
                'artifacts':artifacts,'referenceSha256':j['reference']['sha256'],
                'planner':j['planner'],'geometryEngine':raw['geometryEngine'],'postprocess':'Blender',
                'planReviewCriteria':j['plan'],'visualAccepted':False,'printReady':False,'supplierAccepted':False,
                'inferenceAttempts':1,'elapsedMs':round((time.monotonic()-started)*1000),
                'actualBilledMicroUsd':None,'costState':'PROVIDER_INVOICE_NOT_RECONCILED'}
    except Exception:
        # Store partial originals and a safe phase, never exception text, tokens or URLs.
        receipt={'revision':j['revision'],'jobId':j['jobId'],'fingerprint':fp,'state':'FAILED_RECONCILE',
            'failedStage':stage,'artifacts':artifacts,'visualAccepted':False,'printReady':False,
            'actualBilledMicroUsd':None,'automaticRetryAllowed':False}
    if durable_exports:receipt['checkpointProtocol']='immutable-artifact-receipts-v1'
    if not store.create_json(result_key,receipt):raise Rejected('RESULT_COMMIT_CONFLICT')
    return receipt

_ENGINE=None
_STORE=None

def handler(job):
    global _ENGINE,_STORE
    if os.environ.get('ENABLE_RUNPOD_WORKER')!='true':return {'error':'GPU_WORKER_DISABLED'}
    try:
        if _STORE is None:_STORE=S3Store.from_env()
        if _ENGINE is None:
            from engine import NativeEngine
            _ENGINE=NativeEngine()  # constructor does not allocate CUDA or download weights
        from engine import blender
        import runpod
        result=execute(job,_STORE,_ENGINE,blender,
            progress=lambda stage:runpod.serverless.progress_update(job,{'stage':stage}),enabled=True)
        if result['state']!='REVIEW_REQUIRED':return {'error':'PIPELINE_FAILED_RECONCILE','receipt':result}
        return result
    except Exception:return {'error':'PIPELINE_REJECTED_RECONCILE_NO_RETRY'}

if __name__=='__main__':
    import runpod
    runpod.serverless.start({'handler':handler})
