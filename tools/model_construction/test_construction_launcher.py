"""Pinned package/transport contract; all remote operations are inert doubles."""
import base64
import contextlib
import io
import json
from pathlib import Path
import types
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

import test_construction_transaction as lineage
import oracle_construction_launch as launcher


def package_bytes(path):
    root = Path(__file__).resolve().parents[2] if path.startswith(('tools/model_context_upgrade/', 'tools/model_construction/')) else lineage.lineage.ANCESTOR
    return (root / path).read_bytes()

ROOT = Path(__file__).resolve().parents[2]
COMMIT = 'a' * 40
CANCELLED = '00000000-0000-4000-8000-000000000001'


def success():
    return {'phase': 'WORLDIFACT_STANDARD_CONSTRUCTION_VERIFIED', 'revision': launcher.REVISION,
            'paid_generation_requested': False, 'job_rows_changed': False, 'provider_limits_changed': False,
            'previous_source_restored': None, 'activation_committed': True}


class LauncherTests(unittest.TestCase):
    def fixtures(self):
        values = {path: package_bytes(path) for path, _ in launcher.FILES.values()}
        manifest = {name: (path, launcher.blob(values[path])) for name, (path, _) in launcher.FILES.items()}
        return values, manifest
    def test_default_does_not_read_download_discover_or_connect(self):
        with patch.object(launcher, 'package', side_effect=AssertionError('download')), \
             patch.object(launcher, 'connection', side_effect=AssertionError('remote')), \
             patch.object(launcher.Path, 'home', side_effect=AssertionError('file lookup')):
            launcher.main([])
            launcher.main(['--update-payload'])

    def test_explicit_payload_update_mode_is_boolean_and_reaches_installer(self):
        for invalid in (1, None, 'true'):
            with self.assertRaises(launcher.LaunchError):
                launcher.script('inert', approved=True, update_payload=invalid)
        for enabled in (False, True):
            with patch.object(launcher, 'package', return_value='inert'), \
                 patch.object(launcher, 'connection', return_value=['INERT']), \
                 patch.object(launcher, 'invoke', return_value=success()) as invoke:
                args = ['--source-commit', COMMIT, '--approve-service-maintenance']
                if enabled:
                    args.append('--update-payload')
                launcher.main(args)
            program = invoke.call_args.args[1]
            self.assertIn('UPDATE_PAYLOAD=' + repr(enabled), program)
            self.assertIn("(['--update-payload'] if UPDATE_PAYLOAD else [])", program)
            self.assertIn('ALLOW_CANCELLED_CLEANUP=False', program)
            self.assertIn('EXPECTED_CANCELLED_JOB=None', program)
            compile(program, 'pinned-update-wrapper', 'exec')
    def test_unfrozen_package_refuses_before_read_download_or_connection(self):
        unfrozen = {name:(path, 'UNFROZEN_REFUSE' if name in launcher.NEW_FILES else digest)
                    for name,(path,digest) in launcher.FILES.items()}
        with patch.object(launcher,'read_public',side_effect=AssertionError('download')), \
             patch.object(launcher,'connection',side_effect=AssertionError('connection')), \
             patch.object(launcher,'FILES',unfrozen), \
             contextlib.redirect_stdout(io.StringIO()):
            with self.assertRaisesRegex(launcher.LaunchError,'pins are unavailable'):
                launcher.main(['--source-commit',COMMIT,'--approve-service-maintenance'])
    def test_remote_closure_is_exactly_old_twenty_eight_plus_launcher_and_new_thirteen(self):
        prior = lineage.installer
        import oracle_upgrade_launch
        self.assertEqual(len(oracle_upgrade_launch.FILES),28)
        self.assertEqual(len(launcher.NEW_FILES),13)
        self.assertEqual(set(launcher.FILES),set(oracle_upgrade_launch.FILES) | {'oracle_upgrade_launch.py'} | set(launcher.NEW_FILES))
        self.assertEqual(len(launcher.FILES),42)
        self.assertNotIn('inspect_candidate_readonly.py',launcher.FILES)
        self.assertNotIn('test_native_pipeline.py',launcher.FILES)
        self.assertGreater(launcher.INSTALL_TIMEOUT,prior.INSTALL_TIMEOUT if hasattr(prior,'INSTALL_TIMEOUT') else 2400)
        self.assertGreater(launcher.SSH_TIMEOUT,launcher.INSTALL_TIMEOUT+135)
    def test_candidate_inspection_option_is_not_available(self):
        with patch.object(launcher,'package',side_effect=AssertionError('package')), \
             patch.object(launcher,'connection',side_effect=AssertionError('connection')), \
             contextlib.redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit):
                launcher.main(['--source-commit',COMMIT,'--inspect-approved-candidate'])
    def test_immutable_commit_and_explicit_maintenance_flag_are_required(self):
        for value in ('main', 'v1', '../private', 'A' * 39, None):
            with self.assertRaises(launcher.LaunchError): launcher.source_commit(value)
        with self.assertRaises(launcher.LaunchError): launcher.script('inert', approved=False)

    def test_cancelled_cleanup_requires_separate_approval_and_exact_boolean_propagation(self):
        with patch.object(launcher,'package',side_effect=AssertionError('download')):
            with self.assertRaises(SystemExit): launcher.main(['--allow-cancelled-cleanup'])
        with self.assertRaises(launcher.LaunchError): launcher.script('inert',allow_cancelled_cleanup=True)
        for invalid in (1,'true',None):
            with self.assertRaises(launcher.LaunchError): launcher.script('inert',approved=True,allow_cancelled_cleanup=invalid)
        for enabled in (False,True):
            program=launcher.script('inert',approved=True,allow_cancelled_cleanup=enabled,expected_cancelled_job=CANCELLED if enabled else None)
            self.assertIn('ALLOW_CANCELLED_CLEANUP='+repr(enabled),program)
            self.assertIn("(['--allow-cancelled-cleanup','--expected-cancelled-job',EXPECTED_CANCELLED_JOB] if ALLOW_CANCELLED_CLEANUP else [])",program)
            self.assertIn('EXPECTED_CANCELLED_JOB='+repr(CANCELLED if enabled else None),program)

    def test_cli_threads_explicit_consent_into_remote_invocation(self):
        for enabled in (False,True):
            with patch.object(launcher,'package',return_value='inert'),patch.object(launcher,'connection',return_value=['INERT']),patch.object(launcher,'invoke',return_value=success()) as invoke:
                args=['--source-commit',COMMIT,'--approve-service-maintenance']
                if enabled: args += ['--allow-cancelled-cleanup','--expected-cancelled-job',CANCELLED]
                launcher.main(args)
            self.assertIn('ALLOW_CANCELLED_CLEANUP='+repr(enabled),invoke.call_args.args[1])
            self.assertIn('EXPECTED_CANCELLED_JOB='+repr(CANCELLED if enabled else None),invoke.call_args.args[1])
    def test_cleanup_identity_pair_refuses_before_download_connection_or_target_reads(self):
        pairs = [(True, None), (True, ''), (True, 'not-a-job'), (True, CANCELLED.upper().replace('0', 'A', 1)),
                 (True, CANCELLED + '\n'), (True, 42), (False, CANCELLED)]
        for enabled, identity in pairs:
            with self.subTest(enabled=enabled, identity=identity):
                with self.assertRaises(launcher.LaunchError):
                    launcher.script('inert', approved=True, allow_cancelled_cleanup=enabled, expected_cancelled_job=identity)
        cases = [ ['--approve-service-maintenance','--allow-cancelled-cleanup'],
                  ['--approve-service-maintenance','--expected-cancelled-job',CANCELLED],
                  ['--inspect-approved-candidate','--expected-cancelled-job',CANCELLED],
                  ['--expected-cancelled-job',CANCELLED],
                  ['--approve-service-maintenance','--allow-cancelled-cleanup','--expected-cancelled-job','not-a-job'] ]
        with patch.object(launcher, 'package', side_effect=AssertionError('download')), \
             patch.object(launcher, 'connection', side_effect=AssertionError('connection')):
            for args in cases:
                with self.subTest(args=args), self.assertRaises(SystemExit): launcher.main(args)

    def test_package_preserves_full_exact_file_set_and_refuses_byte_drift(self):
        values, manifest = self.fixtures()
        with patch.object(launcher, 'FILES', manifest):
            encoded = launcher.package(COMMIT, reader=values.__getitem__)
            payload = json.loads(base64.b64decode(encoded))
            self.assertEqual(set(payload), set(manifest))
            for name, (path, _) in manifest.items():
                self.assertEqual(base64.b64decode(payload[name]), values[path])
            first = next(iter(values))
            changed = {**values, first: values[first] + b'\n'}
            with self.assertRaises(launcher.LaunchError): launcher.package(COMMIT, reader=changed.__getitem__)
    def test_corrupt_package_refuses_before_oci_or_ssh(self):
        with patch.object(launcher, 'package', side_effect=launcher.LaunchError('checksum')), \
             patch.object(launcher, 'connection', side_effect=AssertionError('connection attempted')):
            with self.assertRaises(launcher.LaunchError):
                launcher.main(['--source-commit', COMMIT, '--approve-service-maintenance'])
    def test_frozen_manifest_matches_repository_bytes(self):
        for name, (path, digest) in launcher.FILES.items():
            with self.subTest(name=name):
                if digest == 'UNFROZEN_REFUSE':
                    self.assertIn(name, launcher.NEW_FILES)
                else:
                    self.assertEqual(launcher.blob(package_bytes(path)), digest)
    def test_result_cannot_leak_unknown_fields_or_fake_restoration(self):
        valid = success()
        self.assertEqual(launcher.safe_result(valid), valid)
        cases = [{**valid, 'private_log': 'must not leave VM'}, {**valid, 'paid_generation_requested': True},
                 {**valid, 'activation_committed': False}, {**valid, 'previous_source_restored': True},
                 {**valid, 'revision': 'wrong'}]
        for item in cases:
            with self.assertRaises(launcher.LaunchError): launcher.safe_result(item)
        uncertain = {**valid, 'phase': 'WORLDIFACT_STANDARD_CONSTRUCTION_NOT_CONFIRMED',
                     'activation_committed': None, 'refusal_code': 'unconfirmed'}
        self.assertEqual(launcher.safe_result(uncertain), uncertain)
        with self.assertRaises(launcher.LaunchError):
            launcher.safe_result({**uncertain, 'refusal_code': 'private /home/user/token'})
    def test_transport_requires_matching_exact_json_and_exit_code(self):
        value = success()
        with patch.object(launcher.subprocess, 'run', return_value=types.SimpleNamespace(stdout=json.dumps(value), returncode=0)):
            self.assertEqual(launcher.invoke(['INERT'], 'inert'), value)
        for output, code in ((json.dumps(value), 1), ('private log\n' + json.dumps(value), 0), ('{}', 0)):
            with patch.object(launcher.subprocess, 'run', return_value=types.SimpleNamespace(stdout=output, returncode=code)):
                with self.assertRaises(launcher.LaunchError): launcher.invoke(['INERT'], 'inert')
    def test_actual_flat_package_unpacks_and_defaults_to_inert_plan(self):
        values, pins = self.fixtures()
        with patch.object(launcher, 'FILES', pins):
            payload = json.loads(base64.b64decode(launcher.package(COMMIT, reader=values.__getitem__)))
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary)
            for name, raw in payload.items(): (folder / name).write_bytes(base64.b64decode(raw))
            result = subprocess.run([sys.executable, '-B', str(folder / 'install_construction.py')],
                                    cwd=folder, capture_output=True, text=True, timeout=20)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(result.stdout, 'PLAN ONLY. No source reads, service signals, installation, exports or generation.\n')
            self.assertEqual(set(path.name for path in folder.iterdir()), set(payload))
            checked = subprocess.run([sys.executable, '-B', '-c',
                "import install_construction as i;i.manifest.final_manifest();i.frozen_dependencies();print('PINNED_FLAT_DEPENDENCIES_OK')"],
                cwd=folder, capture_output=True, text=True, timeout=20)
            self.assertEqual(checked.returncode,0,checked.stderr)
            self.assertEqual(checked.stdout,'PINNED_FLAT_DEPENDENCIES_OK\n')
            self.assertEqual(set(path.name for path in folder.iterdir()),set(payload))
            # Explicitly inject an unfrozen fixture map even after final pins
            # are reviewed, so this subprocess can never enter real maintenance.
            command = ("import construction_manifest as m;"
                       "m.EXPECTED_AFTER={n:'UNFROZEN_REFUSE' for n in m.health.SOURCES};"
                       "import runpy,sys;sys.argv=['install_construction.py','--approve-service-maintenance'];"
                       "runpy.run_path('install_construction.py',run_name='__main__')")
            refused = subprocess.run([sys.executable, '-B', '-c', command], cwd=folder,
                                     capture_output=True, text=True, timeout=20)
            self.assertEqual(refused.returncode,1)
            result = launcher.safe_result(json.loads(refused.stdout))
            self.assertIsNone(result['activation_committed'])
            self.assertEqual(set(path.name for path in folder.iterdir()),set(payload))
    def test_mixed_source_commits_are_immutable_and_path_allowlisted(self):
        old = 'tools/model_context/journal_socket.py'
        new = 'tools/model_context_upgrade/install_upgrade.py'
        self.assertEqual(launcher.file_commit(COMMIT, old), '2380a7e2dad05a40b3753faf06c2635ed444be51')
        self.assertEqual(launcher.file_commit(COMMIT, new), COMMIT)
        self.assertEqual(launcher.file_commit(COMMIT,'tools/model_construction/install_construction.py'),COMMIT)
        for path in ('tools/model_context_upgrade/../private.py', 'state/config.json', 'https://example.invalid/code.py'):
            with self.assertRaises(launcher.LaunchError): launcher.file_commit(COMMIT, path)
        calls = []
        class Reply:
            status = 200
            def __enter__(self): return self
            def __exit__(self, *_): pass
            def read(self, _size): return b'# inert public fixture'
        class Opener:
            def open(self, url, timeout): calls.append(url); return Reply()
        with patch.object(launcher.urllib.request, 'build_opener', return_value=Opener()):
            launcher.read_public(COMMIT, old); launcher.read_public(COMMIT, new)
        self.assertEqual(calls, [launcher.PUBLIC_ROOT + launcher.ANCESTOR_COMMIT + '/' + old,
                                 launcher.PUBLIC_ROOT + COMMIT + '/' + new])
    def test_remote_script_has_no_default_or_generation_entrypoint(self):
        program = launcher.script('inert', approved=True)
        compile(program, 'pinned-remote-wrapper', 'exec')
        self.assertIn("'install_construction.py'),'--approve-service-maintenance'", program)
        self.assertNotIn('test_original_job_once', program)
        self.assertNotIn('exports/prepare', program)
        self.assertIn('StrictHostKeyChecking=yes', Path(launcher.__file__).read_text())
        self.assertNotIn('StrictHostKeyChecking=no', Path(launcher.__file__).read_text())


if __name__ == '__main__': unittest.main()
