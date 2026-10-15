"""Only synthetic PNG fixtures; no user's photograph in git or CI."""
import hashlib,importlib.util,json,struct,tempfile,unittest,zlib
from pathlib import Path
from zipfile import ZipFile
path=Path(__file__).resolve().parents[1]/'scripts/verify-reference-trial-pack.py'
spec=importlib.util.spec_from_file_location('packverify',path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
def png():
    def chunk(t,d):return struct.pack('>I',len(d))+t+d+struct.pack('>I',zlib.crc32(t+d))
    data=b''.join(b'\x00'+b'\x12\x34\x56'*32 for _ in range(32))
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',32,32,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(data))+chunk(b'IEND',b'')
def pack(scene=False,override=None):
    p=png();x={'reference.png':p,'mask_candidate_REVIEW_REQUIRED.png':p,
       'PROMPT.md':b'3D mesh not a billboard. '+b'preserve silhouette and PBR. '*25,
       'ACCEPTANCE.md':b'actual mesh, actual cameras. '+b'no fake model. '*25,'README.md':b'PRIVATE SOURCE ONLY'}
    files={k:{'sha256':hashlib.sha256(v).hexdigest(),'bytes':len(v),'width':32,'height':32,'mime':'image/png'} for k,v in x.items() if k.endswith('png')}
    meta={'schemaVersion':'worldifact-reference-trial-v1','trialId':'test-robot',
       'inputPrivacy':'PRIVATE_OWNER_HANDOFF_NOT_PUBLIC_GITHUB','assetType':'MULTI_ASSET_SCENE' if scene else 'SINGLE_CHARACTER_WITH_PROP',
       'status':'SOURCE_PACK_READY_MODEL_NOT_GENERATED','modelGenerated':False,'astraProviderCallExecuted':False,
       'runpodGpuCallExecuted':False,'maskCandidateReviewed':False,'model3dDownloadUrl':None,
       'runpodJobId':None,'runpodSpendUsd':0,'blocks':['MULTI_ASSET_SCENE_PIPELINE_REQUIRED'] if scene else [],'files':files}
    meta.update(override or {});x['manifest.json']=json.dumps(meta).encode();return x
class Tests(unittest.TestCase):
    def check(self,contents):
        with tempfile.TemporaryDirectory() as td:
            p=Path(td)/'x.zip'
            with ZipFile(p,'w') as z:
                for name,data in contents.items():z.writestr(name,data)
            return m.verify(p)
    def test_source_only_verified(self):
        for scene in (False,True):
            r=self.check(pack(scene));self.assertTrue(r['verified']);self.assertEqual(r['providerCalls'],0)
    def test_false_model_link_and_provider_call_refused(self):
        for changed in ({'model3dDownloadUrl':'https://invalid/fake.glb'},{'modelGenerated':True},
                        {'astraProviderCallExecuted':True},{'runpodSpendUsd':5}):
            with self.subTest(changed=changed),self.assertRaises(m.Refusal):self.check(pack(override=changed))
    def test_scene_without_pipeline_refused(self):
        with self.assertRaisesRegex(m.Refusal,'MULTIASSET_NOT_SUPPORTED'):self.check(pack(True,{'blocks':[]}))
    def test_wrong_sha_refused(self):
        f=pack();d=json.loads(f['manifest.json']);d['files']['reference.png']['sha256']='f'*64;f['manifest.json']=json.dumps(d).encode()
        with self.assertRaisesRegex(m.Refusal,'WRONG_SOURCE_HASH'):self.check(f)
    def test_path_traversal_refused(self):
        with self.assertRaisesRegex(m.Refusal,'INVALID_ENTRIES'):self.check({**pack(),'../sensitive.png':png()})
    def test_bad_ihdr_crc_refused(self):
        bad=png();self.assertRaises(m.Refusal,m.png_size,bad[:29]+b'\0'*4+bad[33:])
if __name__=='__main__':unittest.main(verbosity=2)
