import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch
import hashlib
import io
from PIL import Image,ImageDraw

spec=importlib.util.spec_from_file_location('owner_prepare',Path(__file__).resolve().parents[1]/'tools/runpod_owner_models/prepare.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class Memory:
    def __init__(self):self.objects={}
    def create_json(self,key,value):
        if key in self.objects:return False
        self.objects[key]=json.dumps(value).encode();return True
    def read(self,key,limit):return self.objects.get(key)

class PreparationRecovery(unittest.TestCase):
    def test_saved_mask_is_verified_and_reused_without_segmentation(self):
        image=Image.new('RGB',(1229,1536),(40,80,30));buf=io.BytesIO();image.save(buf,format='JPEG');original=buf.getvalue()
        image=Image.open(io.BytesIO(original)).convert('RGB');normalized=module.encode_png(image)
        mask=Image.new('L',image.size,0);ImageDraw.Draw(mask).rectangle((190,30,970,1350),fill=255)
        mask_bytes=module.encode_png(mask);store=Memory();store.bucket='private'
        store.client=type('Client',(),{'head_object':lambda self,**kw:{'Metadata':{'sha256':hashlib.sha256(mask_bytes).hexdigest()}}})()
        item={'jobId':'fixed','scope':'scope','sha256':hashlib.sha256(original).hexdigest(),'source':'robot.jpg','subject':'robot','name':'ECOMECH_V4'}
        prefix='jobs/scope/fixed/';source='ops/owner-models-20261016/sources/robot.jpg'
        store.objects[source]=original;store.objects[prefix+'reference.png']=normalized;store.objects[prefix+'mask.png']=mask_bytes
        store.create_json(prefix+'source-provenance.json',{'originalKey':source,'originalSha256':item['sha256'],
            'referenceSha256':hashlib.sha256(normalized).hexdigest(),'mask':{'revision':module.SAM_REVISION}})
        store.create_json('ops/runpod-qualification/proof/receipt.json',{'status':'PASS','image':'fixed-image','uvAcceptance':{'status':'PASS'},'originalGlb':{'bytes':200000}})
        cfg={'id':'owner-models-20261016','qualificationId':'proof','image':'fixed-image','expiresBefore':'2099-01-01T00:00:00Z','jobs':[item]}
        with patch.object(module,'foreground',side_effect=AssertionError('must not recompute saved mask')),patch.object(module,'openai',side_effect=RuntimeError('COUNT_BOUNDARY')):
            with self.assertRaisesRegex(RuntimeError,'COUNT_BOUNDARY'):module.prepare(store,cfg)
        self.assertEqual(store.objects[prefix+'mask.png'],mask_bytes)
        self.assertNotIn(prefix+'astra-dispatch-claim.json',store.objects)

    def test_only_matching_unspent_preparation_resumes(self):
        store=Memory();claim={'sourceSha256':'a'*64,'authorizedBatch':'fixed'}
        module.claim_preparation(store,'job/',claim)
        module.claim_preparation(store,'job/',claim)
        with self.assertRaisesRegex(RuntimeError,'CLAIM_MISMATCH'):
            module.claim_preparation(store,'job/',{**claim,'sourceSha256':'b'*64})

    def test_any_paid_or_completed_marker_blocks_resume(self):
        for marker in ('astra-dispatch-claim.json','astra-response.json','prepared-job.json',
                       'operator-dispatch-claim.json','claim.json','result.json'):
            with self.subTest(marker=marker):
                store=Memory();module.claim_preparation(store,'job/',{'source':'same'})
                store.objects['job/'+marker]=b'{}'
                with self.assertRaisesRegex(RuntimeError,'REQUIRES_RECONCILIATION'):
                    module.claim_preparation(store,'job/',{'source':'same'})

    def test_existing_derivative_requires_exact_bytes(self):
        store=Memory();store.objects['job/reference.png']=b'original bytes'
        module.put_bytes(store,'job/reference.png',b'original bytes','image/png')
        with self.assertRaisesRegex(RuntimeError,'DERIVATIVE_MISMATCH'):
            module.put_bytes(store,'job/reference.png',b'different','image/png')

if __name__=='__main__':unittest.main()
