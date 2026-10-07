"""Fail-closed admission/network/cleanup tests; not isolated Blender gate proof."""
from pathlib import Path
import subprocess
import sys
import tempfile
import types
import unittest
from unittest.mock import patch
import urllib.request

import offline_construction as gate


class OfflineGateSafetyTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.stage, self.workspace = self.root / 'stage', self.root / 'workspace'
        self.stage.mkdir(); self.workspace.mkdir()

    def test_missing_podman_refuses_without_native_fallback_or_stage_mutation(self):
        with patch.object(gate.shutil, 'which', return_value=None):
            with self.assertRaisesRegex(gate.Refused, 'PODMAN_REQUIRED_NO_NATIVE_FALLBACK'):
                gate.preflight(self.stage, self.workspace)
        self.assertEqual(list(self.stage.iterdir()), [])
        self.assertEqual(list(self.workspace.iterdir()), [])

    def test_existing_state_and_linked_paths_are_never_used_or_deleted(self):
        state = self.stage / 'state'; state.mkdir()
        retained = state / 'retained'; retained.write_bytes(b'keep')
        with self.assertRaisesRegex(gate.Refused, 'STATELESS'):
            gate.preflight(self.stage, self.workspace)
        self.assertEqual(retained.read_bytes(), b'keep')
        linked = self.root / 'linked-workspace'; linked.symlink_to(self.workspace, target_is_directory=True)
        with self.assertRaisesRegex(gate.Refused, 'UNSAFE_STAGE_OR_WORKSPACE'):
            gate.preflight(self.stage, linked)

    def test_existing_evidence_cannot_be_overwritten_or_count_as_a_new_pass(self):
        evidence = self.workspace / gate.EVIDENCE
        evidence.write_bytes(b'previous proof')
        with self.assertRaisesRegex(gate.Refused, 'FRESH_EVIDENCE'):
            gate.preflight(self.stage, self.workspace)
        self.assertEqual(evidence.read_bytes(), b'previous proof')

    def test_external_network_and_unrequested_api_paths_are_refused_before_open(self):
        provider = gate.Provider(None, None, None, self.stage, True)
        def unexpected(*_args, **_kwargs):
            raise AssertionError('Should not open any connection')
        for url in ('https://example.com/', 'https://api.openai.com/v1/models',
                    'http://127.0.0.1:9999/v1/responses',
                    'https://api.openai.com/v1/responses?secret=unexpected'):
            with self.subTest(url=url):
                with self.assertRaisesRegex(gate.Refused, 'EXTERNAL_NETWORK_REFUSED'):
                    provider.open(unexpected, None, urllib.request.Request(url, data=b'{}'))
        for event, args in (('socket.connect', (None, ('8.8.8.8', 443))),
                            ('socket.getaddrinfo', ('api.openai.com', 443))):
            with self.assertRaisesRegex(gate.Refused, 'EXTERNAL_NETWORK_REFUSED'):
                gate.no_remote(event, args)
        gate.no_remote('socket.connect', (None, ('127.0.0.1', 1234)))

    def test_a_third_count_cannot_create_an_unplanned_paid_phase(self):
        provider = gate.Provider(None, None, None, self.stage, False)
        request = urllib.request.Request('https://api.openai.com/v1/responses/input_tokens',
            data=b'{"model":"gpt-6-astra"}', headers={'Authorization': 'Bearer ' + gate.KEY})
        provider.calls = [{}, {}]; provider.counts = [{}, {}]
        with self.assertRaisesRegex(gate.Refused, 'UNEXPECTED_COUNT_REQUEST'):
            provider.open(lambda *_: None, None, request)

    def test_unconfirmed_cleanup_preserves_fixture_state_and_cannot_issue_proof(self):
        folders, inode = gate.create_jobs(self.stage)
        with patch.object(gate.subprocess, 'run', return_value=types.SimpleNamespace(returncode=125)):
            with self.assertRaisesRegex(gate.Refused, 'CLEANUP_UNCONFIRMED'):
                gate.cleanup(self.stage, folders, [], inode)
        self.assertTrue((self.stage / 'state/jobs.sqlite').is_file())
        self.assertFalse((self.workspace / gate.EVIDENCE).exists())

    def test_cleanup_only_deletes_the_exact_owned_fresh_state(self):
        folders, inode = gate.create_jobs(self.stage)
        with patch.object(gate.subprocess, 'run', return_value=types.SimpleNamespace(returncode=1)):
            with self.assertRaisesRegex(gate.Refused, 'CLEANUP_UNCONFIRMED'):
                gate.cleanup(self.stage, folders, [], inode + 1)
            self.assertTrue((self.stage / 'state').exists())
            gate.cleanup(self.stage, folders, [], inode)
        self.assertFalse((self.stage / 'state').exists())

    def test_cli_cannot_emit_success_when_required_container_runtime_is_missing(self):
        # Run resource-limit/signal setup in its own process, never the test host.
        executable = Path(gate.__file__).resolve()
        with tempfile.TemporaryDirectory() as empty_path:
            result = subprocess.run([sys.executable, str(executable), '--source', str(self.stage),
                '--workspace', str(self.workspace)], capture_output=True, text=True, timeout=10,
                env={'PATH': empty_path, 'LANG': 'C.UTF-8', 'PYTHONDONTWRITEBYTECODE': '1'})
        self.assertEqual(result.returncode, 1)
        self.assertIn('PODMAN_REQUIRED_NO_NATIVE_FALLBACK', result.stdout)
        self.assertNotIn(gate.SUCCESS, result.stdout)
        self.assertFalse((self.workspace / gate.EVIDENCE).exists())


if __name__ == '__main__':
    unittest.main()
