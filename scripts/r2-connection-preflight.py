"""RunPod and Cloudflare R2 one-use trusted-main probe. No customer objects."""
import json, os, re, sys, uuid

class PreflightError(Exception):
    def __init__(self, code):
        self.code=code
        super().__init__(code)

def validate(env):
    if not re.fullmatch(r'https://[0-9a-f]{32}\.r2\.cloudflarestorage\.com/?',
                        env.get('ARTIFACT_S3_ENDPOINT','')):
        raise PreflightError('INVALID_R2_S3_ENDPOINT')
    if env.get('ARTIFACT_BUCKET')!='worldifact-artifacts':
        raise PreflightError('INVALID_R2_BUCKET')
    if env.get('ARTIFACT_REGION')!='auto':
        raise PreflightError('INVALID_R2_REGION')
    if not env.get('ARTIFACT_ACCESS_KEY_ID') or not env.get('ARTIFACT_SECRET_ACCESS_KEY'):
        raise PreflightError('MISSING_R2_CREDENTIALS')

class ProbeStore:
    def __init__(self, client, bucket):
        self.client,self.bucket=client,bucket
    def create_json(self, key, value):
        from botocore.exceptions import ClientError
        raw=json.dumps(value,ensure_ascii=False,separators=(',',':')).encode()
        try:
            self.client.put_object(Bucket=self.bucket,Key=key,Body=raw,ContentType='application/json',IfNoneMatch='*')
        except ClientError as exc:
            if exc.response.get('ResponseMetadata',{}).get('HTTPStatusCode')==412:
                return False
            raise
        return True
    def read(self,key,limit):
        response=self.client.get_object(Bucket=self.bucket,Key=key)
        stream=response['Body']
        try:
            return stream.read(limit+1)
        finally:
            stream.close()

def connect(env):
    import boto3
    from botocore.config import Config
    client=boto3.client('s3',
        endpoint_url=env['ARTIFACT_S3_ENDPOINT'],
        region_name=env['ARTIFACT_REGION'],
        aws_access_key_id=env['ARTIFACT_ACCESS_KEY_ID'],
        aws_secret_access_key=env['ARTIFACT_SECRET_ACCESS_KEY'],
        config=Config(connect_timeout=7,read_timeout=12,
                      retries={'total_max_attempts':1},
                      s3={'addressing_style':'path'}))
    return ProbeStore(client,env['ARTIFACT_BUCKET'])

def test_storage(store,key):
    payload={'revision':'worldifact-r2-connectivity-v1','probe':key.rsplit('/',1)[-1]}
    raw=json.dumps(payload,ensure_ascii=False,separators=(',',':')).encode()
    created=False
    try:
        try:
            if not store.create_json(key,payload):
                raise PreflightError('FIRST_CREATE_NOT_CONFIRMED')
            created=True
        except PreflightError:
            raise
        except Exception:
            raise PreflightError('FIRST_CREATE_UNKNOWN') from None
        try:
            second=store.create_json(key,payload)
        except Exception:
            raise PreflightError('CAS_SECOND_CREATE_UNKNOWN') from None
        if second is not False:
            raise PreflightError('ATOMIC_CREATE_IF_ABSENT_FAILED')
        try:
            observed=store.read(key,max(4096,len(raw)+1))
        except Exception:
            raise PreflightError('READ_FAILED') from None
        if observed!=raw:
            raise PreflightError('READ_MISMATCH')
    finally:
        if created:
            try:
                store.client.delete_object(Bucket=store.bucket,Key=key)
            except Exception:
                raise PreflightError('PROBE_DELETE_NOT_CONFIRMED') from None
    return {'verified':True,'cas':'PASS','read':'PASS','cleanup':'PASS','userObjectsChanged':0}

def run(env,store_factory=None,id_factory=None):
    validate(env)
    try:
        store=store_factory() if store_factory else connect(env)
    except Exception:
        raise PreflightError('R2_CONNECTION_INITIALIZATION_FAILED') from None
    suffix=id_factory() if id_factory else uuid.uuid4().hex
    if not isinstance(suffix,str) or not re.fullmatch('[a-f0-9]{32}',suffix):
        raise PreflightError('INVALID_PROBE_ID')
    return test_storage(store,'ops/preflight/'+suffix+'.json')

def main():
    try:
        result=run(os.environ)
    except PreflightError as exc:
        result={'verified':False,'reason':exc.code,'userObjectsChanged':0}
    except Exception:
        result={'verified':False,'reason':'UNKNOWN_SAFE_FAILURE','userObjectsChanged':0}
    print(json.dumps(result,sort_keys=True))
    return 0 if result['verified'] else 2

if __name__=='__main__':
    sys.exit(main())
