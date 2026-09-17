"""Continue the already approved one-FAST-test/USD5 task from Cloud Shell.

Default is plan-only. --approve-service-restart applies the narrow cost guard
with the existing reviewed restart/rollback launcher, then activates ONE attempt.
No model is generated. Repeating observes the same update and activation.
"""
import base64
import hashlib
import json
import sys
import urllib.request

SOURCE = '849643ec0eaf358a887698ea96646489a013e598'
PACKAGES = {
    'install_v33.py': ('install_spend.py', '3fd8aea09aa8f456c076a05bab87f7f4b1b69598'),
    'fast_spend.py': ('fast_spend.py', '11cec88990ff724b59d8ed6fefa159f02ce93ccc'),
}
BASE_SOURCE = 'cd0ff1ddded5f5590cea4ac8163bbb530e41a02c'
BASE_SHA256 = '64023092e7ef4192ba21a82332ec044999e38640ae8f58e39d3757ba5db8687a'
ACTIVATE = r'''
import json,sys,urllib.request
from pathlib import Path
try:
    path=Path.home()/'froge-connector/state/config.json'
    if path.is_symlink() or path.stat().st_size>16384:raise ValueError('Invalid config')
    token=json.loads(path.read_text()).get('token')
    if not isinstance(token,str) or not 32<=len(token)<=256:raise ValueError('Missing local authorization')
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self,*args,**kwargs):return None
    opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),NoRedirect())
    request=urllib.request.Request('https://worldifact.xodobrox.workers.dev/api/studio/approved-test/activate',
        data=b'{"approval":"fast-test-20260917-usd5"}',
        headers={'Origin':'https://worldifact.xodobrox.workers.dev','Content-Type':'application/json','X-WORLDIFACT-Owner':token})
    with opener.open(request,timeout=45) as response:
        raw=response.read(4097)
        if len(raw)>4096:raise ValueError('Oversized response')
        body=json.loads(raw)
    if body.get('activated') is not True or body.get('limit')!=7 or body.get('used') not in (6,7) or body.get('remaining')!=7-body['used'] or body.get('paidGenerationRequested') is not False:
        raise ValueError('Activation not verified')
    print(json.dumps({'phase':'APPROVED_FAST_TEST_READY' if body['remaining']==1 else 'APPROVED_TEST_ALREADY_RESERVED',
        'ready':body['remaining']==1,'remaining':body['remaining'],'used':body['used'],
        'expiresAt':body.get('expiresAt'),'model_generation_requested':False}))
except Exception:
    print(json.dumps({'phase':'ACTIVATION_NOT_CONFIRMED','model_generation_requested':False,
        'message':'Keep the update record. Repeating the same approved command checks the update and retries only this idempotent activation; it does not generate a model.'}))
    sys.exit(1)
'''

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):return None

def read_public(commit, name):
    url='https://raw.githubusercontent.com/teslaeco/WORLDIFACT/'+commit+'/tools/fast_preview/'+name
    with urllib.request.build_opener(NoRedirect()).open(url,timeout=45) as response:
        raw=response.read(262145)
    if len(raw)>262144:raise ValueError('Oversized reviewed source')
    return raw

def main():
    if '--approve-service-restart' not in sys.argv and '--status' not in sys.argv:
        print('PLAN ONLY. One approved FAST trial, USD4 conservative provider guard inside USD5 approval. No connection or change.');return
    raw=read_public(BASE_SOURCE,'oracle_launch.py')
    if hashlib.sha256(raw).hexdigest()!=BASE_SHA256:raise ValueError('Reviewed launcher checksum failed')
    namespace={'__name__':'reviewed_budget_launcher','__file__':'reviewed-oracle-launch.py'}
    exec(compile(raw,'reviewed-oracle-launch.py','exec'),namespace)
    encoded={};checksums={}
    for target,(source,expected) in PACKAGES.items():
        code=read_public(SOURCE,source)
        digest=hashlib.sha1(b'blob '+str(len(code)).encode()+b'\0'+code).hexdigest()
        if digest!=expected:raise ValueError('Pinned cost-guard source mismatch')
        compile(code,source,'exec')
        encoded[target]=base64.b64encode(code).decode('ascii');checksums[target]=hashlib.sha256(code).hexdigest()
    namespace['SOURCE']=SOURCE
    namespace['FILES']=checksums
    namespace['package']=lambda:encoded
    print('Checking the recorded cost-guard update; existing models and job data are not uploaded.',flush=True)
    namespace['main']()
    if '--approve-service-restart' not in sys.argv:return
    ssh=namespace['connection']()
    current=namespace['probe'](ssh,'status',{})
    if current.get('phase')!='INSTALLED_AND_LOCALLY_VERIFIED':
        print('Cost guard is not ready. No paid trial activation attempted.');return
    print('Activating the existing approval: original counter 6 -> maximum 7, FAST only. No model is started.',flush=True)
    output=namespace['invoke'](ssh,data=ACTIVATE,timeout=100)
    value=json.loads(output)
    if value.get('phase') not in ('APPROVED_FAST_TEST_READY','APPROVED_TEST_ALREADY_RESERVED') or value.get('model_generation_requested') is not False:
        raise ValueError('Activation response not verified')
    print(json.dumps(value,indent=2))
    if value.get('ready'):
        print('READY: return to WORLDIFACT Shop, keep the existing model receipt, select FAST and use Check connection. One Generate click uses this single approved attempt.')
    else:print('The approved attempt is already reserved. Recover its existing job; do not create another test.')

if __name__=='__main__':
    try:main()
    except Exception:
        print('STOP: update or activation not confirmed. Keep this same command and recorded workspace; do not share keys or restart the full installer.',file=sys.stderr)
        sys.exit(1)
