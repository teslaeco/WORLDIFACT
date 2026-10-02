"""Offline tests for the strict pinned, unpaid prebuild Cloud Shell launcher."""
import ast
import base64
import contextlib
import io
import importlib.util
import json
from pathlib import Path
import signal
import subprocess
import tempfile
import types
import unittest
from unittest.mock import patch

_spec = importlib.util.spec_from_file_location('prebuild_launcher', Path(__file__).with_name('oracle_prebuild_launch.py'))
launch = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(launch)
ROOT = Path(__file__).resolve().parents[2]
COMMIT = '0123456789abcdef0123456789abcdef01234567'
CORE = {'install_prebuild.py', 'prebuild_policy.py', 'prebuild_patch.py', 'offline_cabinet.py'}


def success(phase='WORLDIFACT_PREBUILD_VERIFIED'):
    return {'phase': phase, 'revision': launch.REVISION, 'paid_generation_requested': False,
            'quality_test': 'NOT_RUN'}


def failure(code='UNCONFIRMED', phase='INSTALLER', restored=None):
    return {'phase': 'WORLDIFACT_PREBUILD_NOT_CONFIRMED', 'failure_phase': phase,
            'failure_code': code, 'previous_source_restored': restored,
            'paid_generation_requested': False}


class LaunchTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.home = Path(temp.name)
        self.key = self.home / 'ssh-key-2026-09-06.key'
        self.key.write_text('PRIVATE_CANARY_NEVER_READ')
        self.key.chmod(0o600)

    def fixtures(self):
        data = {path: ('# fixture ' + name + '\n').encode()
                for name, (path, _) in launch.FILES.items()}
        manifest = {name: (path, launch.blob(data[path]))
                    for name, (path, _) in launch.FILES.items()}
        return data, manifest

    def payload(self, data, manifest):
        contents = {name: base64.b64encode(data[path]).decode('ascii')
                    for name, (path, _) in manifest.items()}
        return base64.b64encode(json.dumps(contents).encode()).decode('ascii')

    def receiver(self, raw=None, code=0, payload=None, manifest=None, wait=None, handlers=None):
        data, default_manifest = self.fixtures()
        manifest = default_manifest if manifest is None else manifest
        payload = self.payload(data, manifest) if payload is None else payload
        raw = json.dumps(success()).encode() if raw is None else raw
        process = types.SimpleNamespace(wait=wait or (lambda **_: code), poll=lambda: code,
                                        send_signal=lambda _: None, kill=lambda: None)
        def start(*args, **kwargs):
            kwargs['stdout'].write(raw)
            kwargs['stdout'].flush()
            return process
        output = io.StringIO()
        def handler(signum, fn):
            if handlers is not None:
                handlers[signum] = fn
        with patch.object(launch, 'FILES', manifest), \
                patch.object(Path, 'home', return_value=self.home), \
                patch.object(subprocess, 'Popen', side_effect=start) as popen, \
                patch.object(signal, 'signal', side_effect=handler), \
                contextlib.redirect_stdout(output), self.assertRaises(SystemExit) as stopped:
            exec(compile(launch.script(payload, approved=True), '<receiver>', 'exec'), {'__name__': 'fixture'})
        return stopped.exception.code, json.loads(output.getvalue()), popen, process

    def test_plan_has_no_reads_download_oci_ssh_or_install(self):
        for args in ([], ['--source-commit', COMMIT]):
            with self.subTest(args=args), patch.object(launch, 'connection') as connection, \
                    patch.object(launch, 'package') as package, patch.object(subprocess, 'run') as run, \
                    patch.object(launch.urllib.request, 'build_opener') as network, \
                    patch.object(Path, 'read_bytes') as read_bytes, patch.object(Path, 'read_text') as read_text, \
                    contextlib.redirect_stdout(io.StringIO()) as output:
                launch.main(args)
            self.assertIn('PLAN ONLY', output.getvalue())
            for operation in (connection, package, run, network, read_bytes, read_text):
                operation.assert_not_called()

    def test_remote_requires_exact_commit_before_any_io(self):
        for value in (None, '', 'main', 'v1', 'a' * 39, 'a' * 41, 'g' * 40,
                      '../' + COMMIT, COMMIT + '?token=PRIVATE_CANARY', 'https://example.com/' + COMMIT):
            args = ['--approve-service-restart'] + ([] if value is None else ['--source-commit', value])
            with self.subTest(value=value), patch.object(launch, 'connection') as connection, \
                    patch.object(launch, 'package') as package, patch.object(subprocess, 'run') as run, \
                    self.assertRaises(launch.LaunchError) as failure:
                launch.main(args)
            for operation in (connection, package, run):
                operation.assert_not_called()
            self.assertNotIn('PRIVATE_CANARY', str(failure.exception))
        self.assertEqual(launch.source_commit(COMMIT.upper()), COMMIT)

    def test_only_exact_two_cli_options_and_no_paid_diagnostic_or_staging_mode(self):
        for option in ('--diagnose-job', '--stage-test-helper', '--approve-paid-test', '--source', '--approve-service'):
            with self.subTest(option=option), patch.object(launch, 'package') as package, \
                    patch.object(launch, 'connection') as connection, \
                    contextlib.redirect_stderr(io.StringIO()) as errors, self.assertRaises(SystemExit) as stopped:
                launch.main([option, 'PRIVATE_CANARY'])
            self.assertEqual(stopped.exception.code, 2)
            self.assertNotIn('PRIVATE_CANARY', errors.getvalue())
            package.assert_not_called(); connection.assert_not_called()
        for approved in (False, None, 1, 'yes'):
            with self.subTest(approved=approved), self.assertRaises(launch.LaunchError):
                launch.script('payload', approved=approved)

    def test_manifest_is_exactly_original_fifteen_plus_four_frozen_core_files(self):
        tree = ast.parse((ROOT/'tools/model_completion/oracle_launch.py').read_text())
        original = next(ast.literal_eval(n.value) for n in tree.body if isinstance(n, ast.Assign)
                        and any(isinstance(t, ast.Name) and t.id == 'FILES' for t in n.targets))
        original.pop('test_original_job_once.py')
        self.assertEqual(len(original), 15)
        self.assertEqual(set(launch.FILES), set(original) | CORE)
        self.assertEqual({n: launch.FILES[n] for n in original}, original)
        for name in CORE:
            self.assertEqual(launch.FILES[name][0], 'tools/model_prebuild/' + name)
        for name, (path, expected) in launch.FILES.items():
            self.assertRegex(name, r'^[a-z0-9_]+\.py$')
            self.assertRegex(expected, r'^[0-9a-f]{40}$')
            self.assertEqual(launch.blob((ROOT/path).read_bytes()), expected)
        self.assertNotIn('test_original_job_once.py', launch.FILES)
        self.assertFalse(any('fixture' in name or 'test_' in name for name in launch.FILES))

    def test_flat_public_package_imports_and_installer_is_plan_only(self):
        contents = json.loads(base64.b64decode(launch.package(COMMIT, lambda path: (ROOT/path).read_bytes())))
        self.assertEqual(set(contents), set(launch.FILES))
        with tempfile.TemporaryDirectory() as folder:
            directory = Path(folder)
            for name, encoded in contents.items():
                (directory/name).write_bytes(base64.b64decode(encoded))
            answer = subprocess.run([launch.sys.executable, '-B', str(directory/'install_prebuild.py')],
                                    cwd=directory, stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=10)
            self.assertEqual(answer.returncode, 0, answer.stderr)
            self.assertIn('PLAN ONLY', answer.stdout)
            self.assertNotIn('WORLDIFACT_PREBUILD_VERIFIED', answer.stdout)
            self.assertEqual({p.name for p in directory.iterdir()}, set(contents))

    def test_bad_hash_stops_before_oci_or_ssh(self):
        data, manifest = self.fixtures()
        for raw in (b'', b'changed', b'x' * (launch.LIMIT + 1), 'not bytes'):
            with self.subTest(type=type(raw).__name__), patch.object(launch, 'FILES', manifest), \
                    patch.object(launch, 'read_public', return_value=raw), \
                    patch.object(launch, 'connection') as connection, patch.object(subprocess, 'run') as run, \
                    contextlib.redirect_stdout(io.StringIO()), self.assertRaises(launch.LaunchError):
                launch.main(['--source-commit', COMMIT, '--approve-service-restart'])
            connection.assert_not_called(); run.assert_not_called()

    def test_matching_hash_still_requires_compilation(self):
        raw = b'def broken(:\n'
        manifest = {'install_prebuild.py': ('tools/model_prebuild/install_prebuild.py', launch.blob(raw))}
        with patch.object(launch, 'FILES', manifest), self.assertRaises(launch.LaunchError):
            launch.package(COMMIT, lambda _: raw)

    def test_missing_reviewed_pin_stops_before_download(self):
        manifest = {'install_prebuild.py': ('tools/model_prebuild/install_prebuild.py', 'NOT_REVIEWED')}
        with patch.object(launch, 'FILES', manifest), patch.object(launch, 'read_public') as read, \
                self.assertRaises(launch.LaunchError):
            launch.package(COMMIT)
        read.assert_not_called()

    def test_download_uses_immutable_allowlist_bounded_read_and_no_redirect(self):
        sizes = []
        response = types.SimpleNamespace(status=200, read=lambda size: sizes.append(size) or b'# fixture\n')
        path = launch.FILES['install_prebuild.py'][0]
        with patch.object(launch.urllib.request, 'build_opener') as opener:
            opener.return_value.open.return_value = contextlib.nullcontext(response)
            self.assertEqual(launch.read_public(COMMIT, path), b'# fixture\n')
        opener.return_value.open.assert_called_once_with(launch.PUBLIC_ROOT + COMMIT + '/' + path, timeout=30)
        self.assertEqual(sizes, [launch.LIMIT + 1])
        self.assertEqual(opener.call_args.args[0].proxies, {})
        self.assertIsInstance(opener.call_args.args[1], launch.NoRedirect)
        self.assertIsNone(launch.NoRedirect().redirect_request(None, None, None, None, None, None))
        with patch.object(launch.urllib.request, 'build_opener') as opener, self.assertRaises(launch.LaunchError):
            launch.read_public(COMMIT, 'tools/model_prebuild/../../private')
        opener.assert_not_called()

    def test_download_failures_never_expose_exception_output(self):
        with patch.object(launch.urllib.request, 'build_opener', side_effect=OSError('PRIVATE_CANARY')), \
                self.assertRaises(launch.LaunchError) as failure:
            launch.read_public(COMMIT, launch.FILES['install_prebuild.py'][0])
        self.assertNotIn('PRIVATE_CANARY', str(failure.exception))

    def test_original_connection_implementation_is_unchanged(self):
        original = ast.parse((ROOT/'tools/model_completion/oracle_launch.py').read_text())
        current = ast.parse(Path(launch.__file__).read_text())
        for name in ('lookup', 'connection'):
            def definition(tree):
                return ast.dump(next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == name))
            self.assertEqual(definition(current), definition(original))

    def test_strict_connection_uses_original_key_without_reading_it(self):
        with patch.object(launch, 'lookup', side_effect=['ocid1.instance.synthetic', '8.8.8.8']) as lookup, \
                patch.object(Path, 'read_bytes', side_effect=AssertionError('Key must not be read')), \
                patch.object(Path, 'read_text', side_effect=AssertionError('Key must not be read')):
            args = launch.connection(self.home)
        for option in ('StrictHostKeyChecking=yes', 'IdentitiesOnly=yes', 'BatchMode=yes',
                       'ConnectTimeout=20', 'ServerAliveInterval=15', 'ServerAliveCountMax=3'):
            self.assertIn(option, args)
        self.assertEqual(args[args.index('-F') + 1], '/dev/null')
        self.assertEqual(args[args.index('-i') + 1], str(self.key))
        self.assertIn('opc@8.8.8.8', args)
        self.assertNotIn('PRIVATE_CANARY', str(args))
        self.assertEqual(lookup.call_count, 2)
        self.assertIn('eu-amsterdam-1', lookup.call_args_list[0].args[0])
        self.assertIn("query instance resources where displayName = 'froge-blender' && lifeCycleState = 'RUNNING'",
                      lookup.call_args_list[0].args[0])

    def test_missing_and_symlink_key_or_home_stop_before_oci(self):
        self.key.unlink()
        with patch.object(launch, 'lookup') as lookup, self.assertRaises(launch.LaunchError):
            launch.connection(self.home)
        lookup.assert_not_called()
        other = self.home/'other'; other.write_text('DO_NOT_USE'); self.key.symlink_to(other)
        with patch.object(launch, 'lookup') as lookup, self.assertRaises(launch.LaunchError):
            launch.connection(self.home)
        lookup.assert_not_called()
        self.key.unlink(); self.key.write_text('DO_NOT_READ')
        linked = self.home/'linked-home'; linked.symlink_to(self.home, target_is_directory=True)
        with patch.object(launch, 'lookup') as lookup, self.assertRaises(launch.LaunchError):
            launch.connection(linked)
        lookup.assert_not_called()

    def test_invalid_or_nonpublic_vm_addresses_stop(self):
        for instance, address in (('invalid', '8.8.8.8'), ('ocid1.instance.synthetic', '127.0.0.1'),
                ('ocid1.instance.synthetic', '10.0.0.1'), ('ocid1.instance.synthetic', '-oProxyCommand=bad'),
                ('ocid1.instance.synthetic', '224.0.0.1'), ('ocid1.instance.synthetic', '2001:4860:4860::8888%eth0')):
            with self.subTest(address=address), patch.object(launch, 'lookup', side_effect=[instance, address]), \
                    self.assertRaises(launch.LaunchError):
                launch.connection(self.home)

    def test_ambiguous_or_failed_oci_results_are_rejected_privately(self):
        for stdout in ('[]', '["one","two"]', '{"id":"one"}', '[null]', 'PRIVATE_CANARY', 'x'*65537):
            with self.subTest(size=len(stdout)), patch.object(subprocess, 'run',
                    return_value=types.SimpleNamespace(returncode=0, stdout=stdout)), \
                    self.assertRaises(launch.LaunchError) as failure:
                launch.lookup(['oci', 'fixture'])
            self.assertNotIn('PRIVATE_CANARY', str(failure.exception))

    def test_receiver_invokes_only_new_installer_once_and_bounds_timeout(self):
        code, result, popen, _ = self.receiver()
        self.assertEqual(code, 0); self.assertEqual(result, success()); popen.assert_called_once()
        command = popen.call_args.args[0]
        self.assertEqual(command[:2], [launch.sys.executable, '-B'])
        self.assertEqual(Path(command[2]).name, 'install_prebuild.py')
        self.assertEqual(command[3:], ['--approve-service-restart'])
        self.assertEqual(popen.call_args.kwargs['stdin'], subprocess.DEVNULL)
        self.assertEqual(popen.call_args.kwargs['stderr'], subprocess.STDOUT)
        staged = Path(command[2]).parent
        self.assertEqual({p.name for p in staged.iterdir()}, set(launch.FILES))
        self.assertEqual(staged.stat().st_mode & 0o777, 0o700)
        self.assertTrue(all(p.stat().st_mode & 0o777 == 0o600 for p in staged.iterdir()))
        self.assertGreater(launch.SSH_TIMEOUT, launch.INSTALL_TIMEOUT + 130)

    def test_receiver_already_verified_requires_same_revision_and_explicit_no_paid(self):
        raw = json.dumps({'phase': 'ALREADY_VERIFIED', 'revision': launch.REVISION,
                          'paid_generation_requested': False}).encode()
        code, result, _, _ = self.receiver(raw=raw)
        self.assertEqual(code, 0); self.assertEqual(result, success())

    def test_receiver_filters_private_prefix_unknown_fields_and_output(self):
        raw = ('PRIVATE_CANARY path=/synthetic/private\n' + json.dumps(
            dict(success(), unknown='PRIVATE_CANARY'), indent=2) + '\n').encode()
        code, result, _, _ = self.receiver(raw=raw)
        self.assertEqual(code, 0); self.assertEqual(result, success())
        self.assertNotIn('PRIVATE_CANARY', str(result))

    def test_receiver_never_infers_success_from_exit_zero_or_marker_alone(self):
        variants = [b'', b'WORLDIFACT_PREBUILD_VERIFIED', b'PRIVATE_CANARY', b'x'*(launch.OUTPUT_LIMIT+1),
                    json.dumps(dict(success(), revision='wrong')).encode(),
                    json.dumps(dict(success(), paid_generation_requested=True)).encode(),
                    json.dumps(dict(success(), paid_generation_requested=0)).encode(),
                    json.dumps(dict(success(), phase='PLAN_ONLY')).encode(),
                    json.dumps(success()).encode()+b'\nPRIVATE_CANARY']
        for raw in variants:
            with self.subTest(raw_size=len(raw)):
                code, result, popen, _ = self.receiver(raw=raw)
            self.assertEqual(code, 1); self.assertEqual(result['phase'], 'WORLDIFACT_PREBUILD_NOT_CONFIRMED')
            self.assertNotIn('PRIVATE_CANARY', str(result)); popen.assert_called_once()

    def test_receiver_nonzero_or_signal_exit_cannot_claim_success(self):
        for returncode in (1, -signal.SIGTERM):
            with self.subTest(returncode=returncode):
                code, result, popen, _ = self.receiver(code=returncode)
            self.assertEqual(code, 1); self.assertEqual(result['phase'], 'WORLDIFACT_PREBUILD_NOT_CONFIRMED')
            popen.assert_called_once()

    def test_receiver_known_source_receipt_and_active_job_refusals_are_actionable(self):
        cases = [('STOP: A model job is active. Nothing is cancelled automatically.', 'ACTIVE_JOB'),
                 ('STOP: A job appeared before maintenance. No update applied.', 'ACTIVE_JOB'),
                 ('STOP: Unreviewed completion source: server.py; no service stopped.', 'SOURCE_REFUSED'),
                 ('STOP: Unknown existing prebuild helper; no overwrite.', 'SOURCE_REFUSED'),
                 ('STOP: Existing completion/runtime receipt is invalid.', 'RECEIPT_REFUSED'),
                 ('STOP: Unsafe prebuild receipt; no service stopped.', 'RECEIPT_REFUSED')]
        for line, expected in cases:
            with self.subTest(reason=expected):
                code, result, popen, _ = self.receiver(raw=(line+'\n').encode(), code=1)
            self.assertEqual(code, 1); self.assertEqual(result, failure(expected)); popen.assert_called_once()

    def test_receiver_reports_restoration_only_after_exact_final_confirmed_line(self):
        progress = 'Offline Codex/Blender verification in progress; this can take several minutes. No paid model request.\n'
        restored = 'STOP: Prebuild verification failed; previous working source restored.'
        code, result, popen, _ = self.receiver(raw=(progress+restored+'\n').encode(), code=1)
        self.assertEqual(code, 1)
        self.assertEqual(result, failure('VERIFICATION_ROLLED_BACK', 'OFFLINE_VERIFICATION', True))
        popen.assert_called_once()
        recovery = 'STOP: Recovery requires review; preserve private backups.'
        code, result, _, _ = self.receiver(raw=(progress+restored+'\n'+recovery+'\n').encode(), code=1)
        self.assertEqual(code, 1)
        self.assertEqual(result, failure('RECOVERY_REQUIRED', 'OFFLINE_VERIFICATION'))

    def test_receiver_untrusted_or_partial_errors_remain_unknown_and_redacted(self):
        restored = 'STOP: Prebuild verification failed; previous working source restored.'
        values = ['PRIVATE_CANARY', 'PRIVATE_CANARY '+restored, restored+' PRIVATE_CANARY',
                  restored+'\r\n', 'PRIVATE_CANARY\x1c'+restored,
                  restored+'\nPRIVATE_CANARY', 'STOP: Unreviewed completion source: PRIVATE_CANARY; no service stopped.']
        for raw in [value.encode() for value in values]+[b'\xff', b'x'*(launch.OUTPUT_LIMIT+1)]:
            with self.subTest(size=len(raw)):
                code, result, popen, _ = self.receiver(raw=raw, code=1)
            self.assertEqual(code, 1); self.assertEqual(result, failure()); popen.assert_called_once()
            self.assertNotIn('PRIVATE_CANARY', str(result))

    def test_receiver_bad_package_is_rejected_before_staging_or_execution(self):
        data, manifest = self.fixtures()
        entries = json.loads(base64.b64decode(self.payload(data, manifest)))
        values = [dict(entries, **{'install_prebuild.py': base64.b64encode(b'# changed').decode()}),
                  dict(entries, **{'../unexpected.py': base64.b64encode(b'# extra').decode()}),
                  {n: v for n, v in entries.items() if n != 'offline_cabinet.py'}]
        for entries in values:
            with self.subTest(count=len(entries)):
                payload = base64.b64encode(json.dumps(entries).encode()).decode()
                code, result, popen, _ = self.receiver(payload=payload, manifest=manifest)
            self.assertEqual(code, 1); popen.assert_not_called()
            self.assertEqual(result, failure('PACKAGE_REJECTED', 'PACKAGE'))
            self.assertFalse((self.home/'.local').exists())

    def test_receiver_symlink_staging_destination_is_rejected(self):
        outside = self.home/'outside'; outside.mkdir()
        (self.home/'.local').symlink_to(outside, target_is_directory=True)
        code, _, popen, _ = self.receiver()
        self.assertEqual(code, 1); popen.assert_not_called(); self.assertEqual(list(outside.iterdir()), [])

    def test_receiver_timeout_allows_rollback_once_without_retry(self):
        data, manifest = self.fixtures(); output = io.StringIO()
        process = types.SimpleNamespace(wait=unittest.mock.Mock(side_effect=[subprocess.TimeoutExpired('fixture', 1), 0]),
                                        poll=lambda: None, send_signal=unittest.mock.Mock(), kill=unittest.mock.Mock())
        with patch.object(launch, 'FILES', manifest), patch.object(Path, 'home', return_value=self.home), \
                patch.object(subprocess, 'Popen', return_value=process) as popen, patch.object(signal, 'signal'), \
                contextlib.redirect_stdout(output), self.assertRaises(SystemExit) as stopped:
            exec(compile(launch.script(self.payload(data, manifest), approved=True), '<receiver>', 'exec'), {})
        self.assertEqual(stopped.exception.code, 1); popen.assert_called_once()
        process.send_signal.assert_called_once_with(signal.SIGTERM)
        self.assertEqual(process.wait.call_args_list[0].kwargs, {'timeout': launch.INSTALL_TIMEOUT})
        self.assertEqual(process.wait.call_args_list[1].kwargs, {'timeout': 120})
        process.kill.assert_not_called()
        self.assertNotIn('WORLDIFACT_PREBUILD_VERIFIED', output.getvalue())
        self.assertEqual(json.loads(output.getvalue()), failure('TIMEOUT'))

    def test_timeout_restoration_true_requires_confirmed_rollback_output(self):
        namespace = {'json': json, 'REVISION': launch.REVISION, 'OUTPUT_LIMIT': launch.OUTPUT_LIMIT}
        exec(launch.SAFE_RESULT_CODE, namespace)
        restored = b'STOP: Prebuild verification failed; previous working source restored.\n'
        self.assertEqual(namespace['installer_failure'](restored, 'INSTALLER', 'TIMEOUT'), failure('TIMEOUT', restored=True))
        self.assertEqual(namespace['installer_failure'](b'PRIVATE_CANARY', 'INSTALLER', 'TIMEOUT'), failure('TIMEOUT'))

    def test_receiver_relays_signal_and_suppresses_success(self):
        handlers = {}
        def wait(**_):
            handlers[signal.SIGTERM](signal.SIGTERM, None)
            return 0
        code, result, popen, _ = self.receiver(wait=wait, handlers=handlers)
        self.assertEqual(code, 1); self.assertEqual(result['phase'], 'WORLDIFACT_PREBUILD_NOT_CONFIRMED')
        self.assertEqual(result, failure('INTERRUPTED'))
        popen.assert_called_once()

    def test_ssh_invocation_is_once_bounded_and_raw_stderr_suppressed(self):
        observed = types.SimpleNamespace(returncode=0, stdout=json.dumps(success()))
        with patch.object(subprocess, 'run', return_value=observed) as run:
            self.assertEqual(launch.invoke(['ssh', 'fixture'], 'program'), success())
        run.assert_called_once_with(['ssh', 'fixture'], input='program', text=True, stdout=subprocess.PIPE,
                                    stderr=subprocess.DEVNULL, timeout=launch.SSH_TIMEOUT)

    def test_ssh_private_error_malformed_or_unconfirmed_output_never_leaks(self):
        results = [types.SimpleNamespace(returncode=0, stdout='PRIVATE_CANARY'),
                   types.SimpleNamespace(returncode=1, stdout=json.dumps(success())),
                   types.SimpleNamespace(returncode=0, stdout=json.dumps(dict(success(), extra='PRIVATE_CANARY'))),
                   types.SimpleNamespace(returncode=0, stdout='x'*(launch.OUTPUT_LIMIT+1)),
                   subprocess.TimeoutExpired('PRIVATE_CANARY', 1), OSError('PRIVATE_CANARY'), KeyboardInterrupt()]
        for value in results:
            options = {'side_effect': value} if isinstance(value, BaseException) else {'return_value': value}
            with self.subTest(kind=type(value).__name__), patch.object(subprocess, 'run', **options) as run, \
                    self.assertRaises(launch.LaunchError) as failure:
                launch.invoke(['ssh', 'fixture'], 'program')
            self.assertNotIn('PRIVATE_CANARY', str(failure.exception)); run.assert_called_once()

    def test_ssh_accepts_only_exact_safe_failure_json_with_exit_one(self):
        value = failure('VERIFICATION_ROLLED_BACK', 'OFFLINE_VERIFICATION', True)
        with patch.object(subprocess, 'run', return_value=types.SimpleNamespace(returncode=1, stdout=json.dumps(value))) as run:
            self.assertEqual(launch.invoke(['ssh', 'fixture'], 'program'), value)
        run.assert_called_once()
        bad = [dict(value, failure_code='PRIVATE_CANARY'), dict(value, failure_phase='PRIVATE_CANARY'),
               dict(value, previous_source_restored=False), dict(value, previous_source_restored=1),
               dict(value, failure_code='SOURCE_REFUSED'), dict(value, paid_generation_requested=0),
               dict(value, private='PRIVATE_CANARY')]
        for observed in bad:
            with self.subTest(keys=list(observed)), patch.object(subprocess, 'run',
                    return_value=types.SimpleNamespace(returncode=1, stdout=json.dumps(observed))), \
                    self.assertRaises(launch.LaunchError) as caught:
                launch.invoke(['ssh', 'fixture'], 'program')
            self.assertNotIn('PRIVATE_CANARY', str(caught.exception))
        for code in (0, 255, -signal.SIGTERM):
            with self.subTest(code=code), patch.object(subprocess, 'run',
                    return_value=types.SimpleNamespace(returncode=code, stdout=json.dumps(value))), \
                    self.assertRaises(launch.LaunchError):
                launch.invoke(['ssh', 'fixture'], 'program')

    def test_main_prints_safe_stop_reason_and_exits_one_without_retry(self):
        result = failure('SOURCE_REFUSED')
        with patch.object(launch, 'package', return_value='payload'), \
                patch.object(launch, 'connection', return_value=['ssh', 'fixture']), \
                patch.object(launch, 'invoke', return_value=result) as invoke, \
                contextlib.redirect_stdout(io.StringIO()) as output, self.assertRaises(SystemExit) as stopped:
            launch.main(['--source-commit', COMMIT, '--approve-service-restart'])
        self.assertEqual(stopped.exception.code, 1); invoke.assert_called_once()
        self.assertEqual(json.loads(output.getvalue().splitlines()[-1]), result)

    def test_main_verifies_all_bytes_before_connection_and_invokes_once(self):
        order = []
        with patch.object(launch, 'package', side_effect=lambda c: order.append(('package', c)) or 'payload'), \
                patch.object(launch, 'connection', side_effect=lambda: order.append(('connection',)) or ['ssh', 'fixture']), \
                patch.object(launch, 'invoke', return_value=success()) as invoke, \
                contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(launch.main(['--source-commit', COMMIT, '--approve-service-restart']), success())
        self.assertEqual(order, [('package', COMMIT), ('connection',)])
        invoke.assert_called_once_with(['ssh', 'fixture'], launch.script('payload', approved=True))
        self.assertIn('WORLDIFACT_PREBUILD_VERIFIED', output.getvalue())


if __name__ == '__main__':
    unittest.main()
