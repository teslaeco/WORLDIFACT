"""V6 mesh-gate regression tests. Real original GLB is mounted by Actions."""
import importlib.util, json, os, tempfile, unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('qa', ROOT/'tools/ecomech/v6_character_quality_gate.py')
qa=importlib.util.module_from_spec(spec)
spec.loader.exec_module(qa)

class TestQualityGate(unittest.TestCase):
    def test_no_object_is_certified_by_polygons_alone(self):
        with self.assertRaisesRegex(ValueError,'REAL_GLB_V2_REQUIRED'):
            qa.gltf_info(b'not a 3D model')
        with self.assertRaisesRegex(ValueError,'REAL_GLB_V2_REQUIRED'):
            qa.gltf_info(b'glTF'+b'\0'*20)

    def test_wrong_source_provenance_is_rejected(self):
        with tempfile.TemporaryDirectory() as path:
            f=Path(path)/'annotation.json'
            f.write_text(json.dumps({'purpose':'ANNOTATION_DRAFT_NOT_RELEASE_APPROVED',
                'sourceImageOriginalSha256':'0'*64,'parts':{
                  'robotOutline':[[.1,.1]]*60,'chiliOutline':[[.1,.1]]*21}}))
            with self.assertRaisesRegex(ValueError,'REFERENCE_ANNOTATION_NOT_FROM_ORIGINAL_IMAGE'):
                qa.reference_mask(f)

    def test_original_mesh_high_silhouette_is_still_no_go(self):
        glb=os.getenv('ECOMECH_ORIGINAL_SIX_GLB')
        manifest=os.getenv('ECOMECH_ORIGINAL_SIX_MANIFEST')
        annotation=os.getenv('ECOMECH_ORIGINAL_SIX_ANNOTATION')
        if not (glb and manifest and annotation):
            self.skipTest('Requires preexisting SHA-verified Github Actions artifact, not fake geometry')
        report=qa.score_geometry(glb,manifest,annotation)
        self.assertEqual(report['originalGLBSha256'],
          '193ad27bd19ec94941b24222662024460d62758c7e2b0e53e7e55e51196f5970')
        self.assertEqual(report['actualTriangles'],218450)
        self.assertGreater(report['draftSilhouetteIoU'],.7)
        self.assertLess(report['ratios']['depthOverHeight'],.15)
        self.assertIn('FLATTENED_3D_DEPTH',report['failures'])
        self.assertIn('NO_EMBEDDED_NORMAL_AND_METALLIC_ROUGHNESS_PBR_TEXTURES',report['failures'])
        self.assertFalse(report['premiumEligible'])
        self.assertEqual(report['release'],'NO_GO')
        self.assertEqual(report['newPaidRequests'],0)

    def test_original_evidence_refuses_changed_manifest(self):
        glb=os.getenv('ECOMECH_ORIGINAL_SIX_GLB')
        manifest=os.getenv('ECOMECH_ORIGINAL_SIX_MANIFEST')
        annotation=os.getenv('ECOMECH_ORIGINAL_SIX_ANNOTATION')
        if not (glb and manifest and annotation):
            self.skipTest('Needs actual archived neural mesh')
        with tempfile.TemporaryDirectory() as path:
            item=json.loads(Path(manifest).read_text())
            item['outputSha256']='0'*64
            p=Path(path)/'bad.json';p.write_text(json.dumps(item))
            with self.assertRaisesRegex(ValueError,'EXACT_NEURAL_RESULT_PROVENANCE_CHANGED'):
                qa.score_geometry(glb,p,annotation)

if __name__=='__main__':unittest.main()
