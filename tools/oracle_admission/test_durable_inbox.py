"""Real SQLite, threads and process death; no provider or production access."""
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

import durable_inbox as m

ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
OWNER, FINGERPRINT = '1' * 64, '2' * 64
PAYLOAD = json.dumps({'id': ID, 'prompt': 'PRIVATE_FIXTURE',
                      'studioExecution': {'revision': 'studio-execution-v1', 'model': 'sol', 'mode': 'fast'}}).encode()


class InboxTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / 'admissions.sqlite'
        self.inbox = m.Inbox(self.path)

    def stage(self):
        return self.inbox.stage(ID, OWNER, FINGERPRINT, PAYLOAD)

    def authorize(self):
        return self.inbox.authorize(ID, OWNER, FINGERPRINT, m.digest(PAYLOAD), time.time() + 30)

    def test_staging_survives_reopen_without_authorizing_work_or_exposing_payload(self):
        accepted = self.stage()
        self.assertEqual(accepted['phase'], 'staged')
        self.assertNotIn('PRIVATE_FIXTURE', json.dumps(accepted))
        reopened = m.Inbox(self.path)
        self.assertEqual(reopened.read(ID), accepted)
        self.assertEqual(reopened.stage(ID, OWNER, FINGERPRINT, PAYLOAD), accepted)
        self.assertIsNone(reopened.prepare_one(lambda *_: self.fail('Staging cannot start work')))

    def test_owner_fingerprint_payload_and_model_are_immutable(self):
        self.stage()
        for owner, fingerprint, payload in [(OWNER, FINGERPRINT, PAYLOAD + b' '),
                ('3' * 64, FINGERPRINT, PAYLOAD), (OWNER, '4' * 64, PAYLOAD),
                (OWNER, FINGERPRINT, PAYLOAD.replace(b'"sol"', b'"luna"'))]:
            with self.assertRaisesRegex(m.Refused, 'ADMISSION_CONFLICT'):
                self.inbox.stage(ID, owner, fingerprint, payload)
        with self.assertRaisesRegex(m.Refused, 'ADMISSION_CONFLICT'):
            self.inbox.authorize(ID, '3' * 64, FINGERPRINT, m.digest(PAYLOAD), time.time()+30)
        self.assertEqual(self.inbox.read(ID)['phase'], 'staged')

    def test_concurrent_identical_stages_and_starts_have_one_row_and_one_local_preparation(self):
        with ThreadPoolExecutor(max_workers=8) as pool:
            stages = list(pool.map(lambda _: self.stage(), range(12)))
            starts = list(pool.map(lambda _: self.authorize(), range(12)))
        self.assertTrue(all(row == stages[0] for row in stages))
        self.assertTrue(all(row['phase'] == 'authorized' for row in starts))
        calls = []
        with ThreadPoolExecutor(max_workers=8) as pool:
            list(pool.map(lambda _: self.inbox.prepare_one(lambda receipt, raw: calls.append((receipt['id'], raw))), range(12)))
        self.assertEqual(calls, [(ID, PAYLOAD)])
        self.assertEqual(self.authorize()['phase'], 'queued')
        self.assertIsNone(self.inbox.prepare_one(lambda *_: self.fail('Duplicate queue')))

    def test_missing_or_expired_start_never_creates_authority(self):
        with self.assertRaisesRegex(m.Refused, 'ADMISSION_MISSING'):
            self.authorize()
        self.stage()
        for deadline in (99, 100, 3701, True, float('nan'), float('inf')):
            with self.assertRaisesRegex(m.Refused, 'EXPIRED'):
                self.inbox.authorize(ID, OWNER, FINGERPRINT, m.digest(PAYLOAD), deadline, now=100)
        self.assertEqual(self.inbox.read(ID)['phase'], 'staged')

    def test_busy_store_cannot_acknowledge_and_does_not_lose_previous_stage(self):
        self.stage()
        con = sqlite3.connect(self.path)
        try:
            con.execute('BEGIN IMMEDIATE')
            with self.assertRaises(sqlite3.OperationalError):
                self.authorize()
        finally:
            con.rollback(); con.close()
        self.assertEqual(self.inbox.read(ID)['phase'], 'staged')

    def test_disk_full_during_insert_cannot_acknowledge_a_missing_record(self):
        with self.inbox.transaction() as db:
            pages = db.execute('PRAGMA page_count').fetchone()[0]
        real_connect = sqlite3.connect
        def full_connect(*args, **kwargs):
            con = real_connect(*args, **kwargs)
            con.execute('PRAGMA max_page_count=' + str(pages))
            return con
        with patch.object(m.sqlite3, 'connect', full_connect):
            with self.assertRaises(sqlite3.OperationalError):
                self.inbox.stage(ID, OWNER, FINGERPRINT, json.dumps({'id': ID, 'prompt': 'x' * 100000}).encode())
        self.assertIsNone(self.inbox.read(ID))

    def test_local_preparation_retries_are_bounded_and_never_rearm_blocked_work(self):
        self.stage(); self.authorize()
        calls = []
        def fail(*_):
            calls.append(1)
            raise OSError('Synthetic local disk failure')
        for _ in range(8):
            m.Inbox(self.path).prepare_one(fail)
        self.assertEqual(len(calls), 3)
        self.assertEqual(self.authorize()['phase'], 'blocked')
        self.assertEqual(self.stage()['phase'], 'blocked')

    def test_process_death_after_acceptance_preserves_request_and_before_local_completion_counts_attempt(self):
        code = '''import os, sys
sys.path.insert(0, sys.argv[1])
import durable_inbox as m
i=m.Inbox(sys.argv[2])
i.stage(sys.argv[3], sys.argv[4], sys.argv[5], bytes.fromhex(sys.argv[6]))
os._exit(17)
'''
        result = subprocess.run([sys.executable, '-I', '-B', '-c', code, str(Path(m.__file__).parent), str(self.path), ID, OWNER, FINGERPRINT, PAYLOAD.hex()], capture_output=True)
        self.assertEqual(result.returncode, 17)
        self.assertEqual(self.inbox.read(ID)['phase'], 'staged')
        self.authorize()
        crash = '''import os,sys
sys.path.insert(0,sys.argv[1])
import durable_inbox as m
m.Inbox(sys.argv[2]).prepare_one(lambda *_: os._exit(19))
'''
        for _ in range(3):
            result = subprocess.run([sys.executable, '-I', '-B', '-c', crash, str(Path(m.__file__).parent), str(self.path)], capture_output=True)
            self.assertEqual(result.returncode, 19)
        self.assertEqual(self.inbox.prepare_one(lambda *_: self.fail('Unbounded crash retry'))['phase'], 'blocked')

    def test_changed_stored_payload_refuses_preparation(self):
        self.stage(); self.authorize()
        with self.inbox.transaction() as db:
            db.execute('UPDATE admissions SET payload=?', (b'{}',))
        self.assertEqual(self.inbox.prepare_one(lambda *_: self.fail('Corrupt input')),
                         {'id': ID, 'phase': 'blocked'})
        self.assertIsNone(self.inbox.prepare_one(lambda *_: self.fail('Corrupt input retried')))

    def test_unfunded_expiry_frees_capacity_without_rearming_or_expiring_started_jobs(self):
        self.stage()
        with self.inbox.transaction() as db: db.execute('UPDATE admissions SET created=?', (time.time()-m.STAGE_TTL-1,))
        other = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
        self.inbox.stage(other, OWNER, FINGERPRINT, PAYLOAD.replace(ID.encode(), other.encode()))
        self.assertEqual(self.inbox.read(ID)['phase'], 'blocked')
        self.assertEqual(self.authorize()['phase'], 'blocked')
        self.inbox.authorize(other, OWNER, FINGERPRINT, m.digest(PAYLOAD.replace(ID.encode(), other.encode())), time.time()+30)
        with self.inbox.transaction() as db: db.execute('UPDATE admissions SET created=?', (time.time()-m.STAGE_TTL-1,))
        self.assertEqual(self.inbox.read(other)['phase'], 'authorized')

    def test_symlink_and_shared_database_permissions_refuse(self):
        link = self.path.parent / 'linked.sqlite'
        link.symlink_to(self.path)
        with self.assertRaises(m.Refused): m.Inbox(link)
        self.path.chmod(0o644)
        with self.assertRaises(m.Refused): m.Inbox(self.path)

    def test_capacity_and_invalid_identity_do_not_create_new_rows(self):
        with patch.object(m, 'MAX_WAITING', 0):
            with self.assertRaisesRegex(m.Refused, 'CAPACITY'): self.stage()
        for bad in ('../secret', ID.upper(), '', None):
            with self.assertRaises(m.Refused): self.inbox.stage(bad, OWNER, FINGERPRINT, PAYLOAD)
        self.assertIsNone(self.inbox.read(ID))


if __name__ == '__main__': unittest.main()
