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

    def test_only_fixed_predecessors_or_complete_after_manifest_is_accepted(self):
        sources = transactions.lineage.installed_sources()
        here = Path(__file__).resolve().parent
        sources['context_policy.py'] = (here.parents[1] / 'tools/model_context_upgrade/context_policy.py').read_bytes()
        helpers = {name: (here / name).read_bytes() for name in manifest.HELPERS}
        changed = transactions.runtime_patch.changes(sources, helpers)
        after = {name: transactions.digest(raw) for name, raw in changed.items()}
        self.assertEqual(after, manifest.final_manifest(), 'Frozen target must match the real complete runtime.')
        with patch.object(manifest, 'EXPECTED_AFTER', after):
            self.assertTrue(manifest.reviewed_manifest(manifest.EXPECTED))
            self.assertTrue(manifest.reviewed_manifest(after))
            self.assertTrue(manifest.reviewed_manifest(manifest.INSTALLED_V1))
            self.assertTrue(manifest.reviewed_manifest(manifest.INITIAL_EDIT_BEFORE))
            self.assertEqual(manifest.changes(sources, helpers), changed)
            for name in after:
                with self.subTest(name=name):
                    self.assertFalse(manifest.reviewed_manifest({**after, name: '0' * 64}))
                    self.assertFalse(manifest.reviewed_manifest({key:value for key,value in after.items() if key != name}))
            self.assertFalse(manifest.reviewed_manifest({**after, 'unreviewed.py': 'a' * 64}))
            with self.assertRaises(ValueError): manifest.changes(sources, {**helpers, 'runtime_controller.py': helpers['runtime_controller.py'] + b'\n'})

    def test_update_target_can_only_change_the_complete_installed_parser_hash(self):
        before, after = manifest.payload_predecessor(), manifest.PAYLOAD_AFTER
        self.assertEqual(set(before), health.SOURCES)
        self.assertEqual({name for name in before if before[name] != after[name]}, {'construction_payload.py'})
        self.assertEqual(before['construction_payload.py'],
                         'fb47f6038cf7e43eb98371fdaaa9ad9e34e8fa06075a94a6653338747878fca1')
        invalid = [after, {name: value for name, value in before.items() if name != 'server.py'},
                   {**before, 'unreviewed.py': 'a' * 64}, {**before, 'server.py': '0' * 64},
                   {**before, 'construction_payload.py': 'UNFROZEN_REFUSE'}]
        for value in invalid:
            with self.subTest(value=value), patch.object(manifest, 'INSTALLED_V1', value):
                with self.assertRaisesRegex(ValueError, 'not frozen'):
                    manifest.payload_predecessor()

    def test_initial_edit_target_changes_exactly_three_helpers_from_parser_fixed_runtime(self):
        before, after = manifest.initial_edit_predecessor(), manifest.final_manifest()
        self.assertEqual(before, manifest.PAYLOAD_AFTER)
        self.assertEqual({name for name in before if before[name] != after[name]},
                         {'construction_payload.py', 'phased_controller.py', 'runtime_controller.py'})
        self.assertEqual(before['construction_payload.py'],
                         '3b7e5af5192724af4d7eb2943a09230c952fbd44905ec955f2ae2d7a6ec03a84')
        invalid = [after, {name: value for name, value in before.items() if name != 'server.py'},
                   {**before, 'unreviewed.py': 'a' * 64}, {**before, 'server.py': '0' * 64},
                   {**before, 'construction_payload.py': 'UNFROZEN_REFUSE'}]
        for value in invalid:
            with self.subTest(value=value), patch.object(manifest, 'INITIAL_EDIT_BEFORE', value):
                with self.assertRaisesRegex(ValueError, 'not frozen'):
                    manifest.initial_edit_predecessor()

    def test_initial_edit_rejects_incomplete_extra_or_changed_helper_bytes(self):
        here = Path(__file__).resolve().parent
        helpers = {name: (here / name).read_bytes() for name in manifest.INITIAL_EDIT_HELPERS}
        original = {name: (b'# reviewed predecessor ' + name.encode() + b'\n')
                    for name in manifest.initial_edit_predecessor()}
        before = {name: transactions.digest(raw) for name, raw in original.items()}
        changed = {**original, **helpers}
        after = {name: transactions.digest(raw) for name, raw in changed.items()}
        with patch.object(manifest, 'INITIAL_EDIT_BEFORE', before), \
             patch.object(manifest, 'final_manifest', return_value=after):
            self.assertEqual(manifest.initial_edit_changes(original, helpers), changed)
            invalid = [{name: raw for name, raw in helpers.items() if name != 'phased_controller.py'},
                       {**helpers, 'server.py': b'# unreviewed\n'},
                       {**helpers, 'runtime_controller.py': helpers['runtime_controller.py'] + b'\n'}]
            for value in invalid:
                with self.assertRaises(ValueError): manifest.initial_edit_changes(original, value)

    def test_update_source_authority_does_not_come_from_target_receipts(self):
        operations = types.SimpleNamespace(source=Path('/synthetic/froge-connector'), home=Path('/synthetic'),
                                           expected_source_sha256={**manifest.INSTALLED_V1, 'runtime_controller.py': '0' * 64})
        with patch.object(fence, '_source', side_effect=AssertionError('Unreviewed source read')):
            with self.assertRaisesRegex(fence.FenceRefused, 'exact reviewed'):
                with fence.quiesce(operations):
                    self.fail('Unreviewed update fence yielded')


if __name__ == '__main__': unittest.main()
