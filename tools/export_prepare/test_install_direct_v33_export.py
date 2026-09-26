"""No host changes: exercise the direct v33 export installer on temp fixtures."""
import json,os,sqlite3,sys,tempfile,unittest
from pathlib import Path
from unittest import mock

FAST=Path(__file__).resolve().parents[1]/'fast_preview'
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(FAST));sys.path.insert(0,str(HERE))

from installed_v33 import INSTALLED,installed_server_from_reviewed,stage
import install_direct_v33_export as installer

SOURCE=Path(os.environ['FROGE_SOURCE_ROOT']).resolve()

class InstallDirectExportTests(unittest.TestCase):
    def setUp(self):
        temp=tempfile.TemporaryDirectory();self.addCleanup(temp.cleanup)
        self.root=Path(temp.name)
        reviewed=self.root/'reviewed';reviewed.mkdir()
        for name in INSTALLED:
            raw=(SOURCE/name).read_bytes()
            if name=='server.py':raw=installed_server_from_reviewed(raw)
            target=reviewed/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(raw)
        stage(reviewed,self.root/'fast')
        self.current=(self.root/'fast/patch/server.py').read_bytes()
        self.assertEqual(installer.sha256(self.current),installer.EXPECTED_SERVER_SHA256)
        self.home=self.root/'home';self.source=self.home/'froge-connector'
        (self.source/'state/code-backups').mkdir(parents=True)
        (self.source/'server.py').write_bytes(self.current);os.chmod(self.source/'server.py',0o600)
        (self.source/'state/config.json').write_text(json.dumps({'token':'t'*48}))
        with sqlite3.connect(self.source/'state/jobs.sqlite') as db:
            db.execute('CREATE TABLE jobs (id TEXT PRIMARY KEY,state TEXT NOT NULL)')
        self.commands=[]

    def patches(self,health=None):
        def command(args,timeout=30):
            self.commands.append(tuple(args))
            if args[:4]==['systemctl','--user','show',installer.WORKER] and '--property=WorkingDirectory' in args:return str(self.source)
            return ''
        return (
          mock.patch.object(installer.Path,'home',return_value=self.home),
          mock.patch.object(installer.os,'getuid',return_value=1000),
          mock.patch.object(installer.platform,'machine',return_value='aarch64'),
          mock.patch.object(installer,'state',return_value='active'),
          mock.patch.object(installer,'command',side_effect=command),
          mock.patch.object(installer,'verified_health',side_effect=health) if isinstance(health,BaseException)
            else mock.patch.object(installer,'verified_health',return_value=health or {'connectorVersion':33,'posthocExportRevision':2,'legacyGlbExportRecoveryRevision':1}),
        )

    def test_success_changes_only_server_and_keeps_generation_out(self):
        p=self.patches()
        with p[0],p[1],p[2],p[3],p[4],p[5]:result=installer.install(self.source)
        self.assertEqual(result['phase'],'INSTALLED_AND_LOCALLY_VERIFIED')
        self.assertFalse(result['paidGenerationRequested'])
        self.assertNotEqual((self.source/'server.py').read_bytes(),self.current)
        backup=Path(result['backup'])
        self.assertEqual((backup/'server.py').read_bytes(),self.current)
        manifest=json.loads((backup/'manifest.json').read_text())
        self.assertFalse(manifest['paidGenerationRequested'])
        self.assertTrue(any(command[-2:]==('stop',installer.WORKER) for command in self.commands))
        self.assertTrue(any(command[-2:]==('start',installer.WORKER) for command in self.commands))
        self.assertFalse(any('openai' in ' '.join(command).lower() for command in self.commands))

    def test_failed_health_rolls_back_exact_base(self):
        p=self.patches(installer.InstallError('health failed'))
        with p[0],p[1],p[2],p[3],p[4],p[5]:
            with self.assertRaises(installer.InstallError):installer.install(self.source)
        self.assertEqual((self.source/'server.py').read_bytes(),self.current)

    def test_active_job_stops_before_restart(self):
        with sqlite3.connect(self.source/'state/jobs.sqlite') as db:db.execute("INSERT INTO jobs VALUES ('job','building')")
        p=self.patches()
        with p[0],p[1],p[2],p[3],p[4],p[5]:
            with self.assertRaises(installer.InstallError):installer.install(self.source)
        self.assertFalse(any(command[-2:]==('stop',installer.WORKER) for command in self.commands))

if __name__=='__main__':unittest.main()
