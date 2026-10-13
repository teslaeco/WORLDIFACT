"""Transform only the exact operator-observed Oracle source. Never install it.

Existing integrity manifests/receipts are not rewritten by this builder. A
separate reviewed release must run the real gates before it can attest these
new bytes. Changed or already-patched input is refused.
"""
import ast
import hashlib
from pathlib import Path

import worker_recovery

BEFORE = '3ca9da9a246c406ced7f1183b2e6e85f95d1ce733f0ef12af652c5aaf5812227'
HELPERS = ('durable_inbox.py', 'durable_admission.py')


def transform(original, helpers):
    if hashlib.sha256(original).hexdigest() != BEFORE or set(helpers) != set(HELPERS):
        raise ValueError('Exact observed Oracle source and both helpers are required.')
    text = original.decode()

    def replace(before, after):
        nonlocal text
        if text.count(before) != 1:
            raise ValueError('Oracle source anchor changed.')
        text = text.replace(before, after)

    replace('import studio_execution\n', 'import studio_execution\nimport durable_admission\n')
    pins = {name: hashlib.sha256(helpers[name]).hexdigest() for name in HELPERS}
    replace('SYSTEM = PROMPT\n', 'SYSTEM = PROMPT\nADMISSIONS = durable_admission.Runtime(globals(), ' + repr(pins) + ')\n')
    replace('    state.update(studio_execution.verified_health())\n',
            '    state.update(studio_execution.verified_health())\n    state.update(ADMISSIONS.health())\n')
    replace("self.path == '/v1/jobs' else 12000", "self.path in ('/v1/jobs', '/v1/jobs/stage') else 12000")
    replace('        data = json.loads(self.rfile.read(size))\n',
            '        self.admission_raw = self.rfile.read(size)\n        data = json.loads(self.admission_raw)\n')
    anchor = "            if write and self.path == '/v1/jobs':\n"
    replace(anchor, """            if write and self.path in ('/v1/jobs/stage', '/v1/jobs/start'):
                data = self.input()
                owner = self.headers.get('X-WORLDIFACT-Owner', '')
                fingerprint = self.headers.get('X-WORLDIFACT-Fingerprint', '')
                try:
                    accepted = (ADMISSIONS.stage(self.admission_raw, owner, fingerprint)
                                if self.path.endswith('/stage') else ADMISSIONS.start(data, owner, fingerprint))
                except durable_admission.Refused as error:
                    return self.send_json({'code': error.code}, 409)
                return self.send_json({'id': accepted['id'], 'state': 'pending', 'admission': accepted}, 202)
""" + anchor)
    replace("                with LOCK, database() as db:\n                    prior = db.execute('SELECT * FROM jobs WHERE id=?', (job_id,)).fetchone()\n",
            "                with LOCK, database() as db:\n                    if ADMISSIONS.legacy_conflict(job_id):\n                        return self.send_json({'code': 'DURABLE_ADMISSION_REQUIRED'}, 409)\n                    prior = db.execute('SELECT * FROM jobs WHERE id=?', (job_id,)).fetchone()\n")
    replace("            if not row:\n                return self.send_json({'error': 'Serwer nie ma tego zlecenia. Wyslij opis ponownie.'}, 404)\n",
            "            if not row:\n                staged = ADMISSIONS.missing_status(job_id) if not write and action is None else None\n                if staged is not None:\n                    return self.send_json(staged)\n                return self.send_json({'error': 'Request not found. Preserve its original receipt for reconciliation.'}, 404)\n")
    replace("        WAKE.clear()\n        with LOCK, database() as db:\n",
            "        WAKE.clear()\n        if (context_policy.maintenance_active(ROOT) or studio_pricing.maintenance_active(ROOT)):continue\n        try:\n            ADMISSIONS.drain()\n        except (OSError, sqlite3.Error, ValueError):\n            continue  # No provider call or false ACK after a local storage failure.\n        with LOCK, database() as db:\n")
    replace("            row = db.execute(\"SELECT * FROM jobs WHERE state='queued' ORDER BY created LIMIT 1\").fetchone()\n",
            "            db.execute('PRAGMA synchronous=FULL')\n            db.execute('BEGIN IMMEDIATE')\n            row = db.execute(\"SELECT * FROM jobs WHERE state='queued' ORDER BY created,id LIMIT 1\").fetchone()\n")
    replace("        with database() as db:\n            if not (context_policy.maintenance_active(ROOT) or studio_pricing.maintenance_active(ROOT)):\n                db.execute(\"UPDATE jobs SET state='failed',detail='Serwer uruchomil sie ponownie. Wyslij opis jeszcze raz.' WHERE state NOT IN ('succeeded','failed','cancelled')\")\n",
            "        runtime_lock_fd = durable_admission.process_lock(STATE)\n        with database() as db:\n            if not (context_policy.maintenance_active(ROOT) or studio_pricing.maintenance_active(ROOT)):\n                durable_admission.recover_after_restart(db)\n")
    text = worker_recovery.transform(text)
    ast.parse(text)
    return text.encode()


def build(source, destination):
    source, destination = Path(source), Path(destination)
    if destination.exists() or destination.is_symlink():
        raise ValueError('A new, isolated output directory is required.')
    if any(p.is_symlink() for p in (source, destination.parent, *destination.parent.parents)):
        raise ValueError('Symlink paths are refused.')
    here = Path(__file__).resolve().parent
    helpers = {name: (here / name).read_bytes() for name in HELPERS}
    values = {'server.py': transform(source.read_bytes(), helpers), **helpers}
    destination.mkdir(mode=0o700)
    for name, raw in values.items():
        (destination / name).write_bytes(raw)
    return {name: hashlib.sha256(raw).hexdigest() for name, raw in values.items()}
