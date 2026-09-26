"""Source-only regression for v3 upgrade across every reviewed v33 production state."""
import hashlib,importlib.util,os,sys,tempfile,unittest
from pathlib import Path

FAST=Path(__file__).resolve().parents[1]/"fast_preview"
HERE=Path(__file__).resolve().parent
PROJECT=Path(__file__).resolve().parents[1]/"project_files"
sys.path.insert(0,str(FAST));sys.path.insert(0,str(HERE))
from installed_v33 import INSTALLED,installed_server_from_reviewed,stage
from patch_server import patch_server as export_v1_patch
from upgrade_direct_v33_export import patch_known,BASE_SHA256,PROJECT_SHA256,EXPORT_V1_SHA256

def load_project_patch():
    spec=importlib.util.spec_from_file_location("project_files_patch",PROJECT/"patch_server.py")
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module.patch_server

SOURCE=Path(os.environ["FROGE_SOURCE_ROOT"]).resolve()

class UpgradeV3Tests(unittest.TestCase):
    def setUp(self):
        temp=tempfile.TemporaryDirectory();self.addCleanup(temp.cleanup);root=Path(temp.name)
        original=root/"original";original.mkdir()
        for name in INSTALLED:
            raw=(SOURCE/name).read_bytes()
            if name=="server.py":raw=installed_server_from_reviewed(raw)
            target=original/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(raw)
        stage(original,root/"fast")
        self.base=(root/"fast/patch/server.py").read_text()
        self.project=load_project_patch()(self.base)
        self.v1=export_v1_patch(self.project)
        self.assertEqual(hashlib.sha256(self.base.encode()).hexdigest(),BASE_SHA256)
        self.assertEqual(hashlib.sha256(self.project.encode()).hexdigest(),PROJECT_SHA256)
        self.assertEqual(hashlib.sha256(self.v1.encode()).hexdigest(),EXPORT_V1_SHA256)
    def test_all_three_reviewed_sources_upgrade_to_same_capability_contract(self):
        expected=["FAST_V33_BASE","FAST_V33_PROJECT_FILES","FAST_V33_PROJECT_FILES_EXPORT_PREPARE_V1"]
        for source,label in zip((self.base,self.project,self.v1),expected):
            with self.subTest(label=label):
                patched,actual=patch_known(source);self.assertEqual(actual,label);compile(patched,"server.py","exec")
                self.assertIn("'posthocExportRevision':2",patched)
                self.assertIn("'legacyGlbExportRecoveryRevision':1",patched)
                self.assertIn("action == 'exports/prepare'",patched)
                self.assertIn("bpy.ops.import_scene.gltf",patched)
                self.assertIn("customer_export_files(folder, name)",patched)
                self.assertEqual(patched.count("paths = customer_export_files(folder, name)"),2)
                if label!="FAST_V33_BASE":self.assertIn("'projectFilesRevision':1",patched)
    def test_unknown_source_refuses_mutation(self):
        with self.assertRaises(ValueError):patch_known(self.base+"\n# unknown mutation\n")

if __name__=="__main__":unittest.main()
