"""Offline corruption/wrong-encoder tests using tiny, explicitly fake weights."""
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import download_bundle as bundle


class BundleTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / 'models'
        (self.root / 'ckpts').mkdir(parents=True)
        (self.root / 'dinov3').mkdir()
        self.weight = b'NOT_REAL_MODEL_WEIGHTS_TEST_ONLY'
        sha = hashlib.sha256(self.weight).hexdigest()
        parts = {'sparse_structure_decoder': ('fixture', sha)}
        for p in (patch.object(bundle, 'ROOT', self.root), patch.object(bundle, 'PARTS', parts), patch.object(bundle, 'DINO_WEIGHT_SHA', sha)):
            p.start(); self.addCleanup(p.stop)
        (self.root / 'ckpts/fixture.json').write_text('{}')
        (self.root / 'ckpts/fixture.safetensors').write_bytes(self.weight)
        (self.root / 'dinov3/model.safetensors').write_bytes(self.weight)
        (self.root / 'dinov3/config.json').write_text(json.dumps({'hidden_size': 1024, 'patch_size': 16}))
        for name in ('LICENSE.md', 'README.md', 'preprocessor_config.json'):
            (self.root / 'dinov3' / name).write_text('fixture')
        (self.root / 'pipeline.json').write_text(json.dumps({'args': {
            'models': {'sparse_structure_decoder': 'fixture'},
            'image_cond_model': {'args': {'model_name': bundle.DINO}},
        }}))
        self.review = Path(self.temp.name) / 'review.json'
        self.review.write_text(json.dumps({'reviewed': True, 'dino': bundle.DINO}))

    def test_manifest_uses_only_hashed_relative_files(self):
        bundle.finalize(self.review)
        manifest = json.loads((self.root / 'worldifact-bundle.json').read_text())
        self.assertEqual(manifest['files']['dinov3/model.safetensors'], hashlib.sha256(self.weight).hexdigest())
        self.assertTrue(all(not Path(p).is_absolute() for p in manifest['files']))

    def test_modified_checkpoint_stops_build(self):
        (self.root / 'ckpts/fixture.safetensors').write_bytes(b'corrupt')
        with self.assertRaisesRegex(ValueError, 'CHECKPOINT_CORRUPTED'):
            bundle.finalize(self.review)

    def test_wrong_dino_size_cannot_substitute_for_vitl(self):
        (self.root / 'dinov3/config.json').write_text(json.dumps({'hidden_size': 384, 'patch_size': 16}))
        with self.assertRaisesRegex(ValueError, 'WRONG_DINO_VARIANT'):
            bundle.finalize(self.review)

    def test_unexpected_file_or_missing_license_stops_build(self):
        (self.root / 'dinov3/LICENSE.md').unlink()
        with self.assertRaisesRegex(ValueError, 'FILE_SET_MISMATCH'):
            bundle.finalize(self.review)


if __name__ == '__main__':
    unittest.main()
