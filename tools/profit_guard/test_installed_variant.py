"""Regression on reconstructed real installed files, never the production VM."""
import hashlib
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import astra_spend as guard
import install

class ToolProtocolTests(unittest.TestCase):
    def test_codex_namespaces_and_additional_tools_survive_exact_count_input(self):
        tool = {'type': 'namespace', 'name': 'functions', 'tools': [{'type': 'custom', 'name': 'exec'}]}
        body = {'model': 'gpt-6-astra', 'max_output_tokens': 1024, 'tools': [tool],
                'input': [{'role': 'developer', 'type': 'additional_tools', 'tools': [tool]},
                          {'role': 'user', 'content': [{'type': 'input_image', 'image_url': 'data:image/png;base64,Zml4dHVyZQ=='}]}]}
        counted = guard.count_payload(body)
        self.assertEqual(counted['tools'], body['tools']); self.assertEqual(counted['input'], body['input'])
        self.assertNotIn('max_output_tokens', counted)
        with tempfile.TemporaryDirectory() as directory, patch.object(guard, 'LEDGER_ROOT', Path(directory)/'funds'), patch.object(guard.time, 'time', return_value=1790600000):
            job = Path(directory)/'job'; job.mkdir()
            guard.protect(job, body, {}, counter=lambda *_: 1000)
            self.assertEqual(body['service_tier'], 'default')
            self.assertGreater(json.loads((guard.ledger_folder(job)/guard.STATE).read_text())['reserved'], 0)

    def test_paid_tools_cannot_hide_inside_codex_namespaces_or_additional_catalogues(self):
        for kind in ('web_search', 'code_interpreter', 'image_generation', 'mcp'):
            hidden = {'type': 'namespace', 'name': 'tools', 'tools': [{'type': kind}]}
            for change in ({'tools': [hidden]}, {'input': [{'type': 'additional_tools', 'tools': [hidden]}]}):
                with self.assertRaises(guard.SpendError):
                    guard.count_payload({'model': 'gpt-6-astra', **change})

    def test_offline_script_is_separate_and_keeps_real_reservations(self):
        compile(install.OFFLINE_CHECK, 'offline_check', 'exec')
        self.assertIn('return protect(folder, payload, headers, counter=fixture_counter)', install.OFFLINE_CHECK)
        self.assertIn('codex_smoke.main(build=True)', install.OFFLINE_CHECK)
        self.assertNotIn('CEILING_MICRO_USD =', install.OFFLINE_CHECK)
        self.assertNotIn('verified.json', install.OFFLINE_CHECK)

@unittest.skipUnless(os.environ.get('FAST_INSTALLED_FIXTURE'), 'Real source reconstruction is a separate CI step')
class ActualVariantTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(os.environ['FAST_INSTALLED_FIXTURE'])
        self.original = {name: (self.root/name).read_bytes() for name in install.EXPECTED}

    def test_real_source_equals_the_user_screenshot_and_reverses_to_reviewed_ancestor(self):
        self.assertEqual({n: hashlib.sha256(v).hexdigest() for n,v in self.original.items()}, install.FAST_SPEND_EXPECTED)
        self.assertEqual(hashlib.sha256((self.root/'fast_spend.py').read_bytes()).hexdigest(), install.FAST_SPEND_SHA256)
        self.assertEqual(install.base.blob_sha(self.original['codex_runner.py']), '52c9d68d131178f879bedb9dc496c3c08cc2a3cf')
        self.assertEqual(install.reviewed_variant(self.original), 'FAST_V33_WITH_SPEND')

    def test_new_guard_preserves_legacy_fast_code_and_does_not_modify_other_files(self):
        updated = install.changes(self.original, Path(guard.__file__).read_bytes())
        self.assertEqual(set(updated), {'codex_runner.py','fast_preview.py','astra_spend.py'})
        text = updated['codex_runner.py'].decode()
        self.assertIn(install.OLD_FAST_CALL, text)
        self.assertIn(install.OLD_FAST_HEALTH, updated['fast_preview.py'].decode())
        self.assertEqual(text.count('astra_spend.protect('), 1)
        self.assertLess(text.index('astra_spend.protect('), text.index(install.ANCHOR))
        self.assertEqual(text.count("https://api.openai.com/v1/responses'"), 1)
        for name, raw in updated.items(): compile(raw, name, 'exec')

    def test_unknown_changes_and_mixed_versions_are_not_allowlisted(self):
        altered = {**self.original, 'codex_runner.py': self.original['codex_runner.py'] + b'\n'}
        with self.assertRaises(install.base.InstallError): install.reviewed_variant(altered)
        # Even injecting a matching display hash must not bypass the reverse-patch proof.
        with patch.dict(install.FAST_SPEND_EXPECTED, {n: hashlib.sha256(v).hexdigest() for n,v in altered.items()}, clear=True):
            with self.assertRaises(install.base.InstallError): install.reviewed_variant(altered)

if __name__ == '__main__': unittest.main()
