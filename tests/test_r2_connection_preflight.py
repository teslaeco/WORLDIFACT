"""No real secrets, account or network access in these tests."""
import importlib.util, io, json, os, unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch
s=importlib.util.spec_from_file_location('probe',Path(__file__).resolve().parents[1]/'scripts/r2-connection-preflight.py')
r2=importlib.util.module_from_spec(s);s.loader.exec_module(r2)
CFG={'ARTIFACT_S3_ENDPOINT':'https://'+'a'*32+'.r2.cloudflarestorage.com','ARTIFACT_BUCKET':'worldifact-artifacts','ARTIFACT_REGION':'auto','ARTIFACT_ACCESS_KEY_ID':'FAKE_KEY','ARTIFACT_SECRET_ACCESS_KEY':'FAKE_SECRET'}
class Fake:
    bucket='worldifact-artifacts'
    def __init__(self,invalid_cas=False,invalid_read=False):
        self.data={};self.invalid_cas=invalid_cas;self.invalid_read=invalid_read
        self.client=self;self.calls=[]
    def create_json(self,k,v):
        self.calls.append(('put',k))
        if k in self.data and not self.invalid_cas:return False
        self.data[k]=json.dumps(v,ensure_ascii=False,separators=(',',':')).encode()
        return True
    def read(self,k,limit):
        self.calls.append(('get',k))
        return b'WRONG' if self.invalid_read else self.data[k]
    def delete_object(self,*,Bucket,Key):
        assert Bucket==self.bucket
        del self.data[Key]
class Cases(unittest.TestCase):
    def test_wrong_endpoints_blocked(self):
        for v in ('S3 API URL z Cloudflare R2 Overview','https://evil.example',
                  'http://'+'a'*32+'.r2.cloudflarestorage.com',
                  'https://'+'a'*32+'.r2.cloudflarestorage.com.evil.com'):
            with self.subTest(v=v),self.assertRaises(r2.PreflightError):
                r2.validate({**CFG,'ARTIFACT_S3_ENDPOINT':v})
    def test_bucket_region_secrets_required(self):
        for k,v in [('ARTIFACT_BUCKET','elsewhere'),('ARTIFACT_REGION','eu'),
                    ('ARTIFACT_SECRET_ACCESS_KEY','')]:
            with self.subTest(k=k),self.assertRaises(r2.PreflightError):
                r2.validate({**CFG,k:v})
    def test_cas_read_cleanup(self):
        f=Fake()
        result=r2.run(CFG,lambda:f,lambda:'b'*32)
        self.assertTrue(result['verified'])
        self.assertEqual(result['userObjectsChanged'],0)
        self.assertEqual(len(f.calls),3)
        self.assertEqual(f.data,{})
        self.assertTrue(all(x[1]=='ops/preflight/'+'b'*32+'.json' for x in f.calls))
    def test_false_cas_never_passes(self):
        f=Fake(invalid_cas=True)
        with self.assertRaises(r2.PreflightError) as e:
            r2.run(CFG,lambda:f,lambda:'b'*32)
        self.assertEqual(e.exception.code,'ATOMIC_CREATE_IF_ABSENT_FAILED')
        self.assertEqual(f.data,{})
    def test_read_mismatch_fails(self):
        f=Fake(invalid_read=True)
        with self.assertRaises(r2.PreflightError) as e:
            r2.run(CFG,lambda:f,lambda:'b'*32)
        self.assertEqual(e.exception.code,'READ_MISMATCH')
        self.assertEqual(f.data,{})
    def test_no_secret_echo(self):
        out=io.StringIO()
        bad={**CFG,'ARTIFACT_S3_ENDPOINT':'placeholder'}
        with patch.dict(os.environ,bad,clear=True),redirect_stdout(out):
            self.assertEqual(r2.main(),2)
        for value in (bad['ARTIFACT_S3_ENDPOINT'],bad['ARTIFACT_ACCESS_KEY_ID'],bad['ARTIFACT_SECRET_ACCESS_KEY']):
            self.assertNotIn(value,out.getvalue())
    def test_invalid_id_refuses_without_write(self):
        f=Fake()
        with self.assertRaises(r2.PreflightError):
            r2.run(CFG,lambda:f,lambda:'../oops')
        self.assertEqual(f.calls,[])
if __name__=='__main__':unittest.main()
