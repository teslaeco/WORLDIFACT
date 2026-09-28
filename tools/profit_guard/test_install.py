import contextlib
import hashlib
import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import install as installer
import oracle_launch

class InstallTests(unittest.TestCase):
    def test_default_launcher_and_installer_never_connect_or_modify(self):
        for module in (installer, oracle_launch):
            with patch('sys.argv', ['guard']), patch.object(oracle_launch.subprocess, 'run') as run, contextlib.redirect_stdout(io.StringIO()):
                module.main()
                run.assert_not_called()

    def test_source_hash_mismatch_stops_before_any_patch(self):
        with self.assertRaises(installer.base.InstallError):
            installer.changes({name: b'# unknown\n' for name in installer.EXPECTED}, b'# helper\n')

    def test_patch_is_before_the_only_live_request_and_does_not_change_its_url(self):
        runner = ('import fast_preview\ndef f():\n    if True:\n        if True:\n            if True:\n                if True:\n' + installer.ANCHOR + '\n').encode()
        profile = b"def health(value):\n    value['generationProfileRevision'] = 1\n    return value\n"
        original = {'codex_runner.py': runner, 'fast_preview.py': profile}
        reviewed = {name: hashlib.sha256(raw).hexdigest() for name, raw in original.items()}
        with patch.dict(installer.EXPECTED, reviewed, clear=True):
            result = installer.changes(original, b'def protect(*args): pass\n')
        output = result['codex_runner.py'].decode()
        self.assertLess(output.index('astra_spend.protect'), output.index(installer.ANCHOR))
        self.assertEqual(output.count(installer.ANCHOR), 1)
        self.assertIn('value.update(verified_health())', result['fast_preview.py'].decode())

    def test_offline_verification_failure_restores_only_touched_source(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); source = root/'worker'; source.mkdir()
            original = {name: ('# original '+name+'\n').encode() for name in installer.EXPECTED}
            for name, raw in original.items(): (source/name).write_bytes(raw)
            (source/installer.base.RECEIPT).parent.mkdir(parents=True)
            (source/installer.base.RECEIPT).write_bytes(b'{"original":true}\n')
            (source/'model.glb').write_bytes(b'PRESERVE_MODEL')
            class Operations:
                def preflight(self): pass
                @contextlib.contextmanager
                def quiesce(self): yield
                def assert_idle(self): pass
                def verify(self, workspace): raise RuntimeError('fixture verifier failure')
                def stop(self): pass
                def start(self): pass
                def health(self, enabled): pass
            patched = {name: b'# updated\n' for name in original}
            patched['astra_spend.py'] = b'# helper\n'
            with patch.object(installer, 'changes', return_value=patched), contextlib.redirect_stdout(io.StringIO()):
                with self.assertRaises(installer.base.InstallError):
                    installer.install(source, root/'backup', Operations(), b'# helper\n')
            for name, raw in original.items(): self.assertEqual((source/name).read_bytes(), raw)
            self.assertFalse((source/'astra_spend.py').exists())
            self.assertFalse((source/installer.guard.RECEIPT).exists())
            self.assertEqual((source/'model.glb').read_bytes(), b'PRESERVE_MODEL')
            self.assertEqual((source/installer.base.RECEIPT).read_bytes(), b'{"original":true}\n')

if __name__ == '__main__': unittest.main()
