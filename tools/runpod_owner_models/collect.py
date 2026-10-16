"""Encrypt narrowly scoped, short-lived downloads of the two fixed job results."""
import base64
import hashlib
import json
import os
from pathlib import Path
import sys
import time
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'runpod_worker'))
from storage import S3Store
from cryptography.hazmat.primitives import hashes,serialization
from cryptography.hazmat.primitives.asymmetric import padding,rsa
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

AAD=b'WORLDIFACT-private-owner-results-v1'
ALLOWED={'raw/decoder.npz','raw/original.glb','raw/engine.json',
         'outputs/game.glb','outputs/source.blend','outputs/qa.json'}
ALLOWED.update('outputs/'+kind+'_'+view+'.png'
               for kind in ('clay','pbr') for view in ('front','three_quarter','side','back'))


def check_artifact(artifact,prefix):
    if (not artifact['key'].startswith(prefix) or artifact['key'][len(prefix):] not in ALLOWED
            or type(artifact['bytes']) is not int or not 1<=artifact['bytes']<=256*1024*1024
            or len(artifact['sha256'])!=64 or any(c not in '0123456789abcdef' for c in artifact['sha256'])):
        raise ValueError('UNAPPROVED_OUTPUT_OBJECT')


def collect(store,cfg,public_key):
    models=[];downloads=[]
    for job in cfg['jobs']:
        prefix=f"jobs/{job['scope']}/{job['jobId']}/"
        raw=store.read(prefix+'result.json',262144)
        receipt=json.loads(raw) if raw else None
        if receipt:
            assert receipt['jobId']==job['jobId'] and len(receipt.get('artifacts',[]))<=14
            for artifact in receipt.get('artifacts',[]):
                check_artifact(artifact,prefix)
                head=store.client.head_object(Bucket=store.bucket,Key=artifact['key'])
                assert head['ContentLength']==artifact['bytes'] and head.get('Metadata',{}).get('sha256')==artifact['sha256']
                downloads.append({**artifact,'name':job['name']+'/'+artifact['key'][len(prefix):],
                    'url':store.client.generate_presigned_url('get_object',Params={
                        'Bucket':store.bucket,'Key':artifact['key']},ExpiresIn=3600,HttpMethod='GET')})
        models.append({'name':job['name'],'jobId':job['jobId'],'receipt':receipt})
    plain=json.dumps({'batch':cfg['id'],'expiresAt':int(time.time())+3600,
                       'models':models,'downloads':downloads},separators=(',',':')).encode()
    key=serialization.load_pem_public_key(public_key.encode())
    assert isinstance(key,rsa.RSAPublicKey) and key.key_size>=3072
    symmetric=AESGCM.generate_key(bit_length=256);nonce=os.urandom(12)
    wrapped=key.encrypt(symmetric,padding.OAEP(mgf=padding.MGF1(hashes.SHA256()),algorithm=hashes.SHA256(),label=AAD))
    enc=lambda x:base64.b64encode(x).decode()
    return {'version':1,'key':enc(wrapped),'nonce':enc(nonce),
            'ciphertext':enc(AESGCM(symmetric).encrypt(nonce,plain,AAD))},len(downloads)


if __name__=='__main__':
    try:
        cfg=json.loads(Path('ops/RUNPOD_OWNER_MODEL_JOBS_20261016.json').read_text())
        key=json.loads(Path('ops/RUNPOD_OWNER_REFERENCES_20261016.json').read_text())['publicKeyPem']
        import boto3
        from botocore.config import Config
        store=S3Store.from_env()
        store.client=boto3.client('s3',endpoint_url=os.environ['ARTIFACT_S3_ENDPOINT'],region_name='auto',
            aws_access_key_id=os.environ['ARTIFACT_ACCESS_KEY_ID'],
            aws_secret_access_key=os.environ['ARTIFACT_SECRET_ACCESS_KEY'],
            config=Config(signature_version='s3v4',retries={'total_max_attempts':1},
                          connect_timeout=10,read_timeout=30,s3={'addressing_style':'path'}))
        packet,count=collect(store,cfg,key)
        Path('owner-model-results.sealed.json').write_text(json.dumps(packet)+'\n')
        print(json.dumps({'status':'PRIVATE_RESULT_PACKET_READY','artifactCount':count}))
    except Exception as error:
        print('PRIVATE_COLLECTION_FAILED:'+type(error).__name__,file=sys.stderr);sys.exit(1)
