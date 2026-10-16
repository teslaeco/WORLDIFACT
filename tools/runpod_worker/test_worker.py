"""Offline integration using clearly identified fixture geometry, no neural calls.
A box validates byte handling/exports only; it is not an ECOMECH quality result.
"""
import base64,copy,hashlib,json,tempfile,unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import numpy as np
import trimesh
from contracts import Rejected,validate_job,fingerprint
from handler import execute
from storage import S3Store,validate_glb
from engine import inside,load_bundle,CODE_REVISION,WEIGHTS_REVISION
ROOT=Path(__file__).resolve().parents[2]
FIX=json.loads((ROOT/'tests/fixtures/runpod/contract.json').read_text())

def job():return copy.deepcopy(FIX['job'])
class Store:
    """In-memory test double; real worker uses S3 conditional writes."""
    def __init__(self):
        self.values={FIX['job'][name]['key']:base64.b64decode(FIX[name+'Base64']) for name in ('reference','mask')}
    def read(self,key,limit):
        raw=self.values.get(key)
        if raw and len(raw)>limit:raise Rejected('STORAGE_OBJECT_TOO_LARGE')
        return raw
    def create_json(self,key,value):
        if key in self.values:return False
        self.values[key]=json.dumps(value).encode();return True
    def put_file(self,key,path,mime):
        if key in self.values:raise Rejected('DUPLICATE_OUTPUT_WRITE')
        raw=path.read_bytes();self.values[key]=raw
        return {'key':key,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),'mime':mime}

class FakeEngine:
    def __init__(self,fail=False):self.calls=0;self.fail=fail
    def __call__(self,source,mask,j,out,preserve):
        self.calls+=1;out.mkdir()
        m=trimesh.creation.box()
        np.savez_compressed(out/'decoder.npz',vertices=m.vertices,faces=m.faces)
        (out/'engine.json').write_text(json.dumps({'fixtureOnly':True,'geometryEngine':'microsoft/TRELLIS.2-4B'}))
        preserve(out/'decoder.npz');preserve(out/'engine.json')
        if self.fail:raise RuntimeError('SENSITIVE_PROVIDER_ERROR')
        m.export(out/'original.glb');preserve(out/'original.glb')
        return {'geometryEngine':'microsoft/TRELLIS.2-4B','fixtureOnly':True}

def fake_blender(source,out,seconds):
    out.mkdir();(out/'game.glb').write_bytes(source.read_bytes())
    (out/'source.blend').write_bytes(b'FIXTURE ONLY NOT REAL BLEND')
    (out/'qa.json').write_text(json.dumps({'printReady':False,'visualAccepted':False,'fixtureOnly':True}))
    for k in ('pbr','clay'):
        for v in ('front','three_quarter','side','back'):
            (out/f'{k}_{v}.png').write_bytes(base64.b64decode(FIX['referenceBase64']))

def run(s=None,e=None,p=fake_blender,j=None):
    return execute({'id':'runpod-fixture','input':j or job()},s or Store(),e or FakeEngine(),p,now_ms=FIX['nowMs'],enabled=True)

class WorkerTests(unittest.TestCase):
    def test_cross_language_fingerprint(self):
        self.assertEqual(fingerprint(validate_job(job(),FIX['nowMs'])),FIX['fingerprint'])
    def test_unknown_flags_and_expired_job_refused(self):
        bad=job();bad['auto_buy_gpu']=True
        with self.assertRaisesRegex(Rejected,'INVALID_JOB_FIELDS'):validate_job(bad,FIX['nowMs'])
        with self.assertRaisesRegex(Rejected,'INVALID_OR_EXPIRED_BUDGET'):validate_job(job(),FIX['nowMs']+3600001)
    def test_budget_or_wrong_owner_path_refused_before_gpu(self):
        for name,value in [('key','https://evil.example/image.png'),('sha256','wrong')]:
            bad=job();bad['reference'][name]=value
            with self.assertRaises(Rejected):validate_job(bad,FIX['nowMs'])
        bad=job();bad['budget']['maxGpuMicroUsd']=10
        with self.assertRaisesRegex(Rejected,'GPU_BUDGET_EXCEEDED'):validate_job(bad,FIX['nowMs'])
    def test_disabled_default_never_runs_inference(self):
        e=FakeEngine()
        with self.assertRaisesRegex(Rejected,'GPU_WORKER_DISABLED'):execute({'input':job()},Store(),e,fake_blender)
        self.assertEqual(e.calls,0)
    def test_completed_job_durable_results_and_originals(self):
        s=Store();e=FakeEngine();r=run(s,e)
        self.assertEqual(r['state'],'REVIEW_REQUIRED');self.assertEqual(e.calls,1)
        self.assertFalse(r['printReady']);self.assertFalse(r['visualAccepted']);self.assertIsNone(r['actualBilledMicroUsd'])
        self.assertEqual(len(r['artifacts']),14)
        for a in r['artifacts']:
            self.assertEqual(hashlib.sha256(s.values[a['key']]).hexdigest(),a['sha256'])
        self.assertEqual(r['planner']['responseId'],'resp_fixture_NOT_LIVE')
    def test_scale_to_zero_new_process_does_not_reinfer_existing_job(self):
        s=Store();r=run(s,FakeEngine());e=FakeEngine();r2=run(s,e)
        self.assertEqual(r,r2);self.assertEqual(e.calls,0)
    def test_backend_duplicate_with_changed_input_is_not_reused(self):
        s=Store();run(s);bad=job();bad['settings']['seed']+=1
        with self.assertRaisesRegex(Rejected,'JOB_ID_REUSED_WITH_DIFFERENT_INPUT'):run(s,j=bad)
    def test_interrupted_claim_without_result_is_not_retried(self):
        s=Store();j=job();prefix=f"jobs/{j['scope']}/{j['jobId']}/"
        s.create_json(prefix+'claim.json',{'fingerprint':fingerprint(j)})
        e=FakeEngine()
        with self.assertRaisesRegex(Rejected,'EXISTING_INCOMPLETE_JOB_RECONCILIATION_REQUIRED'):run(s,e)
        self.assertEqual(e.calls,0)
    def test_original_geometry_and_material_checkpoint_survive_export_failure(self):
        s=Store();e=FakeEngine(fail=True);r=run(s,e)
        self.assertEqual(r['state'],'FAILED_RECONCILE');self.assertEqual(r['failedStage'],'RECONSTRUCTION')
        self.assertEqual(len(r['artifacts']),2);self.assertNotIn('SENSITIVE_PROVIDER_ERROR',json.dumps(r))
        run(s,e);self.assertEqual(e.calls,1)
    def test_blender_failure_keeps_original_glb_no_fake_game_output(self):
        def broken(*_):raise TimeoutError('BLENDER_PROCESS_TIMEOUT')
        s=Store();r=run(s,p=broken)
        self.assertEqual(r['state'],'FAILED_RECONCILE');self.assertEqual(len(r['artifacts']),3)
        self.assertTrue(any(a['key'].endswith('raw/original.glb') for a in r['artifacts']))
        self.assertFalse(any(a['key'].endswith('outputs/game.glb') for a in r['artifacts']))
    def test_wrong_source_hash_stops_before_engine(self):
        s=Store();s.values[job()['reference']['key']]=b'CHANGED';e=FakeEngine();r=run(s,e)
        self.assertEqual(e.calls,0);self.assertEqual(r['failedStage'],'REFERENCE')
    def test_sdk_thread_does_not_depend_on_main_thread_signals(self):
        with ThreadPoolExecutor(max_workers=1) as pool:
            self.assertEqual(pool.submit(run).result()['state'],'REVIEW_REQUIRED')
    def test_no_unreviewed_dependency_bundle(self):
        with tempfile.TemporaryDirectory() as t:
            root=Path(t);(root/'worldifact-bundle.json').write_text(json.dumps({'sourceRevision':CODE_REVISION,'modelRevision':WEIGHTS_REVISION}))
            with self.assertRaisesRegex(Rejected,'BUNDLE_REVISION_OR_LICENSE_REVIEW_REQUIRED'):load_bundle(root)
            with self.assertRaisesRegex(Rejected,'BUNDLE_PATH_ESCAPE'):inside(root,'../model')
    def test_real_glb_fixture_and_not_image(self):
        with tempfile.TemporaryDirectory() as t:
            p=Path(t)/'test.glb';trimesh.creation.box().export(p)
            self.assertEqual(validate_glb(p)['bytes'],p.stat().st_size)
            p.write_bytes(b'PNG not GLB'+b' '*100)
            with self.assertRaisesRegex(Rejected,'INVALID_GLB'):validate_glb(p)
    def test_real_s3_conditional_claim_contract_without_network(self):
        import boto3
        from botocore.stub import Stubber
        client=boto3.client('s3',region_name='us-east-1',aws_access_key_id='fixture',aws_secret_access_key='fixture')
        with Stubber(client) as stub:
            expected={'Bucket':'test-bucket','Key':'claim','Body':b'{"a":1}','ContentType':'application/json','IfNoneMatch':'*'}
            stub.add_response('put_object',{},expected)
            stub.add_client_error('put_object',service_error_code='PreconditionFailed',http_status_code=412,expected_params=expected)
            s=S3Store(client,'test-bucket');self.assertTrue(s.create_json('claim',{'a':1}));self.assertFalse(s.create_json('claim',{'a':1}))
            stub.assert_no_pending_responses()

if __name__=='__main__':unittest.main(verbosity=2)
