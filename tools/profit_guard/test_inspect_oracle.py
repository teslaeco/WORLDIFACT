import contextlib
import copy
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

# Transport stub for local tests only. Production imports the existing reviewed helper.
helper = types.ModuleType('oracle_preflight')
class CheckError(Exception): pass
helper.CheckError = CheckError
helper.invoke = lambda *a, **k: (_ for _ in ()).throw(AssertionError('Unexpected transport'))
helper.one = lambda text, _: json.loads(text)[0]
spec = importlib.util.spec_from_file_location('diagnostic', Path(__file__).with_name('inspect_oracle.py'))
d = importlib.util.module_from_spec(spec)
with patch.dict(sys.modules, {'oracle_preflight': helper}): spec.loader.exec_module(d)

def remote():
    namespace = {'__name__': 'fixture'}
    exec(compile(d.REMOTE, 'read_only_remote', 'exec'), namespace)
    return namespace

class InspectionTests(unittest.TestCase):
    def test_hashes_source_without_executing_or_changing_it(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); path = root/'codex_runner.py'
            secret = "SECRET_TEST_MUST_NOT_BE_OUTPUT"
            raw = ("raise RuntimeError('must never execute')\nimport fast_spend\nvalue='"+secret+"'\n").encode()
            path.write_bytes(raw); before = path.stat().st_mtime_ns
            n = remote()
            with patch.object(n['subprocess'], 'run', return_value=types.SimpleNamespace(returncode=0, stdout='active\n')) as run:
                report = d.validate(n['inspect'](root))
            self.assertEqual(report['files']['codex_runner.py']['sha256'], hashlib.sha256(raw).hexdigest())
            self.assertTrue(report['runner_syntax_ok']); self.assertTrue(report['fast_guard_import'])
            self.assertFalse(report['runner_exact_match'])
            self.assertNotIn(secret, json.dumps(report))
            self.assertEqual(path.read_bytes(), raw); self.assertEqual(path.stat().st_mtime_ns, before)
            self.assertEqual(list(root.iterdir()), [path])
            for call in run.call_args_list:
                self.assertEqual(call.args[0][:3], ['systemctl','--user','show'])

    def test_symlink_source_is_not_read(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp); target=root/'config.json'; target.write_text('SECRET')
            (root/'codex_runner.py').symlink_to(target)
            n=remote()
            with patch.object(n['subprocess'], 'run', side_effect=OSError): report=n['inspect'](root)
            self.assertEqual(report['files']['codex_runner.py'], {'status':'UNAVAILABLE'})
            self.assertNotIn('SECRET', json.dumps(report))
            self.assertEqual(target.read_text(), 'SECRET')

    def test_lf_fingerprint_is_diagnostic_only(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp); data=b'import fast_spend\nvalue = 1\n'
            original=data.replace(b'\n', b'\r\n'); (root/'codex_runner.py').write_bytes(original)
            n=remote(); n['EXPECTED']=hashlib.sha256(data).hexdigest()
            with patch.object(n['subprocess'], 'run', side_effect=OSError): report=n['inspect'](root)
            self.assertFalse(report['runner_exact_match']); self.assertTrue(report['runner_lf_match'])
            self.assertEqual((root/'codex_runner.py').read_bytes(),original)

    def test_remote_report_rejects_secret_or_unknown_fields(self):
        with tempfile.TemporaryDirectory() as temp:
            n=remote()
            with patch.object(n['subprocess'], 'run', side_effect=OSError): valid=d.validate(n['inspect'](Path(temp)))
        mutations=[]
        bad=copy.deepcopy(valid);bad['source']='SECRET';mutations.append(bad)
        bad=copy.deepcopy(valid);bad['worker']='SECRET';mutations.append(bad)
        bad=copy.deepcopy(valid);bad['files']['codex_runner.py']={'status':'OK','sha256':'SECRET','git_blob':'0'*40};mutations.append(bad)
        bad=copy.deepcopy(valid);bad['read_only']=False;mutations.append(bad)
        for bad in mutations:
            with self.assertRaises(CheckError) as error: d.validate(bad)
            self.assertNotIn('SECRET',str(error.exception))

    def test_original_cli_and_strict_ssh_route_only_no_installer(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);(root/'ssh-key-2026-09-06.key').write_text('KEY_MUST_NOT_BE_PRINTED')
            n=remote()
            with patch.object(n['subprocess'],'run',side_effect=OSError): report=n['inspect'](root/'froge-connector')
            replies=[json.dumps(['ocid1.instance.fixture']),json.dumps(['8.8.8.8']),json.dumps(report)]
            out=io.StringIO()
            with patch.object(d.Path,'home',return_value=root), patch.object(d,'invoke',side_effect=replies) as transport, patch.object(sys,'argv',['inspect_oracle.py']),contextlib.redirect_stdout(out): d.main()
            calls=transport.call_args_list
            self.assertEqual(len(calls),3)
            ssh=calls[-1].args[0]
            self.assertIn('StrictHostKeyChecking=yes',ssh);self.assertIn('BatchMode=yes',ssh)
            self.assertEqual(ssh[-1],'PYTHONDONTWRITEBYTECODE=1 python3 -B -')
            self.assertNotIn('approve-service-restart',calls[-1].kwargs['data'])
            self.assertNotIn('KEY_MUST_NOT_BE_PRINTED',out.getvalue())
            self.assertIn('WORLDIFACT_ORACLE_DIAGNOSTIC_END',out.getvalue())

if __name__=='__main__':unittest.main()
