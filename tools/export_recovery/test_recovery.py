"""Exact pinned-source regressions with synthetic files and inert processes."""
import ast
from contextlib import contextmanager
import hashlib
import importlib.util
import json
import io
import zipfile
import os
from pathlib import Path
import re
import shutil
import sqlite3
import struct
import subprocess
import sys
import tempfile
import threading
import types
import unittest
from unittest.mock import patch

import export_recovery as recovery
import patch_recovery

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools/model_completion'))
import completion_policy
import reviewed_direct_export
import source_fixture
spec = importlib.util.spec_from_file_location('exact_completion_patch', ROOT / 'tools/model_completion/source_patch.py')
completion_patch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(completion_patch)

FIRST = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
SECOND = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'


def glb():
    text = json.dumps({'asset': {'version': '2.0'}, 'buffers': [], 'images': []}).encode()
    text += b' ' * (-len(text) % 4)
    return struct.pack('<IIIII', 0x46546c67, 2, 20 + len(text), len(text), 0x4e4f534a) + text


def synthetic_exports(root, work, *_args):
    (work / 'model.blend').write_bytes(b'BLENDER-v300synthetic-not-rendered')
    (work / 'model.fbx').write_bytes(b'fixture-fbx-not-rendered')
    textures = work / 'textures'
    textures.mkdir()
    (textures / '00-base.png').write_bytes(b'fixture-image-not-rendered')
    report = {'interchange_exports': {'fbx': {'status': 'ready', 'reimport_verified': True,
               'files': [recovery.record(work / 'model.fbx', work)]},
               'textures': [recovery.record(textures / '00-base.png', work)]}}
    (work / 'result.json').write_text(json.dumps(report))


@unittest.skipUnless(os.environ.get('MODEL_COMPLETION_SOURCE'), 'Pinned fixture is required for exact-source tests')
class RecoveryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        raw = source_fixture.installed_sources(os.environ['MODEL_COMPLETION_SOURCE'])
        raw['server.py'] = reviewed_direct_export.patch_server(raw['server.py'].decode()).encode()
        selected = {name: raw[name] for name in completion_patch.EXPECTED}
        cls.ancestor = completion_patch.changes(selected, Path(completion_policy.__file__).read_bytes())['server.py']
        cls.patched = patch_recovery.patch_server(cls.ancestor)

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.state = self.root / 'state'
        self.jobs = self.state / 'jobs'
        self.jobs.mkdir(parents=True)
        self.db_path = self.state / 'test.sqlite'
        self.lock = threading.RLock()
        self.running = set()
        with sqlite3.connect(self.db_path) as db:
            db.execute('CREATE TABLE jobs (id TEXT, prompt TEXT, state TEXT, detail TEXT, created REAL, updated REAL)')
        @contextmanager
        def database():
            with sqlite3.connect(self.db_path) as db:
                db.row_factory = sqlite3.Row
                yield db
        self.database = database
        ns = {'hashlib': hashlib, 're': re, 'json': json, 'EXPORT_LIMIT': recovery.MAX_EXPORT}
        module = ast.parse(self.ancestor)
        selected = [n for n in module.body if isinstance(n, ast.FunctionDef) and n.name == 'export_files']
        selected += [n for n in module.body if isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'EXPORT_FILES' for t in n.targets)]
        exec(compile(ast.Module(body=selected, type_ignores=[]), 'exact-export-reader', 'exec'), ns)
        self.resolver = ns['export_files']
        self.service = recovery.Recovery(self.root, self.state, self.jobs, self.lock, database,
                                         self.running, self.resolver, lambda _: ['--network=none'], lambda _: 4, 'inert-image')
        self.addCleanup(patch.stopall)
        patch.object(recovery, 'verified_health', return_value={'posthocExportSafetyRevision': recovery.REVISION}).start()
        patch.object(recovery.shutil, 'disk_usage', return_value=types.SimpleNamespace(free=20 * 1024**3)).start()
        self.job(FIRST)

    def job(self, identifier, state='succeeded'):
        folder = self.jobs / identifier
        folder.mkdir()
        (folder / 'model.glb').write_bytes(glb())
        (folder / 'model.blend').write_bytes(b'BLENDER-preserved-source')
        (folder / 'result.json').write_text('{"unrelated_original_report": true}')
        (folder / 'model-ready.json').write_text('{"original_checkpoint": true}')
        (folder / 'agent-request.json').write_text(json.dumps({'instructions': completion_policy.STANDARD}))
        with self.database() as db:
            db.execute('INSERT INTO jobs VALUES (?,?,?,?,?,?)', (identifier, 'synthetic test', state, 'Original completed detail', 111.0, 222.0))
        return folder

    def row(self, identifier=FIRST):
        with self.database() as db:
            return tuple(db.execute('SELECT * FROM jobs WHERE id=?', (identifier,)).fetchone())

    def originals(self, identifier=FIRST):
        return {p.name: p.read_bytes() for p in (self.jobs / identifier).iterdir() if p.is_file()}

    def test_exact_transform_preserves_generation_functions_and_removes_unsafe_helper(self):
        self.assertEqual(hashlib.sha256(self.ancestor).hexdigest(), patch_recovery.COMPLETION_SERVER)
        before, after = ast.parse(self.ancestor), ast.parse(self.patched)
        for name in ('status', 'run_blender', 'run_blender_finalize'):
            fn = lambda tree: next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == name)
            self.assertEqual(ast.dump(fn(before)), ast.dump(fn(after)))
        self.assertNotIn(b'POSTHOC_EXPORTING', self.patched)
        self.assertNotIn(b"'posthocExportRevision':2", self.patched)
        self.assertIn(b'export_recovery.verified_health(ROOT)', self.patched)
        self.assertIn(b'if export_recovery.busy(STATE):continue', self.patched)
        with self.assertRaises(ValueError):
            patch_recovery.patch_server(self.ancestor + b'\n')
        prebuild = self.ancestor.replace(b'    state.update(completion_health())\n', b'    state.update(completion_health())\n' + patch_recovery.PREBUILD_HEALTH.encode())
        self.assertEqual(patch_recovery.review_server(prebuild), 'PREBUILD_DIRECT_V2')
        patch_recovery.patch_server(prebuild)

    def test_offline_stage_proves_exact_sources_without_installing_or_receipt(self):
        source = self.root / 'source-snapshot'
        (source / 'runtime').mkdir(parents=True)
        (source / 'server.py').write_bytes(self.ancestor)
        fixture = Path(os.environ['MODEL_COMPLETION_SOURCE'])
        for name in ('runtime/scene_exports.py', 'runtime_check.py'):
            shutil.copyfile(fixture / name, source / name)
        before = {p.relative_to(source).as_posix(): p.read_bytes() for p in source.rglob('*') if p.is_file()}
        destination = self.root / 'offline-output'
        with patch.object(subprocess, 'Popen', side_effect=AssertionError('process forbidden')):
            manifest = patch_recovery.stage(source, destination)
        self.assertEqual(manifest['phase'], 'OFFLINE_DRAFT_NOT_INSTALLED')
        self.assertFalse(manifest['runtime_verified'])
        self.assertEqual((destination / 'server.py.original').read_bytes(), self.ancestor)
        self.assertEqual((destination / 'server.py').read_bytes(), self.patched)
        self.assertEqual({p.relative_to(source).as_posix(): p.read_bytes() for p in source.rglob('*') if p.is_file()}, before)
        self.assertFalse((destination / recovery.RECEIPT).exists())
        with self.assertRaises(ValueError):
            patch_recovery.stage(source, destination)
        (source / 'server.py').write_bytes(self.ancestor + b'# unreviewed')
        with self.assertRaises(ValueError):
            patch_recovery.stage(source, self.root / 'unknown-output')
        self.assertFalse((self.root / 'unknown-output').exists())

    def test_success_preserves_entire_row_and_all_original_artifacts(self):
        files, row = self.originals(), self.row()
        with patch.object(recovery, 'run_export', side_effect=synthetic_exports) as run:
            body, code = self.service.prepare(FIRST)
        self.assertEqual(code, 200)
        self.assertEqual(body['formats'], ['pbr', 'fbx', 'blend'])
        self.assertEqual(self.row(), row)
        self.assertEqual(self.originals(), files)
        self.assertFalse(recovery.busy(self.state))
        work = run.call_args.args[1]
        self.assertFalse(work.exists())
        self.assertEqual(recovery.resolve(self.jobs / FIRST, 'blend', self.resolver), [self.jobs / FIRST / 'model.blend'])
        # A repeated request verifies ready outputs but starts no second process.
        with patch.object(recovery, 'run_export') as rerun:
            again, status = self.service.prepare(FIRST)
            self.assertEqual(status, 200)
            self.assertTrue(again['recoveredFromGlb'])
            self.assertEqual(again['recoveredFormats'], ['pbr', 'fbx'])
            rerun.assert_not_called()

    def test_failure_or_private_glb_rewrite_never_touches_originals(self):
        files, row = self.originals(), self.row()
        def failing(*args):
            synthetic_exports(*args)
            (args[1] / 'model.glb').write_bytes(b'broken-private-export')
            raise recovery.ExportError('synthetic failure')
        def rewriting(*args):
            synthetic_exports(*args)
            (args[1] / 'model.glb').write_bytes(b'broken-private-export')
        for behavior in (failing, rewriting):
            with self.subTest(behavior=behavior), patch.object(recovery, 'run_export', side_effect=behavior):
                self.assertEqual(self.service.prepare(FIRST)[1], 409)
                self.assertEqual(self.originals(), files)
                self.assertEqual(self.row(), row)
                self.assertFalse(recovery.busy(self.state))
                self.assertFalse((self.jobs / FIRST / recovery.SIDECAR).exists())

    def test_missing_textures_remain_missing_and_valid_ready_fbx_is_preserved(self):
        folder = self.jobs / FIRST
        (folder / 'model.fbx').write_bytes(b'original-existing-fbx')
        (folder / 'result.json').write_text(json.dumps({'interchange_exports': {'fbx': {'status': 'ready', 'files': [recovery.record(folder / 'model.fbx', folder)]}}}))
        files = self.originals()
        def no_maps(root, work, *args):
            synthetic_exports(root, work, *args)
            (work / 'result.json').write_text('{"interchange_exports": {"textures": []}}')
        with patch.object(recovery, 'run_export', side_effect=no_maps):
            self.assertEqual(self.service.prepare(FIRST)[1], 409)
        self.assertEqual(self.originals(), files)
        self.assertNotIn('pbr', recovery.ready(folder, self.resolver))

    def test_partial_success_is_explicit_and_bundle_is_immutable(self):
        (self.jobs / FIRST / 'model.blend').unlink()
        def blend_only(root, work, *args):
            synthetic_exports(root, work, *args)
            (work / 'result.json').write_text('{"interchange_exports": {}}')
        with patch.object(recovery, 'run_export', side_effect=blend_only):
            body, code = self.service.prepare(FIRST)
        self.assertEqual(code, 200)
        self.assertEqual(body['formats'], ['blend'])
        self.assertEqual(body['missingFormats'], ['pbr', 'fbx'])
        with patch.object(recovery, 'run_export') as run:
            self.assertEqual(self.service.prepare(FIRST)[1], 409)
            run.assert_not_called()

    def test_same_and_different_job_preparations_are_globally_excluded(self):
        self.job(SECOND)
        entered, release = threading.Event(), threading.Event()
        replies = []
        def pause(*args):
            entered.set()
            if not release.wait(5):
                raise recovery.ExportError('test thread timeout')
            synthetic_exports(*args)
        with patch.object(recovery, 'run_export', side_effect=pause) as run:
            thread = threading.Thread(target=lambda: replies.append(self.service.prepare(FIRST)))
            thread.start()
            self.assertTrue(entered.wait(5))
            try:
                self.assertTrue(recovery.busy(self.state))
                self.assertEqual(self.service.prepare(FIRST)[1], 409)
                self.assertEqual(self.service.prepare(SECOND)[1], 409)
                self.assertEqual(self.generation_request()[1], 409)
                self.assertEqual(run.call_count, 1)
            finally:
                release.set()
                thread.join(5)
            self.assertFalse(thread.is_alive())
        self.assertEqual(replies[0][1], 200)

    def generation_request(self):
        # Execute the exact patched handler through admission; no socket, host
        # service, provider configuration or real queued job is involved.
        module = ast.parse(self.patched)
        handler = next(n for n in module.body if isinstance(n, ast.ClassDef) and n.name == 'Handler')
        config = self.state / 'fixture-config.json'
        config.write_text('{"token":"synthetic-inert-token"}')
        ns = {'BaseHTTPRequestHandler': object, 'CONFIG': config, 'json': json, 'LOCK': self.lock,
              'database': self.database, 'JOBS': self.jobs, 'STATE': self.state, 'RUNNING': self.running,
              'export_recovery': recovery, 'UUID': re.compile(r'^[a-f0-9-]{36}$'), 'PROMPT_MAX_LENGTH': 5000,
              'photo_input': types.SimpleNamespace(validate_photos=lambda _: []),
              'requested_profile': lambda _: 'standard'}
        exec(compile(ast.Module(body=[handler], type_ignores=[]), 'exact-patched-handler', 'exec'), ns)
        instance = ns['Handler']()
        instance.path = '/v1/jobs'
        instance.authorized = lambda _: True
        instance.input = lambda: {'id': 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'prompt': 'new synthetic request'}
        instance.send_json = lambda body, status_code=200: (body, status_code)
        return instance.handle_request(True)

    def test_actual_download_handler_zip_has_public_texture_paths(self):
        with patch.object(recovery, 'run_export', side_effect=synthetic_exports):
            self.assertEqual(self.service.prepare(FIRST)[1], 200)
        module = ast.parse(self.patched)
        handler = next(n for n in module.body if isinstance(n, ast.ClassDef) and n.name == 'Handler')
        config = self.state / 'fixture-config.json'
        config.write_text('{"token":"synthetic-inert-token"}')
        ns = {'BaseHTTPRequestHandler': object, 'CONFIG': config, 'json': json, 're': re,
              'database': self.database, 'JOBS': self.jobs, 'STATE': self.state,
              'export_recovery': recovery, 'UUID': re.compile(r'^[a-f0-9-]{36}$'),
              'customer_export_files': lambda folder, name: recovery.resolve(folder, name, self.resolver),
              'tempfile': tempfile, 'zipfile': zipfile}
        exec(compile(ast.Module(body=[handler], type_ignores=[]), 'exact-download-handler', 'exec'), ns)
        instance = ns['Handler']()
        instance.path = '/v1/jobs/' + FIRST + '/exports/pbr'
        instance.authorized = lambda _: True
        sent = []
        instance.send_export = lambda output, *_args: sent.append(output.read())
        instance.handle_request(False)
        with zipfile.ZipFile(io.BytesIO(sent[0])) as archive:
            self.assertEqual(archive.namelist(), ['textures/00-base.png'])
        self.assertEqual(recovery.archive_name(self.jobs / FIRST, self.jobs / FIRST / 'model.fbx'), 'model.fbx')

    def test_worker_never_starts_queued_work_while_export_is_reserved(self):
        self.job(SECOND, state='queued')
        recovery.write_new(self.state / recovery.BUSY, b'persisted-inert-reservation')
        before = self.row(SECOND)
        worker = next(n for n in ast.parse(self.patched).body if isinstance(n, ast.FunctionDef) and n.name == 'worker')
        wake = types.SimpleNamespace(wait=unittest.mock.Mock(side_effect=[True, StopIteration]), clear=lambda: None)
        ns = {'WAKE': wake, 'LOCK': self.lock, 'database': self.database,
              'export_recovery': recovery, 'STATE': self.state}
        exec(compile(ast.Module(body=[worker], type_ignores=[]), 'exact-patched-worker', 'exec'), ns)
        with self.assertRaises(StopIteration):
            ns['worker']()
        self.assertEqual(self.row(SECOND), before)

    def test_residual_running_job_blocks_preparation_and_generation(self):
        self.running.add(SECOND)
        with patch.object(recovery, 'run_export') as run:
            self.assertEqual(self.service.prepare(FIRST)[1], 409)
            self.assertEqual(self.generation_request()[1], 409)
            run.assert_not_called()

    def test_uncertain_cleanup_blocks_new_generation_even_after_module_reload(self):
        row, files = self.row(), self.originals()
        with patch.object(recovery, 'run_export', side_effect=recovery.CleanupUncertain('inert')):
            body, code = self.service.prepare(FIRST)
        self.assertEqual((code, body['code']), (503, 'EXPORT_CLEANUP_UNCERTAIN'))
        self.assertEqual(self.row(), row)
        self.assertEqual(self.originals(), files)
        self.assertTrue(recovery.busy(self.state))
        self.assertEqual(self.generation_request()[1], 409)
        alternate = importlib.util.spec_from_file_location('restarted_export_module', recovery.__file__)
        module = importlib.util.module_from_spec(alternate)
        alternate.loader.exec_module(module)
        self.assertTrue(module.busy(self.state))

    def test_stage_cleanup_failure_retains_reservation(self):
        with patch.object(recovery, 'run_export', side_effect=synthetic_exports), patch.object(recovery.shutil, 'rmtree', side_effect=OSError('synthetic cleanup failure')):
            with self.assertRaises(recovery.CleanupUncertain):
                self.service.prepare(FIRST)
        self.assertTrue(recovery.busy(self.state))

    def test_active_or_ineligible_job_is_never_repaired_or_executed(self):
        for state in ('building', 'failed', 'cancelled'):
            with self.database() as db:
                db.execute('UPDATE jobs SET state=? WHERE id=?', (state, FIRST))
            row = self.row()
            with patch.object(recovery, 'run_export') as run:
                self.assertEqual(self.service.prepare(FIRST)[1], 409)
                self.assertEqual(self.row(), row)
                run.assert_not_called()
        with self.database() as db:
            db.execute("UPDATE jobs SET state='succeeded'")
        (self.jobs / FIRST / 'generation-profile.json').write_text('{"profile":"fast-draft-v1"}')
        with patch.object(recovery, 'run_export') as run:
            self.assertEqual(self.service.prepare(FIRST)[1], 409)
            run.assert_not_called()

    def test_symlink_hardlink_traversal_and_external_glb_are_refused(self):
        folder = self.jobs / FIRST
        original = (folder / 'model.glb').read_bytes()
        target = self.root / 'outside.glb'
        target.write_bytes(original)
        (folder / 'model.glb').unlink()
        for link in ('symbolic', 'hard'):
            if link == 'symbolic':
                (folder / 'model.glb').symlink_to(target)
            else:
                os.link(target, folder / 'model.glb')
            with patch.object(recovery, 'run_export') as run:
                self.assertEqual(self.service.prepare(FIRST)[1], 409)
                run.assert_not_called()
            (folder / 'model.glb').unlink()
        (folder / 'model.glb').write_bytes(original)
        for value in ('../model.glb', '/etc/passwd', 'textures/../model.glb'):
            with self.assertRaises(ValueError):
                recovery.checked_records(folder, [{'path': value}], 'pbr')
        with patch.object(recovery, 'run_export') as run:
            self.assertEqual(self.service.prepare('../' + FIRST)[1], 409)
            run.assert_not_called()

    def test_external_and_unknown_extension_resources_fail_before_import(self):
        cases = [
            {'buffers': [{'uri': '../private.bin'}]},
            {'images': [{'uri': 'https://example.invalid/image.png'}]},
            {'extensionsUsed': ['EXT_unreviewed_source']},
            {'extensions': {'EXT_unreviewed_source': {'path': '/outside'}}},
            {'extensions': {'KHR_materials_ior': {'uri': '../outside'}}},
        ]
        for extra in cases:
            document = {'asset': {'version': '2.0'}, **extra}
            raw = json.dumps(document).encode()
            raw += b' ' * (-len(raw) % 4)
            (self.jobs / FIRST / 'model.glb').write_bytes(struct.pack('<IIIII', 0x46546c67, 2, 20 + len(raw), len(raw), 0x4e4f534a) + raw)
            with self.subTest(extra=extra), patch.object(recovery, 'run_export') as run:
                self.assertEqual(self.service.prepare(FIRST)[1], 409)
                run.assert_not_called()

    def test_exporter_symlink_cannot_publish_outside_bytes(self):
        secret = self.root / 'synthetic-private-file'
        secret.write_bytes(b'outside-fixture')
        def unsafe(root, work, *args):
            synthetic_exports(root, work, *args)
            path = work / 'textures/00-base.png'
            path.unlink()
            path.symlink_to(secret)
        with patch.object(recovery, 'run_export', side_effect=unsafe):
            body, code = self.service.prepare(FIRST)
        self.assertEqual(code, 200)
        self.assertNotIn('pbr', body['formats'])
        self.assertEqual(secret.read_bytes(), b'outside-fixture')


class ProcessAndProofTests(unittest.TestCase):
    def test_plan_default_has_no_source_process_or_network_access(self):
        with patch.object(recovery, 'regular', side_effect=AssertionError('source access')), patch.object(recovery.subprocess, 'Popen', side_effect=AssertionError('process')):
            patch_recovery.main([])

    def test_missing_or_stage_receipt_never_advertises_safe_revision(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            self.assertEqual(recovery.verified_health(root), {})
            (root / recovery.RECEIPT).write_text('{"phase":"OFFLINE_DRAFT_NOT_INSTALLED"}')
            self.assertEqual(recovery.verified_health(root), {})

    def test_safe_health_requires_complete_current_proof_and_survives_busy_state(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / 'state').mkdir()
            (root / 'runtime').mkdir()
            names = ('server.py', 'export_recovery.py', 'runtime/scene_exports.py', 'runtime_check.py')
            for name in names:
                (root / name).write_text('# synthetic source fixture: ' + name)
            proof = {'revision': recovery.REVISION, 'sha256': {name: hashlib.sha256((root / name).read_bytes()).hexdigest() for name in names},
                     'offline_export_roundtrip': True, 'cleanup_verified': True, 'admission_verified': True}
            (root / recovery.RECEIPT).write_text(json.dumps(proof))
            self.assertEqual(recovery.verified_health(root), {'posthocExportSafetyRevision': recovery.REVISION, 'posthocExportBusy': False})
            recovery.write_new(root / 'state' / recovery.BUSY, b'inert-reservation')
            self.assertTrue(recovery.verified_health(root)['posthocExportBusy'])
            for name in names:
                original = (root / name).read_bytes()
                (root / name).write_bytes(original + b'# changed')
                self.assertEqual(recovery.verified_health(root), {})
                (root / name).write_bytes(original)
            proof['cleanup_verified'] = False
            (root / recovery.RECEIPT).write_text(json.dumps(proof))
            self.assertEqual(recovery.verified_health(root), {})

    @unittest.skipUnless(os.environ.get('MODEL_COMPLETION_SOURCE'), 'Pinned renderer required')
    def test_timeout_requires_absent_container_and_reaped_client(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'runtime').mkdir()
            shutil.copyfile(Path(os.environ['MODEL_COMPLETION_SOURCE']) / 'runtime/scene_exports.py', root / 'runtime/scene_exports.py')
            work = root / 'work'
            work.mkdir()
            process = types.SimpleNamespace(wait=unittest.mock.Mock(side_effect=[subprocess.TimeoutExpired('inert', 1), 0]),
                                            poll=lambda: None, kill=unittest.mock.Mock())
            results = [types.SimpleNamespace(returncode=i) for i in (0, 0, 1)]
            with patch.object(subprocess, 'Popen', return_value=process) as launch, patch.object(subprocess, 'run', side_effect=results) as commands:
                with self.assertRaises(recovery.ExportError):
                    recovery.run_export(root, work, 'synthetic', 4, lambda _: ['--network=none', '--memory=4g'], 'inert-image')
                self.assertEqual(commands.call_count, 3)
                process.kill.assert_called_once()
                command = launch.call_args.args[0]
                self.assertIn('--network=none', command)
                self.assertIn('--disable-autoexec', command)
                self.assertNotIn('finalize.py', ' '.join(command))
            (work / 'export.py').unlink()
            (work / 'export.log').unlink()
            process.wait = unittest.mock.Mock(return_value=0)
            with patch.object(subprocess, 'Popen', return_value=process), patch.object(subprocess, 'run', return_value=types.SimpleNamespace(returncode=125)):
                with self.assertRaises(recovery.CleanupUncertain):
                    recovery.run_export(root, work, 'synthetic', 4, lambda _: [], 'inert-image')


if __name__ == '__main__':
    unittest.main()
