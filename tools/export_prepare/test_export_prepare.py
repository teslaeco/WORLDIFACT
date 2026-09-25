"""Review the post-hoc export patch against the exact reconstructed live v33 worker.

No network to Oracle, no service restart, no AI/model request.
"""
import hashlib
import os
from pathlib import Path
import sys
import tempfile
import unittest

FAST = Path(__file__).resolve().parents[1] / 'fast_preview'
PROJECT = Path(__file__).resolve().parents[1] / 'project_files'
sys.path.insert(0, str(FAST))
sys.path.insert(0, str(PROJECT))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from installed_v33 import INSTALLED, installed_server_from_reviewed, stage
from patch_server import patch_server as export_patch
from importlib.util import spec_from_file_location, module_from_spec

SOURCE = Path(os.environ['FROGE_SOURCE_ROOT']).resolve()
EXPECTED_CURRENT_SHA256='6795c356d67c72f4aed545505772182f907c9a242ad0cf0076689720a386bb14'

def project_patch(source):
    spec=spec_from_file_location('project_patch',PROJECT/'patch_server.py')
    module=module_from_spec(spec);spec.loader.exec_module(module)
    return module.patch_server(source)

class ExportPreparePatchTests(unittest.TestCase):
    def setUp(self):
        temp=tempfile.TemporaryDirectory();self.addCleanup(temp.cleanup)
        self.root=Path(temp.name)
        original=self.root/'original';original.mkdir()
        for name in INSTALLED:
            raw=(SOURCE/name).read_bytes()
            if name=='server.py':raw=installed_server_from_reviewed(raw)
            target=original/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(raw)
        stage(original,self.root/'fast')
        current=project_patch((self.root/'fast/patch/server.py').read_text()).encode()
        self.assertEqual(hashlib.sha256(current).hexdigest(),EXPECTED_CURRENT_SHA256)
        self.current=current

    def test_patch_is_narrow_compilable_and_preserves_v33_and_project_files(self):
        patched=export_patch(self.current.decode()).encode()
        self.assertNotEqual(patched,self.current)
        text=patched.decode()
        compile(text,'server.py','exec')
        self.assertIn('CONNECTOR_VERSION = 33',text)
        self.assertIn("'projectFilesRevision':1",text)
        self.assertIn("'posthocExportRevision':1",text)
        self.assertIn("if write and action == 'exports/prepare':",text)
        self.assertIn("run_blender_finalize(job_id,folder,cancelled,timeout=300)",text)
        self.assertIn("paidGenerationRequested':False",text)
        self.assertIn("generationRequested':False",text)
        self.assertNotIn("openai_provider.generate(", '\n'.join(line for line in text.splitlines() if 'prepare_customer_exports' in line))
        print('CURRENT_PROJECT_FILES_V33_SHA256='+hashlib.sha256(self.current).hexdigest())
        print('PATCHED_EXPORT_PREPARE_SHA256='+hashlib.sha256(patched).hexdigest())

    def test_prepare_path_is_idempotent_and_does_not_modify_generation_admission(self):
        text=export_patch(self.current.decode())
        self.assertEqual(text.count("action == 'exports/prepare'"),1)
        self.assertEqual(text.count('EXPORT_PREPARING = set()'),1)
        self.assertIn("if ai_busy():",text)
        self.assertIn("before=_file_sha256(model)",text)
        self.assertIn("if _file_sha256(model)!=before:",text)
        self.assertIn("EXPORT_PREPARING.discard(job_id)",text)
        # Existing paid-generation admission remains byte-for-byte in semantic markers.
        for marker in ("reserve-studio","/v1/jobs","generate_code(","ENABLE_STUDIO_JOBS"):
            self.assertIn(marker,text)

    def test_unknown_or_twice_patched_source_fails_closed(self):
        with self.assertRaises(ValueError):
            export_patch(self.current.decode().replace("class Handler(BaseHTTPRequestHandler):","class OtherHandler(BaseHTTPRequestHandler):"))
        once=export_patch(self.current.decode())
        with self.assertRaises(ValueError):export_patch(once)

if __name__=='__main__':unittest.main()
