"""Recover exactly the two approved V3 jobs. R2 reads only, encrypted delivery."""
from __future__ import annotations
import hashlib, json, os, re, struct
from pathlib import Path
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

SCOPE='7995e5146670062672b65386bfcefab8278072cf2ba3bad2dd8b5f342660075f'
JOBS={'ECOMECH_V4':'3b3b9cc5-8f43-4e48-bf56-ce2d3e2390c1','HALLOWEEN_MUSIC_ROOM':'af2fc596-68c7-44a7-a8a8-7e8d4fd2b7e8'}
MAX_FILE=400_000_000
ROOT=Path('owner-recovery-private')
OUT=Path('owner-recovery-sealed')

class RecoveryRefused(ValueError):
    """Only fixed, non-sensitive codes raised by this script."""

def require(ok,code):
    if not ok: raise RecoveryRefused(code)

def validate_spec(spec):
    require(set(spec)=={'name','key','bytes','sha256'},'INVALID_SPEC_FIELDS')
    require(re.fullmatch(r'(ECOMECH_V4|HALLOWEEN_MUSIC_ROOM)/(raw|outputs|source)/[a-zA-Z0-9_.-]+',spec['name']) is not None,'INVALID_FILE_NAME')
    name=spec['name'].split('/')[0]; rel=spec['name'].split('/',1)[1]
    if rel.startswith('source/'): rel=rel[7:]
    require(spec['key']==f'jobs/{SCOPE}/{JOBS[name]}/{rel}','SOURCE_SCOPE_CHANGED')
    require(type(spec['bytes']) is int and 0<spec['bytes']<=MAX_FILE,'INVALID_FILE_SIZE')
    require(re.fullmatch(r'[a-f0-9]{64}',spec['sha256']) is not None,'INVALID_SOURCE_HASH')

def source_specs():
    table=json.loads(Path('ops/OWNER_RECOVERY_SOURCES_20261017.json').read_text())
    require(set(table)==set(JOBS),'FIXED_MODELS_REQUIRED')
    specs=[{'name':name+'/'+rel,'key':f'jobs/{SCOPE}/{JOBS[name]}/'+(rel[7:] if rel.startswith('source/') else rel),'bytes':value[0],'sha256':value[1]} for name,items in table.items() for rel,value in items.items()]
    require(len(specs)==23 and len({s['key'] for s in specs})==23,'FIXED_SOURCE_SET_REQUIRED')
    for spec in specs:validate_spec(spec)
    return specs

def checked_download(client,bucket,spec,target):
    validate_spec(spec)
    require(not target.exists() and not target.is_symlink(),'OUTPUT_EXISTS')
    response=client.get_object(Bucket=bucket,Key=spec['key'])
    body=response['Body'];count=0;digest=hashlib.sha256()
    try:
        require(response['ContentLength']==spec['bytes'],'SOURCE_LENGTH_CHANGED')
        target.parent.mkdir(parents=True,exist_ok=True)
        with target.open('xb') as output:
            while True:
                chunk=body.read(min(1048576,spec['bytes']-count+1))
                if not chunk:break
                count+=len(chunk);require(count<=spec['bytes'],'SOURCE_TOO_LARGE')
                digest.update(chunk);output.write(chunk)
            output.flush();os.fsync(output.fileno())
        require(count==spec['bytes'] and digest.hexdigest()==spec['sha256'],'SOURCE_BYTES_CHANGED')
    except BaseException:
        target.unlink(missing_ok=True);raise
    finally:body.close()

def seal_file(path,name,key,out):
    require(not path.is_symlink() and path.is_file(),'INVALID_LOCAL_SOURCE')
    require(re.fullmatch(r'[A-Za-z0-9_./-]+',name) and '..' not in name.split('/') and not name.startswith('/'),'INVALID_SEALED_NAME')
    nonce=os.urandom(12);aes=os.urandom(32)
    header={'format':'WORLDIFACT_PRIVATE_FILE_V1','name':name,'bytes':path.stat().st_size,'nonce':nonce.hex(),
      'wrappedKey':key.encrypt(aes,padding.OAEP(mgf=padding.MGF1(hashes.SHA256()),algorithm=hashes.SHA256(),label=b'WORLDIFACT_PRIVATE_FILE_V1')).hex()}
    aad=json.dumps(header,sort_keys=True,separators=(',',':')).encode()
    encrypted=Cipher(algorithms.AES(aes),modes.GCM(nonce)).encryptor();encrypted.authenticate_additional_data(aad)
    destination=out/(name.replace('/','__')+'.sealed');destination.parent.mkdir(parents=True,exist_ok=True)
    checksum=hashlib.sha256()
    with path.open('rb') as source,destination.open('xb') as target:
        target.write(struct.pack('>I',len(aad)));target.write(aad)
        for chunk in iter(lambda:source.read(1048576),b''):
            checksum.update(chunk);target.write(encrypted.update(chunk))
        target.write(encrypted.finalize());target.write(encrypted.tag)
    return {'name':name,'bytes':path.stat().st_size,'sha256':checksum.hexdigest(),'sealed':destination.name}

def reject_external_glb(path):
    with path.open('rb') as f:
        header=f.read(20)
        require(len(header)==20 and header[:4]==b'glTF','INVALID_GLB_HEADER')
        _,version,size,jsize,jtype=struct.unpack('<4sIIII',header)
        require(version==2 and size==path.stat().st_size and jtype==0x4E4F534A and jsize<4_000_000,'INVALID_GLB_STRUCTURE')
        data=json.loads(f.read(jsize))
    for value in data.get('buffers',[])+data.get('images',[]):
        require('uri' not in value,'EXTERNAL_GLB_RESOURCE')

def main():
    require(os.getenv('GITHUB_REPOSITORY')=='teslaeco/WORLDIFACT' and os.getenv('GITHUB_REF')=='refs/heads/main' and os.getenv('GITHUB_RUN_ATTEMPT')=='1','TRUSTED_MAIN_REQUIRED')
    endpoint=os.environ['ARTIFACT_S3_ENDPOINT'];bucket=os.environ['ARTIFACT_BUCKET']
    require(endpoint.rstrip('/')=='https://44c5391a2e203041d393e4be4e760fd1.r2.cloudflarestorage.com' and bucket=='worldifact-artifacts','STORAGE_DESTINATION_CHANGED')
    key=serialization.load_pem_public_key(Path('ops/OWNER_RECOVERY_PUBLIC_20261017.pem').read_bytes())
    require(isinstance(key,rsa.RSAPublicKey) and key.key_size==3072,'INVALID_RECIPIENT')
    specs=source_specs()
    import boto3
    from botocore.config import Config
    client=boto3.client('s3',endpoint_url=endpoint,region_name='auto',aws_access_key_id=os.environ['ARTIFACT_ACCESS_KEY_ID'],aws_secret_access_key=os.environ['ARTIFACT_SECRET_ACCESS_KEY'],config=Config(signature_version='s3v4',connect_timeout=10,read_timeout=90,retries={'total_max_attempts':1},s3={'addressing_style':'path'}))
    ROOT.mkdir(mode=0o700,exist_ok=False);OUT.mkdir(mode=0o700,exist_ok=False)
    receipts=[]
    for spec in specs:
        path=ROOT/spec['name'];checked_download(client,bucket,spec,path)
        if path.suffix=='.glb':reject_external_glb(path)
        receipts.append(seal_file(path,spec['name'],key,OUT))
        (OUT/'manifest.json').write_text(json.dumps({'files':receipts,'sourceFilesVerified':len(receipts),'gpuRequests':0},indent=2)+'\n')
        print(json.dumps({'status':'SOURCE_VERIFIED_AND_SEALED','name':spec['name'],'bytes':spec['bytes']}),flush=True)
    print(json.dumps({'status':'EXACT_V3_SOURCES_RECOVERED','files':len(receipts),'bytes':sum(x['bytes'] for x in receipts),'gpuRequests':0,'storageWrites':0}))

if __name__=='__main__':
    try:main()
    except Exception as e:
        print(json.dumps({'status':'SOURCE_RECOVERY_FAILED','errorClass':type(e).__name__,'reason':str(e) if type(e) is RecoveryRefused else 'UNEXPECTED_RUNTIME_FAILURE'}))
        raise SystemExit(2) from None
