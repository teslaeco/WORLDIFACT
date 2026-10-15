"""One controlled transport repair, only after a proven ZERO-inference failure.
Official Gradio REST/SSE protocol; no threads, proxies, tokens, quota bypass or
paid upgrades. One original whole-object generation maximum; journal event IDs
before waiting. Never repeat a generation after a timeout or remote failure.
"""
from __future__ import annotations
import argparse,json,re,signal,time,urllib.request,urllib.parse,uuid
from pathlib import Path
from core import SOURCE_SHA,SPACE_ID,SPACE_REVISION,MAX_GLB,digest,inspect_glb,validate_job
from official_demo_once import Thumbnails,metadata
BASE='https://microsoft-trellis-2.hf.space'
PREFIX=BASE+'/gradio_api'
PREVIOUS_REPORT_SHA='a2f1a5a07c6ee1512adf53261837d679b095749d17000829edd9a286ac1eca88'

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):raise ValueError('UNEXPECTED_REMOTE_REDIRECT')
OPENER=urllib.request.build_opener(NoRedirect)

def request(url,data=None,content_type='application/json',limit=2*1024*1024):
    if urllib.parse.urlparse(url).netloc!='microsoft-trellis-2.hf.space':raise ValueError('UNAPPROVED_HOST')
    req=urllib.request.Request(url,data=data,headers={'Content-Type':content_type,'User-Agent':'WORLDIFACT-official-research/1'},method='POST' if data is not None else 'GET')
    with OPENER.open(req,timeout=30) as r:
        body=r.read(limit+1)
        if len(body)>limit:raise ValueError('RESPONSE_TOO_LARGE')
        return json.loads(body)

def call(name,data,session,seconds,journal):
    if name not in ('start_session','image_to_3d','extract_glb'):raise ValueError('UNAPPROVED_ENDPOINT')
    answer=request(PREFIX+'/call/'+name,json.dumps({'data':data,'session_hash':session}).encode())
    event=answer.get('event_id','')
    if not re.fullmatch('[a-f0-9]{32}',event):raise ValueError('MISSING_EVENT_ID')
    journal(name,event)
    start=time.monotonic();event_type='';payload=[];total=0
    req=urllib.request.Request(PREFIX+'/call/'+name+'/'+event,headers={'Accept':'text/event-stream'})
    with OPENER.open(req,timeout=30) as stream:
        while time.monotonic()-start<seconds:
            line=stream.readline(32*1024*1024+1);total+=len(line)
            if len(line)>32*1024*1024 or total>128*1024*1024:raise ValueError('SSE_SIZE_LIMIT')
            if not line:raise ValueError('SSE_ENDED_WITHOUT_RESULT')
            text=line.decode('utf-8').rstrip('\r\n')
            if text.startswith('event:'):event_type=text[6:].strip()
            elif text.startswith('data:'):payload.append(text[5:].lstrip())
            elif not text:
                if event_type=='complete':return json.loads('\n'.join(payload))
                if event_type=='error':raise RuntimeError('REMOTE_EVENT_ERROR:'+str(payload)[:400])
                event_type='';payload=[]
    raise TimeoutError('EVENT_RESULT_DEADLINE')

def run(previous_dir,out):
    report_path=previous_dir/'attempt.json'
    if digest(report_path)!=PREVIOUS_REPORT_SHA:raise ValueError('EXACT_PRIOR_FAILURE_REPORT_REQUIRED')
    prior=json.loads(report_path.read_text())
    if prior.get('generationRequestsAttempted')!=0 or prior.get('status')!='BLOCKED_NO_RETRY' or prior.get('reason')!='TimeoutError':raise ValueError('RETRY_OF_INFERENCE_FORBIDDEN')
    job=validate_job(prior['job']);image=previous_dir/'input.png'
    if digest(image)!=prior['input']['inputSha256'] or prior['sourceSha256']!=SOURCE_SHA:raise ValueError('PREPARED_ORIGINAL_IMAGE_CHANGED')
    out.mkdir(parents=True,exist_ok=False)
    report={'revision':'trellis2-bounded-rest-transport-repair-v1','previousReportSha256':PREVIOUS_REPORT_SHA,
      'sourceSha256':SOURCE_SHA,'inputSha256':digest(image),'job':job,'state':'PRECHECK',
      'geometryEngine':'microsoft/TRELLIS.2-4B','host':SPACE_ID,'astraGeneratedGeometry':False,
      'generationRequestsAttempted':0,'imageUploaded':False,'newOpenAIRequests':0,'paidVendorRequests':0,
      'visualAccepted':False,'printReady':False,'eventIds':{},'remoteWeightsHashVerified':False}
    def save():
        (out/'rest-attempt.json').write_text(json.dumps(report,indent=2)+'\n')
        print(json.dumps({'state':report['state'],'generationRequestsAttempted':report['generationRequestsAttempted']}),flush=True)
    def journal(name,event):report['eventIds'][name]=event;save()
    def deadline(*_):raise TimeoutError('TOTAL_540S_TRANSPORT_DEADLINE')
    prior_handler=signal.signal(signal.SIGALRM,deadline);signal.alarm(540)
    start=time.monotonic();save()
    try:
        observed=metadata('https://huggingface.co/api/spaces/'+SPACE_ID)
        if observed.get('sha')!=SPACE_REVISION or observed.get('runtime',{}).get('stage')!='RUNNING' or not str(observed['runtime'].get('hardware',{}).get('current','')).startswith('zero-'):
            raise ValueError('OFFICIAL_FREE_DEMO_CHANGED')
        session=uuid.uuid4().hex;report['sessionHash']=session;report['state']='SESSION_SETUP';save()
        call('start_session',[],session,45,journal)
        report['state']='SESSION_READY';save()
        boundary='worldifact'+uuid.uuid4().hex
        body=(f'--{boundary}\r\nContent-Disposition: form-data; name="files"; filename="ecomech.png"\r\nContent-Type: image/png\r\n\r\n'.encode()+image.read_bytes()+f'\r\n--{boundary}--\r\n'.encode())
        report['imageUploaded']=True;save()
        paths=request(PREFIX+'/upload',body,'multipart/form-data; boundary='+boundary)
        if not isinstance(paths,list) or len(paths)!=1 or not isinstance(paths[0],str):raise ValueError('UPLOAD_CONTRACT_CHANGED')
        file={'path':paths[0],'orig_name':'ecomech.png','mime_type':'image/png','meta':{'_type':'gradio.FileData'}}
        args=[file,job['seed'],str(job['resolution']),7.5,.7,12,5.,7.5,.5,12,3.,1.,0.,12,3.]
        report['state']='ONE_RECONSTRUCTION_SUBMIT';report['generationRequestsAttempted']=1;save()
        values=call('image_to_3d',args,session,240,journal)
        if isinstance(values,list):
            for value in values:
                if isinstance(value,str):Thumbnails(out/'provider_renders').feed(value)
        report['state']='RECONSTRUCTION_RETURNED_EXPORTING';save()
        values=call('extract_glb',[job['decimation_target'],job['texture_size']],session,200,journal)
        value=values[0] if isinstance(values,list) and values else None
        if not isinstance(value,dict) or not isinstance(value.get('url'),str):raise ValueError('ORIGINAL_GLB_URL_MISSING')
        url=value['url'];parts=urllib.parse.urlparse(url)
        if parts.scheme!='https' or parts.netloc!='microsoft-trellis-2.hf.space' or not parts.path.startswith('/gradio_api/file='):
            raise ValueError('UNAPPROVED_OUTPUT_URL')
        path=out/'ECOMECH_TRELLIS2_ORIGINAL_UNREVIEWED.glb';total=0
        with OPENER.open(url,timeout=30) as r,path.open('xb') as f:
            while True:
                chunk=r.read(1024*1024)
                if not chunk:break
                total+=len(chunk)
                if total>MAX_GLB:raise ValueError('GLB_DOWNLOAD_TOO_LARGE')
                f.write(chunk)
        report['glb']=inspect_glb(path);report['state']='ORIGINAL_GLB_RECEIVED_UNREVIEWED'
    except Exception as e:
        report['state']='BLOCKED_DO_NOT_RETRY';report['errorType']=type(e).__name__
        report['errorSummary']=str(e)[:500]
        report['remoteCompletion']='UNKNOWN_RECONCILE_EVENT_BEFORE_ANY_RETRY' if report['generationRequestsAttempted'] else 'GENERATION_NOT_SUBMITTED'
    finally:
        signal.alarm(0);signal.signal(signal.SIGALRM,prior_handler)
        report['elapsedSeconds']=round(time.monotonic()-start,2);save()
    return report
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--previous',type=Path,required=True);p.add_argument('--out',type=Path,required=True)
    a=p.parse_args();run(a.previous,a.out)
