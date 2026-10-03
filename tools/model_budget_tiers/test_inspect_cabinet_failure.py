"""Read-only cabinet diagnostics: privacy and failure-evidence boundaries."""
import contextlib
import io
import json
import os
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch

import inspect_cabinet_failure as diagnostic


class CabinetFailureDiagnosticTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name)
        self.parent = self.home/'.local/state/worldifact-astra-guard'
        self.folder = self.parent/'studio-pricing-20261003T191900Z-0123abcd'
        self.folder.mkdir(parents=True)
        self.now = time.time()
        self.record = {'phase':'WORLDIFACT_STUDIO_PRICING_NOT_CONFIRMED','revision':'studio-pricing-v1',
                       'refusal_code':'cabinet_pipeline_unverified','previous_source_restored':True,
                       'activation_committed':False,'paid_generation_requested':False,'job_rows_changed':False,
                       'provider_limits_changed':False,'legacy_provider_cap_micro_usd':1750000}
        self.log = self.folder/'offline-cabinet.log'
        self.log.write_text('Traceback (most recent call last):\n'
                            '  File "/private/worker/offline_cabinet.py", line 144, in main\n'
                            '    private_function("PRIVATE_KEY_CANARY")\n'
                            '  File "/private/worker/server.py", line 318, in run_blender\n'
                            'sqlite3.OperationalError: no such table: jobs\n')
        os.utime(self.log,(self.now-10,self.now-10))
        self.write_summary()

    def write_summary(self):
        path = self.folder/'INSTALL_STATUS.json'
        path.write_text(json.dumps(self.record))
        os.utime(path,(self.now-5,self.now-5))

    def probe(self):
        return diagnostic.validate(diagnostic._SCHEMA['probe'](self.home,self.now))

    def test_real_traceback_only_reports_allowed_locations_and_fixed_marker(self):
        value = self.probe()
        self.assertEqual(value['traceback_frames'],[
            {'file':'offline_cabinet.py','line':144,'function':'main'},
            {'file':'server.py','line':318,'function':'run_blender'}])
        self.assertEqual(value['exception_types'],['OperationalError'])
        self.assertEqual(value['fixed_markers'],['missing_jobs_table'])
        text = json.dumps(value)
        for private in ('PRIVATE_KEY_CANARY','/private','private_function','20261003T191900Z'):
            self.assertNotIn(private,text)
        self.assertFalse(value['success_marker'])

    def test_malicious_log_paths_functions_exception_prose_never_escape(self):
        raw = ('Traceback (most recent call last):\n'
               '  File "/PRIVATE_TOKEN/evil_secret.py", line 3, in run\n'
               '  File "/PRIVATE_TOKEN/server.py", line 9, in PRIVATE_FUNCTION_CANARY\n'
               'PRIVATE_EXCEPTION_CANARY: PRIVATE_MESSAGE_CANARY\n'
               'RuntimeError: PRIVATE_MESSAGE_CANARY\n'
               '{"token":"PRIVATE_JSON_CANARY"}\n').encode()
        value = diagnostic._SCHEMA['sanitize'](raw)
        self.assertEqual(value['traceback_frames'],[{'file':'server.py','line':9,'function':'unknown'}])
        self.assertEqual(value['exception_types'],['RuntimeError'])
        self.assertNotIn('PRIVATE_',json.dumps(value))

    def test_symlink_log_or_summary_is_refused(self):
        for name in ('offline-cabinet.log','INSTALL_STATUS.json'):
            with self.subTest(name=name):
                path = self.folder/name
                raw = path.read_bytes()
                path.unlink()
                outside = self.home/'outside'
                outside.write_bytes(raw)
                path.symlink_to(outside)
                with self.assertRaises((ValueError,OSError)): self.probe()
                path.unlink()
                path.write_bytes(raw)
                os.utime(path,(self.now-10 if name.endswith('.log') else self.now-5,)*2)

    def test_symlink_workspace_and_parent_refused(self):
        self.folder.rename(self.home/'real-folder')
        self.folder.symlink_to(self.home/'real-folder',target_is_directory=True)
        with self.assertRaises(OSError): self.probe()
        self.folder.unlink()
        (self.home/'real-folder').rename(self.folder)
        self.parent.rename(self.home/'real-parent')
        self.parent.symlink_to(self.home/'real-parent',target_is_directory=True)
        with self.assertRaises(OSError): self.probe()

    def test_wrong_summary_cannot_select_an_older_failure(self):
        latest = self.parent/'studio-pricing-20261003T192000Z-aaaaaaaa'
        latest.mkdir()
        (latest/'INSTALL_STATUS.json').write_text(json.dumps({**self.record,'refusal_code':'other'}))
        with self.assertRaises(ValueError): self.probe()

    def test_summary_status_strictly_binds_rolled_back_failure(self):
        for key,value in [('previous_source_restored',False),('activation_committed',True),
                          ('revision','other'),('paid_generation_requested',True),
                          ('provider_limits_changed',None),('job_rows_changed',0)]:
            with self.subTest(key=key):
                original = self.record[key]
                self.record[key] = value
                self.write_summary()
                with self.assertRaises(ValueError): self.probe()
                self.record[key] = original
        self.write_summary()

    def test_old_summary_or_later_log_refused(self):
        status = self.folder/'INSTALL_STATUS.json'
        os.utime(status,(self.now-86401,)*2)
        with self.assertRaises(ValueError): self.probe()
        self.write_summary()
        os.utime(self.log,(self.now,)*2)
        with self.assertRaises(ValueError): self.probe()

    def test_oversized_and_nonregular_log_refused(self):
        self.log.write_bytes(b'x'*1048577)
        with self.assertRaises(ValueError): self.probe()
        self.log.unlink()
        os.mkfifo(self.log)
        with self.assertRaises(ValueError): self.probe()

    def test_local_validator_rejects_injected_output(self):
        value = self.probe()
        for altered in ({**value,'private':'secret'},
                        {**value,'exception_types':['SECRET_CANARY']},
                        {**value,'traceback_frames':[{'file':'server.py','line':1,'function':'PRIVATE'}]}):
            with self.assertRaises(ValueError): diagnostic.validate(altered)

    def test_connection_failure_suppresses_private_exception_and_remote_output(self):
        output = io.StringIO()
        with patch.object(diagnostic,'launcher_connection',side_effect=ValueError('PRIVATE_KEY_CANARY')), contextlib.redirect_stdout(output):
            result = diagnostic.main([])
        self.assertEqual(result,1)
        self.assertNotIn('PRIVATE',output.getvalue())

    def test_bad_launcher_pin_refuses_before_execution(self):
        path = self.home/'launcher.py'
        path.write_text('raise RuntimeError("MUST_NOT_EXECUTE")')
        with self.assertRaises(ValueError): diagnostic.launcher_connection(path)


if __name__ == '__main__': unittest.main()
