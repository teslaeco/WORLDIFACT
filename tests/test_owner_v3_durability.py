"""Offline failure-injection checks; fixtures are not generated owner models."""
import base64
import copy
import hashlib
import json
from pathlib import Path
import struct
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools/runpod_worker'))
from contracts import Rejected, fingerprint
from handler import execute
from storage import MAX_ARTIFACT, MAX_DECODER_ARTIFACT, S3Store, artifact_limit, validate_glb

FIX=json.loads((ROOT/'tests/fixtures/runpod/contract.json').read_text())

def quality_job():
    value=copy.deepcopy(FIX['job'])
    value['revision']='astra-runpod-blender-v3'
    value['settings'].update(resolution=1536,textureSize=4096,targetFaces=1000000)
    value['budget'].update(maxGpuMicroUsd=2100000,executionSeconds=1800,
        coldStartAllowanceSeconds=600,idleSeconds=5,rateMicroUsdPerSecond=756,
        expiresAt=FIX['nowMs']+3600000)
    return value

def triangle_glb():
    binary=struct.pack('<9f3H',0,0,0,1,0,0,0,1,0,0,1,2)+b'\0\0'
    document={'asset':{'version':'2.0'},'scene':0,'scenes':[{'nodes':[0]}],
        'nodes':[{'mesh':0}],'buffers':[{'byteLength':len(binary)}],
        'bufferViews':[{'buffer':0,'byteOffset':0,'byteLength':36},
                       {'buffer':0,'byteOffset':36,'byteLength':6}],
        'accessors':[{'bufferView':0,'componentType':5126,'count':3,'type':'VEC3',
                      'min':[0,0,0],'max':[1,1,0]},
                     {'bufferView':1,'componentType':5123,'count':3,'type':'SCALAR'}],
        'meshes':[{'primitives':[{'attributes':{'POSITION':0},'indices':1}]}]}
    raw=json.dumps(document,separators=(',',':')).encode()
    raw+=b' '*((-len(raw))%4)
    return (struct.pack('<III',0x46546c67,2,28+len(raw)+len(binary))
        +struct.pack('<II',len(raw),0x4e4f534a)+raw
        +struct.pack('<II',len(binary),0x004e4942)+binary)

class Store:
    def __init__(self):
        self.values={FIX['job'][name]['key']:base64.b64decode(FIX[name+'Base64'])
                     for name in ('reference','mask')}
    def read(self,key,limit):
        raw=self.values.get(key)
        if raw is not None and len(raw)>limit:raise Rejected('STORAGE_OBJECT_TOO_LARGE')
        return raw
    def create_json(self,key,value):
        if key in self.values:return False
        self.values[key]=json.dumps(value).encode();return True
    def put_file(self,key,path,mime):
        if key in self.values:raise Rejected('DUPLICATE_OUTPUT_WRITE')
        raw=path.read_bytes();self.values[key]=raw
        return {'key':key,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),'mime':mime}

class FixtureEngine:
    def __init__(self):self.calls=0
    def __call__(self,reference,mask,job,out,preserve):
        self.calls+=1;out.mkdir()
        # A labeled checkpoint fixture, not a native NPZ or inference claim.
        (out/'decoder.npz').write_bytes(b'OFFLINE_DECODER_FIXTURE')
        (out/'engine.json').write_text(json.dumps({'fixtureOnly':True,
            'geometryEngine':'microsoft/TRELLIS.2-4B'}))
        preserve(out/'decoder.npz');preserve(out/'engine.json')
        (out/'original.glb').write_bytes(triangle_glb());preserve(out/'original.glb')
        return {'geometryEngine':'microsoft/TRELLIS.2-4B','fixtureOnly':True}

def fixture_exports(source,out,seconds,preserve,profile,fail_after_first=False,hard_kill=False):
    if profile not in ('robot','halloween'):raise ValueError('BAD_FIXTURE_PROFILE')
    out.mkdir()
    qa={'fixtureOnly':True,'visualAccepted':False,'printReady':False,'supplierAccepted':False}
    files=[('game.glb',source.read_bytes()),('scene-report.json',json.dumps(qa).encode()),
        ('qa.initial.json',json.dumps(qa).encode()),('source.blend',b'OFFLINE_BLEND_FIXTURE')]
    files.extend((f'{kind}_{view}.png',base64.b64decode(FIX['referenceBase64']))
        for kind in ('pbr','clay') for view in ('front','three_quarter','side','back'))
    files.append(('qa.json',json.dumps(qa).encode()))
    for name,raw in files:
        path=out/name;path.write_bytes(raw);preserve(path)
        if name=='pbr_front.png':
            if hard_kill:raise SimulatedProviderTermination()
            if fail_after_first:raise TimeoutError('SENSITIVE_FIXTURE_ERROR')

class SimulatedProviderTermination(BaseException):pass

def run(store,engine=None,postprocess=fixture_exports,job=None):
    return execute({'input':job or quality_job()},store,engine or FixtureEngine(),
        postprocess,now_ms=FIX['nowMs'],enabled=True)

class DurabilityTests(unittest.TestCase):
    def test_complete_result_has_independent_verified_checkpoint_for_every_artifact(self):
        store=Store();result=run(store)
        self.assertEqual(result['state'],'REVIEW_REQUIRED')
        self.assertEqual(len(result['artifacts']),16)
        job=quality_job();prefix=f"jobs/{job['scope']}/{job['jobId']}/"
        for item in result['artifacts']:
            self.assertEqual(hashlib.sha256(store.values[item['key']]).hexdigest(),item['sha256'])
            receipt=json.loads(store.values[prefix+'checkpoints/'+item['key'][len(prefix):]+'.json'])
            self.assertEqual(receipt['fingerprint'],fingerprint(job))
            self.assertEqual(receipt['state'],'ARTIFACT_DURABLE')
            self.assertEqual(receipt['artifact'],item)

    def test_render_failure_keeps_native_source_project_metadata_and_completed_view(self):
        store=Store();engine=FixtureEngine()
        def broken(*args,**kwargs):return fixture_exports(*args,**kwargs,fail_after_first=True)
        result=run(store,engine,broken)
        self.assertEqual(result['state'],'FAILED_RECONCILE')
        self.assertEqual(result['failedStage'],'BLENDER')
        self.assertEqual(len(result['artifacts']),8)
        suffixes={item['key'].split('/outputs/')[-1] for item in result['artifacts']}
        self.assertTrue({'source.blend','game.glb','scene-report.json','qa.initial.json','pbr_front.png'}<=suffixes)
        self.assertNotIn('SENSITIVE_FIXTURE_ERROR',json.dumps(result))
        self.assertEqual(run(store,engine,broken),result)
        self.assertEqual(engine.calls,1)

    def test_hard_termination_leaves_recoverable_receipts_without_final_result_or_reinference(self):
        store=Store();engine=FixtureEngine()
        def killed(*args,**kwargs):return fixture_exports(*args,**kwargs,hard_kill=True)
        with self.assertRaises(SimulatedProviderTermination):run(store,engine,killed)
        prefix=f"jobs/{quality_job()['scope']}/{quality_job()['jobId']}/"
        self.assertNotIn(prefix+'result.json',store.values)
        for relative in ('raw/decoder.npz','raw/original.glb','outputs/source.blend','outputs/pbr_front.png'):
            receipt=json.loads(store.values[prefix+'checkpoints/'+relative+'.json'])
            self.assertEqual(receipt['artifact']['key'],prefix+relative)
        with self.assertRaisesRegex(Rejected,'EXISTING_INCOMPLETE_JOB_RECONCILIATION_REQUIRED'):
            run(store,engine)
        self.assertEqual(engine.calls,1)

    def test_unacknowledged_outputs_cannot_be_reported_complete(self):
        store=Store()
        def unacknowledged(source,out,seconds,preserve,profile):
            fixture_exports(source,out,seconds,lambda _:None,profile)
        result=run(store,postprocess=unacknowledged)
        self.assertEqual(result['state'],'FAILED_RECONCILE')
        self.assertEqual(len(result['artifacts']),3)

    def test_false_manufacturing_approval_is_rejected_before_upload(self):
        store=Store()
        def lying(source,out,seconds,preserve,profile):
            out.mkdir();path=out/'qa.initial.json'
            path.write_text(json.dumps({'printReady':True,'visualAccepted':True,'supplierAccepted':True}))
            preserve(path)
        result=run(store,postprocess=lying)
        self.assertEqual(result['state'],'FAILED_RECONCILE')
        self.assertFalse(any('/outputs/' in item['key'] for item in result['artifacts']))

    def test_checkpoint_callback_cannot_upload_arbitrary_file(self):
        store=Store()
        def escaped(source,out,seconds,preserve,profile):
            out.mkdir();path=out.parent/'private-key.pem';path.write_text('FIXTURE_NOT_A_SECRET')
            preserve(path)
        result=run(store,postprocess=escaped)
        self.assertEqual(result['state'],'FAILED_RECONCILE')
        self.assertFalse(any('private-key' in key for key in store.values))

    def test_large_artifact_exception_is_exact_decoder_path_only(self):
        job=quality_job();prefix=f"jobs/{job['scope']}/{job['jobId']}/"
        self.assertEqual(artifact_limit(prefix+'raw/decoder.npz',Path('decoder.npz'),'application/octet-stream'),MAX_DECODER_ARTIFACT)
        for key,path,mime in [
            (prefix+'raw/original.glb',Path('original.glb'),'model/gltf-binary'),
            (prefix+'outputs/source.blend',Path('source.blend'),'application/octet-stream'),
            ('other/raw/decoder.npz',Path('decoder.npz'),'application/octet-stream'),
            (prefix+'raw/decoder.npz',Path('not-decoder.npz'),'application/octet-stream'),
            (prefix+'raw/decoder.npz',Path('decoder.npz'),'image/png')]:
            self.assertEqual(artifact_limit(key,path,mime),MAX_ARTIFACT)
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'oversize.glb'
            with path.open('wb') as stream:stream.truncate(MAX_ARTIFACT+1)
            with self.assertRaisesRegex(Rejected,'GLB_SIZE_LIMIT'):validate_glb(path)
            with self.assertRaisesRegex(Rejected,'INVALID_ARTIFACT'):
                S3Store(None,'fixture').put_file(prefix+'outputs/game.glb',path,'model/gltf-binary')
            decoder=Path(directory)/'decoder.npz'
            with decoder.open('wb') as stream:stream.truncate(MAX_DECODER_ARTIFACT+1)
            with self.assertRaisesRegex(Rejected,'INVALID_ARTIFACT'):
                S3Store(None,'fixture').put_file(prefix+'raw/decoder.npz',decoder,'application/octet-stream')

    def test_storage_requires_readback_and_never_repeats_ambiguous_write(self):
        class Client:
            def __init__(self):self.writes=0
            def put_object(self,**kwargs):self.writes+=1
            def head_object(self,**kwargs):return {'ContentLength':999,'Metadata':{'sha256':'0'*64}}
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'qa.json';path.write_text('{}');client=Client()
            with self.assertRaisesRegex(Rejected,'ARTIFACT_READBACK_MISMATCH'):
                S3Store(client,'fixture').put_file('outputs/qa.json',path,'application/json')
            self.assertEqual(client.writes,1)

if __name__=='__main__':unittest.main()
