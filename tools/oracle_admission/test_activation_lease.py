"""Read-only pending-admission and default-inert protection, no service actions."""
from contextlib import closing, redirect_stdout
import io
import json
import os
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

import activation
import activation_lease as gate


class AdmissionLeaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='worldifact-inert-lease-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.state = self.root / 'state'
        self.state.mkdir()
        self.jobs = self.state / 'jobs.sqlite'
        with closing(sqlite3.connect(self.jobs)) as db:
            db.execute('CREATE TABLE jobs(id TEXT PRIMARY KEY, state TEXT)')
            db.execute("INSERT INTO jobs VALUES('fixture','succeeded')")
            db.commit()
        self.admissions = self.state / 'admissions.sqlite'
        with closing(sqlite3.connect(self.admissions)) as db:
            db.execute('CREATE TABLE admissions(id TEXT PRIMARY KEY,phase TEXT)')
            db.commit()
        self.admissions.chmod(0o600)

    def insert(self, phase):
        with closing(sqlite3.connect(self.admissions)) as db:
            db.execute('DELETE FROM admissions')
            db.execute('INSERT INTO admissions VALUES(?,?)',('fixture', phase))
            db.commit()

    def test_pending_authority_refuses_without_a_write_or_signal(self):
        for phase in ('staged','authorized','uncertain','unknown',None):
            self.insert(phase)
            before = self.admissions.read_bytes(), self.jobs.read_bytes()
            with self.subTest(phase=phase), self.assertRaises(gate.old.FenceRefused):
                gate.pending_admissions(self.root)
            self.assertEqual((self.admissions.read_bytes(), self.jobs.read_bytes()), before)

    def test_terminal_bound_row_or_blocked_stage_may_be_inspected_readonly(self):
        for phase in ('queued','blocked'):
            self.insert(phase)
            before=self.admissions.read_bytes(),self.jobs.read_bytes()
            gate.pending_admissions(self.root)
            self.assertEqual((self.admissions.read_bytes(),self.jobs.read_bytes()),before)

    def test_queued_without_original_terminal_row_refuses(self):
        self.insert('queued')
        for state in ('queued','generating','unknown',None):
            with closing(sqlite3.connect(self.jobs)) as db:
                db.execute('UPDATE jobs SET state=?',(state,));db.commit()
            with self.subTest(state=state),self.assertRaises(gate.old.FenceRefused):
                gate.pending_admissions(self.root)
        with closing(sqlite3.connect(self.jobs)) as db:
            db.execute('DELETE FROM jobs');db.commit()
        with self.assertRaises(gate.old.FenceRefused):gate.pending_admissions(self.root)

    def test_shared_or_linked_admission_store_is_never_followed(self):
        self.admissions.chmod(0o644)
        with self.assertRaises(gate.old.FenceRefused):gate.pending_admissions(self.root)
        self.admissions.unlink()
        self.admissions.symlink_to(self.jobs)
        with self.assertRaises(gate.old.FenceRefused):gate.pending_admissions(self.root)

    def test_absent_store_is_not_created(self):
        self.admissions.unlink()
        gate.pending_admissions(self.root)
        self.assertFalse(self.admissions.exists())

    def test_default_cli_never_reads_target_or_starts_a_process(self):
        with patch.object(activation,'frozen_dependencies',side_effect=AssertionError('target read')), \
             patch.object(activation,'install',side_effect=AssertionError('install')), \
             redirect_stdout(io.StringIO()) as output:
            self.assertIsNone(activation.main([]))
        self.assertIn('PLAN ONLY',output.getvalue())

if __name__=='__main__':unittest.main()
