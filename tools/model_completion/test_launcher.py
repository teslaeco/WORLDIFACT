"""No-network package and strict-SSH regression tests for model completion."""
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

_spec = importlib.util.spec_from_file_location('model_completion_launcher', Path(__file__).with_name('oracle_launch.py'))
launch = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(launch)


COMMIT = '0123456789abcdef0123456789abcdef01234567'
JOB_UUID = '12345678-1234-4234-8234-123456789abc'


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

    def execute_remote(self, payload, manifest, process, approved=True, diagnose_job=None):
        output = io.StringIO()
        with patch.object(launch, 'FILES', manifest), \
                patch.object(Path, 'home', return_value=self.home), \
                patch.object(subprocess, 'Popen', return_value=process) as popen, \
                patch.object(signal, 'signal'), contextlib.redirect_stdout(output):
            exec(compile(launch.script(payload, approved=approved, diagnose_job=diagnose_job), '<remote>', 'exec'), {'__name__': 'fixture'})
        return output.getvalue(), popen

    def test_plan_only_has_no_download_oci_ssh_or_install(self):
        for args in ([], ['--source-commit', COMMIT]):
            with self.subTest(args=args), patch.object(launch, 'connection') as connection, \
                    patch.object(launch, 'package') as package, \
                    patch.object(subprocess, 'run') as run, \
                    patch.object(launch.urllib.request, 'build_opener') as opener, \
                    contextlib.redirect_stdout(io.StringIO()) as output:
                launch.main(args)
            self.assertIn('PLAN ONLY', output.getvalue())
            connection.assert_not_called()
            package.assert_not_called()
            run.assert_not_called()
            opener.assert_not_called()

    def test_approval_requires_exact_commit_before_oci_or_network(self):
        for value in (None, '', 'main', 'v1.0', 'a' * 39, 'a' * 41, 'g' * 40,
                      '../' + 'a' * 40, COMMIT + '?token=CANARY', 'https://example.com/' + COMMIT):
            args = ['--approve-service-restart']
            if value is not None:
                args += ['--source-commit', value]
            with self.subTest(value=value), patch.object(launch, 'connection') as connection, \
                    patch.object(launch, 'package') as package, \
                    patch.object(subprocess, 'run') as run, \
                    self.assertRaises(launch.LaunchError):
                launch.main(args)
            connection.assert_not_called()
            package.assert_not_called()
            run.assert_not_called()
        self.assertEqual(launch.source_commit(COMMIT.upper()), COMMIT)

    def test_diagnostic_requires_valid_uuid_and_exact_commit_before_network(self):
        for args in (['--diagnose-job', JOB_UUID],
                     ['--source-commit', COMMIT, '--diagnose-job', 'not-a-uuid'],
                     ['--source-commit', COMMIT, '--diagnose-job', JOB_UUID + '/../../config.json']):
            with self.subTest(args=args), patch.object(launch, 'connection') as connection, \
                    patch.object(launch, 'package') as package, self.assertRaises(launch.LaunchError):
                launch.main(args)
            connection.assert_not_called()
            package.assert_not_called()
        self.assertEqual(launch.job_uuid(JOB_UUID.upper()), JOB_UUID)
        with self.assertRaises(launch.LaunchError):
            launch.script('payload')

    def test_diagnostic_cli_never_adds_maintenance_approval(self):
        with patch.object(launch, 'connection', return_value=['ssh', 'fixture']), \
                patch.object(launch, 'package', return_value='payload') as package, \
                patch.object(launch, 'script', return_value='remote') as script, \
                patch.object(subprocess, 'run', return_value=types.SimpleNamespace(returncode=0)), \
                contextlib.redirect_stdout(io.StringIO()):
            launch.main(['--source-commit', COMMIT, '--diagnose-job', JOB_UUID])
        package.assert_called_once_with(COMMIT)
        script.assert_called_once_with('payload', approved=False, diagnose_job=JOB_UUID, stage_test_helper=False)

    def test_maintenance_launcher_cannot_invoke_separately_approved_paid_helper(self):
        for maintenance in ([], ['--approve-service-restart'], ['--stage-test-helper']):
            with self.subTest(maintenance=maintenance), patch.object(launch, 'connection') as connection, \
                    patch.object(launch, 'package') as package, \
                    contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as stopped:
                launch.main(['--source-commit', COMMIT, *maintenance, '--approve-paid-test', 'STAGED_ONLY'])
            self.assertEqual(stopped.exception.code, 2)
            connection.assert_not_called()
            package.assert_not_called()

    def test_stage_helper_requires_exact_commit_and_is_exclusive(self):
        cases = [(['--stage-test-helper'], launch.LaunchError),
                 (['--source-commit', COMMIT, '--stage-test-helper', '--approve-service-restart'], launch.LaunchError),
                 (['--source-commit', COMMIT, '--stage-test-helper', '--diagnose-job', JOB_UUID], launch.LaunchError)]
        for args, error in cases:
            with self.subTest(args=args), patch.object(launch, 'connection') as connection, \
                    patch.object(launch, 'package') as package, self.assertRaises(error):
                launch.main(args)
            connection.assert_not_called()
            package.assert_not_called()
        for flags in ({'approved': True}, {'diagnose_job': JOB_UUID}):
            with self.subTest(flags=flags), self.assertRaises(launch.LaunchError):
                launch.script('payload', stage_test_helper=True, **flags)

    def test_stage_helper_cli_requests_only_staging(self):
        with patch.object(launch, 'connection', return_value=['ssh', 'fixture']), \
                patch.object(launch, 'package', return_value='payload') as package, \
                patch.object(launch, 'script', return_value='remote') as script, \
                patch.object(subprocess, 'run', return_value=types.SimpleNamespace(returncode=0)) as run, \
                contextlib.redirect_stdout(io.StringIO()):
            launch.main(['--source-commit', COMMIT, '--stage-test-helper'])
        package.assert_called_once_with(COMMIT)
        script.assert_called_once_with('payload', approved=False, diagnose_job=None, stage_test_helper=True)
        self.assertEqual(run.call_args.kwargs['input'], 'remote')

    def test_package_contains_only_pinned_compiled_python_without_key(self):
        data, manifest = self.fixtures()
        with patch.object(launch, 'FILES', manifest):
            payload = launch.package(COMMIT, lambda path: data[path])
        decoded = json.loads(base64.b64decode(payload))
        self.assertEqual(set(decoded), set(manifest))
        for name, (path, _) in manifest.items():
            self.assertEqual(base64.b64decode(decoded[name]), data[path])
        self.assertNotIn('PRIVATE_CANARY', payload)
        self.assertNotIn(str(self.key), payload)

    def test_repository_package_matches_every_frozen_git_blob(self):
        root = Path(__file__).resolve().parents[2]
        payload = launch.package(COMMIT, lambda path: (root / path).read_bytes())
        self.assertEqual(set(json.loads(base64.b64decode(payload))), set(launch.FILES))
        self.assertIn('install_completion.py', launch.FILES)
        self.assertIn('reviewed_direct_export.py', launch.FILES)
        self.assertIn('test_original_job_once.py', launch.FILES)
        self.assertNotIn('source_fixture.py', launch.FILES)

    def test_flat_package_imports_and_default_installer_stays_plan_only(self):
        root = Path(__file__).resolve().parents[2]
        payload = json.loads(base64.b64decode(launch.package(COMMIT, lambda path: (root / path).read_bytes())))
        with tempfile.TemporaryDirectory() as folder:
            directory = Path(folder)
            for name, encoded in payload.items():
                (directory / name).write_bytes(base64.b64decode(encoded))
            for entry, marker in (('install_completion.py', 'PLAN ONLY'),
                                  ('test_original_job_once.py', 'PLAN_ONLY')):
                with self.subTest(entry=entry):
                    answer = subprocess.run([launch.sys.executable, '-B', str(directory / entry)],
                                            cwd=directory, stdin=subprocess.DEVNULL, capture_output=True,
                                            text=True, timeout=10)
                    self.assertEqual(answer.returncode, 0, answer.stderr)
                    self.assertIn(marker, answer.stdout)
                    self.assertNotIn('WORLDIFACT_MODEL_COMPLETION_VERIFIED', answer.stdout)
                    if entry == 'test_original_job_once.py':
                        self.assertIs(json.loads(answer.stdout)['paidGenerationRequested'], False)

    def test_bad_package_bytes_fail_before_any_ssh(self):
        for raw in (b'', b'changed', b'x' * (launch.LIMIT + 1), 'not bytes'):
            with self.subTest(raw_type=type(raw).__name__), patch.object(subprocess, 'run') as run, \
                    self.assertRaises(launch.LaunchError):
                launch.package(COMMIT, lambda _: raw)
            run.assert_not_called()

    def test_matching_checksum_does_not_skip_python_compilation(self):
        raw = b'def broken(:\n'
        manifest = {'install_completion.py': ('tools/model_completion/install_completion.py', launch.blob(raw))}
        with patch.object(launch, 'FILES', manifest), self.assertRaises(launch.LaunchError):
            launch.package(COMMIT, lambda _: raw)

    def test_download_is_exact_commit_allowlist_bounded_and_redirect_free(self):
        path = launch.FILES['install_completion.py'][0]
        response = types.SimpleNamespace(status=200, read=lambda limit: b'# package\n')
        opened = contextlib.nullcontext(response)
        with patch.object(launch.urllib.request, 'build_opener') as opener:
            opener.return_value.open.return_value = opened
            self.assertEqual(launch.read_public(COMMIT, path), b'# package\n')
        opener.return_value.open.assert_called_once_with(launch.PUBLIC_ROOT + COMMIT + '/' + path, timeout=30)
        self.assertIsInstance(opener.call_args.args[1], launch.NoRedirect)
        self.assertEqual(opener.call_args.args[0].proxies, {})
        self.assertIsNone(launch.NoRedirect().redirect_request(None, None, None, None, None, None))
        with patch.object(launch.urllib.request, 'build_opener') as opener, self.assertRaises(launch.LaunchError):
            launch.read_public(COMMIT, 'tools/model_completion/../../credentials')
        opener.assert_not_called()

    def test_connection_uses_original_key_only_exact_vm_and_strict_host(self):
        with patch.object(launch, 'lookup', side_effect=['ocid1.instance.valid', '8.8.8.8']) as lookup, \
                patch.object(Path, 'read_bytes', side_effect=AssertionError('Never read the key')), \
                patch.object(Path, 'read_text', side_effect=AssertionError('Never read the key')):
            args = launch.connection(self.home)
        self.assertIn('StrictHostKeyChecking=yes', args)
        self.assertIn('IdentitiesOnly=yes', args)
        self.assertIn('BatchMode=yes', args)
        self.assertEqual(args[args.index('-F') + 1], '/dev/null')
        self.assertEqual(args[args.index('-i') + 1], str(self.key))
        self.assertIn('opc@8.8.8.8', args)
        self.assertNotIn('PRIVATE_CANARY', str(args))
        self.assertIn('eu-amsterdam-1', lookup.call_args_list[0].args[0])
        self.assertIn("query instance resources where displayName = 'froge-blender' && lifeCycleState = 'RUNNING'",
                      lookup.call_args_list[0].args[0])
        self.assertEqual(len(lookup.call_args_list), 2)

    def test_missing_key_and_symlink_key_stop_before_oci(self):
        self.key.unlink()
        with patch.object(launch, 'lookup') as lookup, self.assertRaises(launch.LaunchError):
            launch.connection(self.home)
        lookup.assert_not_called()
        other = self.home / 'other.key'
        other.write_text('DO_NOT_USE')
        self.key.symlink_to(other)
        with patch.object(launch, 'lookup') as lookup, self.assertRaises(launch.LaunchError):
            launch.connection(self.home)
        lookup.assert_not_called()

    def test_symlink_home_stops_before_oci(self):
        linked = self.home / 'home-link'
        linked.symlink_to(self.home, target_is_directory=True)
        with patch.object(launch, 'lookup') as lookup, self.assertRaises(launch.LaunchError):
            launch.connection(linked)
        lookup.assert_not_called()

    def test_invalid_instance_and_non_public_addresses_stop_without_ssh(self):
        cases = [('not-an-instance', '8.8.8.8'), ('ocid1.instance.valid', '127.0.0.1'),
                 ('ocid1.instance.valid', '10.0.0.1'), ('ocid1.instance.valid', 'example.com'),
                 ('ocid1.instance.valid', '-oProxyCommand=command'),
                 ('ocid1.instance.valid', '224.0.0.1'),
                 ('ocid1.instance.valid', '2001:4860:4860::8888%eth0')]
        for instance, address in cases:
            with self.subTest(instance=instance, address=address), \
                    patch.object(launch, 'lookup', side_effect=[instance, address]), \
                    patch.object(subprocess, 'run') as run, self.assertRaises(launch.LaunchError):
                launch.connection(self.home)
            run.assert_not_called()

    def test_ambiguous_oci_lookup_never_selects_arbitrary_vm(self):
        for stdout in ('[]', '["one", "two"]', '{"id": "one"}', '[null]', 'not JSON'):
            result = types.SimpleNamespace(returncode=0, stdout=stdout)
            with self.subTest(stdout=stdout), patch.object(subprocess, 'run', return_value=result), \
                    self.assertRaises(launch.LaunchError):
                launch.lookup(['oci', 'fixture'])

    def test_receiver_runs_only_completion_installer_with_approval(self):
        data, manifest = self.fixtures()
        process = types.SimpleNamespace(wait=lambda: 0, poll=lambda: 0, send_signal=lambda _: None)
        output, popen = self.execute_remote(self.payload(data, manifest), manifest, process)
        args = popen.call_args.args[0]
        self.assertEqual(Path(args[2]).name, 'install_completion.py')
        self.assertNotIn('test_original_job_once.py', ' '.join(args))
        self.assertEqual(args[-1], '--approve-service-restart')
        self.assertEqual(popen.call_args.kwargs['stdin'], subprocess.DEVNULL)
        self.assertIn('WORLDIFACT_MODEL_COMPLETION_VERIFIED', output)
        self.assertIn('Paid generation NOT RUN', output)
        self.assertNotIn('PRIVATE_CANARY', output)
        staged = Path(args[2]).parent
        self.assertEqual({p.name for p in staged.iterdir()}, set(manifest))
        self.assertEqual(staged.stat().st_mode & 0o777, 0o700)
        self.assertTrue(all(p.stat().st_mode & 0o777 == 0o600 for p in staged.iterdir()))

    def test_receiver_diagnostic_passes_only_explicit_uuid_without_restart(self):
        data, manifest = self.fixtures()
        process = types.SimpleNamespace(wait=lambda: 0, poll=lambda: 0, send_signal=lambda _: None)
        output, popen = self.execute_remote(self.payload(data, manifest), manifest, process,
                                           approved=False, diagnose_job=JOB_UUID)
        args = popen.call_args.args[0]
        self.assertEqual(args[-2:], ['--diagnose-job', JOB_UUID])
        self.assertNotIn('--approve-service-restart', args)
        self.assertEqual(Path(args[2]).name, 'install_completion.py')
        self.assertNotIn('test_original_job_once.py', ' '.join(args))
        self.assertIn('WORLDIFACT_MODEL_COMPLETION_DIAGNOSTIC_COMPLETE', output)
        self.assertNotIn('WORLDIFACT_MODEL_COMPLETION_VERIFIED', output)

    def test_receiver_combined_operation_passes_both_explicit_flags(self):
        data, manifest = self.fixtures()
        process = types.SimpleNamespace(wait=lambda: 0, poll=lambda: 0, send_signal=lambda _: None)
        output, popen = self.execute_remote(self.payload(data, manifest), manifest, process,
                                           approved=True, diagnose_job=JOB_UUID)
        self.assertEqual(popen.call_args.args[0][-3:], ['--approve-service-restart', '--diagnose-job', JOB_UUID])
        self.assertEqual(Path(popen.call_args.args[0][2]).name, 'install_completion.py')
        self.assertNotIn('test_original_job_once.py', ' '.join(popen.call_args.args[0]))
        self.assertIn('WORLDIFACT_MODEL_COMPLETION_VERIFIED', output)

    def test_receiver_stage_only_prints_private_safe_helper_path_without_execution(self):
        data, manifest = self.fixtures()
        path, _ = manifest['test_original_job_once.py']
        data[path] = b'raise AssertionError("STAGED_HELPER_MUST_NOT_EXECUTE")\n'
        manifest['test_original_job_once.py'] = (path, launch.blob(data[path]))
        output = io.StringIO()
        with patch.object(launch, 'FILES', manifest), \
                patch.object(Path, 'home', return_value=self.home), \
                patch.object(subprocess, 'Popen') as popen, \
                patch.object(subprocess, 'run') as run, \
                patch.object(launch.urllib.request, 'build_opener') as network, \
                patch.object(signal, 'signal') as handlers, \
                contextlib.redirect_stdout(output), self.assertRaises(SystemExit) as stopped:
            script = launch.script(self.payload(data, manifest), stage_test_helper=True)
            exec(compile(script, '<remote>', 'exec'), {'__name__': 'fixture'})
        self.assertEqual(stopped.exception.code, 0)
        popen.assert_not_called()
        run.assert_not_called()
        network.assert_not_called()
        handlers.assert_not_called()
        summary = json.loads(output.getvalue())
        self.assertEqual(summary['phase'], 'WORLDIFACT_MODEL_TEST_HELPER_STAGED')
        self.assertIs(summary['paid_generation_requested'], False)
        self.assertIs(summary['service_restarted'], False)
        helper = Path(summary['helper_path'])
        parent = self.home / '.local/state/worldifact-astra-guard'
        self.assertEqual(helper.parent.parent, parent)
        self.assertEqual(helper.name, 'test_original_job_once.py')
        self.assertTrue(helper.parent.name.startswith('model-completion-package-'))
        self.assertEqual(helper.read_bytes(), data[path])
        self.assertEqual(helper.stat().st_mode & 0o777, 0o600)
        self.assertEqual(helper.parent.stat().st_mode & 0o777, 0o700)
        self.assertFalse(helper.is_symlink())
        self.assertEqual({p.name for p in helper.parent.iterdir()}, set(manifest))
        self.assertFalse((self.home / 'froge-connector').exists())
        self.assertNotIn('WORLDIFACT_MODEL_COMPLETION_VERIFIED', output.getvalue())

    def test_receiver_stage_only_rejects_symlink_destination(self):
        data, manifest = self.fixtures()
        outside = self.home / 'outside'
        outside.mkdir()
        (self.home / '.local').symlink_to(outside, target_is_directory=True)
        with patch.object(launch, 'FILES', manifest), \
                patch.object(Path, 'home', return_value=self.home), \
                patch.object(subprocess, 'Popen') as popen, self.assertRaises(SystemExit):
            script = launch.script(self.payload(data, manifest), stage_test_helper=True)
            exec(compile(script, '<remote>', 'exec'), {'__name__': 'fixture'})
        popen.assert_not_called()
        self.assertEqual(list(outside.iterdir()), [])

    def test_receiver_rejects_changed_bytes_or_extra_names_before_staging(self):
        data, manifest = self.fixtures()
        contents = json.loads(base64.b64decode(self.payload(data, manifest)))
        mutated = [dict(contents, **{'install_completion.py': base64.b64encode(b'# tampered').decode()}),
                   dict(contents, **{'test_original_job_once.py': base64.b64encode(b'# tampered helper').decode()}),
                   dict(contents, **{'../unexpected.py': base64.b64encode(b'# unexpected').decode()})]
        for flags in ({'approved': True}, {'stage_test_helper': True}):
            for value in mutated:
                with self.subTest(flags=flags, keys=list(value)), patch.object(launch, 'FILES', manifest), \
                        patch.object(Path, 'home', return_value=self.home), \
                        patch.object(subprocess, 'Popen') as popen, self.assertRaises(SystemExit):
                    exec(compile(launch.script(base64.b64encode(json.dumps(value).encode()).decode(), **flags),
                                 '<remote>', 'exec'), {'__name__': 'fixture'})
                popen.assert_not_called()
                self.assertFalse((self.home / '.local').exists())

    def test_receiver_failure_never_claims_success(self):
        data, manifest = self.fixtures()
        for code in (1, -signal.SIGTERM):
            process = types.SimpleNamespace(wait=lambda: code, poll=lambda: code, send_signal=lambda _: None)
            output = io.StringIO()
            with self.subTest(code=code), patch.object(launch, 'FILES', manifest), \
                    patch.object(Path, 'home', return_value=self.home), \
                    patch.object(subprocess, 'Popen', return_value=process), \
                    patch.object(signal, 'signal'), contextlib.redirect_stdout(output), self.assertRaises(SystemExit):
                exec(compile(launch.script(self.payload(data, manifest), approved=True), '<remote>', 'exec'), {'__name__': 'fixture'})
            self.assertNotIn('WORLDIFACT_MODEL_COMPLETION_VERIFIED', output.getvalue())
            self.assertIn('WORLDIFACT_MODEL_COMPLETION_NOT_CONFIRMED', output.getvalue())

    def test_receiver_rejects_symlink_staging_parent_without_starting_installer(self):
        data, manifest = self.fixtures()
        outside = self.home / 'outside'
        outside.mkdir()
        (self.home / '.local').symlink_to(outside, target_is_directory=True)
        with patch.object(launch, 'FILES', manifest), \
                patch.object(Path, 'home', return_value=self.home), \
                patch.object(subprocess, 'Popen') as popen, self.assertRaises(SystemExit):
            exec(compile(launch.script(self.payload(data, manifest), approved=True), '<remote>', 'exec'), {'__name__': 'fixture'})
        popen.assert_not_called()
        self.assertEqual(list(outside.iterdir()), [])

    def test_receiver_relays_interrupt_and_never_claims_success(self):
        data, manifest = self.fixtures()
        handlers, sent = {}, []
        def wait():
            handlers[signal.SIGTERM](signal.SIGTERM, None)
            return 0
        process = types.SimpleNamespace(wait=wait, poll=lambda: None, send_signal=sent.append)
        output = io.StringIO()
        with patch.object(launch, 'FILES', manifest), \
                patch.object(Path, 'home', return_value=self.home), \
                patch.object(subprocess, 'Popen', return_value=process), \
                patch.object(signal, 'signal', side_effect=lambda signum, handler: handlers.update({signum: handler})), \
                contextlib.redirect_stdout(output), self.assertRaises(SystemExit):
            exec(compile(launch.script(self.payload(data, manifest), approved=True), '<remote>', 'exec'), {'__name__': 'fixture'})
        self.assertEqual(sent, [signal.SIGTERM])
        self.assertNotIn('WORLDIFACT_MODEL_COMPLETION_VERIFIED', output.getvalue())
        self.assertIn('WORLDIFACT_MODEL_COMPLETION_NOT_CONFIRMED', output.getvalue())

    def test_approved_cli_passes_exact_commit_and_rejects_ssh_failure(self):
        with patch.object(launch, 'connection', return_value=['ssh', 'fixture']) as connection, \
                patch.object(launch, 'package', return_value='fixture') as package, \
                patch.object(subprocess, 'run', return_value=types.SimpleNamespace(returncode=1)) as run, \
                contextlib.redirect_stdout(io.StringIO()), self.assertRaises(launch.LaunchError):
            launch.main(['--source-commit', COMMIT, '--approve-service-restart'])
        connection.assert_called_once_with()
        package.assert_called_once_with(COMMIT)
        self.assertEqual(run.call_args.args[0], ['ssh', 'fixture'])
        self.assertEqual(run.call_args.kwargs['input'], launch.script('fixture', approved=True))


if __name__ == '__main__':
    unittest.main()
