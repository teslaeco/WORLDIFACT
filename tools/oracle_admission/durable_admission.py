"""Adapter for the exact reviewed Oracle server, with no provider calls.

Only fresh detailed Studio selections use this protocol. Existing jobs and
historical routes keep their original semantics. Start authorization is supplied
by the authenticated Worker after its existing account/budget dispatch claim.
"""
import hashlib
import fcntl
import json
import os
from pathlib import Path
import shutil
import sqlite3
import tempfile
import time

from durable_inbox import Inbox, Refused, REVISION, identity, sync_directory


def encoded(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()


def write_input(path, raw):
    fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(raw)
        stream.flush()
        os.fsync(stream.fileno())


class Runtime:
    def __init__(self, api, source_hashes):
        self.api, self.source_hashes = api, dict(source_hashes)
        self._inbox = None

    @property
    def inbox(self):
        if self._inbox is None:
            self._inbox = Inbox(self.api['STATE'] / 'admissions.sqlite')
        return self._inbox

    def health(self):
        try:
            if set(self.source_hashes) != {'durable_inbox.py', 'durable_admission.py'}:
                return {}
            for name, expected in self.source_hashes.items():
                path = self.api['ROOT'] / name
                if path.is_symlink() or hashlib.sha256(path.read_bytes()).hexdigest() != expected:
                    return {}
            if not self.api['studio_execution'].verified_health(self.api['ROOT']):
                return {}
            return {'studioAdmissionRevision': REVISION}
        except (OSError, ValueError, KeyError):
            return {}

    def validated(self, raw):
        data = json.loads(raw)
        if not isinstance(data, dict) or set(data) - {'id', 'prompt', 'agentInstructions', 'photos', 'studioExecution'}:
            raise Refused('INVALID_STAGED_REQUEST')
        prompt, instructions = data.get('prompt'), data.get('agentInstructions', '')
        if (not isinstance(prompt, str) or not prompt.strip()
                or len(prompt.encode('utf-16-le')) // 2 > self.api['PROMPT_MAX_LENGTH']
                or not isinstance(instructions, str) or len(instructions.encode('utf-16-le')) // 2 > 12000):
            raise Refused('INVALID_STAGED_REQUEST')
        profile = self.api['requested_profile'](data)
        execution = self.api['studio_execution'].admission(data, profile)
        if execution is None or profile != 'standard':
            raise Refused('STAGED_DETAILED_SELECTION_REQUIRED')
        photos = self.api['photo_input'].validate_photos(data.get('photos', []))
        return data, execution, photos, instructions

    def stage(self, raw, owner, fingerprint):
        if not self.health():
            raise Refused('DURABLE_ADMISSION_UNAVAILABLE')
        data, _, photos, _ = self.validated(raw)
        identity(data.get('id'), owner, fingerprint)
        with self.api['LOCK'], self.api['database']() as db:
            if db.execute('SELECT 1 FROM jobs WHERE id=?', (data['id'],)).fetchone() and self.inbox.read(data['id']) is None:
                raise Refused('LEGACY_JOB_CANNOT_BE_RESTAGED')
            # Replays remain readable when capacity or readiness has changed.
            prior = self.inbox.read(data['id'])
            if prior is None:
                if (self.api['JOBS'] / data['id']).exists() or (self.api['JOBS'] / data['id']).is_symlink():
                    raise Refused('EXISTING_JOB_FILES_REQUIRE_REVIEW')
                if db.execute('SELECT COUNT(*) FROM jobs').fetchone()[0] >= 300:
                    raise Refused('ADMISSION_CAPACITY')
                if shutil.disk_usage(self.api['STATE']).free < 2 * 1024**3 + len(raw):
                    raise Refused('ADMISSION_DISK_CAPACITY')
                health = self.api['health']()
                if not health.get('ready') or photos and not health.get('photoInput'):
                    raise Refused('DURABLE_ADMISSION_UNAVAILABLE')
            return self.inbox.stage(data['id'], owner, fingerprint, raw)

    def start(self, value, owner, fingerprint):
        if not self.health():
            raise Refused('DURABLE_ADMISSION_UNAVAILABLE')
        if not isinstance(value, dict) or set(value) != {'id', 'payloadSha256', 'deadline'}:
            raise Refused('INVALID_START_AUTHORITY')
        if type(value['deadline']) is not int:
            raise Refused('INVALID_START_AUTHORITY')
        receipt = self.inbox.authorize(value['id'], owner, fingerprint, value['payloadSha256'], value['deadline'] / 1000)
        self.api['WAKE'].set()
        return receipt

    def drain(self):
        if not self.health():
            return
        with self.api['LOCK']:
            return self.inbox.prepare_one(self.materialize)

    def legacy_conflict(self, job_id):
        # A staged, unfunded job cannot acquire execution authority through the
        # old one-step endpoint, including after its admission was blocked.
        return self.inbox.read(job_id) is not None

    def materialize(self, receipt, raw):
        """Only input files, immutable terms and the local jobs queue are written.

        Never call a model, finish_model, an artifact exporter or an HTTP API.
        A durable queue row is the only authority for the existing worker to run.
        """
        data, execution, photos, instructions = self.validated(raw)
        identity(data.get('id'), receipt['owner'], receipt['fingerprint'])
        if hashlib.sha256(raw).hexdigest() != receipt['payloadSha256'] or data['id'] != receipt['id']:
            raise Refused('ADMISSION_CONFLICT')
        destination = self.api['JOBS'] / data['id']
        inputs = {'agent-instructions.json': encoded({'text': instructions, 'revision': 1})}
        if photos:
            inputs['reference-photos.json'] = encoded(self.api['photo_input'].metadata(photos))
            inputs.update({'reference-%d.jpg' % index: photo['bytes'] for index, photo in enumerate(photos)})
        marker = encoded({key: receipt[key] for key in ('revision', 'id', 'owner', 'fingerprint', 'payloadSha256')})
        with self.api['database']() as db:
            db.execute('PRAGMA synchronous=FULL')
            db.execute('BEGIN IMMEDIATE')
            prior = db.execute('SELECT * FROM jobs WHERE id=?', (data['id'],)).fetchone()
            if any(p.is_symlink() for p in (destination, *destination.parents)):
                raise Refused('UNSAFE_JOB_DIRECTORY')
            if not destination.exists():
                if prior is not None:
                    raise Refused('EXISTING_JOB_FILES_MISSING')
                temporary = Path(tempfile.mkdtemp(prefix='.admission-', dir=self.api['JOBS']))
                # An interrupted temporary directory is retained for diagnosis;
                # this code never removes or overwrites a customer's directory.
                for name, contents in {**inputs, '.worldifact-admission.json': marker}.items():
                    write_input(temporary / name, contents)
                sync_directory(temporary)
                os.rename(temporary, destination)
                sync_directory(self.api['JOBS'])
            for name, contents in {**inputs, '.worldifact-admission.json': marker}.items():
                path = destination / name
                if path.is_symlink() or not path.is_file() or path.stat().st_size != len(contents) or path.read_bytes() != contents:
                    raise Refused('ADMISSION_INPUT_FILES_CONFLICT')
            if prior is not None:
                if prior['prompt'] != data['prompt'].strip():
                    raise Refused('ADMISSION_CONFLICT')
                return  # A lost local ACK must never create a second queue entry.
            self.api['studio_pricing'].bind(destination, None)
            self.api['studio_execution'].bind(destination, execution)
            now = time.time()
            db.execute('INSERT INTO jobs VALUES (?,?,?,?,?,?)',
                       (data['id'], data['prompt'].strip(), 'queued', 'Durable request accepted.', now, now))

    def missing_status(self, job_id):
        row = self.inbox.read(job_id)
        if row is None:
            return None
        # No artifact or cost assertion is made from the admission journal.
        # queued without the original queue row is uncertain, never re-enqueued.
        return {'id': job_id, 'state': 'failed' if row['phase'] == 'blocked' else 'pending', 'admission': row}


def process_lock(state):
    """Hold for the full worker lifetime, before startup recovery touches rows."""
    path = state / 'durable-worker.lock'
    fd = os.open(path, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BaseException:
        os.close(fd)
        raise
    return fd


def recover_after_restart(db):
    """Queued work has never entered the provider; preserve it across restart.

    Processing work might have incurred a cost. Keep it terminal/reviewable,
    preserving its files and cost ledger; never automatically execute it again.
    """
    db.execute("UPDATE jobs SET state='failed',detail='Worker interrupted. Preserve this request for reconciliation; do not resubmit.' WHERE state NOT IN ('queued','succeeded','failed','cancelled')")
