"""Synthetic attestation fixtures; no installed, provider or Blender claim."""
from copy import deepcopy
import hashlib
import json
import os
from pathlib import Path
import tempfile
import unittest

import construction_health as health


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def encoded(value):
    return (json.dumps(value, sort_keys=True) + '\n').encode()


class HealthTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='construction-health-')
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        for name in health.SOURCES | {'astra_spend.py', 'fast_preview.py'}:
            raw = ('# Synthetic source fixture: ' + name + '\n').encode()
            if name == 'construction_health.py':
                raw = Path(health.__file__).read_bytes()
            (self.root / name).write_bytes(raw)
        self.sources = {name: sha((self.root / name).read_bytes()) for name in health.SOURCES}
        self.chain = {}
        fenced = {'maintenance_fence': health.FENCE_REVISION,
                  'cancelled_cleanup_interruption_approved': False,
                  'offline_generic_pipeline': True, 'offline_cabinet_pipeline': True,
                  'offline_standard_pipeline': True}
        for name, (revision, names) in health.CHAIN_LAYOUT.items():
            self.chain[name] = {'revision': revision,
                                'sha256': {key: self.sources[key] for key in names}}
            if names in (health.PRICING_SOURCES, health.CORE_SOURCES):
                self.chain[name].update(fenced)
        self.chain[health.GENERIC_RECEIPT] = {
            'sources': {name: self.sources[name] for name in ('codex_runner.py', 'blender_mcp.py')},
            'cli_mcp_roundtrip': True, 'code_mode_roundtrip': True, 'blender_build_roundtrip': True}
        self.chain[health.GUARD_RECEIPT] = {
            'revision': 'astra-usd175-v1',
            'sha256': {name: sha((self.root / name).read_bytes())
                       for name in ('codex_runner.py', 'astra_spend.py', 'fast_preview.py')},
            'outputPolicy': {'revision': 'astra-low-reconciled-v2',
                             'sha256': self.sources['astra_spend_v2.py']}}
        self.proof = {'revision': health.REVISION, 'sha256': self.sources,
                      'maintenance_fence': health.FENCE_REVISION,
                      'cancelled_cleanup_interruption_approved': False,
                      **{gate: True for gate in health.GATES}}
        self.write_chain()

    def write_proof(self):
        (self.root / health.RECEIPT).write_bytes(encoded(self.proof))

    def write_chain(self):
        for name, value in self.chain.items():
            path = self.root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(encoded(value))
        self.proof['receipt_sha256'] = {
            name: sha((self.root / name).read_bytes()) for name in health.CHAIN_RECEIPTS}
        self.write_proof()

    def test_exact_bound_chain_returns_only_public_revision(self):
        before = {str(path): path.read_bytes() for path in self.root.rglob('*') if path.is_file()}
        self.assertEqual(health.verified_health(self.root),
                         {'worldifactStandardConstructionPolicy': health.REVISION})
        self.assertEqual(before, {str(path): path.read_bytes()
                                 for path in self.root.rglob('*') if path.is_file()})

    def test_every_runtime_source_is_bound_to_actual_bytes(self):
        for name in sorted(health.SOURCES):
            with self.subTest(name=name):
                path = self.root / name
                original = path.read_bytes()
                path.write_bytes(original + b'# changed\n')
                self.assertEqual(health.verified_health(self.root), {})
                path.write_bytes(original)

    def test_every_prior_receipt_is_bound_to_exact_bytes(self):
        for name in sorted(health.CHAIN_RECEIPTS):
            with self.subTest(name=name):
                path = self.root / name
                original = path.read_bytes()
                path.write_bytes(original + b'\n')
                self.assertEqual(health.verified_health(self.root), {})
                path.write_bytes(original)

    def test_source_and_receipt_coverage_cannot_be_extended_or_shrunk(self):
        original = deepcopy(self.proof)
        for field in ('sha256', 'receipt_sha256'):
            for mutation in ('missing', 'extra', 'invalid_hash'):
                with self.subTest(field=field, mutation=mutation):
                    self.proof = deepcopy(original)
                    mapping = self.proof[field]
                    if mutation == 'missing':
                        mapping.pop(next(iter(mapping)))
                    elif mutation == 'extra':
                        mapping['../unreviewed.py'] = 'a' * 64
                    else:
                        mapping[next(iter(mapping))] = 'A' * 64
                    self.write_proof()
                    self.assertEqual(health.verified_health(self.root), {})

    def test_new_gate_and_fence_values_are_strict(self):
        original = deepcopy(self.proof)
        for key in (*health.GATES, 'maintenance_fence', 'cancelled_cleanup_interruption_approved', 'revision'):
            for value in (None, 1, 'true', False if key != 'cancelled_cleanup_interruption_approved' else []):
                with self.subTest(key=key, value=value):
                    self.proof = deepcopy(original)
                    self.proof[key] = value
                    self.write_proof()
                    self.assertEqual(health.verified_health(self.root), {})

    def test_rebound_receipt_hash_does_not_hide_invalid_chain(self):
        original = deepcopy(self.chain)
        for name, (_revision, _names) in health.CHAIN_LAYOUT.items():
            with self.subTest(name=name):
                self.chain = deepcopy(original)
                self.chain[name]['sha256']['codex_runner.py'] = 'a' * 64
                self.write_chain()
                self.assertEqual(health.verified_health(self.root), {})

    def test_phased_gate_does_not_substitute_for_legacy_standard_gate(self):
        self.chain['.worldifact-standard-context.json']['offline_standard_pipeline'] = False
        self.write_chain()
        self.assertEqual(health.verified_health(self.root), {})

    def test_generic_roundtrips_are_genuine_boolean_requirements(self):
        for flag in ('cli_mcp_roundtrip', 'code_mode_roundtrip', 'blender_build_roundtrip'):
            with self.subTest(flag=flag):
                self.chain[health.GENERIC_RECEIPT][flag] = 1
                self.write_chain()
                self.assertEqual(health.verified_health(self.root), {})
                self.chain[health.GENERIC_RECEIPT][flag] = True

    def test_guard_still_binds_legacy_helpers_and_modified_output_policy(self):
        for name in ('astra_spend.py', 'fast_preview.py'):
            with self.subTest(name=name):
                path = self.root / name
                original = path.read_bytes()
                path.write_bytes(b'# changed\n')
                self.assertEqual(health.verified_health(self.root), {})
                path.write_bytes(original)
        self.chain[health.GUARD_RECEIPT]['outputPolicy']['sha256'] = 'a' * 64
        self.write_chain()
        self.assertEqual(health.verified_health(self.root), {})

    def test_symlinked_sources_receipts_and_root_are_rejected(self):
        for name in ('runtime_controller.py', health.RECEIPT, health.GENERIC_RECEIPT):
            with self.subTest(name=name):
                path = self.root / name
                saved = path.with_name(path.name + '.saved')
                path.rename(saved)
                path.symlink_to(saved)
                self.assertEqual(health.verified_health(self.root), {})
                path.unlink()
                saved.rename(path)
        with tempfile.TemporaryDirectory() as other:
            linked = Path(other) / 'linked'
            linked.symlink_to(self.root, target_is_directory=True)
            self.assertEqual(health.verified_health(linked), {})

    def test_nested_receipt_parent_symlink_is_rejected(self):
        tools = self.root / 'tools'
        tools.rename(self.root / 'saved-tools')
        tools.symlink_to(self.root / 'saved-tools', target_is_directory=True)
        self.assertEqual(health.verified_health(self.root), {})

    def test_missing_oversized_special_and_duplicate_key_files_are_rejected(self):
        path = self.root / health.RECEIPT
        for raw in (b'', b'{' + b' ' * 16384 + b'}', b'[]', b'{"revision":1,"revision":2}'):
            with self.subTest(raw_length=len(raw)):
                path.write_bytes(raw)
                self.assertEqual(health.verified_health(self.root), {})
        path.unlink()
        self.assertEqual(health.verified_health(self.root), {})
        os.mkfifo(path)
        self.assertEqual(health.verified_health(self.root), {})


if __name__ == '__main__':
    unittest.main()
