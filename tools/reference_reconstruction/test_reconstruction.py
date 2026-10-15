"""Offline contract tests, explicitly NOT tests of TRELLIS2 visual quality."""
import copy,json,tempfile,unittest
from pathlib import Path
import trimesh
from core import SOURCE_SHA,validate_job,inspect_glb,prepare_input,supplier_release_decision
from native_trellis2 import hardware,contained,validate_bundle
JOB={'revision':'reference-reconstruction-v1','source_sha256':SOURCE_SHA,'seed':20261015,
 'resolution':1024,'texture_size':4096,'decimation_target':500000,'engine':'trellis2'}

class ContractTests(unittest.TestCase):
    def test_valid_job_is_copied_without_mutation(self):
        before=copy.deepcopy(JOB);result=validate_job(JOB)
        self.assertEqual(result,JOB);self.assertIsNot(result,JOB);self.assertEqual(JOB,before)
    def test_original_reference_cannot_be_replaced(self):
        with self.assertRaisesRegex(ValueError,'SOURCE_OR_ENGINE_CHANGED'):validate_job({**JOB,'source_sha256':'0'*64})
    def test_legacy_engine_cannot_be_a_hidden_fallback(self):
        with self.assertRaisesRegex(ValueError,'SOURCE_OR_ENGINE_CHANGED'):validate_job({**JOB,'engine':'triposr'})
    def test_invalid_resolution_refused(self):
        for r in (True,256,2048,999999,'1024'):
            with self.assertRaises(ValueError):validate_job({**JOB,'resolution':r})
    def test_hidden_paid_options_refused(self):
        with self.assertRaisesRegex(ValueError,'INVALID_JOB'):validate_job({**JOB,'auto_upgrade_gpu':True})
    def test_bounds_for_seed_target_texture(self):
        for k,v in (('seed',-1),('seed',True),('seed',2**31),('texture_size',16384),('decimation_target',999999999)):
            with self.assertRaises(ValueError):validate_job({**JOB,k:v})
    def test_no_cuda_is_not_cpu_generation(self):
        h=hardware(False,0,'Linux');self.assertFalse(h['ready']);self.assertIn('CUDA_GPU_NOT_AVAILABLE',h['blockers'])
    def test_small_gpu_rejected(self):
        self.assertFalse(hardware(True,16*1024**3,'Linux')['ready'])
    def test_documented_gpu_is_only_a_capability(self):
        self.assertTrue(hardware(True,24*1024**3,'Linux')['ready'])
        self.assertFalse(hardware(True,80*1024**3,'Darwin')['ready'])
    def test_bundle_path_escape_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaises(ValueError):contained(Path(d),'../outside')
            with self.assertRaises(ValueError):contained(Path(d),'/outside')
    def test_unreviewed_dependency_bundle_refused(self):
        from core import MODEL_REVISION,SOURCE_REVISION
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);(root/'worldifact-bundle.json').write_text(json.dumps({'modelRevision':MODEL_REVISION,'sourceRevision':SOURCE_REVISION}))
            with self.assertRaisesRegex(ValueError,'DEPENDENCY_LICENSE_REVIEW_REQUIRED'):validate_bundle(root)
    def test_picture_is_not_glb(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'fake.glb';p.write_bytes(b'PNG image not a mesh')
            with self.assertRaisesRegex(ValueError,'INVALID_GLB_CONTAINER'):inspect_glb(p)
    def test_real_export_is_not_likeness_certification(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'fixture.glb';trimesh.creation.box().export(p)
            audit=inspect_glb(p)
            self.assertEqual(audit['instantiatedTriangles'],12)
            self.assertFalse(audit['printReady']);self.assertFalse(audit['visualAccepted'])
    def test_source_replacement_fails_before_creating_output(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);src=root/'source.png';src.write_bytes(b'wrong source')
            out=root/'output.png'
            with self.assertRaisesRegex(ValueError,'ORIGINAL_REFERENCE_SHA_MISMATCH'):prepare_input(src,root/'mask.png',out,'a'*64)
            self.assertFalse(out.exists())
    def test_watertight_is_not_supplier_approval(self):
        q=supplier_release_decision({'watertight':True,'triangle_count':5000000})
        self.assertFalse(q['eligibleForSupplierHandoff']);self.assertIn('identity_reviewed',q['missingEvidence'])
        self.assertIn('supplier_accepted',q['missingEvidence']);self.assertFalse(q['automaticOrderAllowed'])
    def test_explicit_supplier_handoff_never_places_order(self):
        fields=('identity_reviewed','clay_four_views_accepted','pbr_four_views_accepted','scale_confirmed',
          'watertight','self_intersections_checked','wall_thickness_checked','supports_slicer_accepted',
          'supplier_material_profile_confirmed','supplier_accepted')
        q=supplier_release_decision(dict.fromkeys(fields,True))
        self.assertTrue(q['eligibleForSupplierHandoff']);self.assertFalse(q['automaticOrderAllowed']);self.assertFalse(q['physicalPrintVerified'])
    def test_truthy_strings_cannot_approve_print(self):
        self.assertFalse(supplier_release_decision({'supplier_accepted':'true'})['eligibleForSupplierHandoff'])

if __name__=='__main__':unittest.main(verbosity=2)
