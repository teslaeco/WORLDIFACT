"""Execute the real runner body with an inert child; cover emitted pretty JSON."""
import base64
from contextlib import redirect_stdout
from copy import deepcopy
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import cloud_shell_activate as launcher


class TerminalResultTests(unittest.TestCase):
    def setUp(self):
        self.success = dict(phase=launcher.SUCCESS, revision=launcher.REVISION,
            paid_generation_requested=False, job_rows_changed=False,
            provider_limits_changed=False, previous_source_restored=None,
            activation_committed=True)
        self.failure = {**self.success, 'phase': launcher.FAILURE,
            'activation_committed': False, 'previous_source_restored': True,
            'refusal_code': 'verification_failed'}

    def test_accepts_actual_pretty_json_terminal_format(self):
        raw=b'Verifying offline fixtures...\n'+json.dumps(self.success,indent=2).encode()+b'\n\n'
        self.assertEqual(launcher.parse_installer_result(raw,0),self.success)

    def test_compact_and_failure_results_remain_supported(self):
        for value,code in ((self.success,0),(self.failure,1),(self.failure,0)):
            with self.subTest(value=value,code=code):
                self.assertEqual(launcher.parse_installer_result(json.dumps(value).encode()+b'\n',code),value)

    def test_truncated_duplicated_or_nonterminal_results_are_uncertain(self):
        full=json.dumps(self.success,indent=2).encode()+b'\n'
        for value in (full[:-5],full+full,full+b'unexpected trailing output\n',b'no terminal result\n',b'x'*65537):
            with self.subTest(value=value[:50]), self.assertRaises((launcher.Refused,ValueError)):
                launcher.parse_installer_result(value,0)

    def test_nonzero_exit_cannot_report_success(self):
        for code in (1,-15):
            with self.subTest(code=code),self.assertRaises(launcher.Refused):
                launcher.parse_installer_result(json.dumps(self.success).encode(),code)

    def test_invalid_flags_still_refuse(self):
        for key in ('paid_generation_requested','job_rows_changed','provider_limits_changed'):
            value={**self.success,key:True}
            with self.subTest(key=key),self.assertRaises(launcher.Refused):
                launcher.parse_installer_result(json.dumps(value,indent=2).encode(),0)

    def run_runner(self,value,code):
        with tempfile.TemporaryDirectory() as tmp:
            home=Path(tmp);program=home/'run.py';program.write_text('# inert fixture\n')
            raw=b'# inert package source; never executed\n'
            names=['activation.py']+['fixture_%02d.py'%n for n in range(58)]
            files={n:{'sha256':launcher.checksum(raw),'data':base64.b64encode(raw).decode()} for n in names}
            payload=json.dumps({'release':launcher.RELEASE,'files':files,'cancelled':None}).encode()
            source=launcher.common()+'PAYLOAD='+repr(base64.b64encode(payload).decode())+'\n'+launcher.RUNNER
            calls=[]
            def child(args,**kwargs):
                calls.append(args)
                self.assertEqual(Path(args[2]),home/'package/activation.py')
                self.assertEqual(args[3:],['--approve-service-maintenance'])
                kwargs['stdout'].write(b'Offline verification complete.\n'+json.dumps(value,indent=2).encode()+b'\n')
                return subprocess.CompletedProcess(args,code)
            with patch.object(subprocess,'run',side_effect=child),redirect_stdout(io.StringIO()):
                exec(compile(source,'actual-runner-body.py','exec'),{'__file__':str(program)})
            self.assertEqual(len(calls),1)
            result=launcher.safe_result(json.loads((home/'result.json').read_text()))
            self.assertEqual((home/'result.json').stat().st_mode&0o077,0)
            return result

    def test_actual_runner_persists_multiline_success_once(self):
        self.assertEqual(self.run_runner(self.success,0),self.success)

    def test_actual_runner_persists_multiline_rollback_without_retry(self):
        self.assertEqual(self.run_runner(self.failure,1),self.failure)

    def test_actual_runner_does_not_upgrade_nonzero_exit_to_success(self):
        value=self.run_runner(self.success,1)
        self.assertEqual(value['refusal_code'],'launcher_unconfirmed')
        self.assertIsNone(value['activation_committed'])


if __name__=='__main__':unittest.main()
