"""Run the checksum-matched server's actual HTTP handler with inert readiness.

These tests use real SQLite, files and HTTP; provider/attestation readiness is a
fixture. They do not attest an install or invoke any model/Blender process.
"""
import ast
import base64
from concurrent.futures import ThreadPoolExecutor
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import sqlite3
import struct
import subprocess
import sys
import tempfile
import threading
import time
from types import SimpleNamespace
import unittest
import urllib.error
import urllib.request
from unittest.mock import patch

import durable_admission
from durable_inbox import Inbox, Refused, REVISION
import patch_server

REPO = Path(__file__).resolve().parents[2]
OWNER, FINGERPRINT = 'a' * 64, 'b' * 64
ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'


def payload(job_id=ID, model='sol', mode='fast'):
    return json.dumps({'id': job_id, 'prompt': 'Private inert fixture', 'agentInstructions': 'Original inputs',
                       'studioExecution': {'revision': 'studio-execution-v1', 'model': model, 'mode': mode}}).encode()


class RuntimeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.installed = Path(os.environ['ORACLE_ADMISSION_SOURCE'])
        cls.original = (cls.installed / 'server.py').read_bytes()
        cls.photo_source = Path(os.environ.get('ORACLE_ADMISSION_PHOTO_SOURCE', REPO / '.upstream/model-completion/oracle_connector'))
        sys.path.insert(0, str(cls.photo_source))
        cls.addClassCleanup(sys.path.pop, 0)
        cls.helpers = {n: (Path(__file__).parent / n).read_bytes() for n in patch_server.HELPERS}
        cls.proposed = patch_server.transform(cls.original, cls.helpers)
        # Execute selected actual server definitions without importing unrelated
        # executable/provider modules. No mocked clone of the HTTP handler.
        tree = ast.parse(cls.proposed)
        cls.definitions = [node for node in tree.body if isinstance(node, (ast.FunctionDef, ast.ClassDef))
                           and node.name in ('Handler', 'database', 'initialize', 'write_json')]

    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        root = Path(self.temporary.name)
        state = root / 'state'
        jobs = state / 'jobs'
        jobs.mkdir(parents=True, mode=0o700)
        for n, raw in self.helpers.items(): (root / n).write_bytes(raw)
        self.bound = {}
        def bind(folder, terms):
            prior = self.bound.get(folder.name)
            if prior is not None and prior != terms: raise ValueError('Changed selection')
            self.bound[folder.name] = terms
        # Use the original reviewed validators, never provider execution.
        execution_tree = ast.parse((self.installed / 'studio_execution.py').read_bytes())
        execution = {'REVISION': 'studio-execution-v1', 'MODELS': {'astra': None, 'sol': None, 'luna': None}}
        exec(compile(ast.Module(body=[n for n in execution_tree.body if isinstance(n, ast.FunctionDef)
                                    and n.name in ('validate', 'admission')], type_ignores=[]), 'selection.py', 'exec'), execution)
        photo = self.photo_source / 'photo_input.py'
        photo_spec = importlib.util.spec_from_file_location('admission_test_photos', photo)
        photo_module = importlib.util.module_from_spec(photo_spec)
        photo_spec.loader.exec_module(photo_module)
        import http.server, hmac, re, secrets
        self.api = dict(ROOT=root, STATE=state, JOBS=jobs, CONFIG=state / 'config.json',
                        LOCK=threading.RLock(), WAKE=threading.Event(), RUNNING=set(), CANCEL={},
                        context_policy=SimpleNamespace(maintenance_active=lambda *_: False),
                        studio_pricing=SimpleNamespace(maintenance_active=lambda *_: False, bind=lambda *_: None, admission=lambda *_: None),
                        studio_execution=SimpleNamespace(admission=execution['admission'], bind=bind, verified_health=lambda *_: {'fixture': True}),
                        health=lambda: {'ready': True, 'photoInput': True}, requested_profile=lambda _: 'standard',
                        photo_input=photo_module, PROMPT_MAX_LENGTH=5000,
                        UUID=re.compile(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}'),
                        BaseHTTPRequestHandler=http.server.BaseHTTPRequestHandler,
                        durable_admission=durable_admission, os=os, json=json, sqlite3=sqlite3, time=time,
                        hmac=hmac, re=re, secrets=secrets, threading=threading, shutil=shutil, OpenAIServiceError=type('ProviderError', (Exception,), {}))
        exec(compile(ast.Module(body=self.definitions, type_ignores=[]), 'observed-server.py', 'exec'), self.api)
        self.api['initialize']()
        self.runtime = durable_admission.Runtime(self.api, {n: hashlib.sha256(b).hexdigest() for n, b in self.helpers.items()})
        self.api['ADMISSIONS'] = self.runtime
        self.api['Handler'].log_message = lambda *_: None
        self.server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), self.api['Handler'])
        thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)
        self.token = json.loads(self.api['CONFIG'].read_bytes())['token']

    def request(self, path, body=None, authorized=True, owner=OWNER, fingerprint=FINGERPRINT):
        request = urllib.request.Request('http://127.0.0.1:%d%s' % (self.server.server_port, path), data=body,
                                         headers={'Authorization': 'Bearer ' + (self.token if authorized else 'inert-wrong'),
                                                  'Content-Type': 'application/json',
                                                  'X-WORLDIFACT-Owner': owner, 'X-WORLDIFACT-Fingerprint': fingerprint})
        try: response = urllib.request.urlopen(request, timeout=5)
        except urllib.error.HTTPError as error: response = error
        with response: return response.status, json.loads(response.read())

    def stage(self, raw=None):
        status, body = self.request('/v1/jobs/stage', raw or payload())
        self.assertEqual(status, 202, body)
        self.assertNotIn('Private', json.dumps(body))
        return body['admission']

    def start(self, receipt):
        return self.request('/v1/jobs/start', json.dumps({'id': receipt['id'], 'payloadSha256': receipt['payloadSha256'],
                                                      'deadline': int((time.time() + 30) * 1000)}).encode())

    def count(self):
        with self.api['database']() as db: return db.execute('SELECT COUNT(*) FROM jobs').fetchone()[0]

    def test_exact_observed_source_required_and_no_installed_receipts_written(self):
        with self.assertRaises(ValueError): patch_server.transform(self.original + b'\n', self.helpers)
        with self.assertRaises(ValueError): patch_server.transform(self.proposed, self.helpers)
        self.assertEqual(list(self.api['ROOT'].glob('.worldifact-*.json')), [])

    def test_unauthenticated_and_changed_ownership_cannot_stage_or_start(self):
        self.assertEqual(self.request('/v1/jobs/stage', payload(), authorized=False)[0], 401)
        self.assertEqual(self.count(), 0)
        receipt = self.stage()
        self.assertEqual(self.request('/v1/jobs/stage', payload(), owner='c'*64)[0], 409)
        self.assertEqual(self.request('/v1/jobs/start', json.dumps({'id': ID, 'payloadSha256': receipt['payloadSha256'],
                          'deadline': int((time.time()+30)*1000)}).encode(), fingerprint='c'*64)[0], 409)
        self.assertIsNone(self.runtime.drain())
        self.assertEqual(self.count(), 0)

    def test_lost_stage_ack_reopen_same_id_then_one_start_and_immutable_modes(self):
        for index, (model, mode) in enumerate((m, s) for m in ('astra','sol','luna') for s in ('standard','fast')):
            job_id = '%08x-aaaa-4aaa-8aaa-aaaaaaaaaaaa' % index
            receipt = self.stage(payload(job_id, model, mode))
            self.runtime._inbox = None  # Reopen real SQLite after lost ACK.
            self.assertEqual(self.stage(payload(job_id, model, mode)), receipt)
            self.assertIsNone(self.runtime.drain())
            self.assertEqual(self.start(receipt)[0], 202)
            self.assertEqual(self.runtime.drain(), {'id': job_id, 'phase': 'queued'})
            self.assertEqual(self.start(receipt)[0], 202)
            self.assertIsNone(self.runtime.drain())
            self.assertEqual(self.bound[job_id], {'revision': 'studio-execution-v1', 'model': model, 'mode': mode})
        self.assertEqual(self.count(), 6)

    def test_parallel_starts_commit_one_original_queue_entry(self):
        receipt = self.stage()
        with ThreadPoolExecutor(max_workers=6) as pool:
            self.assertTrue(all(s == 202 for s, _ in pool.map(lambda _: self.start(receipt), range(12))))
        with ThreadPoolExecutor(max_workers=6) as pool: list(pool.map(lambda _: self.runtime.drain(), range(12)))
        self.assertEqual(self.count(), 1)
        self.assertEqual(self.request('/v1/jobs', payload())[0], 409)

    def test_restart_preserves_queued_and_never_rearms_uncertain_paid_work(self):
        with self.api['database']() as db:
            for index, state in enumerate(('queued','generating','building','retrying','succeeded','failed','cancelled')):
                db.execute('INSERT INTO jobs VALUES (?,?,?,?,?,?)', (str(index), 'inert', state, '', 1, 1))
        with self.api['database']() as db: durable_admission.recover_after_restart(db)
        with self.api['database']() as db:
            self.assertEqual([r['state'] for r in db.execute('SELECT * FROM jobs ORDER BY id')],
                             ['queued','failed','failed','failed','succeeded','failed','cancelled'])
        # Demonstrate the regression against the actual observed startup SQL.
        old = [n.value for n in ast.walk(ast.parse(self.original)) if isinstance(n, ast.Constant)
               and isinstance(n.value, str) and n.value.startswith("UPDATE jobs SET state='failed',detail='Serwer uruchomil")][0]
        with self.api['database']() as db:
            db.execute(old)
            self.assertEqual(db.execute("SELECT state FROM jobs WHERE id='0'").fetchone()[0], 'failed')

    def test_original_queue_commit_lost_ack_never_requeues_completed_job(self):
        receipt = self.stage()
        self.start(receipt)
        self.runtime.materialize(receipt, payload())
        with self.api['database']() as db: db.execute("UPDATE jobs SET state='succeeded' WHERE id=?", (ID,))
        self.assertEqual(self.runtime.drain()['phase'], 'queued')
        with self.api['database']() as db: self.assertEqual(db.execute('SELECT state FROM jobs').fetchone()[0], 'succeeded')
        self.assertEqual(self.count(), 1)

    def test_interrupted_input_directory_commit_is_recovered_without_overwrite(self):
        receipt = self.stage()
        self.start(receipt)
        original = self.api['studio_execution'].bind
        self.api['studio_execution'].bind = lambda *_: (_ for _ in ()).throw(OSError('inert power loss'))
        self.assertEqual(self.runtime.drain()['phase'], 'authorized')
        files = {p.name: p.read_bytes() for p in (self.api['JOBS']/ID).iterdir()}
        self.assertEqual(self.count(), 0)
        self.api['studio_execution'].bind = original
        self.assertEqual(self.runtime.drain()['phase'], 'queued')
        self.assertEqual(files, {p.name: p.read_bytes() for p in (self.api['JOBS']/ID).iterdir()})

    def test_queued_record_loss_is_uncertain_and_does_not_duplicate_generation(self):
        receipt = self.stage()
        self.start(receipt)
        self.runtime.drain()
        with self.api['database']() as db: db.execute('DELETE FROM jobs WHERE id=?', (ID,))
        status, body = self.request('/v1/jobs/' + ID)
        self.assertEqual((status, body['state']), (200, 'pending'))
        self.assertEqual(self.start(receipt)[0], 202)
        self.assertIsNone(self.runtime.drain())
        self.assertEqual(self.count(), 0)

    def test_file_sync_failure_cannot_create_provider_queue_authority(self):
        receipt = self.stage()
        self.start(receipt)
        with patch.object(durable_admission, 'sync_directory', side_effect=OSError('inert disk error')):
            for _ in range(3): self.runtime.drain()
        self.assertEqual(self.count(), 0)
        self.assertEqual(self.request('/v1/jobs/'+ID)[1]['state'], 'failed')

    def test_modified_helper_or_unattested_runtime_never_accepts(self):
        (self.api['ROOT']/'durable_inbox.py').write_bytes(b'# inert tamper')
        self.assertEqual(self.request('/v1/jobs/stage', payload())[0], 409)
        self.assertEqual(self.count(), 0)

    def test_process_lock_prevents_second_runtime_from_recovering_active_jobs(self):
        fd = durable_admission.process_lock(self.api['STATE'])
        self.addCleanup(os.close, fd)
        with self.assertRaises(BlockingIOError): durable_admission.process_lock(self.api['STATE'])

    def test_four_original_references_survive_stage_and_local_materialization(self):
        # An inert JPEG header fixture exercises byte preservation, not decoding
        # or Blender/image quality. Native rendering is a separate release gate.
        jpeg = b'\xff\xd8\xff\xc0' + struct.pack('>HBHHB', 11, 8, 1, 1, 1) + b'\x01\x11\x00\x00\x00\x00\xff\xd9'
        data = json.loads(payload())
        data['photos'] = [{'name': str(i)+'.jpg', 'view': view, 'dataUrl': 'data:image/jpeg;base64,'+base64.b64encode(jpeg).decode()}
                          for i, view in enumerate(('front','side','back','detail'))]
        raw = json.dumps(data).encode()
        receipt = self.stage(raw)
        self.start(receipt)
        self.assertEqual(self.runtime.drain()['phase'], 'queued')
        for i in range(4): self.assertEqual((self.api['JOBS']/ID/('reference-%d.jpg'%i)).read_bytes(), jpeg)
        saved = json.loads((self.api['JOBS']/ID/'reference-photos.json').read_bytes())
        self.assertEqual([r['view'] for r in saved], ['front','side','back','detail'])
        self.assertTrue(all(r['sha256'] == hashlib.sha256(jpeg).hexdigest() for r in saved))
        # Deliberately invalid MIME/remote references are rejected before queueing.
        data['id'] = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
        data['photos'][0]['dataUrl'] = 'https://private.invalid/customer-image'
        self.assertEqual(self.request('/v1/jobs/stage', json.dumps(data).encode())[0], 400)
        self.assertEqual(self.count(), 1)


if __name__ == '__main__': unittest.main()
