"""Private S3-compatible object storage. No customer URL, public ACL or secret logging.
The bucket must support strongly consistent conditional PutObject If-None-Match.
A network error or ambiguous conditional write is NOT retried automatically.
"""
from __future__ import annotations
import hashlib, json, os, re, struct
from urllib.parse import urlsplit
from contracts import Rejected
MAX_ARTIFACT=256*1024*1024
MAX_DECODER_ARTIFACT=1024*1024*1024
_DECODER_KEY=re.compile(r'jobs/[a-f0-9]{64}/[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}/raw/decoder\.npz')

def artifact_limit(key,path,mime):
    # The higher ceiling applies ONLY to the native decoder checkpoint. GLB,
    # Blender, images and reports retain the existing 256 MiB ceiling.
    if (isinstance(key,str) and _DECODER_KEY.fullmatch(key)
            and path.name=='decoder.npz' and mime=='application/octet-stream'):
        return MAX_DECODER_ARTIFACT
    return MAX_ARTIFACT

def digest(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
    return h.hexdigest()

class S3Store:
    def __init__(self, client, bucket):
        self.client,self.bucket=client,bucket
    @classmethod
    def from_env(cls):
        import boto3
        from botocore.config import Config
        endpoint=os.environ['ARTIFACT_S3_ENDPOINT']
        u=urlsplit(endpoint)
        # An operator-controlled TLS endpoint, never a request-supplied address.
        if u.scheme!='https' or not u.hostname or u.username or u.password or u.query or u.fragment or u.path not in ('','/'):
            raise Rejected('INVALID_STORAGE_ENDPOINT')
        bucket=os.environ['ARTIFACT_BUCKET']
        if not re.fullmatch(r'[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]',bucket):raise Rejected('INVALID_BUCKET')
        client=boto3.client('s3',endpoint_url=endpoint,region_name=os.environ.get('ARTIFACT_REGION','auto'),
          aws_access_key_id=os.environ['ARTIFACT_ACCESS_KEY_ID'],aws_secret_access_key=os.environ['ARTIFACT_SECRET_ACCESS_KEY'],
          config=Config(connect_timeout=10,read_timeout=30,retries={'total_max_attempts':1},s3={'addressing_style':'path'}))
        return cls(client,bucket)
    def read(self,key,limit):
        from botocore.exceptions import ClientError
        try:r=self.client.get_object(Bucket=self.bucket,Key=key)
        except ClientError as e:
            if e.response.get('Error',{}).get('Code') in ('NoSuchKey','404'):return None
            raise Rejected('STORAGE_READ_FAILED') from None
        body=r['Body']
        try:
            if r.get('ContentLength',0)>limit:raise Rejected('STORAGE_OBJECT_TOO_LARGE')
            data=body.read(limit+1)
            if len(data)>limit:raise Rejected('STORAGE_OBJECT_TOO_LARGE')
            return data
        finally:body.close()
    def create_json(self,key,value):
        from botocore.exceptions import ClientError
        raw=json.dumps(value,ensure_ascii=False,separators=(',',':')).encode()
        if len(raw)>262144:raise Rejected('RECEIPT_TOO_LARGE')
        try:self.client.put_object(Bucket=self.bucket,Key=key,Body=raw,ContentType='application/json',IfNoneMatch='*')
        except ClientError as e:
            if e.response.get('ResponseMetadata',{}).get('HTTPStatusCode')==412:return False
            raise Rejected('STORAGE_CLAIM_UNKNOWN') from None
        return True
    def put_file(self,key,path,mime):
        size=path.stat().st_size
        if not 1<=size<=artifact_limit(key,path,mime) or path.is_symlink() or not path.is_file():raise Rejected('INVALID_ARTIFACT')
        checksum=digest(path)
        with path.open('rb') as body:
            self.client.put_object(Bucket=self.bucket,Key=key,Body=body,ContentType=mime,
                Metadata={'sha256':checksum},IfNoneMatch='*')
        # A committed upload is acknowledged only after storage readback. An
        # ambiguous PUT or failed readback never causes a second write.
        head=self.client.head_object(Bucket=self.bucket,Key=key)
        if head.get('ContentLength')!=size or head.get('Metadata',{}).get('sha256')!=checksum:
            raise Rejected('ARTIFACT_READBACK_MISMATCH')
        return {'key':key,'bytes':size,'sha256':checksum,'mime':mime}


def validate_glb(path):
    """Require embedded glTF resources before any importer sees the model."""
    if not 28 <= path.stat().st_size <= MAX_ARTIFACT:raise Rejected('GLB_SIZE_LIMIT')
    raw=path.read_bytes()
    if struct.unpack_from('<III',raw)!=(0x46546c67,2,len(raw)):raise Rejected('INVALID_GLB')
    n,kind=struct.unpack_from('<II',raw,12)
    if n%4 or kind!=0x4e4f534a or n+28>len(raw):raise Rejected('INVALID_GLB_JSON')
    doc=json.loads(raw[20:20+n])
    if doc.get('asset',{}).get('version')!='2.0' or not doc.get('meshes'):raise Rejected('NO_GLTF_MESH')
    for entry in doc.get('buffers',[])+doc.get('images',[]):
        if 'uri' in entry and not entry['uri'].startswith('data:'):raise Rejected('EXTERNAL_GLTF_RESOURCE')
    return {'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw)}
