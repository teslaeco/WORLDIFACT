"""Validate PRIVATE owner-supplied 3D reference packs; zero provider calls.
These packs are source inputs, NOT generated GLB models. Never upload PNGs to Git.
"""
import hashlib,json,re,stat,struct,sys,zlib
from pathlib import Path
from zipfile import ZipFile,BadZipFile

CORE={'reference.png','mask_candidate_REVIEW_REQUIRED.png','manifest.json','PROMPT.md','ACCEPTANCE.md','README.md'}
class Refusal(ValueError):pass
def need(cond,code):
    if not cond:raise Refusal(code)
def png_size(raw):
    need(len(raw)>=33 and raw[:16]==b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR','INVALID_PNG')
    need(zlib.crc32(raw[12:29])==struct.unpack('>I',raw[29:33])[0],'BAD_PNG_IHDR_CHECKSUM')
    w,h=struct.unpack('>II',raw[16:24])
    need(32<=w<=4096 and 32<=h<=4096 and w*h<=16000000,'PNG_SIZE_LIMIT')
    return w,h
def verify(path):
    need(path.is_file() and path.stat().st_size<=32*1024*1024,'PACK_SIZE_LIMIT')
    try:
        with ZipFile(path) as z:
            entries=z.infolist();names=[e.filename for e in entries]
            need(len(names)==len(set(names)) and set(names) in (CORE,CORE|{'qa_board.png'}),'INVALID_ENTRIES')
            need(all(e.file_size<=12*1024*1024 and not e.is_dir() and not stat.S_ISLNK(e.external_attr>>16) for e in entries),'UNSAFE_ENTRIES')
            need(sum(e.file_size for e in entries)<=32*1024*1024 and z.testzip() is None,'ZIP_INTEGRITY_FAILED')
            manifest=json.loads(z.read('manifest.json'))
            need(isinstance(manifest,dict) and manifest.get('schemaVersion')=='worldifact-reference-trial-v1','BAD_MANIFEST')
            trial=manifest.get('trialId')
            need(isinstance(trial,str) and re.fullmatch('[a-z0-9-]{3,64}',trial),'BAD_TRIAL_ID')
            need(manifest.get('inputPrivacy')=='PRIVATE_OWNER_HANDOFF_NOT_PUBLIC_GITHUB','PRIVATE_INPUT_REQUIRED')
            need(manifest.get('status')=='SOURCE_PACK_READY_MODEL_NOT_GENERATED','FALSE_LIVE_STATUS')
            need(manifest.get('assetType') in ('SINGLE_CHARACTER_WITH_PROP','MULTI_ASSET_SCENE'),'BAD_SCENE_TYPE')
            need(all(manifest.get(n) is False for n in ('modelGenerated','astraProviderCallExecuted','runpodGpuCallExecuted','maskCandidateReviewed')),'FALSE_MODEL_OR_MASK_CLAIM')
            need(manifest.get('model3dDownloadUrl') is None and manifest.get('runpodJobId') is None and manifest.get('runpodSpendUsd')==0,'FALSE_RESULT')
            if manifest.get('assetType')=='MULTI_ASSET_SCENE':
                need('MULTI_ASSET_SCENE_PIPELINE_REQUIRED' in manifest.get('blocks',[]),'MULTIASSET_NOT_SUPPORTED')
            media=manifest.get('files')
            need(isinstance(media,dict) and set(media)==set(names)-{'manifest.json','PROMPT.md','ACCEPTANCE.md','README.md'},'INVALID_MEDIA_LIST')
            for name,meta in media.items():
                raw=z.read(name)
                need(isinstance(meta,dict) and meta.get('mime')=='image/png' and meta.get('bytes')==len(raw),'WRONG_MEDIA_TYPE')
                need(meta.get('sha256')==hashlib.sha256(raw).hexdigest(),'WRONG_SOURCE_HASH')
                need((meta.get('width'),meta.get('height'))==png_size(raw),'WRONG_PNG_DIMENSIONS')
            a,b=media['reference.png'],media['mask_candidate_REVIEW_REQUIRED.png']
            need((a['width'],a['height'])==(b['width'],b['height']),'MASK_SIZE_MISMATCH')
            need(len(z.read('PROMPT.md'))>400 and len(z.read('ACCEPTANCE.md'))>200,'MISSING_ACCEPTANCE_CRITERIA')
            return {'verified':True,'trialId':trial,'status':'SOURCE_ONLY_NOT_GENERATED','providerCalls':0,'costUsd':0}
    except (BadZipFile,ValueError,UnicodeDecodeError,KeyError,TypeError,OSError,struct.error) as e:
        if isinstance(e,Refusal):raise
        raise Refusal('INVALID_PRIVATE_PACK') from None
def main():
    if len(sys.argv)!=2:print('USAGE: python scripts/verify-reference-trial-pack.py <owner-private.zip>');return 2
    try: result=verify(Path(sys.argv[1]))
    except Refusal as e:result={'verified':False,'reason':str(e),'providerCalls':0,'costUsd':0}
    print(json.dumps(result,sort_keys=True))
    return 0 if result['verified'] else 2
if __name__=='__main__':sys.exit(main())
