"""Five synthetic GLB parts only; no owner photographs and no neural/provider calls."""
import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

import trimesh

SRC = Path(__file__).resolve().parents[1] / 'scripts/compose-private-scene.py'
spec = importlib.util.spec_from_file_location('worldifact_private_scene', SRC)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class CompositionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.inputs = self.root / 'private'
        (self.inputs / 'parts').mkdir(parents=True)
        parts = {}
        for slot in module.REQUIRED:
            path = self.inputs / 'parts' / f'{slot}.glb'
            mesh = trimesh.creation.icosphere(subdivisions=2)
            path.write_bytes(mesh.export(file_type='glb'))
            parts[slot] = {
                'path': f'parts/{slot}.glb',
                'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                'transform': [[1, 0, 0, 0], [0, 1, 0, 0],
                              [0, 0, 1, 0], [0, 0, 0, 1]],
            }
        self.manifest = {
            'revision': 'worldifact-scene-assembly-v1',
            'assetType': 'MULTI_ASSET_SCENE',
            'assets': parts,
            'visualAccepted': False,
        }

    def test_five_independent_real_meshes_survive_glb_export(self):
        dst = self.root / 'scene-result'
        result = module.compose(self.inputs, self.manifest, dst)
        self.assertEqual(result['state'], 'REVIEW_REQUIRED')
        self.assertFalse(result['blenderEditable'])
        self.assertFalse(result['providerExecutionVerified'])
        self.assertEqual(result['unseenSurfaces'], 'GENERATED_INFERRED')
        output = dst / 'scene.glb'
        self.assertTrue(output.read_bytes().startswith(b'glTF'))
        scene = trimesh.load(output, force='scene', process=False)
        self.assertTrue(set(module.REQUIRED).issubset(
            {name.rsplit('_', 1)[0] for name in scene.graph.nodes_geometry} ))
        self.assertEqual(len(scene.geometry), 5)
        self.assertEqual(result['sceneSha256'], hashlib.sha256(output.read_bytes()).hexdigest())

    def test_missing_squirrel_rejected_not_silently_flattened(self):
        del self.manifest['assets']['squirrel']
        with self.assertRaisesRegex(module.Rejected, 'MISSING_INDEPENDENT_SCENE_PART'):
            module.compose(self.inputs, self.manifest, self.root / 'broken')

    def test_tampered_glb_refused_by_exact_sha256(self):
        self.manifest['assets']['room']['sha256'] = '0' * 64
        with self.assertRaisesRegex(module.Rejected, 'PART_HASH_MISMATCH'):
            module.compose(self.inputs, self.manifest, self.root / 'broken')

    def test_all_nondeterministic_sources_and_external_urls_rejected(self):
        self.manifest['assets']['performer']['path'] = 'https://example.invalid/model.glb'
        with self.assertRaisesRegex(module.Rejected, 'INVALID_PRIVATE_SOURCE_PATH'):
            module.compose(self.inputs, self.manifest, self.root / 'broken')

    def test_wrong_reference_transform_rejected(self):
        self.manifest['assets']['keyboard']['transform'][0][0] = float('nan')
        with self.assertRaisesRegex(module.Rejected, 'NONFINITE_SCENE_TRANSFORM'):
            module.compose(self.inputs, self.manifest, self.root / 'broken')

    def test_impossible_manufacturing_approval_rejected(self):
        self.manifest['visualAccepted'] = True
        with self.assertRaisesRegex(module.Rejected, 'FALSE_SCENE_APPROVAL'):
            module.compose(self.inputs, self.manifest, self.root / 'broken')

    def test_no_output_written_inside_source_bundle(self):
        with self.assertRaisesRegex(module.Rejected, 'OUTPUT_INSIDE_PRIVATE_INPUT'):
            module.compose(self.inputs, self.manifest, self.inputs / 'render')

if __name__ == '__main__':
    unittest.main()
