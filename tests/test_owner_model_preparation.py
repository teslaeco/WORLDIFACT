import importlib.util
import json
from pathlib import Path
import unittest

spec=importlib.util.spec_from_file_location('owner_prepare',Path(__file__).resolve().parents[1]/'tools/runpod_owner_models/prepare.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class Memory:
    def __init__(self):self.objects={}
    def create_json(self,key,value):
        if key in self.objects:return False
        self.objects[key]=json.dumps(value).encode();return True
    def read(self,key,limit):return self.objects.get(key)

class PreparationRecovery(unittest.TestCase):
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
