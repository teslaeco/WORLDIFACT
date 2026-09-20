"""Review the project-file patch against the exact reconstructed FAST v33 server.

No network, no Oracle host access, no service restart, no AI call.
"""
import hashlib
import os
from pathlib import Path
import sys
import tempfile
import unittest

TOOLS = Path(__file__).resolve().parents[1] / 'fast_preview'
sys.path.insert(0, str(TOOLS))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from installed_v33 import INSTALLED, installed_server_from_reviewed, stage
from patch_server import patch_server

SOURCE = Path(os.environ['FROGE_SOURCE_ROOT']).resolve()


class ProjectFilePatchTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory(); self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        original = self.root / 'original'; original.mkdir()
        for name in INSTALLED:
            raw = (SOURCE / name).read_bytes()
            if name == 'server.py': raw = installed_server_from_reviewed(raw)
            target = original / name; target.parent.mkdir(parents=True, exist_ok=True); target.write_bytes(raw)
        stage(original, self.root / 'fast')
        self.current = (self.root / 'fast/patch/server.py').read_bytes()

    def test_exact_current_server_is_hash_identified_and_patch_is_narrow(self):
        current_sha = hashlib.sha256(self.current).hexdigest()
        patched = patch_server(self.current.decode()).encode()
        patched_sha = hashlib.sha256(patched).hexdigest()
        self.assertNotEqual(current_sha, patched_sha)
        text = patched.decode()
        self.assertIn('CONNECTOR_VERSION = 33', text)
        self.assertIn("'projectFilesRevision':1", text)
        self.assertIn('PROJECT_FILE_MAX_BYTES = 100 * 1024 * 1024', text)
        self.assertIn('PROJECT_FILE_MAX_COUNT = 2', text)
        self.assertIn("def do_PUT(self):", text)
        self.assertIn("def do_DELETE(self):", text)
        self.assertIn("if self.path.startswith('/v1/project-files/'):", text)
        self.assertIn("shutil.disk_usage(STATE).free < 4*1024**3", text)
        self.assertIn("PROJECT_FILE_RETENTION_SECONDS = 7 * 24 * 3600", text)
        self.assertNotIn('ORACLE_API_TOKEN', text)
        print('CURRENT_FAST_V33_SERVER_SHA256=' + current_sha)
        print('PATCHED_PROJECT_FILES_SERVER_SHA256=' + patched_sha)

    def test_patch_rejects_unknown_or_twice_patched_source(self):
        source = self.current.decode()
        with self.assertRaises(ValueError): patch_server(source.replace("CONFIG = STATE / 'config.json'", "CONFIG = STATE / 'other.json'"))
        patched = patch_server(source)
        with self.assertRaises(ValueError): patch_server(patched)

    def test_existing_fast_and_standard_contract_markers_survive(self):
        text = patch_server(self.current.decode())
        self.assertIn('requested_profile(data)', text)
        self.assertIn('capability(health())', text)
        self.assertIn('fast-draft-v1', (self.root / 'fast/patch/fast_preview.py').read_text())
        self.assertIn("accepted=outcome.get('accepted') is True", text)


if __name__ == '__main__': unittest.main()
