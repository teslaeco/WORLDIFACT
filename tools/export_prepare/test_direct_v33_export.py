"""Review direct post-hoc exports against the exact reconstructed FAST v33 base.

No Oracle host access, service restart, AI request or model generation.
"""
import hashlib
import os
from pathlib import Path
import sys
import tempfile
import unittest

FAST=Path(__file__).resolve().parents[1]/'fast_preview'
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(FAST));sys.path.insert(0,str(HERE))

from installed_v33 import INSTALLED,installed_server_from_reviewed,stage
from direct_v33_patch import patch_server

SOURCE=Path(os.environ['FROGE_SOURCE_ROOT']).resolve()
EXPECTED_BASE='1f09db9835e9ee22361e468d051da7e847dbff36fe7e52a2f2c9c6f6337402b9'

class DirectV33ExportPatchTests(unittest.TestCase):
    def setUp(self):
        temp=tempfile.TemporaryDirectory();self.addCleanup(temp.cleanup)
        self.root=Path(temp.name)
        original=self.root/'original';original.mkdir()
        for name in INSTALLED:
            raw=(SOURCE/name).read_bytes()
            if name=='server.py':raw=installed_server_from_reviewed(raw)
            target=original/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(raw)
        stage(original,self.root/'fast')
        self.current=(self.root/'fast/patch/server.py').read_bytes()
        self.assertEqual(hashlib.sha256(self.current).hexdigest(),EXPECTED_BASE)

    def test_direct_patch_adds_only_same_job_no_ai_export_recovery(self):
        text=patch_server(self.current.decode())
        compile(text,'server.py','exec')
        self.assertIn('CONNECTOR_VERSION = 33',text)
        self.assertIn("'posthocExportRevision':2",text)
        self.assertIn("'legacyGlbExportRecoveryRevision':1",text)
        self.assertIn("action == 'exports/prepare'",text)
        self.assertIn("run_blender_finalize(job_id,folder,threading.Event(),timeout=300)",text)
        self.assertIn("bpy.ops.import_scene.gltf",text)
        self.assertIn("bpy.ops.wm.save_as_mainfile",text)
        self.assertIn("customer_export_files(folder, name)",text)
        self.assertIn("paidGenerationRequested':False",text)
        self.assertIn("generationRequested':False",text)
        self.assertIn("before=file_sha256(model)",text)
        self.assertIn("if file_sha256(model)!=before",text)
        self.assertNotIn("projectFilesRevision",text)
        # Generation admission and FAST policy remain present but are not called by prepare.
        for marker in ("requested_profile(data)","/v1/jobs","generate_code(","fast-draft-v1"):
            self.assertIn(marker,text)

    def test_legacy_glb_recovery_is_bounded_and_never_overwrites_glb(self):
        text=patch_server(self.current.decode())
        self.assertIn("process.wait(timeout=timeout)",text)
        self.assertIn("subprocess.run(['podman','kill',name]",text)
        self.assertIn("model=folder/'model.glb'",text)
        self.assertNotIn("export_scene.gltf",text.split("POSTHOC_IMPORT_SCRIPT",1)[1].split('"""',1)[0])
        self.assertIn("report['interchange_exports']=export_interchange",text)

    def test_unknown_or_twice_patched_source_fails_closed(self):
        with self.assertRaises(ValueError):
            patch_server(self.current.decode().replace("class Handler(BaseHTTPRequestHandler):","class OtherHandler(BaseHTTPRequestHandler):"))
        once=patch_server(self.current.decode())
        with self.assertRaises(ValueError):patch_server(once)

if __name__=='__main__':unittest.main()
