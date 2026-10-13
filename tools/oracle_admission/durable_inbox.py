"""Non-billable durable request inbox. No provider, account or job-file access.

Staging commits immutable bytes before acknowledgement. Only an authenticated
caller with the existing account/budget dispatch authority may authorize start.
Replaying an identical stage/start changes neither input nor execution authority.
The consumer may retry local preparation; it must never retry provider execution.
"""
from contextlib import contextmanager
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import stat
import time

REVISION = 'oracle-durable-admission-v1'
UUID = re.compile(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}')
HASH = re.compile(r'[a-f0-9]{64}')
MAX_PAYLOAD = 9 * 1024 * 1024
MAX_WAITING = 16
MAX_PREPARATIONS = 3
STAGE_TTL = 35 * 60  # Longer than the Worker's maximum unused receipt lifetime.
PHASES = frozenset(('staged', 'authorized', 'queued', 'uncertain', 'blocked'))


class Refused(ValueError):
    def __init__(self, code):
        super().__init__(code)
        self.code = code


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def identity(job_id, owner, fingerprint):
    if (not isinstance(job_id, str) or not UUID.fullmatch(job_id)
            or not isinstance(owner, str) or not HASH.fullmatch(owner)
            or not isinstance(fingerprint, str) or not HASH.fullmatch(fingerprint)):
        raise Refused('INVALID_ADMISSION_IDENTITY')


def sync_directory(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


class Inbox:
    def __init__(self, path):
        self.path = Path(path).absolute()
        if any(p.is_symlink() for p in (self.path, *self.path.parents)):
            raise Refused('UNSAFE_ADMISSION_STORE')
        if not self.path.parent.is_dir():
            raise Refused('ADMISSION_DIRECTORY_MISSING')
        # Exclusive creation never truncates an existing journal or follows links.
        try:
            fd = os.open(self.path, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
        except FileExistsError:
            info = self.path.lstat()
            if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
                raise Refused('UNSAFE_ADMISSION_STORE')
        else:
            os.close(fd)
        with self.transaction() as db:
            db.execute('''CREATE TABLE IF NOT EXISTS admissions (
                id TEXT PRIMARY KEY, owner TEXT NOT NULL, fingerprint TEXT NOT NULL,
                payload_sha256 TEXT NOT NULL, payload BLOB NOT NULL,
                phase TEXT NOT NULL CHECK(phase IN ('staged','authorized','queued','uncertain','blocked')),
                preparations INTEGER NOT NULL DEFAULT 0,
                created REAL NOT NULL, updated REAL NOT NULL)''')
        sync_directory(self.path.parent)

    @contextmanager
    def transaction(self):
        # The surrounding parent is the existing private connector state folder.
        # Do not use immutable=1: it would ignore committed WAL transactions.
        if any(p.is_symlink() for p in (self.path, *self.path.parents)):
            raise Refused('UNSAFE_ADMISSION_STORE')
        db = sqlite3.connect(self.path.as_uri() + '?mode=rw', uri=True, timeout=3)
        db.row_factory = sqlite3.Row
        try:
            db.execute('PRAGMA synchronous=FULL')
            db.execute('BEGIN IMMEDIATE')
            yield db
            db.commit()
        except BaseException:
            db.rollback()
            raise
        finally:
            db.close()

    @staticmethod
    def public(row):
        if row['phase'] not in PHASES:
            raise Refused('INVALID_ADMISSION_RECORD')
        return {'revision': REVISION, 'id': row['id'], 'owner': row['owner'],
                'fingerprint': row['fingerprint'], 'payloadSha256': row['payload_sha256'],
                'phase': row['phase']}

    def stage(self, job_id, owner, fingerprint, payload):
        identity(job_id, owner, fingerprint)
        if not isinstance(payload, bytes) or not 0 < len(payload) <= MAX_PAYLOAD:
            raise Refused('INVALID_ADMISSION_PAYLOAD')
        try:
            value = json.loads(payload)
        except (ValueError, UnicodeError):
            raise Refused('INVALID_ADMISSION_PAYLOAD') from None
        if not isinstance(value, dict) or value.get('id') != job_id:
            raise Refused('INVALID_ADMISSION_PAYLOAD')
        payload_sha = digest(payload)
        with self.transaction() as db:
            row = db.execute('SELECT * FROM admissions WHERE id=?', (job_id,)).fetchone()
            if row is not None:
                if (row['owner'], row['fingerprint'], row['payload_sha256']) != (owner, fingerprint, payload_sha):
                    raise Refused('ADMISSION_CONFLICT')
            else:
                # Only requests that never received start authority can expire.
                # Keep their immutable identity/payload for review; no paid job,
                # hold, original artifact or provider reservation is removed.
                db.execute("UPDATE admissions SET phase='blocked',updated=? WHERE phase='staged' AND created<?",
                           (time.time(), time.time() - STAGE_TTL))
                if db.execute("SELECT COUNT(*) FROM admissions WHERE phase IN ('staged','authorized')").fetchone()[0] >= MAX_WAITING:
                    raise Refused('ADMISSION_CAPACITY')
                now = time.time()
                db.execute('INSERT INTO admissions VALUES (?,?,?,?,?,?,0,?,?)',
                           (job_id, owner, fingerprint, payload_sha, payload, 'staged', now, now))
                row = db.execute('SELECT * FROM admissions WHERE id=?', (job_id,)).fetchone()
            result = self.public(row)
        # The caller cannot send an acknowledgement until commit has succeeded.
        return result

    def authorize(self, job_id, owner, fingerprint, payload_sha, deadline, now=None):
        identity(job_id, owner, fingerprint)
        if not isinstance(payload_sha, str) or not HASH.fullmatch(payload_sha):
            raise Refused('INVALID_ADMISSION_PAYLOAD')
        now = time.time() if now is None else now
        with self.transaction() as db:
            row = db.execute('SELECT * FROM admissions WHERE id=?', (job_id,)).fetchone()
            if row is None:
                raise Refused('ADMISSION_MISSING')
            if (row['owner'], row['fingerprint'], row['payload_sha256']) != (owner, fingerprint, payload_sha):
                raise Refused('ADMISSION_CONFLICT')
            if row['phase'] == 'staged':
                if type(deadline) not in (int, float) or not now < deadline <= now + 3600:
                    raise Refused('ADMISSION_AUTHORITY_EXPIRED')
                db.execute("UPDATE admissions SET phase='authorized',updated=? WHERE id=? AND phase='staged'", (now, job_id))
                row = db.execute('SELECT * FROM admissions WHERE id=?', (job_id,)).fetchone()
            result = self.public(row)
        return result

    def read(self, job_id):
        if not isinstance(job_id, str) or not UUID.fullmatch(job_id):
            raise Refused('INVALID_ADMISSION_IDENTITY')
        if any(p.is_symlink() for p in (self.path, *self.path.parents)):
            raise Refused('UNSAFE_ADMISSION_STORE')
        db = sqlite3.connect(self.path.as_uri() + '?mode=ro', uri=True, timeout=3)
        db.row_factory = sqlite3.Row
        try:
            db.execute('PRAGMA query_only=ON')
            row = db.execute('SELECT id,owner,fingerprint,payload_sha256,phase FROM admissions WHERE id=?', (job_id,)).fetchone()
            return None if row is None else self.public(row)
        finally:
            db.close()

    def prepare_one(self, prepare_local):
        """Commit a bounded local-only preparation attempt before calling it.

        prepare_local MUST check the original jobs row first and idempotently
        materialize/enqueue the same request. It MUST NOT call a provider. An
        already-created row counts as prepared even after a lost acknowledgement.
        Serial consumers are enforced across processes by a private file lock.
        """
        lock = self.path.with_suffix('.consumer.lock')
        fd = os.open(lock, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
        try:
            info = os.fstat(fd)
            if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
                raise Refused('UNSAFE_ADMISSION_STORE')
            try:
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                return None
            return self._prepare_one(prepare_local)
        finally:
            os.close(fd)

    def _prepare_one(self, prepare_local):
        with self.transaction() as db:
            row = db.execute("SELECT * FROM admissions WHERE phase='authorized' ORDER BY created,id LIMIT 1").fetchone()
            if row is None:
                return None
            if row['preparations'] >= MAX_PREPARATIONS:
                db.execute("UPDATE admissions SET phase='blocked',updated=? WHERE id=?", (time.time(), row['id']))
                return {'id': row['id'], 'phase': 'blocked'}
            if digest(row['payload']) != row['payload_sha256']:
                db.execute("UPDATE admissions SET phase='blocked',updated=? WHERE id=?", (time.time(), row['id']))
                return {'id': row['id'], 'phase': 'blocked'}
            attempts = row['preparations'] + 1
            db.execute('UPDATE admissions SET preparations=?,updated=? WHERE id=?', (attempts, time.time(), row['id']))
            request, payload = self.public(row), row['payload']
        # Attempt count is committed before entering local preparation. Even
        # abrupt process death cannot reset the retry limit or create new IDs.
        try:
            prepare_local(request, payload)
        except (OSError, sqlite3.Error, Refused):
            phase = 'blocked' if attempts >= MAX_PREPARATIONS else 'authorized'
            with self.transaction() as db:
                db.execute('UPDATE admissions SET phase=?,updated=? WHERE id=?', (phase, time.time(), row['id']))
            return {'id': row['id'], 'phase': phase}
        with self.transaction() as db:
            db.execute("UPDATE admissions SET phase='queued',updated=? WHERE id=?", (time.time(), row['id']))
        return {'id': row['id'], 'phase': 'queued'}
