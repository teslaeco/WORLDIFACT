"""Offline wrapper tests. Synthetic private parameters; no OCI/SSH/provider."""
import base64
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import types
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('original_test_wrapper', Path(__file__).with_name('oracle_original_test_once.py'))
wrapper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(wrapper)

COMMIT = '0123456789abcdef0123456789abcdef01234567'
SOURCE = '11111111-2222-4333-8444-555555555555'
TEST = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
HASH = 'b' * 64
CANARY = 'PRIVATE_PROMPT_REFERENCE_FILENAME_TOKEN_CANARY'
PRIVATE = {'approval': wrapper.APPROVAL, 'source_job': SOURCE, 'test_job': TEST,
           'expected_original_artifact_sha256': HASH}


def result(state='failed', submitted=True):
    value = {'jobId': TEST, 'state': state, 'result': 'JOB_DID_NOT_COMPLETE',
             'submittedThisRun': submitted, 'automaticPostRetries': 0, 'maximumProviderReservationUsd': 1.75,
             'actualInvoiceUsd': None, 'taxUsd': None, 'customerCharges': 0, 'customerPointsDebited': 0,
             'visualQuality': 'REQUIRES_HUMAN_REVIEW', 'manufacturingApproval': False}
    if state == 'succeeded':
        value.update(result='VERIFIED_MODEL_READY_FOR_VISUAL_REVIEW', glb={'bytes': 100, 'sha256': 'c' * 64},
                     geometry={'triangles': 20000}, hostModelStatus='reviewed', structuralCompletionChecked=True)
    elif state == 'absent':
        value['result'] = 'FIXED_JOB_ABSENT_NO_RETRY'
    elif state not in ('failed', 'cancelled'):
        value['result'] = 'JOB_STILL_RUNNING'
    return value


def fixtures(behavior=None):
    behavior = ('return ' + repr(result())) if behavior is None else behavior
    helper = ("APPROVAL = " + repr(wrapper.APPROVAL) + "\nCALLS = []\ndef run(root, **kwargs):\n"
              "    CALLS.append((str(root), kwargs))\n    print(" + repr(CANARY) + ")\n    " + behavior + '\n').encode()
    files = {'test_original_job_once.py': helper, 'install_completion.py': b'raise AssertionError("INSTALLER_MUST_NOT_EXECUTE")\n'}
    files.update({'fixture_%d.py' % i: b'raise AssertionError("PACKAGE_IMPORT_FORBIDDEN")\n' for i in range(14)})
    expected = {name: wrapper.blob(raw) for name, raw in files.items()}
    payload = base64.b64encode(json.dumps({name: base64.b64encode(raw).decode() for name, raw in files.items()}).encode()).decode()
    return files, expected, payload


class WrapperTests(unittest.TestCase):
    def approved_args(self):
        return ['--source-commit', COMMIT, '--approve-paid-test', wrapper.APPROVAL, '--source-job', SOURCE,
                '--test-job', TEST, '--expected-original-artifact-sha256', HASH]

    def test_default_has_no_reads_network_or_subprocess(self):
        for args in ([], ['--source-commit', COMMIT], ['--source-job', SOURCE, '--test-job', TEST]):
            with self.subTest(args=args), patch.object(wrapper, 'reviewed_package') as package, \
                    patch.object(wrapper.urllib.request, 'build_opener') as network, \
                    patch.object(subprocess, 'run') as run, patch('builtins.open') as read, \
                    contextlib.redirect_stdout(io.StringIO()) as output:
                self.assertEqual(wrapper.main(args), {'phase': 'PLAN_ONLY', 'paidGenerationRequested': False})
            package.assert_not_called(); network.assert_not_called(); run.assert_not_called(); read.assert_not_called()
            self.assertNotIn(SOURCE, output.getvalue())

    def test_missing_or_invalid_parameters_stop_before_any_download_or_lookup(self):
        cases = [(None, wrapper.APPROVAL, SOURCE, TEST, HASH), ('main', wrapper.APPROVAL, SOURCE, TEST, HASH),
                 (COMMIT, 'maintenance-is-not-paid-approval', SOURCE, TEST, HASH),
                 (COMMIT, wrapper.APPROVAL, None, TEST, HASH), (COMMIT, wrapper.APPROVAL, SOURCE, SOURCE, HASH),
                 (COMMIT, wrapper.APPROVAL, SOURCE.upper().replace('1111', 'AAAA', 1), TEST, HASH),
                 (COMMIT, wrapper.APPROVAL, SOURCE, TEST, None), (COMMIT, wrapper.APPROVAL, SOURCE, TEST, 'not-a-hash')]
        for values in cases:
            with self.subTest(values=values), patch.object(wrapper, 'read_launcher') as reader, self.assertRaises(wrapper.LaunchError):
                wrapper.parameters(*values)
            reader.assert_not_called()
        with patch.object(wrapper, 'reviewed_package') as package, self.assertRaises(wrapper.LaunchError):
            wrapper.main(['--approve-paid-test', wrapper.APPROVAL])
        package.assert_not_called()

    def test_maintenance_cancel_and_retry_options_are_not_available(self):
        for option in ('--approve-service-restart', '--stage-test-helper', '--cancel', '--retry', '--status'):
            with self.subTest(option=option), patch.object(wrapper, 'reviewed_package') as package, \
                    contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
                wrapper.main(self.approved_args() + [option])
            package.assert_not_called()

    def test_invalid_cli_arguments_do_not_echo_private_parameters(self):
        with patch.object(wrapper, 'reviewed_package') as package, contextlib.redirect_stderr(io.StringIO()) as output, \
                self.assertRaises(SystemExit) as stopped:
            wrapper.main(self.approved_args() + ['--private-extra', CANARY])
        self.assertEqual(stopped.exception.code, 2)
        self.assertNotIn(CANARY, output.getvalue())
        self.assertNotIn(SOURCE, output.getvalue())
        self.assertNotIn(HASH, output.getvalue())
        package.assert_not_called()

    def test_loader_download_is_bounded_no_proxy_no_redirect_and_exact_commit(self):
        raw = b'# inert loader fixture\n'
        response = types.SimpleNamespace(status=200, read=lambda limit: raw)
        with patch.object(wrapper, 'LAUNCHER_BLOB', wrapper.blob(raw)), patch.object(wrapper.urllib.request, 'build_opener') as build:
            build.return_value.open.return_value = contextlib.nullcontext(response)
            self.assertEqual(wrapper.read_launcher(COMMIT), raw)
        self.assertEqual(build.call_args.args[0].proxies, {})
        self.assertIsInstance(build.call_args.args[1], wrapper.NoRedirect)
        build.return_value.open.assert_called_once_with(wrapper.PUBLIC_ROOT + COMMIT + '/' + wrapper.LAUNCHER_PATH, timeout=30)
        self.assertIsNone(wrapper.NoRedirect().redirect_request(None, None, None, None, None, None))

    def test_unverified_loader_cannot_execute(self):
        raw = b'raise AssertionError("NEVER_EXECUTE_UNVERIFIED_LOADER")\n'
        with patch.object(wrapper, 'read_launcher', return_value=raw), \
                patch.object(wrapper, 'exec', create=True) as execute, self.assertRaises(wrapper.LaunchError):
            wrapper.reviewed_package(COMMIT)
        execute.assert_not_called()

    def test_all_package_bytes_compile_and_match_before_script_creation(self):
        files, expected, payload = fixtures()
        with patch.object(wrapper, 'HELPER_BLOB', expected[wrapper.HELPER_NAME]):
            self.assertEqual(wrapper.validate_package(payload, expected), files)
            changed = dict(expected, **{wrapper.HELPER_NAME: '0' * 40})
            with self.assertRaises(wrapper.LaunchError): wrapper.validate_package(payload, changed)
            entries = json.loads(base64.b64decode(payload))
            entries['fixture_0.py'] = base64.b64encode(b'changed').decode()
            bad = base64.b64encode(json.dumps(entries).encode()).decode()
            with self.assertRaises(wrapper.LaunchError): wrapper.script(bad, expected, PRIVATE)
            entries['extra.py'] = base64.b64encode(b'pass\n').decode()
            with self.assertRaises(wrapper.LaunchError): wrapper.validate_package(base64.b64encode(json.dumps(entries).encode()).decode(), expected)

    def test_helper_approval_contract_must_match_wrapper(self):
        files, expected, payload = fixtures()
        files[wrapper.HELPER_NAME] = b"APPROVAL = 'DIFFERENT'\n"
        expected[wrapper.HELPER_NAME] = wrapper.blob(files[wrapper.HELPER_NAME])
        payload = base64.b64encode(json.dumps({n: base64.b64encode(raw).decode() for n, raw in files.items()}).encode()).decode()
        with patch.object(wrapper, 'HELPER_BLOB', expected[wrapper.HELPER_NAME]), self.assertRaises(wrapper.LaunchError):
            wrapper.validate_package(payload, expected)

    def remote(self, behavior=None):
        files, expected, payload = fixtures(behavior)
        namespace = {'__name__': 'fixture_receiver'}
        output = io.StringIO(); errors = io.StringIO()
        with patch.object(wrapper, 'HELPER_BLOB', expected[wrapper.HELPER_NAME]), \
                patch.object(subprocess, 'run') as run, patch.object(subprocess, 'Popen') as popen, \
                patch.object(wrapper.urllib.request, 'build_opener') as network, \
                contextlib.redirect_stdout(output), contextlib.redirect_stderr(errors), self.assertRaises(SystemExit) as stopped:
            program = wrapper.script(payload, expected, PRIVATE)
            exec(compile(program, '<inert remote fixture>', 'exec'), namespace)
        run.assert_not_called(); popen.assert_not_called(); network.assert_not_called()
        self.assertNotIn(CANARY, output.getvalue() + errors.getvalue())
        self.assertNotIn(SOURCE, output.getvalue() + errors.getvalue())
        self.assertNotIn(HASH, output.getvalue() + errors.getvalue())
        return json.loads(output.getvalue()), namespace, stopped.exception.code

    def test_receiver_runs_only_verified_helper_once_with_exact_private_parameters(self):
        observed, namespace, code = self.remote()
        self.assertEqual(code, 0)
        self.assertEqual(observed, result())
        calls = namespace['helper']['CALLS']
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0][1], PRIVATE)
        self.assertTrue(calls[0][0].endswith('/froge-connector'))

    def test_receiver_suppresses_private_prints_exceptions_and_system_exit(self):
        for behavior in ('raise RuntimeError(' + repr(CANARY) + ')', 'raise KeyboardInterrupt()', 'raise SystemExit(' + repr(CANARY) + ')',
                         'return ' + repr({**result(), 'prompt': CANARY})):
            with self.subTest(behavior=behavior):
                observed, namespace, code = self.remote(behavior)
                self.assertEqual(code, 1)
                self.assertEqual(observed, {'phase': 'ONE_SHOT_NOT_CONFIRMED', 'jobId': TEST, 'automaticPostRetries': 0})
                self.assertEqual(len(namespace['helper']['CALLS']), 1)

    def test_receiver_rechecks_tampered_package_before_helper_execution(self):
        files, expected, payload = fixtures()
        with patch.object(wrapper, 'HELPER_BLOB', expected[wrapper.HELPER_NAME]):
            program = wrapper.script(payload, expected, PRIVATE)
        entries = json.loads(base64.b64decode(payload)); entries['fixture_0.py'] = base64.b64encode(b'changed').decode()
        bad = base64.b64encode(json.dumps(entries).encode()).decode()
        program = program.replace('PAYLOAD = ' + repr(payload), 'PAYLOAD = ' + repr(bad), 1)
        namespace = {}; output = io.StringIO()
        with contextlib.redirect_stdout(output), self.assertRaises(SystemExit) as stopped:
            exec(compile(program, '<tampered fixture>', 'exec'), namespace)
        self.assertEqual(stopped.exception.code, 1)
        self.assertNotIn('helper', namespace)

    def test_safe_result_rejects_private_or_unverified_fields(self):
        for state in ('queued', 'generating', 'retrying', 'building', 'succeeded', 'failed', 'cancelled', 'absent'):
            self.assertEqual(wrapper.safe_result(result(state), TEST), result(state))
        cases = [{**result(), 'prompt': CANARY}, {**result(), 'jobId': SOURCE}, {**result(), 'customerCharges': 1},
                 {**result(), 'automaticPostRetries': True}, {**result(), 'visualQuality': 'PASSED'},
                 {**result('succeeded'), 'glb': {'bytes': 100, 'sha256': CANARY}},
                 {**result('succeeded'), 'geometry': {'private': CANARY}},
                 {**result('succeeded'), 'hostModelStatus': 'draft'}]
        for value in cases:
            with self.subTest(keys=list(value)), self.assertRaises(wrapper.LaunchError):
                wrapper.safe_result(value, TEST)

    def test_ssh_is_invoked_once_and_stderr_never_relayed(self):
        process = types.SimpleNamespace(returncode=0, stdout=json.dumps(result()), stderr=CANARY)
        with patch.object(subprocess, 'run', return_value=process) as run:
            self.assertEqual(wrapper.invoke(['ssh', 'fixture'], 'private program', TEST), result())
        run.assert_called_once()
        self.assertEqual(run.call_args.kwargs['stderr'], subprocess.DEVNULL)
        self.assertEqual(run.call_args.kwargs['timeout'], wrapper.SSH_TIMEOUT)
        self.assertEqual(run.call_args.kwargs['input'], 'private program')
        self.assertNotIn('private program', run.call_args.args[0])

    def test_timeout_failure_and_arbitrary_remote_output_never_retry_or_echo(self):
        for output, code in [(CANARY, 0), (json.dumps(result()), 1), ('x' * (wrapper.OUTPUT_LIMIT + 1), 0)]:
            process = types.SimpleNamespace(returncode=code, stdout=output)
            with patch.object(subprocess, 'run', return_value=process) as run, self.assertRaises(wrapper.LaunchError) as error:
                wrapper.invoke(['ssh', 'fixture'], 'program', TEST)
            run.assert_called_once(); self.assertNotIn(CANARY, str(error.exception))
        with patch.object(subprocess, 'run', side_effect=subprocess.TimeoutExpired('ssh', 1)) as run, self.assertRaises(wrapper.LaunchError):
            wrapper.invoke(['ssh', 'fixture'], 'program', TEST)
        run.assert_called_once()

    def test_main_uses_only_reviewed_package_connection_and_separate_helper_script(self):
        files, expected, payload = fixtures()
        connection = unittest.mock.Mock(return_value=['ssh', 'strict-fixture'])
        namespace = {'connection': connection, 'main': unittest.mock.Mock(side_effect=AssertionError('Never maintenance main')),
                     'script': unittest.mock.Mock(side_effect=AssertionError('Never maintenance script'))}
        with patch.object(wrapper, 'HELPER_BLOB', expected[wrapper.HELPER_NAME]), \
                patch.object(wrapper, 'reviewed_package', return_value=(namespace, payload, expected)) as package, \
                patch.object(wrapper, 'invoke', return_value=result()) as invoke, contextlib.redirect_stdout(io.StringIO()) as output:
            observed = wrapper.main(self.approved_args())
        self.assertEqual(observed, result())
        package.assert_called_once_with(COMMIT); connection.assert_called_once(); invoke.assert_called_once()
        namespace['main'].assert_not_called(); namespace['script'].assert_not_called()
        self.assertEqual(json.loads(output.getvalue()), result())
        self.assertNotIn(CANARY, output.getvalue()); self.assertNotIn(SOURCE, output.getvalue())

    def test_repository_wrapper_pins_match_frozen_loader_and_helper(self):
        root = Path(__file__).resolve().parent
        self.assertEqual(wrapper.blob((root / 'oracle_launch.py').read_bytes()), wrapper.LAUNCHER_BLOB)
        self.assertEqual(wrapper.blob((root / wrapper.HELPER_NAME).read_bytes()), wrapper.HELPER_BLOB)

    def test_real_frozen_loader_verifies_all_sixteen_files_without_connection_or_install(self):
        root = Path(__file__).resolve().parents[2]
        raw = (root / wrapper.LAUNCHER_PATH).read_bytes()
        prefix = wrapper.PUBLIC_ROOT + COMMIT + '/'
        paths = []
        class PublicFixture:
            def open(self, url, timeout):
                self_outer.assertTrue(url.startswith(prefix))
                path = url[len(prefix):]
                self_outer.assertNotIn('..', path)
                paths.append(path)
                body = (root / path).read_bytes()
                response = types.SimpleNamespace(status=200, read=lambda limit: body)
                return contextlib.nullcontext(response)
        self_outer = self
        with patch.object(wrapper, 'read_launcher', return_value=raw), \
                patch.object(wrapper.urllib.request, 'build_opener', return_value=PublicFixture()), \
                patch.object(subprocess, 'run', side_effect=AssertionError('No OCI/SSH or installer')) as run:
            namespace, payload, expected = wrapper.reviewed_package(COMMIT)
        self.assertEqual(len(expected), 16)
        self.assertEqual(len(paths), 16)
        self.assertEqual(expected[wrapper.HELPER_NAME], wrapper.HELPER_BLOB)
        self.assertEqual(set(wrapper.validate_package(payload, expected)), set(namespace['FILES']))
        run.assert_not_called()


if __name__ == '__main__':
    unittest.main()
