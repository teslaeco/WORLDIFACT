"""Opt-in inspection launcher; no OCI or SSH invocation, no real model read."""
from contextlib import redirect_stdout
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

import oracle_upgrade_launch as launcher

HERE = Path(__file__).resolve().parent
COMMIT = 'a' * 40


def unverified():
    return {'phase':'CURRENT_CANDIDATE_UNVERIFIED','read_only':True,'paid_generation_requested':False,
            'job_rows_changed':False,'financial_settlement_requested':False,'artifact_copied':False,
            'completion_verified':False,'visual_quality_verified':False,'reason':'MISSING_FILE'}


def found():
    value = unverified(); value.pop('reason')
    value.update(phase='CURRENT_CANDIDATE_FOUND_UNREVIEWED', revision=2, renderer_reported_triangles=100,
                 model={'container_valid':True,'bytes':128,'sha256':'b'*64,'mesh_count':1,
                        'material_count':0,'node_count':1,'image_count':0})
    return value


class CandidateLauncherTests(unittest.TestCase):
    def test_inspection_and_maintenance_modes_are_mutually_exclusive(self):
        for args in (['--approve-service-maintenance','--inspect-approved-candidate'],
                     ['--inspect-approved-candidate','--allow-cancelled-cleanup']):
            with patch.object(launcher, 'package', side_effect=AssertionError('maintenance download')), \
                 patch.object(launcher, 'candidate_package', side_effect=AssertionError('inspection download')):
                with self.assertRaises(SystemExit): launcher.main(args)
    def test_inspection_downloads_only_frozen_new_inspector(self):
        paths = []
        def reader(path): paths.append(path); return (HERE / 'inspect_candidate_readonly.py').read_bytes()
        payload = launcher.candidate_package(COMMIT, reader)
        self.assertTrue(payload); self.assertEqual(paths, [launcher.INSPECTOR[0]])
        self.assertEqual(launcher.file_commit(COMMIT, paths[0]), COMMIT)
        with self.assertRaises(launcher.LaunchError): launcher.candidate_package(COMMIT, lambda _: b'print("changed")')
    def test_explicit_inspection_routes_without_any_maintenance_payload_or_side_effect(self):
        with patch.object(launcher,'candidate_package',return_value='inert') as package, \
             patch.object(launcher,'package',side_effect=AssertionError('maintenance requested')), \
             patch.object(launcher,'invoke',side_effect=AssertionError('maintenance invoked')), \
             patch.object(launcher,'connection',return_value=['existing-verified-connection']), \
             patch.object(launcher,'invoke_candidate',return_value=unverified()) as invoke, redirect_stdout(io.StringIO()):
            result=launcher.main(['--source-commit',COMMIT,'--inspect-approved-candidate'])
        self.assertEqual(result,unverified()); package.assert_called_once_with(COMMIT)
        self.assertEqual(invoke.call_args.args[0],['existing-verified-connection'])
        self.assertIn('INSPECT_APPROVED=True',invoke.call_args.args[1])
    def test_in_memory_inspection_needs_approval_and_has_no_package_or_service_writer(self):
        with self.assertRaises(launcher.LaunchError): launcher.candidate_script('inert')
        text=launcher.CANDIDATE_REMOTE
        for forbidden in ('mkdir','tempfile','systemctl','sqlite3','install_upgrade','write_bytes','write_text'):
            self.assertNotIn(forbidden,text)
    def test_real_in_memory_wrapper_reads_only_disposable_missing_candidate_without_writes(self):
        payload=launcher.candidate_package(COMMIT,lambda _: (HERE/'inspect_candidate_readonly.py').read_bytes())
        with tempfile.TemporaryDirectory() as temporary:
            folder=Path(temporary); before=list(folder.iterdir())
            result=subprocess.run([sys.executable,'-B','-'],input=launcher.candidate_script(payload,approved=True),
                                  text=True,capture_output=True,cwd=folder,env={**os.environ,'HOME':temporary},timeout=15)
            self.assertEqual(result.returncode,0,result.stderr)
            self.assertEqual(launcher.safe_candidate_result(json.loads(result.stdout)),unverified())
            self.assertEqual(list(folder.iterdir()),before)
    def test_result_allowlist_rejects_private_extra_fields_and_quality_claims(self):
        for good in (unverified(),found()): self.assertEqual(launcher.safe_candidate_result(good),good)
        for value in ({**unverified(),'prompt':'private'}, {**unverified(),'reason':'/private/path'}, {**unverified(),'reason':[]},
                      {**found(),'completion_verified':True}, {**found(),'visual_quality_verified':True},
                      {**found(),'revision':True}, {**found(),'renderer_reported_triangles':True},
                      {**found(),'model':{**found()['model'],'private':'not allowed'}},
                      {**found(),'model':{**found()['model'],'bytes':True}},
                      {**found(),'model':{**found()['model'],'sha256':'https://private'}}):
            with self.assertRaises(launcher.LaunchError): launcher.safe_candidate_result(value)
    def test_result_transport_suppresses_logs_wrong_exit_and_private_errors(self):
        value=found()
        with patch.object(launcher.subprocess,'run',return_value=types.SimpleNamespace(returncode=0,stdout=json.dumps(value))):
            self.assertEqual(launcher.invoke_candidate(['INERT'],'inert'),value)
        for code,output in ((1,json.dumps(value)),(0,'private log\n'+json.dumps(value)),(0,'{}')):
            with patch.object(launcher.subprocess,'run',return_value=types.SimpleNamespace(returncode=code,stdout=output)):
                with self.assertRaises(launcher.LaunchError): launcher.invoke_candidate(['INERT'],'inert')
    def test_inspector_pin_matches_current_candidate_bytes(self):
        self.assertEqual(launcher.blob((HERE/'inspect_candidate_readonly.py').read_bytes()),launcher.INSPECTOR[1])


if __name__ == '__main__': unittest.main()
