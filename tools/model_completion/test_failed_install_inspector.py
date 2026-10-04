import hashlib, importlib.util, json, os, pathlib, subprocess, sys, tempfile, unittest
from unittest.mock import patch
HERE=pathlib.Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('forensics',HERE/'inspect_failed_install.py');observer=importlib.util.module_from_spec(spec);spec.loader.exec_module(observer)
class Tests(unittest.TestCase):
    def test_default_is_inert(self):
        with patch.object(observer,'connection',side_effect=AssertionError('SSH')),patch.object(observer.subprocess,'run',side_effect=AssertionError('spawn')):
            observer.main([])
    def test_missing_state_is_safe_and_read_only(self):
        with tempfile.TemporaryDirectory() as directory:
            r=subprocess.run([sys.executable,'-B','-c',observer.REMOTE],env={**os.environ,'HOME':directory},capture_output=True,text=True,timeout=20)
            self.assertEqual(r.returncode,0,r.stderr);v=json.loads(r.stdout)
            self.assertFalse(v['reviewedPackageFound']);self.assertEqual(v['backups'],[]);self.assertEqual(list(pathlib.Path(directory).rglob('*')),[])
    def test_exact_published_preflight_reports_source_mismatch_without_writes(self):
        with tempfile.TemporaryDirectory() as directory:
            home=pathlib.Path(directory);source=home/'froge-connector';source.mkdir()
            for n in ('server.py','codex_runner.py','blender_mcp.py','astra_spend_v2.py'):(source/n).write_bytes(b'changed source\n')
            package=home/'.local/state/worldifact-astra-guard/model-completion-package-fixture';package.mkdir(parents=True)
            # Copy only the exact published package, never the current launcher.
            package_spec=importlib.util.spec_from_file_location('model_completion_launcher_for_test',HERE/'oracle_launch.py')
            oracle_launch=importlib.util.module_from_spec(package_spec);package_spec.loader.exec_module(oracle_launch)
            for n,(path,digest) in oracle_launch.FILES.items():
                if n=='test_original_job_once.py':continue
                raw=(HERE.parents[1]/path).read_bytes();self.assertEqual(hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest(),digest)
                (package/n).write_bytes(raw)
            before={str(p.relative_to(home)):p.read_bytes() for p in home.rglob('*') if p.is_file()}
            prefix='import os,platform\nos.getuid=lambda:1000\nplatform.machine=lambda:"aarch64"\n'
            r=subprocess.run([sys.executable,'-B','-c',prefix+observer.REMOTE],env={**os.environ,'HOME':str(home)},capture_output=True,text=True,timeout=20)
            self.assertEqual(r.returncode,0,r.stderr);v=json.loads(r.stdout)
            self.assertTrue(v['reviewedPackageFound']);self.assertEqual(v['preflight']['error_type'],'ValueError')
            self.assertEqual(v['preflight']['known_reason'],'Unreviewed installed completion ancestor; no service stopped.')
            self.assertNotIn('changed source',r.stdout)
            after={str(p.relative_to(home)):p.read_bytes() for p in home.rglob('*') if p.is_file()};self.assertEqual(before,after)
    def test_audit_denies_native_sqlite_connection_before_any_sidecar(self):
        import textwrap
        start=observer.REMOTE.index('    class ReadOnlyViolation')
        end=observer.REMOTE.index('    sys.addaudithook',start)
        audit=textwrap.dedent(observer.REMOTE[start:end])
        with tempfile.TemporaryDirectory() as directory:
            target=pathlib.Path(directory)/'jobs.sqlite'
            code='import os,sys,sqlite3\n'+audit+"\nsys.addaudithook(audit)\ntry:\n sqlite3.connect("+repr(str(target))+",uri=True)\nexcept ReadOnlyViolation as e:\n assert str(e)=='SQLITE_CONNECT_NOT_PERFORMED'\nelse: raise AssertionError('SQLite was not blocked')\n"
            r=subprocess.run([sys.executable,'-B','-c',code],capture_output=True,text=True,timeout=10)
            self.assertEqual(r.returncode,0,r.stderr);self.assertEqual(list(pathlib.Path(directory).iterdir()),[])
    def test_no_write_install_or_service_change_interface(self):
        self.assertNotIn('install_completion.install(',observer.REMOTE)
        self.assertIn("install_completion.Operations(source,home).preflight()",observer.REMOTE)
        for event in ('os.mkdir','os.remove','os.rename','socket.connect','os.system'):self.assertIn(event,observer.REMOTE)
        self.assertNotIn("'--approve-service-restart'",observer.REMOTE)
if __name__=='__main__':unittest.main()
