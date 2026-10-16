"""Synthetic contracts only: no original customer PNG or real neural inference."""
import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from PIL import Image
import numpy as np
import trimesh

script = Path(__file__).resolve().parents[1] / 'scripts/verify-3d-trial-result.py'
spec = importlib.util.spec_from_file_location('trialcheck', script)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

class Checks(unittest.TestCase):
    def create(self, folder, trial, flatten=False, erase_node=None, repeated=False, no_texture=False):
        target = Path(folder)
        raw, out = target / 'raw', target / 'outputs'
        raw.mkdir();out.mkdir()
        scene = trimesh.Scene()
        for i, name in enumerate(sorted(mod.TRIALS[trial]['nodes'])):
            mesh = trimesh.creation.icosphere(subdivisions=3)
            if not no_texture:
                pts = mesh.vertices
                uv = np.column_stack(((np.arctan2(pts[:, 1], pts[:, 0]) + np.pi) / (2 * np.pi),
                                      (pts[:, 2] + 1) / 2))
                mat = trimesh.visual.material.PBRMaterial(
                    baseColorTexture=Image.new('RGBA', (8, 8), (80 + i * 10, 150, 70, 255)))
                mesh.visual = trimesh.visual.TextureVisuals(uv=uv, material=mat)
            if flatten:
                mesh.vertices[:, 2] *= 0.001
            n = 'wrong' if name == erase_node else name
            scene.add_geometry(mesh, node_name=n, geom_name=n,
                               transform=trimesh.transformations.translation_matrix([i * 3, 0, 0]))
        scene.export(out / 'game.glb')
        (raw / 'original.glb').write_bytes((out / 'game.glb').read_bytes())
        # Contract fixture only, not a real/editable Blender file.
        (out / 'source.blend').write_bytes(b'BLENDER-v-300' + b'\0' * 2048)
        for i, v in enumerate(mod.VIEWS):
            color = (10 + i * 10, 40 + i * 13, 100 + i * 10) if not repeated else (100, 100, 100)
            Image.new('RGB', (300, 300), color).save(out / (v + '.png'))
        qa = {'sourceSha256': hashlib.sha256((raw / 'original.glb').read_bytes()).hexdigest(),
              'printReady': False, 'visualAccepted': False, 'views': list(mod.VIEWS)}
        (out / 'qa.json').write_text(json.dumps(qa))
        receipt = {'state': 'REVIEW_REQUIRED', 'visualAccepted': False,
                   'printReady': False, 'supplierAccepted': False,
                   'geometryEngine': 'microsoft/TRELLIS.2-4B',
                   'inferenceAttempts': 1, 'actualBilledMicroUsd': None}
        (target / 'result.json').write_text(json.dumps(receipt))

    def test_synthetic_structural_pass_does_not_claim_actual_neural_model_or_similarity(self):
        for trial in mod.TRIALS:
            with self.subTest(trial=trial), tempfile.TemporaryDirectory() as d:
                self.create(d, trial)
                result = mod.inspect_folder(Path(d), trial)
                self.assertEqual(result['structuralFormatCheck'], 'PASS')
                self.assertEqual(result['visualSimilarity'], 'NOT_MEASURED')
                self.assertEqual(result['realProviderExecution'], 'NOT_INDEPENDENTLY_VERIFIED')
                self.assertFalse(result['publicDownloadVerified'])

    def test_flat_billboard_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            self.create(d, 'ecomech-v4', flatten=True)
            with self.assertRaisesRegex(mod.Rejected, 'BILLBOARD_OR_FLAT_MESH'):
                mod.inspect_folder(Path(d), 'ecomech-v4')

    def test_missing_independent_squirrel_component_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            self.create(d, 'halloween-music-room', erase_node='squirrel')
            with self.assertRaisesRegex(mod.Rejected, 'REQUIRED_3D_COMPONENTS_MISSING'):
                mod.inspect_folder(Path(d), 'halloween-music-room')

    def test_copy_pasted_camera_image_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            self.create(d, 'ecomech-v4', repeated=True)
            with self.assertRaisesRegex(mod.Rejected, 'REPEATED_OR_COPIED_CAMERA_IMAGES'):
                mod.inspect_folder(Path(d), 'ecomech-v4')

    def test_pbr_material_must_have_texture(self):
        with tempfile.TemporaryDirectory() as d:
            self.create(d, 'ecomech-v4', no_texture=True)
            with self.assertRaisesRegex(mod.Rejected, 'PBR_TEXTURE_MISSING'):
                mod.inspect_folder(Path(d), 'ecomech-v4')

    def test_false_visual_approval_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            self.create(d, 'ecomech-v4')
            path = Path(d) / 'result.json'
            receipt = json.loads(path.read_text())
            receipt['visualAccepted'] = True
            path.write_text(json.dumps(receipt))
            with self.assertRaisesRegex(mod.Rejected, 'FALSE_GENERATION_APPROVAL'):
                mod.inspect_folder(Path(d), 'ecomech-v4')

    def test_bad_blender_header_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            self.create(d, 'ecomech-v4')
            (Path(d) / 'outputs/source.blend').write_bytes(b'FAKE' + b'0' * 2000)
            with self.assertRaisesRegex(mod.Rejected, 'EDITABLE_BLEND_FORMAT_REQUIRED'):
                mod.inspect_folder(Path(d), 'ecomech-v4')

    def test_original_glb_integrity_rejected_if_changed(self):
        with tempfile.TemporaryDirectory() as d:
            self.create(d, 'ecomech-v4')
            path = Path(d) / 'outputs/qa.json'
            qa = json.loads(path.read_text())
            qa['sourceSha256'] = '0' * 64
            path.write_text(json.dumps(qa))
            with self.assertRaisesRegex(mod.Rejected, 'SOURCE_GLB_HASH_MISMATCH'):
                mod.inspect_folder(Path(d), 'ecomech-v4')

if __name__ == '__main__':
    unittest.main(verbosity=2)
