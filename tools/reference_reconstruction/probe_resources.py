"""Read-only official model/Space capability probe. Never uploads user images.
No authentication, POST, inference, hardware rental, quotas or production changes.
"""
from __future__ import annotations
import json, urllib.error, urllib.request
from pathlib import Path

TARGETS = {
 'weights':'https://huggingface.co/api/models/microsoft/TRELLIS.2-4B',
 'space':'https://huggingface.co/api/spaces/microsoft/TRELLIS.2',
 'config':'https://microsoft-trellis-2.hf.space/config',
 'api':'https://microsoft-trellis-2.hf.space/gradio_api/info',
}

def probe(fetch=None):
    result={'method':'GET_ONLY_OFFICIAL_PUBLIC_METADATA','imageUploaded':False,
      'inferenceStarted':False,'apiCostUsd':0,'observations':{}}
    for name,url in TARGETS.items():
        try:
            if fetch:
                status,data=fetch(url)
            else:
                req=urllib.request.Request(url,headers={'User-Agent':'WORLDIFACT-resource-audit/1'},method='GET')
                with urllib.request.urlopen(req,timeout=25) as r:
                    raw=r.read(4*1024*1024+1)
                    if len(raw)>4*1024*1024:raise ValueError('METADATA_TOO_LARGE')
                    status,data=r.status,json.loads(raw)
            if name=='weights':
                clean={k:data.get(k) for k in ('id','sha','gated','disabled')}
                clean['license']=data.get('cardData',{}).get('license')
            elif name=='space':
                clean={k:data.get(k) for k in ('id','sha','disabled')}
                clean['runtime']=data.get('runtime')
            elif name=='config':
                clean={'version':data.get('version'),'api_prefix':data.get('api_prefix'),
                  'auth_required':data.get('auth_required'),'enable_queue':data.get('enable_queue'),
                  'endpoints':[{'api_name':d.get('api_name'),'id':d.get('id')} for d in data.get('dependencies',[])]}
            else:
                clean={'named_endpoints':data.get('named_endpoints',{}),'unnamed_endpoints':data.get('unnamed_endpoints',{})}
            result['observations'][name]={'httpStatus':status,'data':clean}
        except urllib.error.HTTPError as e:
            result['observations'][name]={'httpStatus':e.code,'state':'PUBLIC_METADATA_UNAVAILABLE'}
        except Exception as e:
            result['observations'][name]={'state':'PROBE_FAILED','errorType':type(e).__name__}
    return result

if __name__=='__main__':
    out=Path('reconstruction-resource-evidence');out.mkdir(exist_ok=True)
    evidence=probe();(out/'public-capabilities.json').write_text(json.dumps(evidence,indent=2)+'\n')
    print(json.dumps(evidence))
