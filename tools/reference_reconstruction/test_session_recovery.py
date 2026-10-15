"""Offline transport/lifecycle regression tests. No real provider or GPU calls."""
from __future__ import annotations
import concurrent.futures,json,sys,tempfile,time,unittest
from pathlib import Path
from official_demo_once import session_steps,TRANSPORT_WORKERS
from bounded_worker import supervise,SUCCESS

JOB={'seed':20261015,'resolution':1024,'decimation_target':500000,'texture_size':4096}
class Pending:
    def __init__(self,value=None,error=None):self.value=value;self.error=error;self.cancelled=False
    def result(self,timeout=None):
        if self.error:raise self.error
        return self.value
    def cancel(self):self.cancelled=True
class FakeClient:
    def __init__(self,failed=None):self.failed=failed;self.calls=[]
    def submit(self,*args,api_name,**kwargs):
        self.calls.append(api_name)
        if api_name==self.failed:return Pending(error=TimeoutError('offline simulated delay'))
        return Pending(('<fixture>','<fixture>') if api_name=='/extract_glb' else '')

class SessionRecoveryTests(unittest.TestCase):
    def exercise(self,failed=None):
        client=FakeClient(failed);report={'generationRequestsAttempted':0,'exportRequestsAttempted':0}
        snapshots=[]
        with tempfile.TemporaryDirectory() as d:
            try:session_steps(client,Path(d)/'input.png',JOB,Path(d),report,
              lambda:snapshots.append(dict(report)),lambda p:p)
            except TimeoutError:pass
        return client,report,snapshots
    def test_sequential_limits_are_not_transport_thread_count(self):
        self.assertGreaterEqual(TRANSPORT_WORKERS,4)
        client,r,_=self.exercise()
        self.assertEqual(client.calls,['/start_session','/image_to_3d','/extract_glb'])
        self.assertEqual(r['generationRequestsAttempted'],1)
        self.assertEqual(r['exportRequestsAttempted'],1)
    def test_session_timeout_never_uploads_or_generates(self):
        c,r,_=self.exercise('/start_session')
        self.assertEqual(c.calls,['/start_session'])
        self.assertEqual(r['generationRequestsAttempted'],0)
        self.assertEqual(r['exportRequestsAttempted'],0)
        self.assertEqual(r['remoteGenerationCompletion'],'NOT_SUBMITTED')
        self.assertFalse(r.get('imageUploadAttempted',False))
    def test_generation_timeout_is_uncertain_and_never_retried(self):
        c,r,_=self.exercise('/image_to_3d')
        self.assertEqual(c.calls,['/start_session','/image_to_3d'])
        self.assertEqual(r['status'],'BLOCKED_NO_RETRY')
        self.assertEqual(r['remoteGenerationCompletion'],'UNKNOWN')
        self.assertTrue(r['reconcileBeforeAnyNewAttempt'])
    def test_export_timeout_preserves_generation_without_second_inference(self):
        c,r,_=self.exercise('/extract_glb')
        self.assertEqual(c.calls.count('/image_to_3d'),1)
        self.assertEqual(r['remoteGenerationCompletion'],'RETURNED')
        self.assertEqual(r['failedPhase'],'EXPORT_SUBMIT')
    def test_claim_written_before_each_generation_submission(self):
        c,r,states=self.exercise()
        claim=next(x for x in states if x['phase']=='GENERATION_SUBMIT')
        self.assertEqual(claim['generationRequestsAttempted'],1)
        self.assertEqual(claim['remoteGenerationCompletion'],'UNKNOWN')
    def test_shared_executor_fixture_exposes_one_worker_starvation(self):
        # Model of Gradio 2.0.3's prediction/helper scheduling, not a GPU task.
        def exercise(workers):
            pool=concurrent.futures.ThreadPoolExecutor(max_workers=workers)
            def prediction():
                helper=pool.submit(lambda:123)
                try:return helper.result(timeout=.2)
                except concurrent.futures.TimeoutError:return 'starved'
            result=pool.submit(prediction).result(timeout=2)
            pool.shutdown(wait=True);return result
        self.assertEqual(exercise(1),'starved')
        self.assertEqual(exercise(TRANSPORT_WORKERS),123)
    def test_supervisor_terminates_hung_cleanup_after_terminal_receipt(self):
        with tempfile.TemporaryDirectory() as d:
            receipt=Path(d)/'attempt.json';watch=Path(d)/'supervisor.json'
            code="import json,time;from pathlib import Path;Path(%r).write_text(json.dumps({'status':'BLOCKED_NO_RETRY','generationRequestsAttempted':0}));time.sleep(20)"%str(receipt)
            start=time.monotonic();exitcode=supervise([sys.executable,'-c',code],receipt,watch,3,.1,.1)
            self.assertEqual(exitcode,2);self.assertLess(time.monotonic()-start,2)
            data=json.loads(watch.read_text())
            self.assertEqual(data['reason'],'TERMINAL_RECEIPT_THREAD_CLEANUP')
            self.assertEqual(json.loads(receipt.read_text())['generationRequestsAttempted'],0)
    def test_supervisor_bounds_missing_receipt_without_remote_success_claim(self):
        with tempfile.TemporaryDirectory() as d:
            receipt=Path(d)/'none.json';watch=Path(d)/'supervisor.json'
            start=time.monotonic()
            self.assertEqual(supervise([sys.executable,'-c','import time;time.sleep(20)'],receipt,watch,.4,.1,.1),2)
            self.assertLess(time.monotonic()-start,2)
            data=json.loads(watch.read_text())
            self.assertEqual(data['reason'],'HARD_WALL_CLOCK_LIMIT')
            self.assertIsNone(data['generationRequestsAttempted'])
            self.assertFalse(data['remoteCompletionConfirmedBySupervisor'])
    def test_success_receipt_survives_hung_executor(self):
        with tempfile.TemporaryDirectory() as d:
            receipt=Path(d)/'attempt.json';watch=Path(d)/'supervisor.json'
            code="import json,time;from pathlib import Path;Path(%r).write_text(json.dumps({'status':%r,'generationRequestsAttempted':1}));time.sleep(20)"%(str(receipt),SUCCESS)
            self.assertEqual(supervise([sys.executable,'-c',code],receipt,watch,3,.1,.1),0)
            self.assertEqual(json.loads(receipt.read_text())['status'],SUCCESS)
    def test_existing_attempt_cannot_be_overwritten(self):
        with tempfile.TemporaryDirectory() as d:
            receipt=Path(d)/'attempt.json';receipt.write_text('{}')
            with self.assertRaises(FileExistsError):
                supervise([sys.executable,'-c','print(1)'],receipt,Path(d)/'supervisor.json')
            self.assertEqual(receipt.read_text(),'{}')

if __name__=='__main__':unittest.main(verbosity=2)
