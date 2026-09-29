import contextlib
import copy
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch
import astra_spend as legacy
import astra_spend_v2 as guard
import install as old_install
import install_tuning as tune

NOW = 1790640000

def completed(index, input_tokens, output_tokens):
    return {'id':'resp_fixture_'+str(index),'status':'completed','model':'gpt-6-astra','service_tier':'default',
            'usage':{'input_tokens':input_tokens,'output_tokens':output_tokens,'total_tokens':input_tokens+output_tokens}}

class OutputPolicyTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name);self.job=self.root/'job';self.job.mkdir()
        self.patch=patch.object(legacy,'LEDGER_ROOT',self.root/'private-funds');self.patch.start()
        self.clock=patch.object(guard.time,'time',return_value=NOW);self.clock.start()
    def tearDown(self):
        self.clock.stop();self.patch.stop();self.temp.cleanup()
    def state(self): return guard.validate_state(legacy.read_json(legacy.ledger_folder(self.job)/legacy.STATE))

    def test_contract_build_review_finish_fit_without_raising_job_ceiling(self):
        for i,(input_tokens,output_tokens) in enumerate([(2000,500),(12000,5000),(16000,800),(18000,200)]):
            payload={'model':'gpt-6-astra','max_output_tokens':16000,'reasoning':{'effort':'high'},'input':'fixture'}
            def counter(body,headers):
                self.assertEqual(body['reasoning']['effort'],'low');return input_tokens
            token=guard.protect(self.job,payload,{},counter=counter)
            self.assertGreaterEqual(payload['max_output_tokens'],output_tokens)
            self.assertLessEqual(guard.used(self.state()),1_750_000)
            self.assertTrue(guard.settle_completed(self.job,token,completed(i,input_tokens,output_tokens)))
        self.assertEqual(self.state()['requests'],4)
        self.assertLess(guard.used(self.state()),1_100_000)
        self.assertEqual(guard.CEILING_MICRO_USD,legacy.CEILING_MICRO_USD)
        self.assertFalse((self.job/legacy.STATE).exists())

    def test_incomplete_disconnect_and_invalid_usage_keep_full_reserved_funds(self):
        token,output=guard.reserve(self.job,1000,16000)
        original=self.state()
        bad=[]
        for key,value in [('status','incomplete'),('model','gpt-6-sol'),('service_tier','priority'),('id','invalid')]:
            r=completed(1,1000,500);r[key]=value;bad.append(r)
        for usage in ({}, {'input_tokens':1000,'output_tokens':True,'total_tokens':1001},
                      {'input_tokens':99999,'output_tokens':500,'total_tokens':100499},
                      {'input_tokens':1000,'output_tokens':output+1,'total_tokens':1001+output}):
            r=completed(1,1000,500);r['usage']=usage;bad.append(r)
        for r in bad:
            self.assertFalse(guard.settle_completed(self.job,token,r));self.assertEqual(self.state(),original)
        # Recreating job outputs is not a funding reset.
        self.job.rmdir();self.job.mkdir();self.assertEqual(self.state(),original)

    def test_duplicate_completion_cannot_release_funds_twice_or_for_another_call(self):
        token,_=guard.reserve(self.job,1000,8192)
        value=completed(1,1000,500)
        self.assertTrue(guard.settle_completed(self.job,token,value));once=self.state()
        with ThreadPoolExecutor(8) as pool:
            self.assertTrue(all(pool.map(lambda _:guard.settle_completed(self.job,token,value),range(30))))
        self.assertEqual(self.state(),once)
        other,_=guard.reserve(self.job,1000,8192);before=self.state()
        self.assertFalse(guard.settle_completed(self.job,other,value));self.assertEqual(self.state(),before)

    def test_legacy_uncertain_spend_is_frozen_and_never_refunded_on_migration(self):
        root=legacy.ledger_folder(self.job)
        legacy.atomic(root/legacy.STATE,{'revision':legacy.REVISION,'reserved':1_600_000,'requests':9})
        token,out=guard.reserve(self.job,0,16000)
        self.assertLess(out,3000);self.assertEqual(self.state()['legacyHeld'],1_600_000)
        self.assertTrue(guard.settle_completed(self.job,token,completed(1,0,100)))
        self.assertGreaterEqual(guard.used(self.state()),1_600_000)
        # A rollback to old code rejects new state instead of resetting it.
        with self.assertRaises(legacy.SpendError):legacy.reserve(self.job,0,8192)

    def test_concurrent_requests_corruption_and_expiry_fail_closed(self):
        def reserve(_):
            try:return guard.reserve(self.job,1000,16000)[1]
            except guard.SpendError:return 0
        with ThreadPoolExecutor(10) as pool: list(pool.map(reserve,range(30)))
        self.assertLessEqual(guard.used(self.state()),1_750_000)
        state=self.state();key=next(iter(state['holds']));state['holds'][key]['held']=0
        with self.assertRaises(guard.SpendError):guard.validate_state(state)
        with self.assertRaises(guard.SpendError):guard.reserve(self.job,1,1000,now=guard.VALID_UNTIL)
        with self.assertRaises(guard.SpendError):guard.reserve(self.job,65537,1000)

    def test_tuner_defaults_to_plan_without_reading_or_changing_the_vm(self):
        with patch('sys.argv',['install_tuning.py']),patch.object(tune,'install') as install,contextlib.redirect_stdout(io.StringIO()):
            tune.main();install.assert_not_called()

    def test_unknown_runner_is_not_tuned_from_a_guess(self):
        with self.assertRaises(old_install.base.InstallError):tune.changes({'codex_runner.py':b'# unknown','fast_preview.py':b'# unknown'},b'# policy')

@unittest.skipUnless(os.environ.get('FAST_INSTALLED_FIXTURE'),'Exact source fixture is reconstructed by the dedicated workflow')
class ExactTunerTests(unittest.TestCase):
    def test_patched_real_runner_low_reasoning_and_same_stream_only_completion_hook(self):
        source=Path(os.environ['FAST_INSTALLED_FIXTURE'])
        before={name:(source/name).read_bytes() for name in old_install.EXPECTED}
        installed=old_install.changes(before,Path(legacy.__file__).read_bytes())
        current={name:installed[name] for name in old_install.EXPECTED}
        self.assertEqual(tune.original_variant(current),'FAST_V33_WITH_SPEND')
        result=tune.changes(current,Path(guard.__file__).read_bytes())
        runner=result['codex_runner.py'].decode()
        self.assertIn("'model_reasoning_effort':'low'",runner)
        self.assertIn("'effort':'low'",runner)
        self.assertIn(old_install.OLD_FAST_CALL,runner)
        self.assertEqual(runner.count('astra_reservation = astra_spend_v2.protect'),1)
        self.assertEqual(runner.count('astra_spend_v2.settle_completed'),1)
        self.assertLess(runner.index('with opener.open(request,timeout=180)'),runner.index('astra_spend_v2.settle_completed'))
        self.assertIn("if event.get('type') == 'response.completed':",runner)
        self.assertIn('outer.unknown_usage=True',runner)
        for name,raw in result.items():compile(raw,name,'exec')

if __name__=='__main__':unittest.main()
