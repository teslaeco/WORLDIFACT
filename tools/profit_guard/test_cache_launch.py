"""Tests for the one-command launcher. No OCI, SSH, service or model calls."""
import base64
import contextlib
import hashlib
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import types
import unittest
from unittest.mock import patch
import oracle_cache_launch as launch


class LaunchTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name)
        self.key = self.home/'ssh-key-2026-09-06.key'
        self.key.write_text('PRIVATE_TEST_CANARY_NEVER_READ')
        self.addCleanup(patch.stopall)

    def fixture_package(self):
        data = {path: ('# public fixture '+name+'\n').encode() for name,(path,_) in launch.FILES.items()}
        manifest = {name: (path, launch.blob(data[path])) for name,(path,_) in launch.FILES.items()}
        return data, manifest

    def test_default_is_plan_only_without_lookups_downloads_or_processes(self):
        with patch.object(launch, 'connection') as connect, patch.object(launch, 'package') as package, patch.object(launch.subprocess, 'run') as run, contextlib.redirect_stdout(io.StringIO()):
            launch.main([])
        connect.assert_not_called(); package.assert_not_called(); run.assert_not_called()

    def test_fixed_package_contains_all_ten_dependencies_no_secrets_or_payment_code(self):
        data, manifest = self.fixture_package()
        with patch.object(launch, 'FILES', manifest):
            result = json.loads(base64.b64decode(launch.package(lambda path: data[path])))
        self.assertEqual(len(result), 10)
        self.assertEqual(set(result), set(manifest))
        for name,(path,_) in manifest.items():
            self.assertEqual(base64.b64decode(result[name]), data[path])
        self.assertNotIn('PRIVATE_TEST_CANARY', str(result))

    def test_bad_checksum_empty_and_oversized_files_stop_without_ssh(self):
        for raw in [b'# tampered', b'', b'x'*(launch.LIMIT+1)]:
            with self.subTest(size=len(raw)), patch.object(launch.subprocess, 'run') as run:
                with self.assertRaises(launch.LaunchError): launch.package(lambda _: raw)
                run.assert_not_called()

    def test_verified_package_is_compiled_not_executed(self):
        raw = b"raise RuntimeError('not executed during packaging')\n"
        with patch.object(launch, 'FILES', {'a.py': ('tools/a.py',launch.blob(raw))}):
            launch.package(lambda _: raw)
        bad = b'this is not valid python >>>'
        with patch.object(launch, 'FILES', {'a.py': ('tools/a.py',launch.blob(bad))}):
            with self.assertRaises(SyntaxError): launch.package(lambda _: bad)

    def test_public_reader_has_fixed_commit_no_redirect_and_no_credentials(self):
        response = types.SimpleNamespace(status=200, read=lambda n: b'# test\n')
        class Context:
            def __enter__(self): return response
            def __exit__(self,*_): pass
        opener = types.SimpleNamespace(open=lambda url,timeout: (self.assertEqual(url,launch.PUBLIC_ROOT+launch.SOURCE+'/tools/profit_guard/install.py'), Context())[1])
        with patch.object(launch.urllib.request,'build_opener',return_value=opener):
            self.assertEqual(launch.read_public('tools/profit_guard/install.py'),b'# test\n')
        self.assertIsNone(launch.NoRedirect().redirect_request(None,None,None,None,None,None))
        with self.assertRaises(launch.LaunchError): launch.read_public('../../.env')

    def test_bad_download_is_bounded_and_does_not_echo_private_transport_error(self):
        with patch.object(launch.urllib.request,'build_opener') as build:
            build.return_value.open.side_effect=RuntimeError('PRIVATE_TEST_CANARY')
            with self.assertRaises(launch.LaunchError) as result: launch.read_public('tools/profit_guard/install.py')
            self.assertNotIn('PRIVATE_TEST_CANARY',str(result.exception))

    def test_oci_lookup_rejects_missing_duplicate_nonjson_and_failed_results(self):
        for stdout,code in [('[]',0),('["a","b"]',0),('[1]',0),('broken',0),('["one"]',1),('x'*65537,0)]:
            with self.subTest(code=code,size=len(stdout)), patch.object(launch.subprocess,'run',return_value=types.SimpleNamespace(returncode=code,stdout=stdout,stderr='PRIVATE_TEST_CANARY')):
                with self.assertRaises(launch.LaunchError) as result: launch.lookup(['oci','test'])
                self.assertNotIn('PRIVATE_TEST_CANARY',str(result.exception))

    def test_oci_timeout_never_exposes_raw_error(self):
        with patch.object(launch.subprocess,'run',side_effect=subprocess.TimeoutExpired('PRIVATE_TEST_CANARY',60)):
            with self.assertRaises(launch.LaunchError) as result: launch.lookup(['oci','test'])
        self.assertNotIn('PRIVATE_TEST_CANARY',str(result.exception))

    def test_connection_uses_only_original_key_region_vm_and_strict_known_host(self):
        with patch.object(launch,'lookup',side_effect=['ocid1.instance.oc1.eu-amsterdam-1.abc','8.8.8.8']) as query, patch.object(Path,'read_text',side_effect=AssertionError('Do not read a key')), patch.object(Path,'read_bytes',side_effect=AssertionError('Do not read a key')):
            args=launch.connection(self.home)
        self.assertIn('StrictHostKeyChecking=yes',args); self.assertIn('BatchMode=yes',args)
        self.assertIn('ServerAliveInterval=15',args); self.assertIn(str(self.key),args)
        self.assertIn('opc@8.8.8.8',args)
        self.assertIn('eu-amsterdam-1',query.call_args_list[0].args[0])
        self.assertIn("query instance resources where displayName = 'froge-blender' && lifeCycleState = 'RUNNING'",query.call_args_list[0].args[0])
        self.assertNotIn('StrictHostKeyChecking=no',args)

    def test_missing_or_symlinked_key_does_not_start_oci_or_create_folders(self):
        self.key.unlink()
        with patch.object(launch,'lookup') as lookup:
            with self.assertRaises(launch.LaunchError): launch.connection(self.home)
            self.key.symlink_to(self.home/'some-other-file')
            with self.assertRaises(launch.LaunchError): launch.connection(self.home)
        lookup.assert_not_called()

    def test_injected_or_private_vm_address_is_never_passed_to_ssh(self):
        for address in ['127.0.0.1','10.1.1.1','8.8.8.8;echo BAD','--option']:
            with patch.object(launch,'lookup',side_effect=['ocid1.instance.valid',address]):
                with self.assertRaises(launch.LaunchError): launch.connection(self.home)
        with patch.object(launch,'lookup',return_value='instance;whoami'):
            with self.assertRaises(launch.LaunchError): launch.connection(self.home)

    def execute_receiver(self, contents, manifest, returncode=0):
        output=io.StringIO()
        fake=types.SimpleNamespace(wait=lambda: returncode, poll=lambda: returncode, send_signal=lambda _: None)
        with patch.object(launch,'FILES',manifest), patch.object(Path,'home',return_value=self.home), patch.object(subprocess,'Popen',return_value=fake) as popen, patch('signal.signal'), contextlib.redirect_stdout(output):
            exec(compile(launch.script(base64.b64encode(json.dumps(contents).encode()).decode()),'<receiver>','exec'),{'__name__':'__fixture__'})
        return output.getvalue(),popen

    def test_receiver_runs_only_cache_installer_and_marks_success_after_zero_exit(self):
        data,manifest=self.fixture_package()
        contents={n:base64.b64encode(data[p]).decode() for n,(p,_) in manifest.items()}
        out,popen=self.execute_receiver(contents,manifest)
        args=popen.call_args.args[0]
        self.assertEqual(Path(args[2]).name,'install_cache_accounting.py')
        self.assertEqual(args[-1],'--approve-service-restart')
        self.assertEqual(popen.call_args.kwargs['stdin'],subprocess.DEVNULL)
        self.assertIn('WORLDIFACT_CACHE_FIX_INSTALLED',out)
        self.assertIn('Paid character generation NOT TESTED',out)
        self.assertFalse((self.home/'froge-connector').exists())
        stage=Path(args[2]).parent
        self.assertEqual(set(p.name for p in stage.iterdir()),set(contents))

    def test_receiver_bad_names_and_bytes_fail_before_staging_or_restart(self):
        data,manifest=self.fixture_package()
        correct={n:base64.b64encode(data[p]).decode() for n,(p,_) in manifest.items()}
        for item in [{**correct,'../config.json':'e30='},{**correct,'install.py':base64.b64encode(b'# tampered').decode()}]:
            with self.assertRaises(SystemExit): self.execute_receiver(item,manifest)
        self.assertFalse((self.home/'.local').exists())

    def test_receiver_failed_installer_cannot_print_success(self):
        data,manifest=self.fixture_package()
        contents={n:base64.b64encode(data[p]).decode() for n,(p,_) in manifest.items()}
        with self.assertRaises(SystemExit) as result: self.execute_receiver(contents,manifest,returncode=1)
        self.assertEqual(result.exception.code,1)

    def test_explicit_invocation_starts_one_ssh_with_validated_stdin(self):
        with patch.object(launch,'connection',return_value=['ssh','fixture']) as connect, patch.object(launch,'package',return_value='e30=') as package, patch.object(subprocess,'run',return_value=types.SimpleNamespace(returncode=0)) as run, contextlib.redirect_stdout(io.StringIO()):
            launch.main(['--approve-service-restart'])
        connect.assert_called_once(); package.assert_called_once(); run.assert_called_once()
        self.assertEqual(run.call_args.args[0],['ssh','fixture'])
        self.assertIn('install_cache_accounting.py',run.call_args.kwargs['input'])

    def test_ssh_failure_is_not_retried_or_described_as_installed(self):
        with patch.object(launch,'connection',return_value=['ssh','fixture']), patch.object(launch,'package',return_value='e30='), patch.object(subprocess,'run',return_value=types.SimpleNamespace(returncode=255)) as run, contextlib.redirect_stdout(io.StringIO()):
            with self.assertRaises(launch.LaunchError): launch.main(['--approve-service-restart'])
        run.assert_called_once()


class RealManifestTests(unittest.TestCase):
    def test_all_fixed_dependencies_match_repo_bytes_and_isolated_plan_loads(self):
        root=Path(__file__).resolve().parents[2]
        payload=launch.package(lambda path: (root/path).read_bytes())
        with tempfile.TemporaryDirectory() as directory:
            stage=Path(directory)
            for name,data in json.loads(base64.b64decode(payload)).items():
                (stage/name).write_bytes(base64.b64decode(data))
            result=subprocess.run([sys.executable,'-B',str(stage/'install_cache_accounting.py')],cwd=stage,capture_output=True,text=True,timeout=10)
            self.assertEqual(result.returncode,0,result.stderr)
            self.assertIn('PLAN ONLY',result.stdout)


if __name__ == '__main__': unittest.main()
