"""Offline regression tests. No provider calls, secrets, slicing or orders."""
import hashlib, importlib.util, json, os, tempfile, unittest
from pathlib import Path
import numpy as np
import trimesh
ROOT=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('make',ROOT/'prepare_make.py')
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)

class MakeTests(unittest.TestCase):
    def test_closed_box_has_positive_volume(self):
        result=mod.audit(trimesh.creation.box(extents=(10,20,30)))
        self.assertTrue(result['watertight'])
        self.assertEqual(result['connectedComponents'],1)
        self.assertEqual(result['boundaryEdges'],0)
        self.assertEqual(result['nonManifoldEdges'],0)
        self.assertTrue(result['positiveVolume'])
        self.assertAlmostEqual(result['volumeMm3'],6000)
    def test_two_closed_islands_are_not_one_print_body(self):
        a=trimesh.creation.box();b=trimesh.creation.box();b.apply_translation((5,0,0))
        result=mod.audit(trimesh.util.concatenate([a,b]))
        self.assertTrue(result['watertight'])
        self.assertEqual(result['connectedComponents'],2)
    def test_inward_mesh_is_detected(self):
        a=trimesh.creation.box();a.invert()
        result=mod.audit(a)
        self.assertTrue(result['watertight'])
        self.assertFalse(result['positiveVolume'])
    def test_open_mesh_is_not_watertight(self):
        a=trimesh.creation.box();a.update_faces(np.arange(len(a.faces))!=0)
        result=mod.audit(a)
        self.assertFalse(result['watertight'])
        self.assertGreater(result['boundaryEdges'],0)
    def test_invalid_profile_refused_before_file_read(self):
        with self.assertRaisesRegex(ValueError,'UNREVIEWED_PRINT_PROFILE'):
            mod.prepare(Path('/missing.glb'),Path('/must-not-write'),-1)
    def test_wrong_original_is_rejected_without_output(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'bad.glb';p.write_bytes(b'glTF'+b'x'*100)
            out=Path(d)/'out'
            with self.assertRaisesRegex(ValueError,'ORIGINAL_V7_GLB_SHA_REQUIRED'):
                mod.prepare(p,out)
            self.assertFalse(out.exists())
    def test_thickness_screen_is_not_certification(self):
        r=mod.thickness_screen(trimesh.creation.box(extents=(10,20,30)),samples=12)
        self.assertFalse(r['fullMinimumThicknessVerified'])
        self.assertEqual(r['belowTargetSamples'],0)
    def test_actual_mesh_and_roundtrip_when_supplied(self):
        root=os.environ.get('ECOMECH_V8_RESULT')
        if not root:self.skipTest('Actual generated source-bound artifact required')
        d=Path(root);q=json.loads((d/'MAKE_QA.json').read_text())
        m=trimesh.load(d/'ECOMECH_V8_MAKE_CANDIDATE_200mm.stl',force='mesh',process=True)
        self.assertEqual(mod.sha(d/'ECOMECH_V8_MAKE_CANDIDATE_200mm.stl'),q['stlSha256'])
        self.assertEqual(mod.audit(m),q['structuralAudit'])
        self.assertAlmostEqual(m.extents[2],200,places=4)
        self.assertFalse(q['printReady'])
        self.assertFalse(q['supplierAccepted'])
        self.assertFalse(q['slicerAccepted'])
        self.assertFalse(q['physicalTestPrinted'])
        self.assertTrue(q['sourceOriginalUnmodified'])
        self.assertEqual(q['newOpenAiCalls'],0)
        self.assertEqual(q['newPaidVendorCalls'],0)
        self.assertTrue(q['structuralGatePassed'])
        s=trimesh.load(d/'ECOMECH_V8_MAKE_CLAY.glb',force='mesh',process=True)
        np.testing.assert_allclose(s.extents*1000,m.extents[[0,2,1]],atol=.002)

if __name__=='__main__':unittest.main(verbosity=2)
