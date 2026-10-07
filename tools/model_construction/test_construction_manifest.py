"""Finite manifest/fence admission and exact copied guardian protocol."""
from pathlib import Path
import types
import unittest
from unittest.mock import patch

import construction_fence as fence
import construction_health as health
import construction_manifest as manifest
import test_construction_transaction as transactions


class ManifestTests(unittest.TestCase):
    def setUp(self):
        self.unfrozen = {name: 'UNFROZEN_REFUSE' for name in health.SOURCES}

    def test_unfrozen_original_manifest_cannot_admit_direct_fence(self):
        operations = types.SimpleNamespace(source=Path('/synthetic/froge-connector'), home=Path('/synthetic'),
                                           expected_source_sha256=dict(manifest.EXPECTED))
        with patch.object(manifest, 'EXPECTED_AFTER', self.unfrozen), \
             patch.object(fence, '_source', side_effect=AssertionError('Source read before frozen admission')):
            self.assertFalse(manifest.reviewed_manifest(manifest.EXPECTED))
            with self.assertRaisesRegex(fence.FenceRefused, 'exact reviewed'):
                with fence.quiesce(operations): self.fail('Unfrozen fence yielded')

    def test_operations_preflight_refuses_unfrozen_before_any_target_check(self):
        installer = transactions.installer
        operations = installer.Operations(Path('/synthetic/froge-connector'), Path('/synthetic'))
        with patch.object(manifest, 'EXPECTED_AFTER', self.unfrozen), \
             patch.object(installer, 'frozen_dependencies', side_effect=AssertionError('Premature gate check')):
            with self.assertRaisesRegex(ValueError, 'not frozen'): operations.preflight()

    def test_copied_fence_differs_only_in_finite_manifest_import(self):
        here = Path(__file__).resolve().parent
        old = (here.parents[1] / 'tools/model_context_upgrade/upgrade_fence.py').read_text()
        old = old.replace('from upgrade_patch import EXPECTED, reviewed_manifest',
                          'from construction_manifest import EXPECTED, reviewed_manifest')
        self.assertEqual((here / 'construction_fence.py').read_text(), old)

    def test_only_fixed_before_or_complete_after_manifest_is_accepted(self):
        sources = transactions.lineage.installed_sources()
        here = Path(__file__).resolve().parent
        sources['context_policy.py'] = (here.parents[1] / 'tools/model_context_upgrade/context_policy.py').read_bytes()
        helpers = {name: (here / name).read_bytes() for name in manifest.HELPERS}
        changed = transactions.runtime_patch.changes(sources, helpers)
        after = {name: transactions.digest(raw) for name, raw in changed.items()}
        with patch.object(manifest, 'EXPECTED_AFTER', after):
            self.assertTrue(manifest.reviewed_manifest(manifest.EXPECTED))
            self.assertTrue(manifest.reviewed_manifest(after))
            self.assertEqual(manifest.changes(sources, helpers), changed)
            for name in after:
                with self.subTest(name=name):
                    self.assertFalse(manifest.reviewed_manifest({**after, name: '0' * 64}))
                    self.assertFalse(manifest.reviewed_manifest({key:value for key,value in after.items() if key != name}))
            self.assertFalse(manifest.reviewed_manifest({**after, 'unreviewed.py': 'a' * 64}))
            with self.assertRaises(ValueError): manifest.changes(sources, {**helpers, 'runtime_controller.py': helpers['runtime_controller.py'] + b'\n'})


if __name__ == '__main__': unittest.main()
