"""Finite installed-source admission and inherited guardian semantic identity."""
import hashlib
from pathlib import Path
import unittest
from unittest.mock import patch

from upgrade_test_support import ANCESTOR, bootstrap
bootstrap()
import upgrade_patch
from test_upgrade_transaction import installed_sources

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]


class ManifestTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls): cls.before = installed_sources()
    def test_installed_pr214_only_and_single_helper_write(self):
        helper = (HERE / 'context_policy.py').read_bytes()
        with patch.object(upgrade_patch, 'HELPER_SHA256', hashlib.sha256(helper).hexdigest()):
            after = upgrade_patch.changes(self.before, helper)
            self.assertEqual({name for name in after if after[name] != self.before[name]}, {'context_policy.py'})
            self.assertTrue(upgrade_patch.reviewed_manifest(upgrade_patch.EXPECTED))
            self.assertTrue(upgrade_patch.reviewed_manifest(upgrade_patch.upgraded_manifest()))
            for name in self.before:
                with self.subTest(name=name):
                    with self.assertRaises(ValueError):
                        upgrade_patch.changes({**self.before, name: self.before[name] + b'\n'}, helper)
                    self.assertFalse(upgrade_patch.reviewed_manifest({**upgrade_patch.EXPECTED, name: '0' * 64}))
            with self.assertRaises(ValueError): upgrade_patch.changes({**self.before, 'unknown.py': b'# unknown'}, helper)
            with self.assertRaises(ValueError): upgrade_patch.changes(self.before, helper + b'\n')
    def test_missing_or_mixed_old_helper_and_ancestor_refused(self):
        for name in ('context_policy.py', 'studio_pricing.py', 'terminal_budget.py'):
            with self.subTest(name=name):
                with self.assertRaises(ValueError):
                    upgrade_patch.reviewed_sources({key: raw for key, raw in self.before.items() if key != name})
        # The original pre-context runner was once reviewed, but is not this upgrade's target.
        ancestor = {**upgrade_patch.EXPECTED, 'codex_runner.py': 'bc8db1e2694cf3144bf19fa0b46fa93475624fa47f07b00daa886d15415d4412'}
        self.assertFalse(upgrade_patch.reviewed_manifest(ancestor))
    def test_unfrozen_helper_cannot_extend_target_admission(self):
        for value in (None, 'main', 'x' * 64, upgrade_patch.EXPECTED['context_policy.py']):
            with self.subTest(value=value), patch.object(upgrade_patch, 'HELPER_SHA256', value):
                with self.assertRaises(ValueError): upgrade_patch.upgraded_manifest()
    def test_original_guardian_byte_identical_except_manifest_and_reviewed_import_location(self):
        expected = (ANCESTOR / 'tools/model_context/maintenance_fence.py').read_text()
        expected = expected.replace('from context_patch import EXPECTED, reviewed_manifest', 'from upgrade_patch import EXPECTED, reviewed_manifest')
        expected = expected.replace("    path = Path(__file__).resolve().with_name('journal_socket.py')", "    path = Path(__file__).resolve().with_name('journal_socket.py')\n    if not path.exists():\n        path = Path(__file__).resolve().parents[1] / 'model_context/journal_socket.py'")
        self.assertEqual((HERE / 'upgrade_fence.py').read_text(), expected)
        self.assertEqual(hashlib.sha256((ANCESTOR / 'tools/model_context/journal_socket.py').read_bytes()).hexdigest(),
                         '427f365b40264a71d1cdd208e94156617d3524518fc9f621485f4a91419fa54e')


if __name__ == '__main__': unittest.main()
