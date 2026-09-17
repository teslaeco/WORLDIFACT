import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from unittest.mock import patch
import oracle_budget_launch as launch

class LaunchTests(unittest.TestCase):
    def test_default_does_not_connect_or_modify_anything(self):
        with patch.object(sys,'argv',['launcher']),patch.object(launch,'read_public',side_effect=AssertionError('No network in plan mode')),redirect_stdout(io.StringIO()) as out:
            launch.main()
        self.assertIn('PLAN ONLY',out.getvalue())
    def test_package_names_and_fixed_sources_do_not_include_private_files(self):
        self.assertEqual(set(launch.PACKAGES),{'install_v33.py','fast_spend.py'})
        self.assertEqual(launch.PACKAGES['install_v33.py'][0],'install_spend.py')
        self.assertEqual(len(launch.SOURCE),40)
        self.assertEqual(len(launch.BASE_SHA256),64)
    def activation(self, response=None, bad_token=False):
        calls=[]
        with tempfile.TemporaryDirectory() as temp:
            home=Path(temp);state=home/'froge-connector/state';state.mkdir(parents=True)
            secret='fixture-local-secret-not-production-123456'
            (state/'config.json').write_text(json.dumps({'token':'bad' if bad_token else secret}))
            class Response:
                def __enter__(self):return self
                def __exit__(self,*_):return False
                def read(self,n):return json.dumps(response).encode()
            class Opener:
                def open(self, request, timeout):
                    calls.append(request)
                    self_check=request.full_url=='https://worldifact.xodobrox.workers.dev/api/studio/approved-test/activate'
                    if not self_check:raise AssertionError('Unexpected route')
                    if request.get_header('X-worldifact-owner')!=secret:raise AssertionError('Missing local auth')
                    if json.loads(request.data)!={'approval':'fast-test-20260917-usd5'}:raise AssertionError('Wrong approval')
                    return Response()
            with patch.object(Path,'home',return_value=home),patch('urllib.request.build_opener',return_value=Opener()),redirect_stdout(io.StringIO()) as out:
                try:exec(compile(launch.ACTIVATE,'activation-fixture','exec'),{})
                except SystemExit:pass
            text=out.getvalue();self.assertNotIn(secret,text)
            return calls,json.loads(text)
    def test_success_activates_but_does_not_submit_a_model(self):
        calls,data=self.activation({'activated':True,'limit':7,'used':6,'remaining':1,'expiresAt':'2026-09-17T19:00:00Z','paidGenerationRequested':False})
        self.assertEqual(len(calls),1)
        self.assertEqual(data['phase'],'APPROVED_FAST_TEST_READY')
        self.assertFalse(data['model_generation_requested'])
    def test_already_used_response_is_not_a_new_allowance(self):
        calls,data=self.activation({'activated':True,'limit':7,'used':7,'remaining':0,'expiresAt':'2026-09-17T19:00:00Z','paidGenerationRequested':False})
        self.assertEqual(len(calls),1)
        self.assertFalse(data['ready'])
        self.assertEqual(data['phase'],'APPROVED_TEST_ALREADY_RESERVED')
    def test_missing_local_auth_and_unbounded_response_fail_closed(self):
        calls,data=self.activation({},True)
        self.assertEqual(calls,[]);self.assertEqual(data['phase'],'ACTIVATION_NOT_CONFIRMED')
        calls,data=self.activation({'activated':True,'limit':999,'used':6,'remaining':993,'paidGenerationRequested':False})
        self.assertEqual(data['phase'],'ACTIVATION_NOT_CONFIRMED')
        self.assertEqual(len(calls),1)

if __name__=='__main__':unittest.main()
