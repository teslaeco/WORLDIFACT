"""One research request to the official Microsoft TRELLIS.2 free demo.
Not production infrastructure. Uses no HF/API key and never upgrades paid quota,
retries, calls BRIA, or substitutes a previous mesh. User image is temporarily
processed by the official Microsoft Hugging Face Space, not Tripo/Meshy APIs.
"""
from __future__ import annotations
import argparse,base64,json,os,re,shutil,time,urllib.request
from pathlib import Path
from html.parser import HTMLParser
from core import SOURCE_SHA,SPACE_ID,SPACE_REVISION,MODEL_ID,prepare_input,digest,inspect_glb,validate_job
os.environ['HF_HUB_DISABLE_IMPLICIT_TOKEN']='1'
os.environ['HF_HUB_DISABLE_TELEMETRY']='1'
os.environ['GRADIO_ANALYTICS_ENABLED']='False'

class Thumbnails(HTMLParser):
    def __init__(self,out):super().__init__();self.out=out
    def handle_starttag(self,tag,attrs):
        a=dict(attrs);ident=a.get('id','');src=a.get('src','')
        if tag=='img' and re.fullmatch(r'view-m[0-5]-s[0-7]',ident) and src.startswith('data:image/jpeg;base64,') and len(src)<4000000:
            self.out.mkdir(exist_ok=True)
            raw=base64.b64decode(src.split(',',1)[1],validate=True)
            if raw[:2]!=b'\xff\xd8':raise ValueError('INVALID_PROVIDER_PREVIEW')
            (self.out/(ident+'.jpg')).write_bytes(raw)

def metadata(url):
    with urllib.request.urlopen(url,timeout=20) as response:
        raw=response.read(1024*1024+1)
        if len(raw)>1024*1024:raise ValueError('METADATA_SIZE_LIMIT')
        return json.loads(raw)

def run(source,mask,job_path,out):
    job=validate_job(json.loads(job_path.read_text()))
    out.mkdir(parents=True,exist_ok=False)
    report={'revision':'trellis2-official-free-research-v1','sourceSha256':SOURCE_SHA,
      'geometryEngine':MODEL_ID,'host':'microsoft/TRELLIS.2 on Hugging Face ZeroGPU',
      'astraGeneratedGeometry':False,'newOpenAIRequests':0,'paidVendorRequests':0,
      'generationRequestsAttempted':0,'retryAllowed':False,'printReady':False,'visualAccepted':False,
      'runtimeWeightsHashVerified':False,'status':'PRECHECK','job':job}
    def checkpoint():
        (out/'attempt.json').write_text(json.dumps(report,indent=2)+'\n')
    checkpoint();client=None;pending=None;start=time.monotonic()
    try:
        meta=metadata('https://huggingface.co/api/spaces/'+SPACE_ID)
        if meta.get('sha')!=SPACE_REVISION or meta.get('runtime',{}).get('stage')!='RUNNING':
            raise ValueError('OFFICIAL_DEMO_REVISION_OR_AVAILABILITY_CHANGED')
        if not str(meta['runtime'].get('hardware',{}).get('current','')).startswith('zero-'):
            raise ValueError('OFFICIAL_FREE_ZERO_GPU_REQUIRED')
        report['spaceRevision']=meta['sha']
        prepared=out/'input.png';report['input']=prepare_input(source,mask,prepared,digest(mask))
        from gradio_client import Client,handle_file
        cache=out/'downloads'
        client=Client(SPACE_ID,token=None,verbose=False,max_workers=1,download_files=str(cache),
          httpx_kwargs={'timeout':30},analytics_enabled=False)
        endpoints=client.view_api(return_format='dict',print_info=False)['named_endpoints']
        if not all(k in endpoints for k in ('/start_session','/image_to_3d','/extract_glb')):
            raise ValueError('API_CONTRACT_CHANGED')
        client.submit(api_name='/start_session').result(timeout=30)
        report['status']='SUBMITTING_ONE_RECONSTRUCTION';report['generationRequestsAttempted']=1
        report['imageUploadedToOfficialSpace']=True;checkpoint()
        # Input is ALREADY alpha-composited locally. Do NOT call remote preprocess_image:
        # it uses a separate background-removal service when no alpha is present.
        pending=client.submit(handle_file(str(prepared)),seed=job['seed'],resolution=str(job['resolution']),
          ss_guidance_strength=7.5,ss_guidance_rescale=.7,ss_sampling_steps=12,ss_rescale_t=5.,
          shape_slat_guidance_strength=7.5,shape_slat_guidance_rescale=.5,shape_slat_sampling_steps=12,shape_slat_rescale_t=3.,
          tex_slat_guidance_strength=1.,tex_slat_guidance_rescale=0.,tex_slat_sampling_steps=12,tex_slat_rescale_t=3.,
          api_name='/image_to_3d')
        html=pending.result(timeout=240);pending=None
        if isinstance(html,(tuple,list)):html=html[-1]
        if isinstance(html,str):Thumbnails(out/'provider_renders').feed(html)
        report['status']='GEOMETRY_RETURNED_EXPORT_PENDING';checkpoint()
        pending=client.submit(decimation_target=job['decimation_target'],texture_size=job['texture_size'],api_name='/extract_glb')
        returned=pending.result(timeout=240);pending=None
        value=returned[0] if isinstance(returned,(list,tuple)) else returned
        original=Path(value if isinstance(value,str) else value['path']).resolve()
        if not original.is_relative_to(cache.resolve()) or not original.is_file():raise ValueError('UNEXPECTED_OUTPUT_LOCATION')
        report['glb']=inspect_glb(original)
        shutil.copyfile(original,out/'ECOMECH_TRELLIS2_ORIGINAL_UNREVIEWED.glb')
        report['status']='ORIGINAL_GLB_RECEIVED_REQUIRES_INDEPENDENT_REVIEW'
    except Exception as e:
        # Do not turn network/quotas into a cheaper unrelated geometry fallback.
        text=str(e)
        report['status']='BLOCKED_NO_RETRY'
        report['reason']='AUTH_OR_FREE_QUOTA' if any(s in text.lower() for s in ('quota','sign in','log in','token','unauth')) else type(e).__name__
        report['errorSummary']=text[:500].replace(str(source),'[source]').replace(str(out),'[output]')
        if pending is not None:
            report['remoteCompletion']='UNKNOWN_RECONCILE_BEFORE_RETRY'
            try:pending.cancel()
            except Exception:pass
    finally:
        if client:
            try:client.close()
            except Exception:pass
        report['elapsedSeconds']=round(time.monotonic()-start,2);checkpoint()
        print(json.dumps({k:report.get(k) for k in ('status','reason','generationRequestsAttempted','elapsedSeconds')}))
    return report
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--mask',type=Path,required=True)
    p.add_argument('--job',type=Path,required=True);p.add_argument('--out',type=Path,required=True)
    a=p.parse_args();run(a.source,a.mask,a.job,a.out)
