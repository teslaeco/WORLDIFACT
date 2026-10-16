"""Pure-CPU contracts: strict upstream patch, UV coordinate math and face IDs.

These prove deterministic patching, not DRTK CUDA equivalence or photo-to-3D.
"""
import subprocess
import tempfile
import unittest
from pathlib import Path

from trellis_mit_patch import (
    SOURCE, ORIGINAL, REPLACEMENT, Rejected, audit, replace_import)
from uv_contract import clip_to_pixel, decode_face_alpha, face_alpha, validate_resolution


class UpstreamPatchTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.path = self.root / SOURCE
        self.path.parent.mkdir(parents=True)
        self.original = b'# pinned MIT source fixture\n' + ORIGINAL + b'def to_glb(): return True\n'
        self.path.write_bytes(self.original)
        (self.root / 'README.md').write_text('MIT fixture')
        def git(*args):
            return subprocess.check_output(['git', '-C', str(self.root), *args], stderr=subprocess.DEVNULL).decode().strip()
        git('init', '-q')
        git('config', 'user.email', 'fixture@example.invalid')
        git('config', 'user.name', 'fixture')
        git('add', '.')
        git('commit', '-qm', 'pinned source fixture')
        self.sha = git('rev-parse', 'HEAD')

    def test_exact_one_file_patch_and_audit(self):
        result = audit(self.root, apply=True, expected_revision=self.sha)
        self.assertEqual(result['sourceDiffScope'], [SOURCE])
        self.assertEqual(result['commercialRasterizer'], 'drtk/MIT')
        self.assertEqual(self.path.read_bytes(), self.original.replace(ORIGINAL, REPLACEMENT))
        self.assertEqual(audit(self.root, apply=False, expected_revision=self.sha), result)

    def test_default_production_pin_refuses_unpinned_fixture(self):
        with self.assertRaisesRegex(Rejected, 'UPSTREAM_REVISION_CHANGED'):
            audit(self.root, apply=True)

    def test_reject_changed_original_import(self):
        with self.assertRaisesRegex(Rejected, 'UPSTREAM_IMPORT_CHANGED'):
            replace_import(b'import unrelated_renderer as dr\n')
        with self.assertRaisesRegex(Rejected, 'UPSTREAM_IMPORT_CHANGED'):
            replace_import(ORIGINAL + ORIGINAL)
        with self.assertRaisesRegex(Rejected, 'UPSTREAM_IMPORT_CHANGED'):
            replace_import(ORIGINAL + REPLACEMENT)

    def test_refuses_build_time_dirty_tree(self):
        (self.root / 'README.md').write_text('unreviewed edit')
        with self.assertRaisesRegex(Rejected, 'UPSTREAM_UNRELATED_SOURCE_CHANGED'):
            audit(self.root, apply=True, expected_revision=self.sha)

    def test_refuses_tampered_adapter_source(self):
        audit(self.root, apply=True, expected_revision=self.sha)
        self.path.write_bytes(self.path.read_bytes() + b'\n# tamper\n')
        with self.assertRaisesRegex(Rejected, 'COMMERCIAL_SOURCE_PATCH_NOT_APPLIED'):
            audit(self.root, apply=False, expected_revision=self.sha)

    def test_rejects_reapplication_not_pristine(self):
        audit(self.root, apply=True, expected_revision=self.sha)
        with self.assertRaisesRegex(Rejected, 'UPSTREAM_UNRELATED_SOURCE_CHANGED'):
            audit(self.root, apply=True, expected_revision=self.sha)

    def test_refuses_unsafe_symlink(self):
        self.path.unlink()
        outside = self.root / 'outside.py'
        outside.write_bytes(self.original)
        self.path.symlink_to(outside)
        with self.assertRaisesRegex(Rejected, 'UNSAFE_UPSTREAM_SOURCE_PATH'):
            audit(self.root, apply=True, expected_revision=self.sha)


class DRTKPixelContractTests(unittest.TestCase):
    def test_pixel_corners_and_texture_top_left(self):
        w, h = 1024, 512
        self.assertEqual(clip_to_pixel(-1, 1, w, h), (-.5, -.5))
        self.assertEqual(clip_to_pixel(1, -1, w, h), (w - .5, h - .5))
        self.assertEqual(clip_to_pixel(0, 0, w, h), (w/2 - .5, h/2 - .5))

    def test_face_id_is_one_based_and_chunk_offsets_preserved(self):
        self.assertEqual(face_alpha(-1), 0)
        self.assertEqual(face_alpha(0), 1)
        self.assertEqual(face_alpha(17), 18)
        self.assertEqual(decode_face_alpha(1, 100_000, 300_000), 100_000)
        self.assertEqual(decode_face_alpha(100_000, 100_000, 300_000), 199_999)

    def test_background_and_invalid_indices_cannot_be_interpolated(self):
        for alpha in (0, -1):
            with self.assertRaises( ValueError ):
                decode_face_alpha(alpha, 0, 5)
        with self.assertRaises(ValueError):
            decode_face_alpha(3, 4, 6)
        with self.assertRaises(ValueError):
            face_alpha(-2)

    def test_only_bounded_integer_texture_resolution(self):
        self.assertEqual(validate_resolution([512, 1024]), (512, 1024))
        for v in ([0, 512], [8192, 8192], ['1024', 1024], [256.0, 256], [512], {'w': 512, 'h': 512}):
            with self.subTest(v=v), self.assertRaises(ValueError):
                validate_resolution(v)


if __name__ == '__main__':
    unittest.main()
