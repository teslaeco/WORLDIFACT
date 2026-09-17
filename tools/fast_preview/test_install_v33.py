"""Real temp files/SQLite, injected service operations; no production or paid API."""
from contextlib import contextmanager
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch
from installed_v33 import INSTALLED, installed_server_from_reviewed, stage
import install_v33 as installer

SOURCE=Path(os.environ['FROGE_SOURCE_ROOT'])


class Operations:
    def __init__(self, root):
        self.root=root; self.events=[]; self.active=True; self.busy=False; self.failure=None
    def preflight(self):
        self.events.append('preflight')
        if self.busy: raise installer.InstallError('Active job')
    def assert_idle(self):
        if self.busy: raise installer.InstallError('Active job')
    @contextmanager
    def quiesce(self):
        self.assert_idle(); self.events.append('stop'); self.active=False
        yield
    def verify(self, workspace):
        self.events.append('verify')
        if self.failure=='verify': raise installer.InstallError('Fixture verification failed')
        # Fixture receipt only inside a temp directory, never the live service.
        value={'sources':{n:hashlib.sha256((self.root/n).read_bytes()).hexdigest() for n in ('codex_runner.py','blender_mcp.py')},
               'cli_mcp_roundtrip':True,'code_mode_roundtrip':True,'blender_build_roundtrip':True}
        (self.root/installer.RECEIPT).write_text(json.dumps(value))
    def enable(self): self.events.append('enable')
    def disable(self): self.events.append('disable')
    def start(self): self.events.append('start'); self.active=True
    def stop(self): self.events.append('stop'); self.active=False
    def health(self, fast):
        self.events.append('fast_health' if fast else 'standard_health')
        if fast and self.failure=='health': raise installer.InstallError('New worker health failed')
        if not fast and self.failure=='rollback': raise installer.InstallError('Old worker could not restart')


class InstallTests(unittest.TestCase):
    def setUp(self):
        temp=tempfile.TemporaryDirectory(); self.addCleanup(temp.cleanup)
        self.home=Path(temp.name); self.root=self.home/'froge-connector'; self.root.mkdir()
        for name in INSTALLED:
            raw=(SOURCE/name).read_bytes()
            if name=='server.py': raw=installed_server_from_reviewed(raw)
            path=self.root/name; path.parent.mkdir(exist_ok=True,parents=True); path.write_bytes(raw)
        receipt=self.root/installer.RECEIPT; receipt.parent.mkdir(parents=True)
        receipt.write_text('{"old_verified_receipt":"fixture-original"}')
        (self.root/'state/jobs').mkdir(parents=True)
        (self.root/'state/jobs/model.glb').write_bytes(b'EXISTING PRIVATE MODEL')
        (self.root/'state/config.json').write_bytes(b'PRIVATE-CONFIG-DO-NOT-COPY')
        self.before={name:(self.root/name).read_bytes() for name in INSTALLED}
        self.old_receipt=receipt.read_bytes(); self.workspace=self.home/'backup'
        self.ops=Operations(self.root)
    def run_install(self, **kw):
        return installer.install(self.root,self.workspace,self.ops,approved=True,**kw)
    def unchanged(self):
        for name,raw in self.before.items(): self.assertEqual((self.root/name).read_bytes(),raw)
        self.assertEqual((self.root/installer.RECEIPT).read_bytes(),self.old_receipt)
        self.assertFalse((self.root/'fast_preview.py').exists())
        self.assertEqual((self.root/'state/jobs/model.glb').read_bytes(),b'EXISTING PRIVATE MODEL')
        self.assertEqual((self.root/'state/config.json').read_bytes(),b'PRIVATE-CONFIG-DO-NOT-COPY')
    def test_no_approval_has_no_writes_or_service_actions(self):
        with self.assertRaises(installer.InstallError): installer.install(self.root,self.workspace,self.ops)
        self.assertFalse(self.workspace.exists()); self.assertEqual(self.ops.events,[]); self.unchanged()
    def test_active_job_and_changed_source_stop_before_service_changes(self):
        self.ops.busy=True
        with self.assertRaises(installer.InstallError): self.run_install()
        self.assertTrue(self.ops.active); self.assertFalse(self.workspace.exists()); self.unchanged()
        self.ops.busy=False
        (self.root/'server.py').write_text('unreviewed source')
        with self.assertRaises(ValueError): self.run_install()
        self.assertNotIn('stop',self.ops.events)
    def test_success_preserves_models_secrets_and_backups(self):
        result=self.run_install()
        self.assertEqual(result['phase'],'INSTALLED_AND_LOCALLY_VERIFIED')
        self.assertFalse(result['paid_generation_requested']); self.assertFalse(result['site_deployed'])
        self.assertTrue(installer.receipt_matches(self.root)); self.assertTrue(self.ops.active)
        self.assertIn('verify',self.ops.events); self.assertIn('fast_health',self.ops.events)
        for name,raw in self.before.items(): self.assertEqual((self.workspace/'originals'/name).read_bytes(),raw)
        self.assertEqual((self.root/'state/jobs/model.glb').read_bytes(),b'EXISTING PRIVATE MODEL')
        self.assertFalse(any(p.name=='config.json' for p in self.workspace.rglob('*')))
        self.assertEqual((self.root/'state/config.json').read_bytes(),b'PRIVATE-CONFIG-DO-NOT-COPY')
        second=self.home/'second'
        with self.assertRaises(ValueError): installer.install(self.root,second,self.ops,approved=True)
        self.assertTrue(self.ops.active)
    def test_failed_offline_verification_restores_originals_and_genuine_old_receipt(self):
        self.ops.failure='verify'
        with self.assertRaisesRegex(installer.InstallError,'restored'): self.run_install()
        self.unchanged(); self.assertTrue(self.ops.active)
        self.assertEqual(json.loads((self.workspace/'INSTALL_STATUS.json').read_text())['phase'],'ROLLED_BACK')
    def test_failed_post_start_health_restores_originals(self):
        self.ops.failure='health'
        with self.assertRaisesRegex(installer.InstallError,'restored'): self.run_install()
        self.unchanged(); self.assertIn('standard_health',self.ops.events)
    def test_source_race_does_not_overwrite_concurrent_edit_or_leave_worker_stopped(self):
        def racing_stage(source,destination):
            result=stage(source,destination); (source/'server.py').write_text('concurrent editor'); return result
        with self.assertRaises(installer.InstallError): self.run_install(stage_fn=racing_stage)
        self.assertEqual((self.root/'server.py').read_text(),'concurrent editor')
        self.assertTrue(self.ops.active)
    def test_idle_recheck_failure_does_not_leave_worker_stopped(self):
        checks=0
        def idle():
            nonlocal checks
            checks+=1
            if checks>1: raise installer.InstallError('Unexpected active job after stop')
        self.ops.assert_idle=idle
        with self.assertRaises(installer.InstallError): self.run_install()
        self.unchanged(); self.assertTrue(self.ops.active)
    def test_partial_write_failure_also_rolls_back_the_current_file(self):
        original=installer.atomic_write; failed=False
        def fail_after_replace(path,data,mode=0o600):
            nonlocal failed
            original(path,data,mode)
            if Path(path)==self.root/'codex_runner.py' and not failed:
                failed=True; raise OSError('Simulated fsync failure after replacement')
        with patch.object(installer,'atomic_write',side_effect=fail_after_replace):
            with self.assertRaises(installer.InstallError): self.run_install()
        self.unchanged(); self.assertTrue(self.ops.active)
    def test_symlink_target_is_never_overwritten(self):
        target=self.home/'outside'; target.write_text('do not overwrite')
        (self.root/'server.py').unlink(); (self.root/'server.py').symlink_to(target)
        with self.assertRaises(ValueError): self.run_install()
        self.assertEqual(target.read_text(),'do not overwrite'); self.assertNotIn('stop',self.ops.events)
    def test_real_sqlite_gate_blocks_new_accepted_jobs_until_worker_stops(self):
        database=self.root/'state/jobs.sqlite'
        with sqlite3.connect(database) as db: db.execute('CREATE TABLE jobs (state TEXT)')
        operations=installer.LiveOperations(self.root,self.home)
        events=[]
        def command(args,timeout=30):
            if 'stop' in args:
                with sqlite3.connect(database,timeout=0.01) as contender:
                    with self.assertRaises(sqlite3.OperationalError): contender.execute("INSERT INTO jobs VALUES ('queued')")
                events.append('stop'); return ''
            if '--property=MainPID' in args: return '0'
            if '--property=ActiveState' in args: return 'inactive'
            raise AssertionError(args)
        operations.command=command
        with operations.quiesce():
            operations.assert_idle()
            with sqlite3.connect(database,timeout=0.01) as db: db.execute("INSERT INTO jobs VALUES ('succeeded')")
        self.assertEqual(events,['stop'])


if __name__=='__main__': unittest.main()
