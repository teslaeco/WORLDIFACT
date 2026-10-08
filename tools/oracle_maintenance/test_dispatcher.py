"""Credential-free dispatcher, package and subprocess-boundary tests."""
import hashlib
import io
import json
import os
from pathlib import Path
import signal
import subprocess
import tempfile
from contextlib import redirect_stdout
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

import dispatcher
import status
from test_status import result


class DispatcherTests(unittest.TestCase):
    def api(self, states):
        snapshots = [{'fixture_state': state} for state in states]
        return SimpleNamespace(account_home=lambda: Path('/home/opc'),
                               read_status=Mock(side_effect=snapshots),
                               classify=lambda value: value['fixture_state'], SUCCESS=status.SUCCESS)

    def test_reviewed_launcher_pin_matches_unchanged_repository_bytes(self):
        path = Path(__file__).absolute().parents[2] / 'tools/model_construction/oracle_construction_launch.py'
        self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), dispatcher.LAUNCHER_HASH)

    def test_only_exact_original_commands_are_accepted(self):
        for command in (None, '', 'status ', ' status', 'status\n', 'status\r\n', 'STATUS',
                        'status --help', 'apply-b6dce84d --force', 'status; id', 'status && id',
                        '$(id)', 'sftp', 'scp -t /tmp/file', 'bash', 'apply-b6dce84d\nstatus'):
            with self.subTest(command=command), patch.object(dispatcher, 'load_status') as load:
                observed, code = dispatcher.dispatch(command)
                self.assertEqual(code, 1)
                self.assertEqual(observed, dispatcher.envelope(None, 'refused'))
                load.assert_not_called()

    def test_direct_arguments_cannot_replace_forced_command(self):
        output = io.StringIO()
        with redirect_stdout(output), patch.object(dispatcher, 'load_status') as load:
            code = dispatcher.main(['status'], {'SSH_ORIGINAL_COMMAND': 'status'})
        self.assertEqual(code, 1)
        load.assert_not_called()
        self.assertEqual(json.loads(output.getvalue())['result'], 'refused')

    def test_status_does_not_validate_or_run_updater(self):
        api = self.api(['ready_to_apply'])
        with patch.object(dispatcher, 'verified_package') as package, patch.object(dispatcher, 'run_installer') as run:
            value, code = dispatcher.dispatch('status', api=api)
        self.assertEqual(code, 0)
        self.assertEqual(value['result'], 'ready_to_apply')
        package.assert_not_called()
        run.assert_not_called()

    def test_already_updated_is_idempotent(self):
        api = self.api(['already_updated'])
        with patch.object(dispatcher, 'verified_package') as package, patch.object(dispatcher, 'run_installer') as run:
            value, code = dispatcher.dispatch('apply-b6dce84d', api=api)
        self.assertEqual((value['result'], code), ('already_updated', 0))
        self.assertIsNone(value['installer'])
        package.assert_not_called()
        run.assert_not_called()

    def test_busy_and_inconclusive_refuse_without_new_attempt(self):
        for state in ('busy', 'inconclusive'):
            with self.subTest(state=state), patch.object(dispatcher, 'run_installer') as run:
                value, code = dispatcher.dispatch('apply-b6dce84d', api=self.api([state]))
                self.assertEqual((value['result'], code), (state, 1))
                run.assert_not_called()

    def test_state_is_rechecked_after_package_validation(self):
        for second in ('already_updated', 'busy', 'inconclusive'):
            with self.subTest(second=second), patch.object(dispatcher, 'verified_package', return_value=Path('/fixed/package')), patch.object(dispatcher, 'run_installer') as run:
                value, code = dispatcher.dispatch('apply-b6dce84d', api=self.api(['ready_to_apply', second]))
                self.assertEqual(value['result'], second)
                self.assertEqual(code, 0 if second == 'already_updated' else 1)
                run.assert_not_called()

    def test_success_requires_receipt_reconciliation_after_one_invocation(self):
        for after in ('already_updated', 'busy', 'inconclusive', 'ready_to_apply'):
            with self.subTest(after=after), patch.object(dispatcher, 'verified_package', return_value=Path('/fixed/package')), patch.object(dispatcher, 'run_installer', return_value=result()) as run:
                value, code = dispatcher.dispatch('apply-b6dce84d', api=self.api(['ready_to_apply', 'ready_to_apply', after]))
                self.assertEqual(value['result'], 'updated' if after == 'already_updated' else 'not_confirmed')
                self.assertEqual(code, 0 if after == 'already_updated' else 1)
                run.assert_called_once()

    def test_failure_is_reconciled_without_automatic_retry_or_private_error(self):
        api = self.api(['ready_to_apply', 'ready_to_apply', 'inconclusive'])
        with patch.object(dispatcher, 'verified_package', return_value=Path('/fixed/package')), patch.object(dispatcher, 'run_installer', side_effect=ValueError('private output')) as run:
            value, code = dispatcher.dispatch('apply-b6dce84d', api=api)
        self.assertEqual((value['result'], code), ('not_confirmed', 1))
        self.assertNotIn('private output', json.dumps(value))
        run.assert_called_once()

    def test_isolated_entry_rejects_shell_payload_without_execution(self):
        with tempfile.TemporaryDirectory() as folder:
            marker = Path(folder) / 'must-not-exist'
            command = 'status; touch ' + str(marker)
            child = subprocess.run(['/usr/bin/python3', '-I', '-B', dispatcher.__file__],
                                   env={**os.environ, 'SSH_ORIGINAL_COMMAND': command},
                                   capture_output=True, text=True, timeout=10)
            self.assertEqual(child.returncode, 1)
            self.assertEqual(json.loads(child.stdout), dispatcher.envelope(None, 'refused'))
            self.assertEqual(child.stderr, '')
            self.assertFalse(marker.exists())

    def test_sibling_status_load_works_under_isolated_python(self):
        script = ('import runpy; d=runpy.run_path(' + repr(dispatcher.__file__) + ');'
                  'print(d["load_status"]().REVISION)')
        child = subprocess.run(['/usr/bin/python3', '-I', '-B', '-c', script],
                               capture_output=True, text=True, timeout=10)
        self.assertEqual(child.returncode, 0, child.stderr)
        self.assertEqual(child.stdout.strip(), status.REVISION)


class PackageTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.home = Path(self.tmp.name)
        self.package = self.home / '.local/share/worldifact-maintenance/update'
        self.package.mkdir(parents=True)
        raw = b'# synthetic package file\n'
        blob = hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()
        files = {('install_construction.py' if i == 0 else 'file_' + str(i) + '.py'): ('unused', blob)
                 for i in range(42)}
        for name in files:
            (self.package / name).write_bytes(raw)
        launcher = ('import hashlib\nFILES = ' + repr(files) + '\n'
                    "def blob(raw): return hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\\0' + raw).hexdigest()\n").encode()
        (self.package / 'oracle_construction_launch.py').write_bytes(launcher)
        pin = patch.object(dispatcher, 'LAUNCHER_HASH', hashlib.sha256(launcher).hexdigest())
        pin.start()
        self.addCleanup(pin.stop)

    def test_exact_flattened_pinned_package_passes(self):
        self.assertEqual(dispatcher.verified_package(status, self.home), self.package)

    def test_changed_pinned_file_refuses(self):
        (self.package / 'file_1.py').write_text('# changed\n')
        with self.assertRaises(ValueError):
            dispatcher.verified_package(status, self.home)

    def test_extra_import_shadow_and_symlink_refuse(self):
        extra = self.package / 'subprocess.py'
        extra.write_text('raise RuntimeError()\n')
        with self.assertRaises(ValueError):
            dispatcher.verified_package(status, self.home)
        extra.unlink()
        path = self.package / 'file_1.py'
        path.unlink()
        path.symlink_to(self.package / 'file_2.py')
        with self.assertRaises(ValueError):
            dispatcher.verified_package(status, self.home)

    def test_group_writable_parent_refuses(self):
        self.package.parent.chmod(0o770)
        with self.assertRaises(ValueError):
            dispatcher.verified_package(status, self.home)

    def test_every_outside_fallback_root_and_dangling_link_refuses(self):
        paths = (self.package.parents[1] / 'tools', self.package.parent / 'fast_preview',
                 self.package.parent / 'model_context', self.package.parent / 'model_context_upgrade')
        for path in paths:
            for kind in ('directory', 'dangling_link', 'file'):
                with self.subTest(path=path.name, kind=kind):
                    if kind == 'directory':
                        path.mkdir()
                    elif kind == 'dangling_link':
                        path.symlink_to(self.home / 'does-not-exist')
                    else:
                        path.write_bytes(b'outside')
                    with self.assertRaisesRegex(ValueError, 'repository_fallback_present'):
                        dispatcher.verified_package(status, self.home)
                    if kind == 'directory':
                        path.rmdir()
                    else:
                        path.unlink()

    def test_shadow_created_after_validation_cannot_execute(self):
        package = dispatcher.verified_package(status, self.home)
        outside = package.parents[1] / 'tools/profit_guard'
        outside.mkdir(parents=True)
        marker = self.home / 'outside-module-executed'
        shadow = outside / 'install_request_timeout900.py'
        shadow.write_text('from pathlib import Path\nPath(' + repr(str(marker)) + ').touch()\n')
        before = shadow.read_bytes()
        with patch.object(dispatcher.subprocess, 'Popen') as spawn:
            with self.assertRaisesRegex(ValueError, 'repository_fallback_present'):
                dispatcher.run_installer(status, package, self.home)
        spawn.assert_not_called()
        self.assertFalse(marker.exists())
        self.assertEqual(shadow.read_bytes(), before)


class InstallerTests(unittest.TestCase):
    def fake_process(self, raw, code=0, waits=None):
        process = Mock()
        process.wait = Mock(side_effect=waits) if waits is not None else Mock(return_value=code)
        process.poll.return_value = None

        def launch(argv, **kwargs):
            self.argv, self.kwargs = argv, kwargs
            kwargs['stdout'].write(raw)
            return process

        return process, launch

    def test_fixed_arguments_clean_environment_and_private_logs(self):
        raw = b'private gate details\n' + json.dumps(result()).encode() + b'\n'
        process, launch = self.fake_process(raw)
        with patch.object(dispatcher.subprocess, 'Popen', side_effect=launch), patch.dict(os.environ, {'HOME': '/bad', 'PYTHONPATH': '/bad', 'LD_PRELOAD': '/bad'}):
            observed = dispatcher.run_installer(status, Path('/fixed/package'), Path('/home/opc'))
        self.assertEqual(observed, result())
        self.assertEqual(self.argv, ['/usr/bin/python3', '-I', '-B', '-c', dispatcher.INSTALL_ENTRY,
                                    '/fixed/package', '/fixed/package/install_construction.py',
                                    '--update-payload', '--approve-service-maintenance',
                                    '--allow-cancelled-cleanup', '--expected-cancelled-job',
                                    'f91612e5-eb5a-4fec-9585-1ce08c9f38ad'])
        self.assertNotIn('shell', self.kwargs)
        self.assertNotIn('PYTHONPATH', self.kwargs['env'])
        self.assertNotIn('LD_PRELOAD', self.kwargs['env'])
        self.assertEqual(self.kwargs['env']['HOME'], '/home/opc')
        self.assertEqual(self.kwargs['stdin'], subprocess.DEVNULL)
        process.wait.assert_called_once_with(timeout=3180)

    def test_malformed_oversized_and_conflicting_result_refuse(self):
        for raw, code in ((b'private exception', 1), (b'x' * 32769, 0),
                          (json.dumps(result()).encode(), 1),
                          (json.dumps({**result(), 'prompt': 'private'}).encode(), 0)):
            with self.subTest(code=code, size=len(raw)):
                _, launch = self.fake_process(raw, code)
                with patch.object(dispatcher.subprocess, 'Popen', side_effect=launch), self.assertRaises(ValueError):
                    dispatcher.run_installer(status, Path('/fixed/package'), Path('/home/opc'))

    def test_timeout_only_signals_own_child_and_never_retries(self):
        process, launch = self.fake_process(b'', waits=[subprocess.TimeoutExpired('fixed', 3180),
                                                       subprocess.TimeoutExpired('fixed', 120), -9])
        with patch.object(dispatcher.subprocess, 'Popen', side_effect=launch) as popen, self.assertRaises(ValueError):
            dispatcher.run_installer(status, Path('/fixed/package'), Path('/home/opc'))
        process.terminate.assert_called_once()
        process.kill.assert_called_once()
        self.assertEqual(process.wait.call_args_list[-1].kwargs, {'timeout': 15})
        popen.assert_called_once()

    def test_hangup_relays_to_owned_installer_and_restores_handler(self):
        process, launch = self.fake_process(json.dumps(result(False, True, False)).encode(), 1)
        previous = signal.getsignal(signal.SIGHUP)

        def wait(**kwargs):
            signal.getsignal(signal.SIGHUP)(signal.SIGHUP, None)
            return 1

        process.wait.side_effect = wait
        with patch.object(dispatcher.subprocess, 'Popen', side_effect=launch):
            value = dispatcher.run_installer(status, Path('/fixed/package'), Path('/home/opc'))
        self.assertEqual(value['phase'], status.FAILURE)
        process.send_signal.assert_called_once_with(signal.SIGHUP)
        self.assertEqual(signal.getsignal(signal.SIGHUP), previous)


if __name__ == '__main__':
    unittest.main()
