import copy
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import threading
import unittest
import uuid
from concurrent.futures import ThreadPoolExecutor

SOURCE = os.environ.get('MODEL_EXECUTION_SOURCE')
if SOURCE:
    # Integration with the exact captured installed dependencies.
    sys.path.insert(0, SOURCE)
else:
    # Unit tests use repository guard IO and its real diagnostic class. No
    # provider, Blender, installed receipts or live runtime are involved.
    from types import ModuleType
    root = Path(__file__).resolve().parents[2]
    sys.path.insert(0, str(root / 'tools/profit_guard'))
    sys.path.insert(0, str(root / 'tools/model_prebuild'))
    import astra_spend
    import prebuild_patch
    diagnostic = ModuleType('astra_spend_v2')
    diagnostic.legacy = astra_spend
    exec(prebuild_patch.ERRORS, diagnostic.__dict__)
    sys.modules['astra_spend_v2'] = diagnostic
spec = importlib.util.spec_from_file_location('studio_execution', Path(__file__).with_name('studio_execution.py'))
m = importlib.util.module_from_spec(spec); sys.modules[spec.name] = m; spec.loader.exec_module(m)

class ExecutionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.folder = self.base / str(uuid.uuid4()); self.folder.mkdir()
        self.ledger = self.base / 'ledger'
        self.terms = {'revision': m.REVISION, 'model': 'sol', 'mode': 'standard'}
    def bind(self, model='sol', mode='standard'):
        self.terms.update(model=model, mode=mode)
        m.bind(self.folder, self.terms, self.ledger)
    def payload(self):
        return {'model': m.MODELS[self.terms['model']][0], 'input': 'Build one chess rook', 'tools': [], 'max_output_tokens': 16000}
    def protect(self, payload=None):
        p = self.payload() if payload is None else payload
        token = m.protect(self.folder, p, {}, counter=lambda *args: 18000, ledger_root=self.ledger)
        return token, p
    def response(self, rid='resp_test'):
        return {'id': rid, 'model': m.MODELS[self.terms['model']][0], 'status': 'completed', 'service_tier': 'fast' if self.terms['mode']=='fast' else 'default', 'usage': {'input_tokens':18000, 'output_tokens':4000,'total_tokens':22000}}
    def test_immutable_model_mode_and_old_ledger(self):
        self.bind(); m.bind(self.folder,self.terms,self.ledger)
        for change in ({'model':'luna'}, {'mode':'fast'}):
            with self.assertRaises(ValueError): m.bind(self.folder,{**self.terms,**change},self.ledger)
        with self.assertRaises(ValueError): m.bind(self.folder,None,self.ledger)
        other=self.base/str(uuid.uuid4());other.mkdir()
        old=m.legacy.ledger_folder(other,self.ledger)
        m.legacy.atomic(old/m.legacy.STATE,{'revision':'old','reserved':123})
        before=(old/m.legacy.STATE).read_bytes()
        with self.assertRaises(ValueError): m.bind(other,self.terms,self.ledger)
        self.assertEqual((old/m.legacy.STATE).read_bytes(),before)
    def test_each_model_mode_caps_concurrent_requests_before_dispatch(self):
        for model in m.MODELS:
            for mode in ('standard','fast'):
                self.folder=self.base/str(uuid.uuid4());self.folder.mkdir();self.bind(model,mode)
                def reserve(_):
                    try:return self.protect()[0]
                    except m.SpendError:return None
                with ThreadPoolExecutor(max_workers=8) as pool: tokens=list(pool.map(reserve,range(12)))
                self.assertTrue(any(tokens));self.assertTrue(any(t is None for t in tokens))
                with m.ledger(self.folder,self.ledger) as (_,terms,state):
                    self.assertLessEqual(m.used(state),m.MODELS[model][1])
                    self.assertEqual(len(state['holds']),len(set(t for t in tokens if t)))
    def test_incomplete_wrong_model_and_duplicate_usage_never_release(self):
        self.bind();token,p=self.protect()
        with m.ledger(self.folder,self.ledger) as (_,_,state): before=copy.deepcopy(state)
        for change in ({'status':'incomplete'},{'model':'gpt-6-luna'},{'service_tier':'fast'},{'usage':{'input_tokens':1,'output_tokens':1,'total_tokens':7}}):
            self.assertFalse(m.settle_completed(self.folder,token,{**self.response(),**change},self.ledger))
        with m.ledger(self.folder,self.ledger) as (_,_,state): self.assertEqual(state,before)
        self.assertTrue(m.settle_completed(self.folder,token,self.response(),self.ledger))
        self.assertTrue(m.settle_completed(self.folder,token,self.response(),self.ledger))
        token2,p=self.protect();self.assertFalse(m.settle_completed(self.folder,token2,self.response(),self.ledger))
    def test_sealed_job_blocks_reservation_and_retains_terminal_upper_bound(self):
        self.bind();token,p=self.protect()
        receipt=m.seal_terminal(self.folder,self.folder.name,self.ledger)
        with self.assertRaises(m.SpendError): self.protect()
        self.assertTrue(m.settle_completed(self.folder,token,self.response(),self.ledger))
        self.assertEqual(m.seal_terminal(self.folder,self.folder.name,self.ledger),receipt)
        self.assertEqual(receipt['model'],'gpt-6.1-sol')
    def test_missing_terms_cannot_fall_back_to_astra(self):
        self.bind()
        root = m.root_for(self.folder, self.ledger)
        (root / m.TERMS).unlink()
        with self.assertRaises(ValueError): m.job_terms(self.folder, self.ledger)
        with self.assertRaises(ValueError): m.bind(self.folder, None, self.ledger)
    def test_wrong_model_and_hosted_tools_never_reach_counter(self):
        self.bind()
        for change in ({'model':'gpt-6-astra'},{'tools':[{'type':'web_search'}]},{'previous_response_id':'resp_other'},{'service_tier':'ultrafast'}):
            with self.assertRaises(m.SpendError):
                m.protect(self.folder,{**self.payload(),**change},{},counter=lambda *args:self.fail('Provider called'),ledger_root=self.ledger)
    def test_fixed_rates_cover_cache_write_regional_fast_without_changing_caps(self):
        self.bind('sol','fast');token,p=self.protect()
        self.assertEqual(p['service_tier'],'fast')
        self.assertEqual(p['model'],'gpt-6.1-sol')
        self.assertEqual(m.cost(self.terms,1000,1000),27500)
        self.assertEqual(m.MODELS['sol'][1],350000)

if __name__=='__main__': unittest.main()
