"""Bounded Oracle metadata, without importing installed code or reading credentials.

This checks source/receipt references and job/artifact metadata, not real model
quality, billing reconciliation or permission to replace the runtime.
"""
import collections
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import stat
import struct
import time

EXPECTED = {
    "astra_spend_v2.py": "6ff61de4356388ecbec9d5eda1ae61f0ca2098deeb8ed10f1c2928dec67b3028",
    "blender_mcp.py": "54fa9734e848e9c8720e04ae8eddcc4c8a97546e3a64ef31c1bd88b37c317715",
    "codex_runner.py": "850f56fa3503fcdd230a41fb9bf0aa898cd1bd3cba817b8c95562fd8ef050d06",
    "completion_policy.py": "664e9f3b2326116fe9aeeb78e7a84aac254ca8a3054cdccdfb5224e112890110",
    "construction_health.py": "f63c2731c501fa73037ea0205e8bbd73e8cc58f93ab6601d51ba7bd271ae56cf",
    "construction_payload.py": "dc65d54672b657e260a1a4a24da6657e95581de479b55e6e8c9b26f93a49e2bb",
    "construction_policy.py": "0d9e36b5034cf9d055aedda85d9bc052745adbfd07a8061d6c46137ca57a29fa",
    "context_policy.py": "de55626504e39a1ac52b78de57995013761c824165b0f92f108ea09b9cb0a2f1",
    "phased_controller.py": "1825f3cbff6e229799d22001481d8075a8e8b5c567e60b3736a9208126c99d6b",
    "prebuild_policy.py": "b157f93ab4c68402f921576b897ea05f2b68454092167731c74fd9ee45b87033",
    "runtime_controller.py": "9188b29c60ac26ab9f63781660db548b1757ee430fc4b33a43930f6868168b0d",
    "server.py": "3ca9da9a246c406ced7f1183b2e6e85f95d1ce733f0ef12af652c5aaf5812227",
    "studio_execution.py": "88defd43f3de9450a193ff5f4811f55b0f8bfd38a26289c4fb6a974f5d4025be",
    "studio_pricing.py": "ad765f9193e973146a8fd9e0761d13006ba939db7926275f628ad21c83350584",
    "terminal_budget.py": "3e8a1654aede456eeeb673bb67f508a56996602239c56127123ba7e71a5a39f0"
}
CONSTRUCTION = '.worldifact-standard-construction.json'
MODEL = '.worldifact-studio-execution-runtime.json'
CHAIN = ('.worldifact-model-completion.json', '.worldifact-prebuild.json', '.worldifact-terminal-budget-runtime.json',
         '.worldifact-studio-pricing-runtime.json', '.worldifact-standard-context.json',
         '.worldifact-astra-guard.json', 'tools/codex/verified.json')
UUID = re.compile(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}')


def regular(path, maximum):
    path = Path(path).absolute()
    if any(p.is_symlink() for p in (path, *path.parents)):
        raise ValueError('Unsafe diagnostic path')
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, 'rb') as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or not 0 < info.st_size <= maximum:
            raise ValueError('Unexpected diagnostic file')
        raw = stream.read(maximum+1)
        if len(raw) != info.st_size: raise ValueError('Concurrent source change')
        return raw


def snapshot(root):
    root = Path(root).absolute()
    report = {'kind': 'WORLDIFACT_P0_SOURCE_AND_STORAGE', 'generation_requested': False,
              'production_changed': False, 'release': 'NO-GO'}
    try:
        source_hashes = {name: hashlib.sha256(regular(root/name, 2*1024**2)).hexdigest() for name in EXPECTED}
        report['source_files_checked'] = len(source_hashes)
        report['source_manifest_matches'] = source_hashes == EXPECTED
        report['server_sha256'] = source_hashes['server.py']
    except (OSError, ValueError):
        report['source_manifest_matches'] = False
    try:
        construction_raw = regular(root/CONSTRUCTION, 16384)
        construction = json.loads(construction_raw)
        model = json.loads(regular(root/MODEL, 16384))
        report['receipt_references_consistent'] = (
            report['source_manifest_matches']
            and construction['sha256'] == {n: h for n,h in EXPECTED.items() if n != 'studio_execution.py'}
            and construction['receipt_sha256'] == {n: hashlib.sha256(regular(root/n, 16384)).hexdigest() for n in CHAIN}
            and model['sha256'] == {n: EXPECTED[n] for n in ('server.py','codex_runner.py','studio_execution.py')}
            and model['construction_receipt_sha256'] == hashlib.sha256(construction_raw).hexdigest()
            and model['models'] == ['astra','sol','luna'] and model['modes'] == ['standard','fast'])
    except (OSError, ValueError, KeyError, TypeError):
        report['receipt_references_consistent'] = False
    database = root/'state/jobs.sqlite'
    try:
        if any(p.is_symlink() for p in (database, *database.parents)): raise ValueError('Unsafe database path')
        connection = sqlite3.connect(database.as_uri()+'?mode=ro', uri=True, timeout=3)
        try:
            connection.execute('PRAGMA query_only=ON')
            deadline = time.monotonic()+10
            connection.set_progress_handler(lambda: int(time.monotonic() > deadline), 1000)
            connection.execute('BEGIN')
            report['sqlite_quick_check_ok'] = connection.execute('PRAGMA quick_check').fetchone()[0] == 'ok'
            rows = connection.execute('SELECT id,state FROM jobs LIMIT 10001').fetchall()
            if len(rows) > 10000: raise ValueError('Diagnostic row limit exceeded')
            allowed = ('queued','generating','retrying','building','succeeded','failed','cancelled')
            report['job_counts'] = dict(collections.Counter(state if state in allowed else 'OTHER' for _,state in rows))
            report['rows_marked_failed_by_startup'] = connection.execute("SELECT COUNT(*) FROM jobs WHERE state='failed' AND detail=?",
                ('Serwer uruchomil sie ponownie. Wyslij opis jeszcze raz.',)).fetchone()[0]
            jobs = root/'state/jobs'
            if jobs.is_symlink() or not jobs.is_dir(): raise ValueError('Unsafe job directory')
            identifiers = {job for job,_ in rows}
            folders = list(jobs.iterdir())
            if len(folders)>20000: raise ValueError('Diagnostic directory limit exceeded')
            report['uuid_folders_without_sqlite_row'] = sum(bool(UUID.fullmatch(p.name)) and p.name not in identifiers and p.is_dir() and not p.is_symlink() for p in folders)
            counts = collections.Counter()
            for job_id, state in rows:
                if state != 'succeeded': continue
                if not isinstance(job_id,str) or not UUID.fullmatch(job_id):
                    counts['invalid_job_identity'] += 1
                    continue
                folder = jobs/job_id
                if folder.is_symlink(): counts['unsafe_folder'] += 1; continue
                for name, label in (('model.glb','glb'),('model.blend','blend'),('model.fbx','fbx')):
                    path = folder/name
                    if path.is_symlink() or not path.is_file(): counts[label+'_absent_or_unsafe'] += 1; continue
                    counts[label+'_present'] += 1
                    if name == 'model.glb':
                        with path.open('rb') as stream: header = stream.read(12)
                        valid = len(header)==12 and struct.unpack('<III',header)==(0x46546c67,2,path.stat().st_size)
                        counts['glb_header_valid' if valid else 'glb_header_invalid'] += 1
            report['successful_row_artifact_counts'] = dict(counts)
        finally:
            connection.close()
    except (OSError, ValueError, sqlite3.Error):
        report['database_inspection'] = 'INCOMPLETE'
    return report


if __name__ == '__main__':
    print(json.dumps(snapshot('/home/opc/froge-connector'), indent=2, sort_keys=True))
