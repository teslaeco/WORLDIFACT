"""Tests for the one-command 900-second Astra timeout launcher."""
import base64
import contextlib
import io
import json
from pathlib import Path
import subprocess
import tempfile
import types
import unittest
from unittest.mock import patch
import oracle_timeout900_launch as launch


class LaunchTests(unittest.TestCase):
    def setUp(self):
        t=tempfile.TemporaryDirectory(); self.addCleanup(t.cleanup)
        self.home=Path(t.name); self.key=self.home/'ssh-key-2026-09-06.key'; self.key.write_text('PRIVATE_CANARY')
        self.addCleanup(patch.stopall)

    def fixtures(self):
        data={path:('# fixture '+name+'\n').encode() for name,(path,_) in launch.FILES.items()}
        manifest={name:(path,launch.blob(data[path])) for name,(path,_) in launch.FILES.items()}
        return data,manifest

    def test_plan_only_does_nothing(self):
        with patch.object(launch,'connection') as c,patch.object(launch,'package') as p,patch.object(subprocess,'run') as r,contextlib.redirect_stdout(io.StringIO()):
            launch.main([])
        c.assert_not_called();p.assert_not_called();r.assert_not_called()

    def test_package_is_fixed_compiled_and_has_no_secret(self):
        data,manifest=self.fixtures()
        with patch.object(launch,'FILES',manifest):
            value=json.loads(base64.b64decode(launch.package(lambda path:data[path])))
        self.assertEqual(set(value),set(manifest)); self.assertNotIn('PRIVATE_CANARY',str(value))

    def test_bad_package_fails_before_ssh(self):
        for raw in [b'',b'bad',b'x'*(launch.LIMIT+1)]:
            with patch.object(launch.subprocess,'run') as run, self.assertRaises(Exception):
                launch.package(lambda _:raw)
            run.assert_not_called()

    def test_connection_uses_original_key_exact_vm_region_and_strict_host(self):
        with patch.object(launch,'lookup',side_effect=['ocid1.instance.valid','8.8.8.8']) as lookup,patch.object(Path,'read_bytes',side_effect=AssertionError('key not read')):
            args=launch.connection(self.home)
        self.assertIn('StrictHostKeyChecking=yes',args);self.assertIn('BatchMode=yes',args)
        self.assertIn(str(self.key),args);self.assertIn('opc@8.8.8.8',args)
        self.assertIn('eu-amsterdam-1',lookup.call_args_list[0].args[0])

    def test_receiver_runs_only_timeout_installer_and_no_generation(self):
        data,manifest=self.fixtures(); contents={n:base64.b64encode(data[p]).decode() for n,(p,_) in manifest.items()}
        output=io.StringIO(); fake=types.SimpleNamespace(wait=lambda:0,poll=lambda:0,send_signal=lambda _:None)
        with patch.object(launch,'FILES',manifest),patch.object(Path,'home',return_value=self.home),patch.object(subprocess,'Popen',return_value=fake) as popen,patch('signal.signal'),contextlib.redirect_stdout(output):
            exec(compile(launch.script(base64.b64encode(json.dumps(contents).encode()).decode()),'<remote>','exec'),{'__name__':'fixture'})
        args=popen.call_args.args[0]
        self.assertEqual(Path(args[2]).name,'install_request_timeout900.py')
        self.assertEqual(args[-1],'--approve-service-restart')
        self.assertIn('WORLDIFACT_TIMEOUT900_INSTALLED',output.getvalue())
        self.assertIn('Paid generation NOT RUN',output.getvalue())

    def test_failed_installer_never_claims_success(self):
        data,manifest=self.fixtures(); contents={n:base64.b64encode(data[p]).decode() for n,(p,_) in manifest.items()}
        fake=types.SimpleNamespace(wait=lambda:1,poll=lambda:1,send_signal=lambda _:None)
        with patch.object(launch,'FILES',manifest),patch.object(Path,'home',return_value=self.home),patch.object(subprocess,'Popen',return_value=fake),patch('signal.signal'),contextlib.redirect_stdout(io.StringIO()):
            with self.assertRaises(SystemExit): exec(compile(launch.script(base64.b64encode(json.dumps(contents).encode()).decode()),'<remote>','exec'),{'__name__':'fixture'})


if __name__=='__main__': unittest.main()
