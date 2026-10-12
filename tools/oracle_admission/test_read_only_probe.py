"""Privacy and immutability checks for the operator-owned VM probe."""
import hashlib
import json
from pathlib import Path
import sqlite3
import struct
import tempfile
import unittest
from unittest.mock import patch

import read_only_probe as m

ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
PRIVATE = 'PRIVATE_CUSTOMER_PROMPT_AND_DETAIL'


class ProbeTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        folder = self.root/'state/jobs'/ID
        folder.mkdir(parents=True)
        (folder/'model.glb').write_bytes(struct.pack('<III', 0x46546c67, 2, 12))
        (folder/'model.blend').write_bytes(b'BLENDER-inert')
        self.database = self.root/'state/jobs.sqlite'
        with sqlite3.connect(self.database) as db:
            db.execute('CREATE TABLE jobs (id TEXT PRIMARY KEY,prompt,state,detail,created,updated)')
            db.execute('INSERT INTO jobs VALUES (?,?,?,?,?,?)', (ID, PRIVATE, 'succeeded', PRIVATE, 1, 1))
        sources = {n: b'# inert fixture '+n.encode() for n in ('server.py','codex_runner.py','studio_execution.py')}
        self.expected = {n: hashlib.sha256(b).hexdigest() for n,b in sources.items()}
        for n,raw in sources.items(): (self.root/n).write_bytes(raw)
        for n in m.CHAIN:
            p = self.root/n; p.parent.mkdir(exist_ok=True, parents=True); p.write_bytes(b'{}')
        construction = {'sha256': {n:h for n,h in self.expected.items() if n!='studio_execution.py'},
                        'receipt_sha256': {n:hashlib.sha256(b'{}').hexdigest() for n in m.CHAIN}}
        raw = json.dumps(construction).encode()
        (self.root/m.CONSTRUCTION).write_bytes(raw)
        (self.root/m.MODEL).write_text(json.dumps({'sha256':self.expected, 'construction_receipt_sha256':hashlib.sha256(raw).hexdigest(),
                                                 'models':['astra','sol','luna'], 'modes':['standard','fast']}))

    def tree(self): return {p.relative_to(self.root).as_posix(): p.read_bytes() for p in self.root.rglob('*') if p.is_file()}

    def run_probe(self):
        # Inert fixtures test reference consistency only, never create an
        # installed attestation or replace the real production source authority.
        with patch.dict(m.EXPECTED, self.expected, clear=True): return m.snapshot(self.root)

    def test_read_only_counts_and_references_never_expose_customer_data(self):
        before = self.tree()
        result = self.run_probe()
        self.assertEqual(before, self.tree())
        text = json.dumps(result)
        self.assertNotIn(ID, text); self.assertNotIn(PRIVATE, text)
        self.assertTrue(result['source_manifest_matches'])
        self.assertTrue(result['receipt_references_consistent'])
        self.assertEqual(result['successful_row_artifact_counts']['glb_header_valid'], 1)
        self.assertEqual(result['successful_row_artifact_counts']['fbx_absent_or_unsafe'], 1)
        self.assertEqual(result['release'], 'NO-GO')
        self.assertFalse(result['generation_requested']); self.assertFalse(result['production_changed'])

    def test_tampered_source_or_receipt_does_not_become_a_valid_reference(self):
        (self.root/'server.py').write_bytes(b'changed')
        result = self.run_probe()
        self.assertFalse(result['source_manifest_matches']); self.assertFalse(result['receipt_references_consistent'])

    def test_missing_or_symlinked_database_is_never_created_or_followed(self):
        self.database.unlink()
        self.assertEqual(self.run_probe()['database_inspection'], 'INCOMPLETE')
        self.assertFalse(self.database.exists())
        self.database.symlink_to(self.root/'server.py')
        self.assertEqual(self.run_probe()['database_inspection'], 'INCOMPLETE')


if __name__ == '__main__': unittest.main()
