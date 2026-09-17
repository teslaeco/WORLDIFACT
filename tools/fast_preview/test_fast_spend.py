"""Local fixtures only: never uses a provider, credentials or a real service."""
from contextlib import contextmanager
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch
import fast_spend as spend
import install_spend as installer

class CostTests(unittest.TestCase):
    def test_concurrent_and_recreated_reservations_never_exceed_four_dollars(self):
        with tempfile.TemporaryDirectory() as directory:
            results=[]
            def attempt():
                try: results.append(spend.reserve(directory,20000,8192,now=1789660000))
                except spend.SpendError: pass
            threads=[threading.Thread(target=attempt) for _ in range(12)]
            for t in threads:t.start()
            for t in threads:t.join()
            state=json.loads((Path(directory)/'fast-spend.json').read_text())
            self.assertLessEqual(state['reserved_micro_usd'],4_000_000)
            self.assertEqual(state['requests'],len(results))
            self.assertEqual(len(results),3)
            with self.assertRaises(spend.SpendError):spend.reserve(directory,20000,8192,now=1789660000)
    def test_unknown_usage_has_no_refund_and_bad_or_expired_state_fails_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(spend.SpendError):spend.reserve(directory,200000,8192,now=1789660000)
            self.assertFalse((Path(directory)/'fast-spend.json').exists())
            state=spend.reserve(directory,1000,1000,now=1789660000)
            self.assertEqual(state['actual_cost'],'UNKNOWN_UNTIL_PROVIDER_USAGE')
            with self.assertRaises(spend.SpendError):spend.reserve(directory,1,1,now=spend.VALID_UNTIL)
            (Path(directory)/'fast-spend.json').write_text('{"revision":"wrong","reserved_micro_usd":0,"requests":0}')
            with self.assertRaises(spend.SpendError):spend.reserve(directory,1,1,now=1789660000)
    def test_provider_context_and_paid_tool_bypasses_are_rejected(self):
        payload={'model':'gpt-6-astra','input':'one object','tools':[{'type':'custom','name':'exec'}]}
        self.assertEqual(spend.count_payload(payload)['input'],'one object')
        for change in ({'previous_response_id':'private'},{'conversation':'private'},{'prompt':{'id':'private'}},{'background':True},
                       {'tools':[{'type':'web_search'}]},{'input':[{'type':'input_image','image_url':'https://private'}]},
                       {'input':[{'type':'additional_tools','tools':[{'type':'namespace','tools':[{'type':'code_interpreter'}]}]}]}):
            with self.assertRaises(spend.SpendError):spend.count_payload({**payload,**change})
    def test_protect_forces_default_tier_and_reserves_before_returning(self):
        with tempfile.TemporaryDirectory() as directory,patch.object(spend,'input_tokens',return_value=1000) as counter,patch.object(spend.time,'time',return_value=1789660000):
            payload={'model':'gpt-6-astra','input':'one object','tools':[{'type':'custom','name':'exec'}],'max_output_tokens':2000,'service_tier':'fast'}
            spend.protect(directory,payload,{'Authorization':'Bearer fixture'})
            self.assertEqual(payload['service_tier'],'default')
            self.assertEqual(json.loads((Path(directory)/'fast-spend.json').read_text())['requests'],1)
            counter.assert_called_once()
    def test_unavailable_token_count_never_returns_a_generation_permission(self):
        with tempfile.TemporaryDirectory() as directory,patch.object(spend,'input_tokens',side_effect=spend.SpendError('fixture unavailable')):
            with self.assertRaises(spend.SpendError):spend.protect(directory,{'model':'gpt-6-astra','input':'object','tools':[],'max_output_tokens':100}, {})
            self.assertFalse((Path(directory)/'fast-spend.json').exists())
    def test_exact_installed_patch_preserves_standard_and_has_a_pre_request_guard(self):
        root=Path(os.environ['FAST_INSTALLED_FIXTURE'])
        originals={n:(root/n).read_bytes() for n in installer.EXPECTED}
        changed=installer.changes(originals,Path(spend.__file__).read_bytes())
        runner=changed['codex_runner.py'].decode()
        self.assertIn("if outer.fast_limits['fast']:\n                        try:\n                            fast_spend.protect",runner)
        self.assertLess(runner.index('fast_spend.protect'),runner.index("request=urllib.request.Request('https://api.openai.com/v1/responses'"))
        self.assertIn("value['fastBudgetMaxUsd']",changed['fast_preview.py'].decode())
        bad={**originals,'codex_runner.py':originals['codex_runner.py']+b'\n'}
        with self.assertRaises(ValueError):installer.changes(bad,Path(spend.__file__).read_bytes())

class InstallTests(unittest.TestCase):
    def fixture(self,directory,fail=False):
        from types import SimpleNamespace
        root=Path(directory);source=root/'worker';source.mkdir()
        template=Path(os.environ['FAST_INSTALLED_FIXTURE'])
        for n in installer.EXPECTED:(source/n).write_bytes((template/n).read_bytes())
        (source/'receipt').write_bytes(b'old-receipt')
        calls=[]
        def write(p,data,mode=0o600):p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data)
        def summary(p,phase,**kw):write(p/'INSTALL_STATUS.json',json.dumps({'phase':phase,**kw}).encode());return {'phase':phase}
        base=SimpleNamespace(RECEIPT='receipt',read_regular=lambda p,*_:p.read_bytes(),atomic_write=write,summary_file=summary)
        class Ops:
            def preflight(self):calls.append('preflight')
            def assert_idle(self):calls.append('idle')
            @contextmanager
            def quiesce(self):calls.append('stop-under-lock');yield
            def verify(self,_):
                calls.append('offline-check')
                if fail:raise ValueError('fixture failure')
                (source/'receipt').write_bytes(b'new-verified-receipt')
            def start(self):calls.append('start')
            def stop(self):calls.append('stop')
            def health(self,_):calls.append('health')
        return source,base,Ops(),calls
    def test_success_restarts_and_preserves_originals(self):
        with tempfile.TemporaryDirectory() as directory:
            source,base,ops,calls=self.fixture(directory)
            result=installer.install(base,source,Path(directory)/'backup',ops,Path(spend.__file__).read_bytes())
            self.assertEqual(result['phase'],'INSTALLED_AND_LOCALLY_VERIFIED')
            self.assertEqual(calls[-2:],['start','health'])
            self.assertTrue((source/'fast_spend.py').exists())
            self.assertEqual((Path(directory)/'backup/original-receipt.json').read_bytes(),b'old-receipt')
    def test_failure_restores_working_fast_and_never_touches_tunnel(self):
        with tempfile.TemporaryDirectory() as directory:
            source,base,ops,calls=self.fixture(directory,True)
            before={n:(source/n).read_bytes() for n in installer.EXPECTED}
            with self.assertRaises(RuntimeError):installer.install(base,source,Path(directory)/'backup',ops,Path(spend.__file__).read_bytes())
            for n in before:self.assertEqual((source/n).read_bytes(),before[n])
            self.assertFalse((source/'fast_spend.py').exists())
            self.assertEqual((source/'receipt').read_bytes(),b'old-receipt')
            self.assertEqual(calls[-2:],['start','health'])
            self.assertEqual(json.loads((Path(directory)/'backup/INSTALL_STATUS.json').read_text())['phase'],'ROLLED_BACK')
    def test_existing_guard_or_active_job_is_not_overwritten(self):
        with tempfile.TemporaryDirectory() as directory:
            source,base,ops,calls=self.fixture(directory)
            (source/'fast_spend.py').write_bytes(b'existing')
            with self.assertRaises(ValueError):installer.install(base,source,Path(directory)/'backup',ops,Path(spend.__file__).read_bytes())
            self.assertEqual(calls,['preflight'])
            (source/'fast_spend.py').unlink()
            def active():raise ValueError('active job')
            ops.preflight=active
            with self.assertRaises(ValueError):installer.install(base,source,Path(directory)/'backup',ops,Path(spend.__file__).read_bytes())
            self.assertFalse((Path(directory)/'backup').exists())

if __name__=='__main__':unittest.main()
