"""Reproduce and preserve the exact live v33 direct-export server variant.

Uses only pinned public source transforms and temporary inert fixtures. No
Oracle connection, service operation, provider request or historical job edit.
"""
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

import completion_policy as policy
import install_completion as installer
import reviewed_direct_export as direct
import source_patch
from test_completion import FakeOperations, write


@unittest.skipUnless(os.environ.get('MODEL_COMPLETION_SOURCE'), 'Pinned source fixture is required in CI')
class DirectExportVariantTests(unittest.TestCase):
    def setUp(self):
        from source_fixture import installed_sources
        self.original=installed_sources(os.environ['MODEL_COMPLETION_SOURCE'])
        self.base_server=self.original['server.py']
        self.original['server.py']=direct.patch_server(self.base_server.decode()).encode()
        self.selected={name:self.original[name] for name in source_patch.EXPECTED}
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.home=Path(self.tmp.name);self.source=self.home/'froge-connector';self.source.mkdir()
        for name,raw in self.original.items():
            path=self.source/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(raw)
        for name in installer.base.VERIFIERS:
            (self.source/name).write_bytes((Path(os.environ['MODEL_COMPLETION_SOURCE'])/name).read_bytes())
        write(self.source/installer.cache.legacy.RECEIPT,{'revision':installer.cache.legacy.REVISION,
            'sha256':{n:hashlib.sha256(self.original[n]).hexdigest() for n in ('codex_runner.py','fast_preview.py','astra_spend.py')},
            'outputPolicy':{'revision':installer.previous.policy.REVISION,'sha256':hashlib.sha256(self.original['astra_spend_v2.py']).hexdigest()}})
        self.runtime_receipt()
        self.dropin=self.home/'.config/systemd/user/froge-worker.service.d/90-worldifact-fast.conf'
        self.dropin.parent.mkdir(parents=True);self.dropin.write_bytes(installer.base.DROPIN)
        (self.source/'state').mkdir()
        with sqlite3.connect(self.source/'state/jobs.sqlite') as db:
            db.execute('CREATE TABLE jobs (id TEXT,state TEXT)')
            db.execute("INSERT INTO jobs VALUES ('existing','succeeded')")
        (self.source/'state/model.glb').write_bytes(b'original preserved artifact')
        (self.source/'state/spend-ledger.json').write_text('{"held":12345}')

    def runtime_receipt(self):
        write(self.source/installer.base.RECEIPT,{'sources':{n:hashlib.sha256((self.source/n).read_bytes()).hexdigest() for n in ('codex_runner.py','blender_mcp.py')},
            'cli_mcp_roundtrip':True,'code_mode_roundtrip':True,'blender_build_roundtrip':True})

    def test_exact_public_transform_reproduces_observed_server_bytes(self):
        public=Path(direct.__file__).read_bytes()
        self.assertEqual(installer.base.blob_sha(public),'385811ea2aeb8a817328ffed584ab79e48c10026')
        raw=self.original['server.py']
        self.assertEqual(len(raw),60833)
        self.assertEqual(hashlib.sha256(raw).hexdigest(),'4ee9c8b22f12c342f599bb67d2e1a5134b15d81c9ee19d99340a426d818a193b')
        self.assertEqual(installer.base.blob_sha(raw),'076ae0ff95b847184e08d960e5e3b670d80f9df9')
        self.assertEqual(source_patch.reviewed_sources(self.selected),'FAST_V33_DIRECT_EXPORT_V2')
        self.assertEqual(source_patch.reviewed_sources({**self.selected,'server.py':self.base_server}),'FAST_V33_BASE')

    def test_hash_only_allowlist_changes_cannot_bypass_exact_reverse_proof(self):
        mutated=self.original['server.py'].replace(b'POSTHOC_EXPORTING=set()',b'POSTHOC_EXPORTING=dict()')
        with patch.object(source_patch,'DIRECT_EXPORT_SERVER_SHA256',hashlib.sha256(mutated).hexdigest()):
            with self.assertRaises(ValueError):source_patch.reviewed_sources({**self.selected,'server.py':mutated})
        for name in self.selected:
            with self.subTest(name=name),self.assertRaises(ValueError):
                source_patch.reviewed_sources({**self.selected,name:self.selected[name]+b'\n'})

    def test_completion_patch_preserves_all_direct_export_code_and_routes(self):
        patched=source_patch.changes(self.selected,Path(policy.__file__).read_bytes())
        server=patched['server.py'].decode()
        self.assertIn(direct.HELPERS,server)
        self.assertIn(direct.PREPARE,server)
        self.assertEqual(server.count('paths = customer_export_files(folder, name)'),2)
        self.assertIn("'posthocExportRevision':2,'legacyGlbExportRecoveryRevision':1",server)
        self.assertIn('master|pbr|prepare',server)
        # Removing ONLY the completion additions recovers every existing byte.
        server=server.replace('    from completion_policy import verified_health as completion_health\n    state.update(completion_health())\n','')
        server=server.replace('            from completion_policy import public_failure_code\n','')
        server=server.replace(",**public_failure_code(JOBS/job_id,row['state'])",'')
        self.assertEqual(server.encode(),self.original['server.py'])
        for name,raw in patched.items():compile(raw,name,'exec')
        self.assertEqual(hashlib.sha256(patched['server.py']).hexdigest(),'c6f9432b8dd1e756c65fad18e5bd8346e51590b8feade09c7b1324b616a74cb2')

    def real_preflight(self):
        operations=installer.Operations(self.source,self.home)
        calls=[]
        def command(args,timeout=30):
            calls.append(args)
            self.assertEqual(args[:3],['systemctl','--user','show'])
            if args[-2]=='--property=WorkingDirectory':return str(self.source)
            if args[-2]=='--property=ActiveState':return 'active'
            self.fail('Preflight attempted an unapproved command.')
        with patch.object(installer.os,'getuid',return_value=1000),patch.object(installer.platform,'machine',return_value='aarch64'),patch.object(operations,'command',side_effect=command):
            operations.preflight()
        return calls

    def test_real_preflight_accepts_observed_variant_without_mutating_files(self):
        before={str(p.relative_to(self.source)):p.read_bytes() for p in self.source.rglob('*') if p.is_file()}
        calls=self.real_preflight()
        after={str(p.relative_to(self.source)):p.read_bytes() for p in self.source.rglob('*') if p.is_file()}
        self.assertEqual(before,after)
        self.assertEqual(len(calls),3)

    def test_real_preflight_unknown_source_has_specific_safe_refusal(self):
        (self.source/'server.py').write_bytes(self.original['server.py']+b'\n')
        with self.assertRaisesRegex(installer.base.InstallError,'server.py; no service stopped'):
            self.real_preflight()

    def test_real_preflight_rejects_active_job_before_maintenance(self):
        with sqlite3.connect(self.source/'state/jobs.sqlite') as db:
            db.execute("INSERT INTO jobs VALUES ('active','building')")
        with self.assertRaisesRegex(installer.base.InstallError,'A model job is active'):
            self.real_preflight()

    def test_install_updates_known_runtime_and_preserves_export_variant_and_state(self):
        operations=FakeOperations(self.source)
        with patch.object(installer,'check_health'):
            result=installer.install(self.source,self.home/'backup',operations,approved=True)
        self.assertEqual(result['phase'],'WORLDIFACT_MODEL_COMPLETION_VERIFIED')
        self.assertIn(direct.HELPERS,(self.source/'server.py').read_text())
        self.assertEqual((self.home/'backup/originals/server.py').read_bytes(),self.original['server.py'])
        self.assertEqual(policy.verified_health(self.source)['worldifactCompletionPolicy'],policy.REVISION)
        self.assertEqual((self.source/'state/model.glb').read_bytes(),b'original preserved artifact')
        self.assertEqual((self.source/'state/spend-ledger.json').read_text(),'{"held":12345}')

    def test_failed_verification_restores_actual_server_byte_for_byte(self):
        before={str(p.relative_to(self.source)):p.read_bytes() for p in self.source.rglob('*') if p.is_file()}
        operations=FakeOperations(self.source,'verify')
        with patch.object(installer.cache,'check_health'),self.assertRaises(installer.base.InstallError):
            installer.install(self.source,self.home/'backup',operations,approved=True)
        after={str(p.relative_to(self.source)):p.read_bytes() for p in self.source.rglob('*') if p.is_file()}
        self.assertEqual(before,after)
        self.assertEqual(operations.events[-3:],['stop','start','health'])


if __name__=='__main__':unittest.main()
