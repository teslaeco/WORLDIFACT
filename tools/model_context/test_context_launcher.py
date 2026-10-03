"""Pinned package/transport contract; all remote operations are inert doubles."""
import base64
import contextlib
import io
import json
from pathlib import Path
import types
import unittest
from unittest.mock import patch

import oracle_context_launch as launcher

ROOT = Path(__file__).resolve().parents[2]
COMMIT = 'a' * 40


def success():
    return {'phase': 'WORLDIFACT_STANDARD_CONTEXT_VERIFIED', 'revision': launcher.REVISION,
            'paid_generation_requested': False, 'job_rows_changed': False, 'provider_limits_changed': False,
            'previous_source_restored': None, 'activation_committed': True}


class LauncherTests(unittest.TestCase):
    def fixtures(self):
        values = {path: (ROOT / path).read_bytes() for path, _ in launcher.FILES.values()}
        manifest = {name: (path, launcher.blob(values[path])) for name, (path, _) in launcher.FILES.items()}
        return values, manifest
    def test_default_does_not_read_download_discover_or_connect(self):
        with patch.object(launcher, 'package', side_effect=AssertionError('download')), \
             patch.object(launcher, 'connection', side_effect=AssertionError('remote')), \
             patch.object(launcher.Path, 'home', side_effect=AssertionError('file lookup')):
            launcher.main([])
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
            program=launcher.script('inert',approved=True,allow_cancelled_cleanup=enabled)
            self.assertIn('ALLOW_CANCELLED_CLEANUP='+repr(enabled),program)
            self.assertIn("(['--allow-cancelled-cleanup'] if ALLOW_CANCELLED_CLEANUP else [])",program)

    def test_cli_threads_explicit_consent_into_remote_invocation(self):
        for enabled in (False,True):
            with patch.object(launcher,'package',return_value='inert'),patch.object(launcher,'connection',return_value=['INERT']),patch.object(launcher,'invoke',return_value=success()) as invoke:
                args=['--source-commit',COMMIT,'--approve-service-maintenance']
                if enabled: args.append('--allow-cancelled-cleanup')
                launcher.main(args)
            self.assertIn('ALLOW_CANCELLED_CLEANUP='+repr(enabled),invoke.call_args.args[1])
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
                self.assertEqual(launcher.blob((ROOT / path).read_bytes()), digest)
    def test_result_cannot_leak_unknown_fields_or_fake_restoration(self):
        valid = success()
        self.assertEqual(launcher.safe_result(valid), valid)
        cases = [{**valid, 'private_log': 'must not leave VM'}, {**valid, 'paid_generation_requested': True},
                 {**valid, 'activation_committed': False}, {**valid, 'previous_source_restored': True},
                 {**valid, 'revision': 'wrong'}]
        for item in cases:
            with self.assertRaises(launcher.LaunchError): launcher.safe_result(item)
        uncertain = {**valid, 'phase': 'WORLDIFACT_STANDARD_CONTEXT_NOT_CONFIRMED',
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
    def test_remote_script_has_no_default_or_generation_entrypoint(self):
        program = launcher.script('inert', approved=True)
        compile(program, 'pinned-remote-wrapper', 'exec')
        self.assertIn("'install_context.py'),'--approve-service-maintenance'", program)
        self.assertNotIn('test_original_job_once', program)
        self.assertNotIn('exports/prepare', program)
        self.assertIn('StrictHostKeyChecking=yes', Path(launcher.__file__).read_text())
        self.assertNotIn('StrictHostKeyChecking=no', Path(launcher.__file__).read_text())


if __name__ == '__main__': unittest.main()
