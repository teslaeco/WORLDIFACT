"""Exercise the patched run supervisor with an inert local child, never AI."""
import os
from pathlib import Path
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

ROOT=Path(os.environ['FROGE_PATCH_ROOT']).resolve()
sys.path.insert(0,str(ROOT))
sys.path.insert(0,str(Path(__file__).resolve().parent))
import codex_runner
import blender_mcp
from test_fast_preview import triangle


class RunnerTests(unittest.TestCase):
    def test_checked_fast_draft_returns_before_lingering_agent_and_preserves_original(self):
        with tempfile.TemporaryDirectory() as temp:
            folder=Path(temp)
            (folder/'generation-profile.json').write_text('{"profile":"fast-draft-v1"}')
            script='''
import sys,time,json,hashlib,os
from pathlib import Path
sys.path.insert(0,ROOT)
from blender_mcp import JobTools,write
folder=Path(FOLDER)
(folder/'fixture-child.pid').write_text(str(os.getpid()))
def build(candidate):
    data=bytes.fromhex(DATA)
    (candidate/'model.glb').write_bytes(data)
    report={'triangles':1,'images':0}
    write(candidate/'result.json',report)
    write(candidate/'model-ready.json',{'revision':1,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'phase':'core_export','result':report})
scene=json.loads((Path(ROOT)/'examples/rocket.scene.json').read_text())
JobTools(folder,build=build).build(scene)
time.sleep(30)
'''
            setup='ROOT='+repr(str(ROOT))+';FOLDER='+repr(str(folder))+';DATA='+repr(triangle().hex())+'\n'
            started=time.monotonic()
            with patch('codex_runner.executable',return_value=Path(sys.executable)),patch('codex_runner.command',return_value=[sys.executable,'-c',setup+script]),patch('codex_runner.urllib.request.build_opener',side_effect=AssertionError('No provider access in this fixture')):
                result=codex_runner.run(folder,'One rocket','', 'fixture-only-key',threading.Event(),lambda *_:None)
            elapsed=time.monotonic()-started
            self.assertLess(elapsed,10,'Supervisor must not wait for the 30-second inert child sleep')
            self.assertTrue(result['fast_preview'])
            self.assertFalse(result['accepted'])
            self.assertEqual((folder/'model.glb').read_bytes(),triangle())
            self.assertFalse((folder/'agent-outcome.json').exists())
            self.assertIsNone(blender_mcp.completed_outcome(folder))
            pid=int((folder/'fixture-child.pid').read_text())
            with self.assertRaises(ProcessLookupError): os.kill(pid,0)
            print('PASS: actual FAST supervisor retained the checked fixture and stopped the idle child in %.3f s; no AI request.'%elapsed)


if __name__=='__main__': unittest.main()
