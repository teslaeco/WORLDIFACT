"""No-network tests for the 15-minute Astra request-timeout installer."""
import contextlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import install_request_timeout900 as update


class FakeOperations:
    def __init__(self, failure=None):
        self.failure=failure; self.events=[]
    def preflight(self):
        self.events.append('preflight')
        if self.failure=='active': raise update.base.InstallError('active')
    @contextlib.contextmanager
    def quiesce(self):
        self.events.append('quiesce'); yield
    def assert_idle(self): self.events.append('idle')
    def verify(self, workspace):
        self.events.append('verify')
        if self.failure=='verify': raise RuntimeError('fixture')
        # genuine verifier refreshes this receipt in production
        (self.source/update.base.RECEIPT).write_text('{"verified":true}')
    def start(self): self.events.append('start')
    def stop(self): self.events.append('stop')
    def health(self, enabled): self.events.append('health')


class TimeoutInstallerTests(unittest.TestCase):
    def setUp(self):
        t=tempfile.TemporaryDirectory(); self.addCleanup(t.cleanup)
        self.root=Path(t.name); self.source=self.root/'worker'; self.source.mkdir()
        self.runner=self.source/update.RUNNER
        self.original=("prefix\n"+update.OLD+"\nsuffix\n").encode()
        self.runner.write_bytes(self.original)
        receipt=self.source/update.base.RECEIPT; receipt.parent.mkdir(parents=True); receipt.write_text('{"old":true}')
        self.model=self.source/'state/jobs/preserved.glb'; self.model.parent.mkdir(parents=True); self.model.write_bytes(b'ORIGINAL_MODEL')
        self.pay=self.source/'state/payment-canary.json'; self.pay.write_text('{"credits":3805}')
        self.addCleanup(patch.stopall)
        patch.object(update.cache,'check_health').start()
        patch.object(update.base,'receipt_matches',return_value=True).start()

    def ops(self,failure=None):
        o=FakeOperations(failure); o.source=self.source; return o

    def preserved(self):
        self.assertEqual(self.model.read_bytes(),b'ORIGINAL_MODEL')
        self.assertEqual(self.pay.read_text(),'{"credits":3805}')

    def test_patch_is_exactly_180_to_900_and_compiles(self):
        patched,changed=update.patch_runner(self.original)
        self.assertTrue(changed); self.assertIn(update.NEW.encode(),patched); self.assertNotIn(update.OLD.encode(),patched)
        second,changed2=update.patch_runner(patched); self.assertFalse(changed2); self.assertEqual(second,patched)

    def test_unknown_or_multiple_context_stops(self):
        for raw in [b'no timeout', (update.OLD+'\n'+update.OLD).encode(), (update.OLD+'\n'+update.NEW).encode()]:
            with self.subTest(raw=raw), self.assertRaises(update.base.InstallError): update.patch_runner(raw)

    def test_approval_required_before_install(self):
        with self.assertRaises(update.base.InstallError): update.install(self.source,self.root/'backup',self.ops(),approved=False)
        self.assertEqual(self.runner.read_bytes(),self.original); self.preserved()

    def test_success_changes_only_runner_and_runtime_receipt_side_effect_of_verifier(self):
        ops=self.ops()
        result=update.install(self.source,self.root/'backup',ops,approved=True)
        self.assertEqual(result['phase'],'ASTRA_REQUEST_TIMEOUT900_VERIFIED')
        self.assertEqual(result['astra_request_timeout_seconds'],900)
        self.assertEqual(result['max_provider_usd'],1.75)
        self.assertFalse(result['payment_settings_changed']); self.assertFalse(result['paid_generation_requested'])
        self.assertIn(update.NEW.encode(),self.runner.read_bytes())
        self.assertEqual(ops.events,['preflight','quiesce','idle','verify','start','health'])
        self.preserved()

    def test_verification_failure_rolls_back_runner_and_receipt(self):
        original_receipt=(self.source/update.base.RECEIPT).read_bytes()
        ops=self.ops('verify')
        with self.assertRaises(update.base.InstallError): update.install(self.source,self.root/'backup',ops,approved=True)
        self.assertEqual(self.runner.read_bytes(),self.original)
        self.assertEqual((self.source/update.base.RECEIPT).read_bytes(),original_receipt)
        self.preserved()

    def test_active_job_stops_before_backup_or_quiesce(self):
        ops=self.ops('active')
        with self.assertRaises(update.base.InstallError): update.install(self.source,self.root/'backup',ops,approved=True)
        self.assertEqual(ops.events,['preflight']); self.assertFalse((self.root/'backup').exists()); self.preserved()

    def test_already_patched_is_read_only_and_idempotent(self):
        self.runner.write_bytes(update.patch_runner(self.original)[0])
        ops=self.ops()
        result=update.install(self.source,self.root/'backup',ops,approved=True)
        self.assertEqual(result['phase'],'ALREADY_VERIFIED'); self.assertEqual(ops.events,[])
        self.assertFalse((self.root/'backup').exists()); self.preserved()

    def test_default_cli_is_plan_only(self):
        with patch('sys.argv',['install_request_timeout900.py']), patch.object(update,'install') as install:
            update.main(); install.assert_not_called()


if __name__=='__main__': unittest.main()
