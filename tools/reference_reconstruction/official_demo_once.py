"""One bounded official Microsoft TRELLIS.2 research session, not production.
No paid service, auth token, hidden retry, CPU fallback or recycled output.
Run the CLI through its process supervisor so Gradio executor threads cannot
keep the runner alive after a terminal receipt or a timeout.
"""
from __future__ import annotations
import argparse,base64,json,os,re,shutil,time,urllib.request
from pathlib import Path
from html.parser import HTMLParser
from core import SOURCE_SHA,SPACE_ID,SPACE_REVISION,MODEL_ID,prepare_input,digest,inspect_glb,validate_job
os.environ['HF_HUB_DISABLE_IMPLICIT_TOKEN']='1'
os.environ['HF_HUB_DISABLE_TELEMETRY']='1'
os.environ['GRADIO_ANALYTICS_ENABLED']='False'
# gradio_client 2.0.3 shares an executor between a prediction and SSE helpers.
# max_workers=1 can starve those helpers. Calls remain strictly sequential:
# extra transport threads do NOT permit additional inference requests.
TRANSPORT_WORKERS=8
SESSION_TIMEOUT=45
GENERATION_TIMEOUT=240
EXPORT_TIMEOUT=240
TERMINAL={'BLOCKED_NO_RETRY','ORIGINAL_GLB_RECEIVED_REQUIRES_INDEPENDENT_REVIEW'}

def write_receipt(out,report):
    temp=out/'attempt.json.tmp'
    with temp.open('w',encoding='utf-8') as f:
        json.dump(report,f,indent=2);f.write('\n');f.flush();os.fsync(f.fileno())
    os.replace(temp,out/'attempt.json')
    print(json.dumps({'phase':report.get('phase'),'status':report.get('status'),
      'generationRequestsAttempted':report.get('generationRequestsAttempted',0),
      'exportRequestsAttempted':report.get('exportRequestsAttempted',0)}),flush=True)

class Thumbnails(HTMLParser):
    def __init__(self,out):super().__init__();self.out=out;self.total=0
    def handle_starttag(self,tag,attrs):
        a=dict(attrs);ident=a.get('id','');src=a.get('src','')
        if tag=='img' and re.fullmatch(r'view-m[0-5]-s[0-7]',ident) and src.startswith('data:image/jpeg;base64,') and len(src)<4000000:
            raw=base64.b64decode(src.split(',',1)[1],validate=True)
            self.total+=len(raw)
            if self.total>80*1024*1024 or raw[:2]!=b'\xff\xd8':raise ValueError('INVALID_OR_OVERSIZED_PROVIDER_PREVIEWS')
            self.out.mkdir(exist_ok=True);(self.out/(ident+'.jpg')).write_bytes(raw)

def metadata(url):
    with urllib.request.urlopen(url,timeout=20) as response:
        raw=response.read(1024*1024+1)
        if len(raw)>1024*1024:raise ValueError('METADATA_SIZE_LIMIT')
        return json.loads(raw)

def session_steps(client,prepared,job,out,report,checkpoint,file_wrapper):
    """Exactly one session, then at most one generation and one export.
    Transport capacity is independent of sequential business-request limits.
    A timeout after submit is an uncertain remote outcome, never permission to retry.
    """
    pending=None
    try:
        report['phase']='SESSION_START';checkpoint()
        pending=client.submit(api_name='/start_session')
        pending.result(timeout=SESSION_TIMEOUT);pending=None
        report['sessionInitialized']=True;report['phase']='GENERATION_SUBMIT'
        report['generationRequestsAttempted']=1
        report['imageUploadAttempted']=True
        report['remoteGenerationCompletion']='UNKNOWN'
        checkpoint() # durable claim BEFORE any upload or inference request
        pending=client.submit(file_wrapper(str(prepared)),seed=job['seed'],resolution=str(job['resolution']),
          ss_guidance_strength=7.5,ss_guidance_rescale=.7,ss_sampling_steps=12,ss_rescale_t=5.,
          shape_slat_guidance_strength=7.5,shape_slat_guidance_rescale=.5,shape_slat_sampling_steps=12,shape_slat_rescale_t=3.,
          tex_slat_guidance_strength=1.,tex_slat_guidance_rescale=0.,tex_slat_sampling_steps=12,tex_slat_rescale_t=3.,
          api_name='/image_to_3d')
        html=pending.result(timeout=GENERATION_TIMEOUT);pending=None
        report['remoteGenerationCompletion']='RETURNED'
        report['phase']='GENERATION_RETURNED';checkpoint()
        if isinstance(html,(tuple,list)):html=html[-1]
        if isinstance(html,str):Thumbnails(out/'provider_renders').feed(html)
        report['phase']='EXPORT_SUBMIT';report['exportRequestsAttempted']=1;checkpoint()
        pending=client.submit(decimation_target=job['decimation_target'],texture_size=job['texture_size'],api_name='/extract_glb')
        result=pending.result(timeout=EXPORT_TIMEOUT);pending=None
        report['phase']='EXPORT_RETURNED';checkpoint()
        return result
    except Exception:
        report['failedPhase']=report.get('phase')
        report['remoteGenerationCompletion']='NOT_SUBMITTED' if not report.get('generationRequestsAttempted') else report.get('remoteGenerationCompletion','UNKNOWN')
        report['reconcileBeforeAnyNewAttempt']=bool(report.get('generationRequestsAttempted'))
        # The parent must see failure before cleanup can block.
        report['status']='BLOCKED_NO_RETRY';checkpoint()
        if pending is not None:
            try:pending.cancel()
            except Exception:pass
        raise

def run(source,mask,job_path,out):
    job=validate_job(json.loads(job_path.read_text()))
    out.mkdir(parents=True,exist_ok=False)
    report={'revision':'trellis2-official-free-research-v2','sourceSha256':SOURCE_SHA,
      'geometryEngine':MODEL_ID,'host':'microsoft/TRELLIS.2 on Hugging Face ZeroGPU',
      'astraGeneratedGeometry':False,'newOpenAIRequests':0,'paidVendorRequests':0,
      'generationRequestsAttempted':0,'exportRequestsAttempted':0,'retryAllowed':False,
      'printReady':False,'visualAccepted':False,'runtimeWeightsHashVerified':False,
      'transportWorkers':TRANSPORT_WORKERS,'maxConcurrentBusinessRequests':1,
      'imageUploadAttempted':False,'remoteGenerationCompletion':'NOT_SUBMITTED',
      'phase':'PRECHECK','status':'RUNNING','job':job}
    checkpoint=lambda:write_receipt(out,report)
    checkpoint();client=None;start=time.monotonic()
    try:
        meta=metadata('https://huggingface.co/api/spaces/'+SPACE_ID)
        if meta.get('sha')!=SPACE_REVISION or meta.get('runtime',{}).get('stage')!='RUNNING':
            raise ValueError('OFFICIAL_DEMO_REVISION_OR_AVAILABILITY_CHANGED')
        if not str(meta['runtime'].get('hardware',{}).get('current','')).startswith('zero-'):
            raise ValueError('OFFICIAL_FREE_ZERO_GPU_REQUIRED')
        report['spaceRevision']=meta['sha']
        prepared=out/'input.png';report['input']=prepare_input(source,mask,prepared,digest(mask))
        report['phase']='CLIENT_CONNECT';checkpoint()
        from gradio_client import Client,handle_file
        cache=out/'downloads'
        client=Client(SPACE_ID,token=False,verbose=False,max_workers=TRANSPORT_WORKERS,
          download_files=str(cache),httpx_kwargs={'timeout':30},analytics_enabled=False)
        endpoints=client.view_api(return_format='dict',print_info=False)['named_endpoints']
        if not all(k in endpoints for k in ('/start_session','/image_to_3d','/extract_glb')):
            raise ValueError('API_CONTRACT_CHANGED')
        returned=session_steps(client,prepared,job,out,report,checkpoint,handle_file)
        value=returned[0] if isinstance(returned,(list,tuple)) else returned
        original=Path(value if isinstance(value,str) else value['path']).resolve()
        if not original.is_relative_to(cache.resolve()) or not original.is_file():raise ValueError('UNEXPECTED_OUTPUT_LOCATION')
        report['phase']='VERIFY_ORIGINAL_GLB';checkpoint()
        report['glb']=inspect_glb(original)
        shutil.copyfile(original,out/'ECOMECH_TRELLIS2_ORIGINAL_UNREVIEWED.glb')
        report['status']='ORIGINAL_GLB_RECEIVED_REQUIRES_INDEPENDENT_REVIEW'
    except Exception as e:
        text=str(e).lower()
        report['status']='BLOCKED_NO_RETRY';report['errorType']=type(e).__name__
        report['reason']='AUTH_OR_FREE_QUOTA' if any(s in text for s in ('quota','sign in','log in','unauth','credit')) else type(e).__name__
        report['failedPhase']=report.get('failedPhase',report.get('phase'))
        # Never store potentially sensitive provider exception text or session IDs.
    finally:
        report['elapsedSeconds']=round(time.monotonic()-start,2);checkpoint()
        if client:
            try:client.close()
            except Exception:pass
    return report

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--mask',type=Path,required=True)
    p.add_argument('--job',type=Path,required=True);p.add_argument('--out',type=Path,required=True)
    p.add_argument('--worker',action='store_true',help=argparse.SUPPRESS)
    a=p.parse_args()
    if a.worker:
        result=run(a.source,a.mask,a.job,a.out)
        raise SystemExit(0 if result['status']=='ORIGINAL_GLB_RECEIVED_REQUIRES_INDEPENDENT_REVIEW' else 2)
    from bounded_worker import supervise
    import sys
    command=[sys.executable,str(Path(__file__).resolve()),'--worker','--source',str(a.source),
      '--mask',str(a.mask),'--job',str(a.job),'--out',str(a.out)]
    raise SystemExit(supervise(command,a.out/'attempt.json',a.out.parent/(a.out.name+'-supervisor.json'),total_seconds=570))
