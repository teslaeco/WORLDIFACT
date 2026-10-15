"""Offline numeric fixture tests, NOT a generated robot or verified CUDA export."""
import json,tempfile,unittest
from pathlib import Path
from types import SimpleNamespace
import numpy as np
from native_checkpoint import SOURCE_SHA,save_checkpoint,load_checkpoint,sha,export_only
PROVENANCE={'sourceSha256':SOURCE_SHA,'inputSha256':'a'*64,'model':'microsoft/TRELLIS.2-4B',
 'modelRevision':'af44b45f2e35a493886929c6d786e563ec68364d',
 'codeRevision':'75fbf0183001ed9876c8dbb35de6b68552ee08bd'}
def fixture():
    return SimpleNamespace(vertices=np.array([[0,0,0],[1,0,0],[0,1,0]],dtype=np.float32),
      faces=np.array([[0,1,2]],dtype=np.int32),coords=np.array([[0,0,0],[1,2,3]],dtype=np.int32),
      attrs=np.array([[.1,.2,.3,.8,.4,1],[.5,.6,.7,.9,.2,1]],dtype=np.float32),
      origin=np.array([-.5,-.5,-.5],dtype=np.float32),voxel_size=1/1024,
      layout={'base_color':slice(0,3),'metallic':slice(3,4),'roughness':slice(4,5),'alpha':slice(5,6)})
class DecoderCheckpointTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)/'saved';self.mesh=fixture()
    def tearDown(self):self.tmp.cleanup()
    def save(self):return save_checkpoint(self.mesh,self.root,PROVENANCE)
    def test_all_original_geometry_and_material_arrays_roundtrip_exactly(self):
        r=self.save();arrays,meta=load_checkpoint(self.root,r['manifestSha256'])
        for k in ('vertices','faces','coords','attrs'):
            np.testing.assert_array_equal(arrays[k],getattr(self.mesh,k))
            self.assertEqual(arrays[k].dtype,getattr(self.mesh,k).dtype)
        self.assertFalse(meta['printReady']);self.assertFalse(meta['visualAccepted'])
        self.assertEqual(meta['origin'],[-.5,-.5,-.5])
    def test_later_decimation_cannot_mutate_saved_decoder(self):
        r=self.save();before=self.mesh.vertices.copy();self.mesh.vertices[:]=42
        arrays,_=load_checkpoint(self.root,r['manifestSha256'])
        np.testing.assert_array_equal(arrays['vertices'],before)
    def test_material_checkpoint_mutation_is_detected(self):
        r=self.save();p=self.root/'decoder.npz';p.write_bytes(p.read_bytes()+b'changed')
        with self.assertRaisesRegex(ValueError,'CHECKPOINT_ARRAY_HASH_MISMATCH'):
            load_checkpoint(self.root,r['manifestSha256'])
    def test_manifest_mutation_is_detected(self):
        r=self.save();p=self.root/'checkpoint.json';p.write_text(p.read_text()+' ')
        with self.assertRaisesRegex(ValueError,'MANIFEST_HASH_MISMATCH'):
            load_checkpoint(self.root,r['manifestSha256'])
    def test_invalid_face_fails_before_output_creation(self):
        self.mesh.faces[0,1]=999
        with self.assertRaisesRegex(ValueError,'FACE_INDEX_OUT_OF_BOUNDS'):self.save()
        self.assertFalse(self.root.exists())
    def test_nonfinite_decoder_fails_before_output_creation(self):
        self.mesh.attrs[0,0]=np.nan
        with self.assertRaisesRegex(ValueError,'FINITE_NUMERIC_ARRAY_REQUIRED'):self.save()
        self.assertFalse(self.root.exists())
    def test_changed_source_not_accepted(self):
        with self.assertRaisesRegex(ValueError,'CHECKPOINT_PROVENANCE_MISMATCH'):
            save_checkpoint(self.mesh,self.root,{**PROVENANCE,'sourceSha256':'f'*64})
        self.assertFalse(self.root.exists())
    def test_output_checkpoint_is_never_overwritten(self):
        r=self.save()
        with self.assertRaises(FileExistsError):self.save()
        self.assertEqual(sha(self.root/'checkpoint.json'),r['manifestSha256'])
    def test_export_compute_is_not_started_without_explicit_authorization(self):
        with self.assertRaisesRegex(ValueError,'EXISTING_GPU_EXPORT_COMPUTE_AUTHORIZATION_REQUIRED'):
            export_only(self.root,'a'*64,Path(self.tmp.name)/'export')
        self.assertFalse((Path(self.tmp.name)/'export').exists())
    def test_object_pickle_arrays_are_refused_even_with_updated_hashes(self):
        self.save();p=self.root/'decoder.npz'
        a={k:getattr(self.mesh,k) for k in ('vertices','faces','coords','attrs')}
        a['attrs']=np.array([['unsafe']*6]*2,dtype=object);np.savez_compressed(p,**a)
        m=self.root/'checkpoint.json';meta=json.loads(m.read_text());meta['arraySha256']=sha(p)
        m.write_text(json.dumps(meta))
        with self.assertRaisesRegex(ValueError,'UNSAFE_CHECKPOINT_DTYPE'):
            load_checkpoint(self.root,sha(m))
    def test_readback_does_not_rewrite_or_regenerate(self):
        r=self.save();before={p.name:sha(p) for p in self.root.iterdir()}
        load_checkpoint(self.root,r['manifestSha256'])
        self.assertEqual(before,{p.name:sha(p) for p in self.root.iterdir()})
    def test_native_code_checkpoints_before_lossy_export(self):
        code=Path(__file__).with_name('native_trellis2.py').read_text()
        self.assertLess(code.index("report['decoderCheckpoint']=save_checkpoint"),code.index('mesh.simplify('))
        self.assertLess(code.index("report['decoderCheckpoint']=save_checkpoint"),code.index('o_voxel.postprocess.to_glb'))
if __name__=='__main__':unittest.main(verbosity=2)
