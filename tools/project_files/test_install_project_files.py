"""No host changes: exercise the Oracle project-file installer against temp fixtures."""
import json
import os
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest
from unittest import mock

TOOLS = Path(__file__).resolve().parents[1] / 'fast_preview'
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS))
sys.path.insert(0, str(HERE))

from installed_v33 import INSTALLED, installed_server_from_reviewed, stage
import install_project_files as installer

SOURCE = Path(os.environ['FROGE_SOURCE_ROOT']).resolve()


class InstallProjectFilesTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory(); self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        reviewed = self.root / 'reviewed'; reviewed.mkdir()
        for name in INSTALLED:
            raw = (SOURCE / name).read_bytes()
            if name == 'server.py':
                raw = installed_server_from_reviewed(raw)
            target = reviewed / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(raw)
        stage(reviewed, self.root / 'fast')
        self.current_server = (self.root / 'fast/patch/server.py').read_bytes()
        self.assertEqual(installer.sha256(self.current_server), installer.EXPECTED_SERVER_SHA256)

        self.home = self.root / 'home'
        self.source = self.home / 'froge-connector'
        (self.source / 'state').mkdir(parents=True)
        (self.source / 'state/code-backups').mkdir(parents=True)
        (self.source / 'server.py').write_bytes(self.current_server)
        os.chmod(self.source / 'server.py', 0o600)
        (self.source / 'state/config.json').write_text(json.dumps({'token':'t'*48}))
        with sqlite3.connect(self.source / 'state/jobs.sqlite') as db:
            db.execute('CREATE TABLE jobs (id TEXT PRIMARY KEY, state TEXT NOT NULL)')
        self.commands = []

    def patches(self, health=None):
        def command(args, timeout=30):
            self.commands.append(tuple(args))
            if args[:4] == ['systemctl','--user','show',installer.WORKER] and '--property=WorkingDirectory' in args:
                return str(self.source)
            return ''
        return (
            mock.patch.object(installer.Path, 'home', return_value=self.home),
            mock.patch.object(installer.os, 'getuid', return_value=1000),
            mock.patch.object(installer.platform, 'machine', return_value='aarch64'),
            mock.patch.object(installer, 'service_state', return_value='active'),
            mock.patch.object(installer, 'command', side_effect=command),
            mock.patch.object(installer, 'local_health', side_effect=health) if isinstance(health, BaseException)
              else mock.patch.object(installer, 'local_health', return_value=health or {
                'connectorVersion':33,'projectFilesRevision':1,'projectFileMaxBytes':100*1024*1024,'projectFileMaxCount':2}),
        )

    def test_success_changes_only_server_and_records_backup_without_ai(self):
        patches=self.patches()
        with patches[0], patches[1], patches[2], patches[3], patches[4], patches[5]:
            result=installer.install(self.source)
        self.assertEqual(result['phase'],'INSTALLED_AND_LOCALLY_VERIFIED')
        self.assertFalse(result['paid_generation_requested'])
        self.assertEqual(installer.sha256((self.source/'server.py').read_bytes()),installer.PATCHED_SERVER_SHA256)
        backup=Path(result['backup'])
        self.assertEqual((backup/'server.py').read_bytes(),self.current_server)
        manifest=json.loads((backup/'manifest.json').read_text())
        self.assertFalse(manifest['paid_generation_requested'])
        self.assertTrue(any(command[-2:] == ('stop', installer.WORKER) for command in self.commands))
        self.assertTrue(any(command[-2:] == ('start', installer.WORKER) for command in self.commands))
        self.assertFalse(any('openai' in ' '.join(command).lower() for command in self.commands))

    def test_failed_post_restart_health_rolls_back_exact_original(self):
        patches=self.patches(installer.InstallError('health failed'))
        with patches[0], patches[1], patches[2], patches[3], patches[4], patches[5]:
            with self.assertRaises(installer.InstallError):
                installer.install(self.source)
        self.assertEqual((self.source/'server.py').read_bytes(),self.current_server)

    def test_active_job_or_unknown_server_stops_before_service_restart(self):
        with sqlite3.connect(self.source/'state/jobs.sqlite') as db:
            db.execute("INSERT INTO jobs VALUES ('job','generating')")
        patches=self.patches()
        with patches[0], patches[1], patches[2], patches[3], patches[4], patches[5]:
            with self.assertRaises(installer.InstallError):
                installer.install(self.source)
        self.assertFalse(any(command[-2:] == ('stop', installer.WORKER) for command in self.commands))

        with sqlite3.connect(self.source/'state/jobs.sqlite') as db:
            db.execute("DELETE FROM jobs")
        (self.source/'server.py').write_bytes(self.current_server+b'\n')
        self.commands.clear()
        patches=self.patches()
        with patches[0], patches[1], patches[2], patches[3], patches[4], patches[5]:
            with self.assertRaises(installer.InstallError):
                installer.install(self.source)
        self.assertFalse(any(command[-2:] == ('stop', installer.WORKER) for command in self.commands))

    def test_already_installed_only_verifies_health(self):
        from patch_server import patch_server
        patched=patch_server(self.current_server.decode()).encode()
        self.assertEqual(installer.sha256(patched),installer.PATCHED_SERVER_SHA256)
        (self.source/'server.py').write_bytes(patched)
        patches=self.patches()
        with patches[0], patches[1], patches[2], patches[3], patches[4], patches[5]:
            result=installer.install(self.source)
        self.assertEqual(result['phase'],'ALREADY_INSTALLED_AND_VERIFIED')
        self.assertFalse(any(command[-2:] == ('stop', installer.WORKER) for command in self.commands))


if __name__ == '__main__':
    unittest.main()
