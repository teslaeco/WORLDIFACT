"""No paid API or host changes: test v33 assembly against pinned public code."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

from installed_v33 import INSTALLED, blob_sha, installed_server_from_reviewed, stage

SOURCE = Path(os.environ['FROGE_SOURCE_ROOT']).resolve()
TOOLS = Path(__file__).resolve().parent


class InstalledV33Tests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory(); self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.source = self.root / 'source'; self.source.mkdir()
        for name in INSTALLED:
            raw = (SOURCE / name).read_bytes()
            if name == 'server.py': raw = installed_server_from_reviewed(raw)
            path = self.source / name; path.parent.mkdir(parents=True, exist_ok=True); path.write_bytes(raw)
        self.before = {name: (self.source / name).read_bytes() for name in INSTALLED}

    def test_exact_reported_source_matches_and_staging_preserves_v33_behavior(self):
        for name, expected in INSTALLED.items(): self.assertEqual(blob_sha(self.before[name]), expected)
        result = stage(self.source, self.root / 'output')
        self.assertFalse(result['installed']); self.assertFalse(result['default_enabled'])
        self.assertFalse(result['paid_generation_requested'])
        self.assertEqual(result['source_git_blobs'], INSTALLED)
        for name, raw in self.before.items():
            self.assertEqual((self.source / name).read_bytes(), raw)
            self.assertEqual((self.root / 'output/originals' / name).read_bytes(), raw)
        server = (self.root / 'output/patch/server.py').read_text()
        self.assertIn('CONNECTOR_VERSION = 33', server)
        self.assertNotIn('v35-reference-acceptance', server)
        self.assertIn("accepted=outcome.get('accepted') is True", server)
        self.assertIn('requested_profile(data)', server)
        self.assertEqual(len(list((self.root / 'output/patch').rglob('*.py'))), 5)

    def test_does_not_copy_private_state_tools_or_verification_receipts(self):
        for name in ('state/ai-provider.json', 'state/jobs/private/model.glb', 'tools/codex/verified.json'):
            path = self.source / name; path.parent.mkdir(parents=True, exist_ok=True); path.write_text('private sentinel')
        stage(self.source, self.root / 'output')
        contents = '\n'.join(p.read_text() for p in (self.root / 'output').rglob('*') if p.is_file())
        self.assertNotIn('private sentinel', contents)
        self.assertTrue((self.source / 'state/jobs/private/model.glb').is_file())

    def test_changed_source_helper_existing_output_and_in_place_update_fail_closed(self):
        with self.assertRaises(ValueError): stage(self.source, self.source / 'inside-live-tree')
        self.assertFalse((self.source / 'inside-live-tree').exists())
        (self.source / 'fast_preview.py').write_text('existing helper')
        with self.assertRaises(ValueError): stage(self.source, self.root / 'output')
        self.assertFalse((self.root / 'output').exists())
        (self.source / 'fast_preview.py').unlink()
        (self.source / 'server.py').write_bytes(self.before['server.py'] + b'\n')
        with self.assertRaises(ValueError): stage(self.source, self.root / 'output')
        self.assertFalse((self.root / 'output').exists())
        (self.source / 'server.py').write_bytes(self.before['server.py'])
        stage(self.source, self.root / 'output')
        with self.assertRaises(ValueError): stage(self.source, self.root / 'output')

    def test_full_policy_and_supervisor_tests_also_run_with_exact_installed_server_variant(self):
        # This fixture contains public source only; it is not a production copy.
        full = self.root / 'full-test-fixture'
        shutil.copytree(SOURCE, full, ignore=shutil.ignore_patterns('state', 'tools', '__pycache__', '*.pyc'))
        (full / 'server.py').write_bytes(self.before['server.py'])
        stage(full, self.root / 'staged')
        for path in (self.root / 'staged/patch').rglob('*.py'):
            target = full / path.relative_to(self.root / 'staged/patch')
            target.parent.mkdir(parents=True, exist_ok=True); target.write_bytes(path.read_bytes())
        env = {**os.environ, 'FROGE_PATCH_ROOT': str(full), 'PYTHONDONTWRITEBYTECODE': '1'}
        for script in ('test_fast_preview.py', 'test_fast_runner.py'):
            result = subprocess.run([sys.executable, str(TOOLS / script), '-v'], env=env, capture_output=True, text=True, timeout=90)
            self.assertEqual(result.returncode, 0, result.stderr[-6000:])
        print('Exact v33 public source: FAST policy, local HTTP and supervisor regressions passed; live source untouched.')


if __name__ == '__main__': unittest.main()
