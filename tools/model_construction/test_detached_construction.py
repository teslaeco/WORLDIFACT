"""Inert process boundary tests for logout survival and uncertain dispatch."""
import contextlib
import io
import json
from pathlib import Path
import subprocess
import tempfile
import types
import unittest
from unittest.mock import patch

import detached_construction as detached
import oracle_construction_launch as launch

COMMIT = 'a' * 40


class DetachedTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.home = Path(self.temporary.name)
        self.folder = self.home / '.local/state/worldifact-astra-guard' / ('detached-models-' + COMMIT)
        self.calls = []

    def command(self, argv, **kwargs):
        self.calls.append((argv, kwargs))
        text = 'yes\n' if argv[0] == 'loginctl' else 'ActiveState=active\nSubState=running\n' if argv[0] == 'systemctl' else ''
        return types.SimpleNamespace(returncode=0, stdout=text)

    def remote(self, program='pass\n', command=None):
        output = io.StringIO()
        with patch.object(Path, 'home', return_value=self.home), \
             patch.object(subprocess, 'run', side_effect=command or self.command), contextlib.redirect_stdout(output):
            exec(compile(detached.remote_script(COMMIT, program), 'detached-fixture', 'exec'), {})
        return detached.safe_status(json.loads(output.getvalue()), COMMIT)

    def test_launch_is_owned_by_existing_manager_and_never_repeats(self):
        self.assertEqual(self.remote()['state'], 'started')
        self.assertEqual((self.folder / 'run.py').read_text(), 'pass\n')
        unit = next(argv for argv, _ in self.calls if argv[0] == 'systemd-run')
        for option in ('--user', '--service-type=exec', '--property=Restart=no', '--property=RemainAfterExit=yes',
                       '--property=RuntimeMaxSec=3540', '--property=TimeoutStopSec=180', '--property=KillMode=mixed'):
            self.assertIn(option, unit)
        self.assertNotIn('--scope', unit)
        self.assertNotIn('--wait', unit)
        self.assertEqual(self.folder.stat().st_mode & 0o777, 0o700)
        self.assertEqual((self.folder / 'run.py').stat().st_mode & 0o777, 0o600)
        self.assertEqual(self.remote()['state'], 'running')
        self.assertEqual(len([a for a, _ in self.calls if a[0] == 'systemd-run']), 1)

    def test_lost_ack_and_partial_latch_are_inspected_without_relaunch(self):
        def command(argv, **kwargs):
            if argv[0] == 'systemd-run':
                self.calls.append((argv, kwargs))
                raise subprocess.TimeoutExpired(argv, 30)
            return self.command(argv, **kwargs)
        self.assertEqual(self.remote(command=command)['state'], 'unconfirmed')
        self.assertEqual(self.remote()['state'], 'running')
        self.assertEqual(len([a for a, _ in self.calls if a[0] == 'systemd-run']), 1)
        (self.folder / 'result.json').unlink()
        (self.folder / 'run.py').unlink()
        def missing(argv, **kwargs):
            self.assertEqual(argv[0], 'systemctl')
            return types.SimpleNamespace(returncode=0, stdout='ActiveState=inactive\nSubState=dead\n')
        self.assertEqual(self.remote(command=missing)['state'], 'unconfirmed')
        self.assertEqual(list(self.folder.iterdir()), [])

    def test_owner_readable_legacy_root_is_tightened_before_first_dispatch(self):
        root = self.folder.parent
        root.mkdir(parents=True, mode=0o755)
        root.chmod(0o755)
        self.assertEqual(self.remote(None)['state'], 'unconfirmed')
        self.assertEqual(root.stat().st_mode & 0o777, 0o755)
        self.assertEqual(self.remote()['state'], 'started')
        self.assertEqual(root.stat().st_mode & 0o777, 0o700)
        self.assertEqual(self.remote()['state'], 'running')
        self.assertEqual(len([a for a, _ in self.calls if a[0] == 'systemd-run']), 1)

    def test_shared_writable_legacy_root_is_not_repaired_or_dispatched(self):
        root = self.folder.parent
        root.mkdir(parents=True, mode=0o777)
        root.chmod(0o777)
        self.assertEqual(self.remote()['state'], 'unconfirmed')
        self.assertEqual(root.stat().st_mode & 0o777, 0o777)
        self.assertFalse(self.folder.exists())
        self.assertFalse(self.calls)

    def test_status_requires_strict_terminal_json_and_does_not_download_or_write(self):
        self.assertEqual(self.remote(None)['state'], 'unconfirmed')
        self.assertFalse(self.folder.exists())
        self.assertFalse(self.calls)
        self.remote()
        result = {'phase': 'WORLDIFACT_STANDARD_CONSTRUCTION_VERIFIED', 'revision': launch.REVISION,
                  'paid_generation_requested': False, 'job_rows_changed': False, 'provider_limits_changed': False,
                  'previous_source_restored': None, 'activation_committed': True}
        log = self.folder / 'result.json'
        for value in (json.dumps(result), 'private log\n' + json.dumps(result),
                      json.dumps({**result, 'private': 'secret'}), '{}', 'x' * 32769):
            log.write_text(value)
            before = {p.name: (p.read_bytes(), p.stat().st_mtime_ns) for p in self.folder.iterdir()}
            reply = self.remote(None)
            self.assertEqual(reply['state'], 'finished' if value == json.dumps(result) else 'unconfirmed')
            self.assertEqual(before, {p.name: (p.read_bytes(), p.stat().st_mtime_ns) for p in self.folder.iterdir()})
        with patch.object(launch, 'package', side_effect=AssertionError('download')), \
             patch.object(launch, 'connection', return_value=['INERT']), \
             patch.object(detached, 'invoke', return_value={**reply, 'state': 'running'}), \
             contextlib.redirect_stdout(io.StringIO()):
            detached.main(['--status', '--source-commit', COMMIT])

    def test_linger_absence_unsafe_paths_and_unsafe_result_refuse(self):
        def no_linger(argv, **_):
            self.assertEqual(argv[0], 'loginctl')
            return types.SimpleNamespace(returncode=0, stdout='no\n')
        self.assertEqual(self.remote(command=no_linger)['state'], 'unconfirmed')
        self.assertFalse(self.folder.exists())
        self.folder.symlink_to(self.home, target_is_directory=True)
        self.assertEqual(self.remote()['state'], 'unconfirmed')
        self.assertFalse(self.calls)
        value = {'revision': detached.REVISION, 'source_commit': COMMIT,
                 'unit': 'worldifact-models-' + COMMIT + '.service', 'state': 'started', 'result': None}
        for invalid in ({**value, 'private': 'secret'}, {**value, 'source_commit': 'b' * 40},
                        {**value, 'result': {}}, {**value, 'state': 'finished'}):
            with self.assertRaises(launch.LaunchError): detached.safe_status(invalid, COMMIT)

    def test_inert_default_invalid_consent_and_strict_existing_ssh_key(self):
        with patch.object(launch, 'package', side_effect=AssertionError('download')), \
             patch.object(launch, 'connection', side_effect=AssertionError('connect')), \
             contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            detached.main([])
            for args in (['--allow-cancelled-cleanup'], ['--status', '--approve-service-maintenance']):
                with self.assertRaises(SystemExit): detached.main(args)
            with self.assertRaises(launch.LaunchError):
                detached.main(['--approve-service-maintenance', '--source-commit', COMMIT, '--allow-cancelled-cleanup'])
        key = self.home / 'ssh-key-2026-09-06.key'
        key.write_text('inert fixture; not a credential')
        with patch.object(launch, 'lookup', side_effect=AssertionError('unrequested OCI lookup')):
            command = launch.connection(self.home, address='141.148.242.30')
            self.assertIn('StrictHostKeyChecking=yes', command)
            self.assertIn('opc@141.148.242.30', command)
            self.assertIn(str(key), command)
            for address in ('127.0.0.1', '10.0.0.1', 'example.invalid', '-oProxyCommand=bad', '', 42):
                with self.assertRaises(launch.LaunchError): launch.connection(self.home, address=address)


if __name__ == '__main__': unittest.main()
