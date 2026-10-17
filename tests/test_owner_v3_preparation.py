"""Paid-planner boundaries with real PNG bytes and a mocked Responses API."""
import base64
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('v3_preparation',ROOT/'tools/runpod_owner_v3/prepare.py')
prepare=importlib.util.module_from_spec(spec);spec.loader.exec_module(prepare)
FIX=json.loads((ROOT/'tests/fixtures/runpod/contract.json').read_text())


class Memory:
    def __init__(self):self.values={};self.writes=[]
    def read(self,key,limit):
        raw=self.values.get(key)
        if raw is not None and len(raw)>limit:raise ValueError('TOO_LARGE')
        return raw
    def create_json(self,key,value):
        if key in self.values:return False
        self.values[key]=json.dumps(value).encode();self.writes.append(key);return True


def inputs():
    store=Memory()
    cfg={'id':prepare.BATCH,'scope':prepare.SCOPE,'revision':'astra-runpod-blender-v3','jobs':[]}
    for name,job_id,subject in zip(('ECOMECH_V4','HALLOWEEN_MUSIC_ROOM'),prepare.JOBS,('robot','person')):
        item={'name':name,'jobId':job_id,'subject':subject}
        for kind in ('reference','mask'):
            raw=base64.b64decode(FIX[kind+'Base64'])
            item[kind]={'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),'width':64,'height':64}
            store.values[prepare.prefix(item)+kind+'.png']=raw
        cfg['jobs'].append(item)
    return store,cfg


def response(subject='robot',**changes):
    plan={**FIX['job']['plan'],'subject':subject}
    result={'id':'resp_OFFLINE_NOT_LIVE','status':'completed','model':'gpt-6-astra',
            'output':[{'type':'message','content':[{'type':'output_text','text':json.dumps(plan)}]}]}
    return {**result,**changes}


class OwnerPreparation(unittest.TestCase):
    def run_preparation(self,store,cfg,api,stage=1):
        with patch.object(prepare,'openai',side_effect=api),patch.object(prepare.time,'time',return_value=FIX['nowMs']/1000):
            return prepare.prepare(store,cfg,stage)

    def test_exact_image_strict_schema_and_one_bounded_paid_call(self):
        store,cfg=inputs();calls=[];p=prepare.prefix(cfg['jobs'][0])
        def api(path,body):
            calls.append((path,body))
            if path=='/responses/input_tokens':return {'input_tokens':18000}
            claim=json.loads(store.values[p+'astra-dispatch-claim.json'])
            self.assertEqual(claim['maxMicroUsd'],580960)
            self.assertEqual(claim['maxOutputTokens'],2400)
            self.assertEqual(claim['sourceSha256'],cfg['jobs'][0]['reference']['sha256'])
            self.assertEqual(body['max_output_tokens'],2400)
            self.assertEqual(body['reasoning'],{'effort':'low'})
            self.assertEqual(body['service_tier'],'default');self.assertFalse(body['store'])
            self.assertTrue(body['text']['format']['strict'])
            image=body['input'][0]['content'][1]['image_url']
            self.assertEqual(base64.b64decode(image.split(',',1)[1]),store.values[p+'reference.png'])
            return response()
        result=self.run_preparation(store,cfg,api)
        self.assertEqual([p for p,_ in calls],['/responses/input_tokens','/responses'])
        self.assertEqual(result['settings'],{'seed':42,'resolution':1536,'textureSize':4096,'targetFaces':1000000})
        self.assertEqual(result['reference']['sha256'],cfg['jobs'][0]['reference']['sha256'])
        self.assertEqual(self.run_preparation(store,cfg,lambda *_:self.fail('No repeat API call')),result)

    def test_invalid_token_count_stops_before_paid_claim(self):
        for count in (True,0,-1,18001,1.5):
            with self.subTest(count=count):
                store,cfg=inputs();calls=[]
                def api(path,_):calls.append(path);return {'input_tokens':count}
                with self.assertRaises(AssertionError):self.run_preparation(store,cfg,api)
                self.assertEqual(calls,['/responses/input_tokens'])
                self.assertEqual(store.writes,[])

    def test_changed_source_or_mask_stops_before_any_provider_call(self):
        for kind in ('reference','mask'):
            with self.subTest(kind=kind):
                store,cfg=inputs();store.values[prepare.prefix(cfg['jobs'][0])+kind+'.png']+=b'changed'
                with self.assertRaisesRegex(AssertionError,'SOURCE_BYTES_CHANGED'):
                    self.run_preparation(store,cfg,lambda *_:self.fail('API before image verification'))

    def test_ambiguous_paid_response_is_never_automatically_repeated(self):
        store,cfg=inputs();calls=[];p=prepare.prefix(cfg['jobs'][0])
        def api(path,_):
            calls.append(path)
            if path=='/responses/input_tokens':return {'input_tokens':1500}
            raise TimeoutError('AMBIGUOUS_PAID_RESPONSE')
        with self.assertRaises(TimeoutError):self.run_preparation(store,cfg,api)
        self.assertIn(p+'astra-dispatch-claim.json',store.values)
        self.assertNotIn(p+'prepared-job.json',store.values)
        with self.assertRaisesRegex(RuntimeError,'ASTRA_RESULT_UNKNOWN_NO_PAID_RETRY'):
            self.run_preparation(store,cfg,lambda *_:self.fail('Ambiguous paid call repeated'))
        self.assertEqual(calls,['/responses/input_tokens','/responses'])

    def test_completed_saved_response_recovers_without_more_paid_calls(self):
        store,cfg=inputs();p=prepare.prefix(cfg['jobs'][0])
        store.create_json(p+'astra-dispatch-claim.json',{'sourceSha256':cfg['jobs'][0]['reference']['sha256']})
        store.create_json(p+'astra-response.json',response())
        result=self.run_preparation(store,cfg,lambda *_:self.fail('Saved response must be reused'))
        self.assertEqual(result['planner']['responseId'],'resp_OFFLINE_NOT_LIVE')

    def test_incomplete_or_wrong_subject_plan_is_saved_but_cannot_launch(self):
        for result in (response(status='incomplete'),response(subject='person')):
            store,cfg=inputs();p=prepare.prefix(cfg['jobs'][0])
            def api(path,_):return {'input_tokens':1500} if path.endswith('input_tokens') else result
            with self.assertRaises(AssertionError):self.run_preparation(store,cfg,api)
            self.assertIn(p+'astra-response.json',store.values)
            self.assertNotIn(p+'prepared-job.json',store.values)
            with self.assertRaises(AssertionError):
                self.run_preparation(store,cfg,lambda *_:self.fail('Failed plan must not be regenerated'))

    def test_gpu_dispatch_marker_blocks_preparation(self):
        store,cfg=inputs();p=prepare.prefix(cfg['jobs'][0])
        store.create_json(p+'operator-dispatch-claim.json',{'jobId':cfg['jobs'][0]['jobId']})
        with self.assertRaisesRegex(RuntimeError,'GPU_ALREADY_CLAIMED_RECONCILE_ONLY'):
            self.run_preparation(store,cfg,lambda *_:self.fail('Consumed GPU stage repeated'))

    def test_stage2_requires_verified_first_model_and_matching_visual_review(self):
        store,cfg=inputs();first=cfg['jobs'][0];p=prepare.prefix(first)
        def no_api(*_):self.fail('Stage2 advanced before stage1 review')
        with self.assertRaisesRegex(AssertionError,'STAGE1_DURABLE_VERIFICATION_REQUIRED'):
            self.run_preparation(store,cfg,no_api,2)
        store.create_json(p+'operator-verified.json',{'status':'VERIFIED','jobId':first['jobId'],
            'artifacts':[{'key':p+'outputs/game.glb','sha256':'a'*64}]})
        with self.assertRaisesRegex(AssertionError,'STAGE1_VISUAL_REVIEW_REQUIRED'):
            self.run_preparation(store,cfg,no_api,2)
        cfg['stage1VisualReview']={'accepted':True,'jobId':first['jobId'],'gameSha256':'b'*64}
        with self.assertRaisesRegex(AssertionError,'STAGE1_REVIEW_HASH_MISMATCH'):
            self.run_preparation(store,cfg,no_api,2)
        cfg['stage1VisualReview']['gameSha256']='a'*64
        def api(path,_):return {'input_tokens':1500} if path.endswith('input_tokens') else response('person')
        self.assertEqual(self.run_preparation(store,cfg,api,2)['plan']['subject'],'person')


if __name__=='__main__':unittest.main(verbosity=2)
