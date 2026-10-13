"""Fail-closed release-stage tests. No live Oracle or provider calls."""
from pathlib import Path
import hashlib
import json
import os
import tempfile
import unittest
from unittest.mock import patch

import install_admission as target


class InstallerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.source = self.root/'source'
        self.source.mkdir()
        self.original = {name:('synthetic reviewed '+name).encode() for name in target.EXPECTED}
        self.pinned = {name:target.sha(raw) for name,raw in self.original.items()}
        for name,raw in self.original.items(): (self.source/name).write_bytes(raw)
        self.helper = {'durable_inbox.py':b'x=1\n', 'durable_admission.py':b'y=2\n'}
        self.patches = [patch.object(target,'EXPECTED',self.pinned),
            patch.object(target.patch_server,'transform',side_effect=lambda raw,helpers:b'z=3\n'),
            patch.object(target,'read_regular',side_effect=target.read_regular)]
        self.patches[0].start();self.addCleanup(self.patches[0].stop)
        self.patches[1].start();self.addCleanup(self.patches[1].stop)
        self.original_read=target.read_regular
        def fake_read(path):
            path=Path(path)
            if path.name in self.helper and path.parent == Path(target.__file__).resolve().parent:
                return self.helper[path.name]
            return self.original_read(path)
        self.pin_patch=patch.object(target,'PINNED_HELPERS',{n:target.sha(b) for n,b in self.helper.items()})
        self.pin_patch.start();self.addCleanup(self.pin_patch.stop)
        self.patch_read=patch.object(target,'read_regular',side_effect=fake_read)
        self.patch_read.start();self.addCleanup(self.patch_read.stop)

    def test_prepare_isolated_does_not_change_source(self):
        dest=self.root/'stage'
        result=target.prepare(self.source,dest)
        self.assertEqual(result['phase'],'VERIFIED_PREPARATION_ONLY')
        self.assertFalse(result['production_activation_verified'])
        self.assertFalse(result['native_cli_mcp_blender_gates_verified'])
        self.assertFalse(result['receipt_chain_rebound'])
        self.assertEqual((dest/'durable_inbox.py').read_bytes(),self.helper['durable_inbox.py'])
        self.assertEqual((dest/'server.py').read_bytes(),b'z=3\n')
        self.assertEqual({n:target.sha((self.source/n).read_bytes()) for n in self.original},self.pinned)
        self.assertEqual((dest/'ADMISSION_STAGE.json').stat().st_mode & 0o077,0)

    def test_mutated_predecessor_fails_before_stage(self):
        (self.source/'server.py').write_bytes(b'mutated')
        with self.assertRaisesRegex(target.Refused,'UNREVIEWED_SOURCE'):
            target.prepare(self.source,self.root/'candidate')
        self.assertFalse((self.root/'candidate').exists())

    def test_existing_destination_preserved(self):
        dest=self.root/'candidate';dest.mkdir();(dest/'keep').write_text('important')
        with self.assertRaisesRegex(target.Refused,'UNSAFE_STAGE_PATH'):
            target.prepare(self.source,dest)
        self.assertEqual((dest/'keep').read_text(),'important')

    def test_existing_helper_refuses(self):
        (self.source/'durable_inbox.py').write_text('preexisting')
        with self.assertRaisesRegex(target.Refused,'SOURCE_ALREADY_MODIFIED'):
            target.plan(self.source)

    def test_helper_tamper_refuses(self):
        with patch.object(target,'PINNED_HELPERS',{'durable_inbox.py':'0'*64, 'durable_admission.py':'0'*64}):
            with self.assertRaisesRegex(target.Refused,'UNREVIEWED_HELPER'):
                target.plan(self.source)

    def test_symlinked_source_refuses(self):
        (self.source/'server.py').unlink()
        (self.source/'server.py').symlink_to(self.root/'other')
        with self.assertRaises(target.Refused): target.plan(self.source)

    def test_no_activation_even_if_arguments_supplied(self):
        with self.assertRaisesRegex(target.Refused,'NOT_IMPLEMENTED'):
            target.main(['--source',str(self.source),'--activate'])
        self.assertFalse((self.root/'candidate').exists())

    def test_plan_performs_no_writes(self):
        before=set(self.root.rglob('*'))
        p=target.plan(self.source)
        self.assertEqual(len(p['original_sha256']),15)
        self.assertEqual(set(self.root.rglob('*')),before)

if __name__=='__main__':unittest.main()