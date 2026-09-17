"""No Oracle connection: real temp files, mocked service manager and transport."""
import base64
import contextlib
import hashlib
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import types
import unittest
from unittest.mock import patch
import oracle_launch as launch


def remote_functions():
    namespace={}
    exec(compile(launch.REMOTE.rsplit('\ntry:\n',1)[0],'<reviewed remote>','exec'),namespace)
    return namespace


class LauncherTests(unittest.TestCase):
    def setUp(self):
        temp=tempfile.TemporaryDirectory();self.addCleanup(temp.cleanup)
        self.home=Path(temp.name)
        self.ctx=remote_functions();self.calls=[];self.worker='active';self.tunnel='active'
        def state(unit,field='ActiveState'):
            if unit=='froge-worker.service':return self.worker
            if unit=='froge-tunnel.service':return self.tunnel
            return 'running' if field=='SubState' else 'active'
        def command(args,timeout=20):
            self.calls.append(args)
            return 'yes' if args[0]=='loginctl' else ''
        self.ctx['state']=state;self.ctx['command']=command
        self.raw=b'"""Fixture: do not execute an installer."""\n'
        self.expected={'install_v33.py':hashlib.sha256(self.raw).hexdigest()}
        self.encoded={'install_v33.py':base64.b64encode(self.raw).decode()}
        self.job=self.home/'.local/state/worldifact-fast-launch'/launch.SOURCE
        self.unit='worldifact-fast-v33-'+launch.SOURCE[:12]+'.service'
    def invoke(self,mode='apply',encoded=None):
        with patch('pathlib.Path.home',return_value=self.home),patch('pwd.getpwuid',return_value=types.SimpleNamespace(pw_name='opc')):
            return self.ctx['run'](mode,launch.SOURCE,self.expected,self.encoded if encoded is None else encoded)
    def observe(self):
        with patch('pathlib.Path.home',return_value=self.home):
            return self.ctx['observe'](self.job,self.unit,launch.SOURCE)
    def status(self,phase):
        workspace=self.home/'.local/state/worldifact-fast/20260917T141000Z-12345678'
        workspace.mkdir(parents=True,exist_ok=True)
        (workspace/'INSTALL_STATUS.json').write_text(json.dumps({'phase':phase,'sensitive':'not output'}))
        (self.job/'console.log').write_text('Maintenance workspace: '+str(workspace)+'\nprivate log not output\n')
    def test_default_invocation_never_downloads_or_connects(self):
        with patch.object(sys,'argv',['oracle_launch.py']),patch.object(launch,'connection',side_effect=AssertionError('No connection')),patch.object(launch,'package',side_effect=AssertionError('No download')),contextlib.redirect_stdout(io.StringIO()) as output:
            launch.main()
        self.assertIn('PLAN ONLY',output.getvalue())
    def test_status_does_not_create_files_or_launch_a_service(self):
        self.assertEqual(self.invoke('status')['phase'],'NOT_STARTED')
        self.assertFalse(self.job.exists());self.assertEqual(self.calls,[])
    def test_tampered_package_rejected_before_remote_writes_or_launch(self):
        with self.assertRaises(RuntimeError):self.invoke(encoded={'install_v33.py':base64.b64encode(b'wrong').decode()})
        self.assertFalse(self.job.exists());self.assertEqual(self.calls,[])
    def test_repeat_and_lost_launch_acknowledgement_never_start_twice(self):
        original=self.ctx['command']
        def lose(args,timeout=20):
            if args[0]=='systemd-run':
                self.calls.append(args);raise subprocess.TimeoutExpired(args,timeout)
            return original(args,timeout)
        self.ctx['command']=lose
        first=self.invoke();second=self.invoke()
        starts=[args for args in self.calls if args[0]=='systemd-run']
        self.assertEqual(len(starts),1)
        self.assertEqual(first['phase'],'INSTALLATION_RUNNING');self.assertEqual(second['phase'],first['phase'])
        self.assertIn('--approve-service-restart',starts[0]);self.assertIn('--property=Type=exec',starts[0])
        self.assertNotIn('--scope',starts[0]);self.assertNotIn('--wait',starts[0])
        self.assertEqual((self.job/'install_v33.py').read_bytes(),self.raw)
        self.assertEqual((self.job/'launch.json').stat().st_mode&0o777,0o600)
    def test_private_existing_package_is_not_replaced(self):
        self.job.mkdir(parents=True,mode=0o700)
        target=self.job/'install_v33.py';target.write_bytes(b'unexpected')
        with self.assertRaises(RuntimeError):self.invoke()
        self.assertEqual(target.read_bytes(),b'unexpected')
        self.assertFalse((self.job/'launch.json').exists())
        self.assertFalse(any(c[0]=='systemd-run' for c in self.calls))
    def test_missing_linger_blocks_without_enabling_anything(self):
        self.ctx['command']=lambda *args,**kwargs:'no'
        with self.assertRaises(RuntimeError):self.invoke()
        self.assertFalse(self.job.exists())
    def test_success_requires_recorded_result_and_current_running_services(self):
        self.invoke();self.status('INSTALLED_AND_LOCALLY_VERIFIED')
        result=self.observe();self.assertEqual(result['phase'],'INSTALLED_AND_LOCALLY_VERIFIED')
        self.assertNotIn('private',json.dumps(result));self.assertNotIn('sensitive',json.dumps(result))
        self.worker='failed';self.assertEqual(self.observe()['phase'],'RECOVERY_REQUIRED')
    def test_rollback_summary_never_claims_fast_installed(self):
        self.invoke();self.status('ROLLED_BACK')
        result=self.observe()
        self.assertEqual(result['phase'],'ROLLED_BACK');self.assertFalse(result['site_deployed'])
        self.assertFalse(result['paid_generation_requested'])
    def test_remote_symlink_is_refused_without_touching_target(self):
        self.job.parent.mkdir(parents=True)
        outside=self.home/'outside';outside.mkdir()
        self.job.symlink_to(outside,target_is_directory=True)
        with self.assertRaises(RuntimeError):self.invoke()
        self.assertEqual(list(outside.iterdir()),[])
    def test_launcher_keeps_strict_ssh_checks_and_only_queries_known_vm(self):
        key=self.home/'ssh-key-2026-09-06.key';key.write_text('fake-key-not-read')
        calls=[]
        def fake(args,**kwargs):
            calls.append(args)
            return '["ocid1.instance.fixture"]' if 'structured-search' in args else '["192.0.2.10"]'
        with patch.object(launch,'invoke',side_effect=fake),patch('pathlib.Path.home',return_value=self.home):
            args=launch.connection()
        self.assertIn('StrictHostKeyChecking=yes',args);self.assertIn('BatchMode=yes',args)
        self.assertIn('opc@192.0.2.10',args);self.assertEqual(len(calls),2)
        self.assertIn("query instance resources where displayName = 'froge-blender' && lifeCycleState = 'RUNNING'",calls[0])
    def test_downloaded_hashes_match_the_reviewed_code_when_present(self):
        for name,expected in launch.FILES.items():
            p=Path(__file__).with_name(name)
            if p.exists():self.assertEqual(hashlib.sha256(p.read_bytes()).hexdigest(),expected,name)


if __name__=='__main__':unittest.main()
