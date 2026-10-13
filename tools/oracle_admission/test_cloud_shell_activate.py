"""Owner-session-independent launch tests; systemd/SSH are inert fixtures."""
from contextlib import redirect_stdout
from copy import deepcopy
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import cloud_shell_activate as launcher


class LauncherTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='worldifact-launch-fixture-')
        self.addCleanup(self.temp.cleanup)
        self.home=Path(self.temp.name)
        self.commands=[]
        self.running=False
        self.fail_dispatch=False

    def remote(self,start):
        script=launcher.remote_program(b'{}' if start else None)
        def run(command,**kwargs):
            self.commands.append(command)
            if command[0]=='loginctl':
                return subprocess.CompletedProcess(command,0,'yes\n','')
            if command[0]=='systemd-run':
                self.assertIn('--property=Restart=no',command)
                self.assertIn('--property=RuntimeMaxSec=3900',command)
                self.assertIn('--property=KillMode=mixed',command)
                self.assertIn('--unit=worldifact-admission-'+launcher.RELEASE+'.service',command)
                if self.fail_dispatch:
                    raise subprocess.TimeoutExpired(command,30)
                self.running=True
                return subprocess.CompletedProcess(command,0,'','')
            if command[0]=='systemctl':
                return subprocess.CompletedProcess(command,0,'ActiveState='+('active' if self.running else 'inactive')+'\nSubState='+('running' if self.running else 'dead')+'\n','')
            raise AssertionError('Unexpected subprocess')
        with patch.object(Path,'home',return_value=self.home),patch.object(subprocess,'run',side_effect=run),redirect_stdout(io.StringIO()) as out:
            exec(compile(script,'isolated-launcher.py','exec'),{})
        return launcher.safe_status(json.loads(out.getvalue()))

    def test_status_without_attempt_is_readonly(self):
        before=list(self.home.rglob('*'))
        value=self.remote(False)
        self.assertEqual(value['state'],'unconfirmed')
        self.assertEqual(list(self.home.rglob('*')),before)
        self.assertFalse(self.commands)

    def test_repeated_launch_and_status_never_dispatch_a_second_attempt(self):
        self.assertEqual(self.remote(True)['state'],'started')
        self.assertEqual(self.remote(True)['state'],'running')
        self.assertEqual(self.remote(False)['state'],'running')
        self.assertEqual(sum(c[0]=='systemd-run' for c in self.commands),1)
        folder=self.home/'.local/state/worldifact-admission-activation'/launcher.RELEASE
        self.assertEqual(folder.stat().st_mode&0o077,0)
        self.assertEqual((folder/'run.py').stat().st_mode&0o077,0)

    def test_lost_dispatch_ack_does_not_allow_retry(self):
        self.fail_dispatch=True
        self.assertEqual(self.remote(True)['state'],'unconfirmed')
        self.fail_dispatch=False
        self.assertEqual(self.remote(True)['state'],'unconfirmed')
        self.assertEqual(sum(c[0]=='systemd-run' for c in self.commands),1)

    def test_empty_attempt_is_preserved_and_never_started(self):
        folder=self.home/'.local/state/worldifact-admission-activation'/launcher.RELEASE
        folder.mkdir(mode=0o700,parents=True)
        folder.parent.chmod(0o700)
        self.assertEqual(self.remote(True)['state'],'unconfirmed')
        self.assertFalse((folder/'run.py').exists())
        self.assertFalse(any(c[0]=='systemd-run' for c in self.commands))

    def test_existing_finished_result_is_read_without_service_change(self):
        self.remote(True)
        folder=self.home/'.local/state/worldifact-admission-activation'/launcher.RELEASE
        result={'phase':launcher.SUCCESS,'revision':launcher.REVISION,'paid_generation_requested':False,
                'job_rows_changed':False,'provider_limits_changed':False,'previous_source_restored':None,'activation_committed':True}
        (folder/'result.json').write_text(json.dumps(result));(folder/'result.json').chmod(0o600)
        self.commands.clear()
        self.assertEqual(self.remote(True),{'revision':launcher.REVISION,'release':launcher.RELEASE,
            'unit':'worldifact-admission-'+launcher.RELEASE+'.service','state':'finished','result':result})
        self.assertFalse(self.commands)

    def test_default_cli_and_invalid_consent_never_connect(self):
        with patch.object(launcher,'connection',side_effect=AssertionError('SSH')),patch.object(launcher,'package',side_effect=AssertionError('download')),redirect_stdout(io.StringIO()):
            self.assertIsNone(launcher.main([]))
            with self.assertRaises(launcher.Refused):launcher.main(['--allow-cancelled-cleanup'])
            with self.assertRaises(launcher.Refused):launcher.main(['--expected-cancelled-job','x'])

    def test_lock_tamper_fails_before_package_download(self):
        calls=[]
        def reader(commit,path):
            calls.append((commit,path));return b'{}'
        with self.assertRaisesRegex(launcher.Refused,'PACKAGE_LOCK_CHANGED'):
            launcher.package(launcher.RELEASE,reader=reader)
        self.assertEqual(len(calls),1)

    def test_status_cannot_claim_success_with_changed_jobs_or_funds(self):
        valid={'phase':launcher.SUCCESS,'revision':launcher.REVISION,'paid_generation_requested':False,
            'job_rows_changed':False,'provider_limits_changed':False,'previous_source_restored':None,'activation_committed':True}
        launcher.safe_result(valid)
        for key,value in [('paid_generation_requested',True),('job_rows_changed',True),('provider_limits_changed',True),('activation_committed',False),('previous_source_restored',True)]:
            item=deepcopy(valid);item[key]=value
            with self.subTest(key=key),self.assertRaises(launcher.Refused):launcher.safe_result(item)
        for source in (launcher.remote_program(None),launcher.remote_program(b'{}'),launcher.common()+"PAYLOAD='e30='\n"+launcher.RUNNER):
            compile(source,'launcher-source.py','exec')

    def test_package_pins_match_all_published_public_code(self):
        lock=(Path(__file__).parent/'activation_release.json').read_bytes()
        self.assertEqual(launcher.checksum(lock),launcher.LOCK_SHA256)
        parsed=json.loads(lock)
        self.assertEqual(len(parsed['files']),59)
        self.assertEqual(parsed['source_commit'],launcher.RELEASE)
        self.assertTrue(all(item['path'].startswith('tools/') and item['path'].endswith('.py') for item in parsed['files'].values()))

if __name__=='__main__':unittest.main()
