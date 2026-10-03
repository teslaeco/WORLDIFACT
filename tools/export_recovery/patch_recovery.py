"""Offline, exact-source staging only. No installer or remote execution path."""
import argparse
import hashlib
import json
from pathlib import Path
import sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(ROOT / 'tools/model_completion'))
import reviewed_direct_export as direct
# This file can also be imported as source_patch, so select the existing module
# by explicit path rather than relying on sys.path/cache ordering.
import importlib.util
spec = importlib.util.spec_from_file_location('_completion_export_ancestor', ROOT / 'tools/model_completion/source_patch.py')
completion_patch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(completion_patch)
import export_recovery as recovery

COMPLETION_SERVER = 'c6f9432b8dd1e756c65fad18e5bd8346e51590b8feade09c7b1324b616a74cb2'
PREBUILD_HEALTH = '    from prebuild_policy import verified_health as prebuild_health\n    state.update(prebuild_health())\n'
COMPLETION_HEALTH = '    from completion_policy import verified_health as completion_health\n    state.update(completion_health())\n'
COMPLETION_FAILURE = '            from completion_policy import public_failure_code\n'
HELPERS = '''
import export_recovery
EXPORT_RECOVERY = export_recovery.Recovery(ROOT, STATE, JOBS, LOCK, database,
    RUNNING, export_files, sandbox_options, job_memory_gib, IMAGE)

def customer_export_files(folder, name):
    return export_recovery.resolve(folder, name, export_files)

def prepare_customer_exports(job_id, row):
    # Re-read the completed row under the same admission lock; never trust a
    # request-time snapshot or set job state merely to prepare optional files.
    try:
        return EXPORT_RECOVERY.prepare(job_id)
    except export_recovery.CleanupUncertain:
        return {'error':'Optional export cleanup needs review; generation remains blocked.',
                'code':'EXPORT_CLEANUP_UNCERTAIN'}, 503
'''


def once(source, old, new):
    if source.count(old) != 1:
        raise ValueError('Reviewed export recovery context differs.')
    return source.replace(old, new, 1)


def review_server(raw):
    text = raw.decode('utf-8')
    variant = 'COMPLETION_DIRECT_V2'
    if PREBUILD_HEALTH in text:
        text = once(text, PREBUILD_HEALTH, '')
        variant = 'PREBUILD_DIRECT_V2'
    if hashlib.sha256(text.encode()).hexdigest() != COMPLETION_SERVER:
        raise ValueError('Unreviewed export recovery ancestor; no source changed.')
    # Prove original installed ancestry, not only a copied digest.
    original = once(text, COMPLETION_HEALTH, '')
    original = once(original, COMPLETION_FAILURE, '')
    original = once(original, ",**public_failure_code(JOBS/job_id,row['state'])", '')
    if completion_patch.reviewed_server_variant(original.encode()) != 'FAST_V33_DIRECT_EXPORT_V2':
        raise ValueError('Missing reviewed direct-export ancestor.')
    return variant


def patch_server(raw):
    review_server(raw)
    text = once(raw.decode(), direct.HELPERS, HELPERS)
    text = once(text,
        "return self.send_json({**capability(health()),'posthocExportRevision':2,'legacyGlbExportRecoveryRevision':1})",
        "return self.send_json({**capability(health()),**export_recovery.verified_health(ROOT)})")
    text = once(text, 'def ai_busy():\n', 'def ai_busy():\n    if export_recovery.busy(STATE):return True\n')
    text = once(text, "        with LOCK, database() as db:\n            row = db.execute(\"SELECT * FROM jobs WHERE state='queued' ORDER BY created LIMIT 1\").fetchone()",
        "        with LOCK, database() as db:\n            if export_recovery.busy(STATE):continue\n            row = db.execute(\"SELECT * FROM jobs WHERE state='queued' ORDER BY created LIMIT 1\").fetchone()")
    text = once(text,
        '                    if db.execute("SELECT COUNT(*) FROM jobs WHERE state NOT IN (\'succeeded\',\'failed\',\'cancelled\')").fetchone()[0]:',
        '                    if export_recovery.busy(STATE) or RUNNING or db.execute("SELECT COUNT(*) FROM jobs WHERE state NOT IN (\'succeeded\',\'failed\',\'cancelled\')").fetchone()[0]:')
    text = once(text, 'archive.write(path, path.relative_to(folder).as_posix())',
                'archive.write(path, export_recovery.archive_name(folder, path))')
    compile(text, 'server.py', 'exec')
    return text.encode()


def stage(source, destination):
    source, destination = recovery.safe_path(source), recovery.safe_path(destination)
    if destination.exists() or source == destination or source in destination.parents:
        raise ValueError('Use a new offline output directory outside the source snapshot.')
    original = recovery.regular(source / 'server.py', 1024**2)
    exporter = recovery.regular(source / 'runtime/scene_exports.py', 1024**2)
    if hashlib.sha1(b'blob ' + str(len(exporter)).encode() + b'\0' + exporter).hexdigest() != recovery.EXPORTER_BLOB:
        raise ValueError('Unreviewed pinned optional exporter.')
    sandbox = recovery.regular(source / 'runtime_check.py', 1024**2)
    if hashlib.sha1(b'blob ' + str(len(sandbox)).encode() + b'\0' + sandbox).hexdigest() != recovery.SANDBOX_BLOB:
        raise ValueError('Unreviewed runtime sandbox.')
    output = {'server.py': patch_server(original), 'export_recovery.py': HERE.joinpath('export_recovery.py').read_bytes()}
    for name, raw in output.items():
        compile(raw, name, 'exec')
    manifest = {'phase': 'OFFLINE_DRAFT_NOT_INSTALLED', 'ancestor': review_server(original),
                'revision': recovery.REVISION, 'original_server_sha256': hashlib.sha256(original).hexdigest(),
                'sha256': {n: hashlib.sha256(b).hexdigest() for n, b in output.items()},
                'exporter_git_blob': recovery.EXPORTER_BLOB, 'sandbox_git_blob': recovery.SANDBOX_BLOB,
                'runtime_verified': False,
                'services_restarted': False, 'generation_requested': False}
    destination.mkdir(mode=0o700)
    recovery.write_new(destination / 'server.py.original', original)
    for name, raw in output.items():
        recovery.write_new(destination / name, raw)
    recovery.write_new(destination / 'STAGE_MANIFEST.json', (json.dumps(manifest, indent=2) + '\n').encode())
    recovery.sync_directory(destination)
    return manifest


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path)
    parser.add_argument('--stage', type=Path)
    args = parser.parse_args(argv)
    if args.source is None and args.stage is None:
        print('PLAN ONLY. No source reads, installation, service changes, export or generation.')
        return
    if args.source is None or args.stage is None:
        parser.error('Offline staging requires both --source and --stage.')
    print(json.dumps(stage(args.source, args.stage), indent=2))


if __name__ == '__main__':
    main()
