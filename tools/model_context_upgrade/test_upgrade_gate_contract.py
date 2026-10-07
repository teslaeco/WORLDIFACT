"""Offline gate caller contract using inert subprocesses, never real proof."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from upgrade_test_support import bootstrap
bootstrap()
import install_upgrade as installer
import test_upgrade_transaction as transactions
from test_upgrade_transaction import Operations, write, digest


class GateCallerTests(unittest.TestCase):
    setUp = transactions.UpgradeTransactions.setUp
    @classmethod
    def setUpClass(cls): cls.sources = transactions.installed_sources()
    def exercise(self, *, marker='STANDARD_SELECTIVE_EXEC_REAL_PIPELINE_OK', code=0, generic_error=False):
        stage = self.root / 'stage'; workspace = self.root / 'verify'; workspace.mkdir()
        sources = {**self.sources, 'context_policy.py': (Path(installer.__file__).parent / 'context_policy.py').read_bytes()}
        installer.stage_runtime(self.source, stage, sources, {})
        generic_environments, processes = [], []
        def generic_verify(_self, _workspace):
            generic_environments.append(dict(os.environ))
            if generic_error: raise installer.Refused('generic_fixture_failure')
            write(stage / installer.base.RECEIPT, {
                'sources': {name: digest((stage / name).read_bytes()) for name in ('codex_runner.py','blender_mcp.py')},
                'cli_mcp_roundtrip': True, 'code_mode_roundtrip': True, 'blender_build_roundtrip': True})
        class Process:
            def __init__(self, args, **kwargs):
                processes.append((args, kwargs)); kwargs['stdout'].write((marker + '\n').encode())
            def wait(self, timeout): return code
            def poll(self): return code
        operations = installer.Operations(self.source, self.root)
        lease = Operations(self.source).lease
        with patch.dict(os.environ, {'UNRELATED_CREDENTIAL':'must-not-leak','OPENAI_API_KEY':'must-not-leak','CODEX_API_KEY':'must-not-leak'}, clear=False):
            before = dict(os.environ)
            with patch.object(installer.install_completion.Operations, 'verify', generic_verify), patch.object(installer.subprocess, 'Popen', Process):
                try:
                    result = operations._verify_stage(stage, workspace, lease)
                finally:
                    self.assertEqual(dict(os.environ), before)
        return result, generic_environments, processes
    def test_container_and_storage_scope_selectors_refuse_without_source_access(self):
        for key in ('CONTAINER_HOST','CONTAINER_CONNECTION','CONTAINER_SSHKEY','CONTAINERS_CONF',
                    'CONTAINERS_STORAGE_CONF','PODMAN_CONNECTIONS_CONF','DOCKER_HOST',
                    'XDG_CONFIG_HOME','XDG_DATA_HOME','STORAGE_DRIVER','STORAGE_OPTS','_CONTAINERS_USERNS_CONFIGURED'):
            with self.subTest(key=key), patch.dict(os.environ, {key: 'synthetic-alternate-scope'}), \
                 patch.object(installer.base, 'read_regular', side_effect=AssertionError('target read')):
                with self.assertRaisesRegex(installer.Refused, 'container_environment_scope_unproven'):
                    installer.install(self.source, self.backup, Operations(self.source), approved=True)
    def test_both_real_gate_entrypoints_are_selected_with_allowlisted_environment(self):
        result, environments, processes = self.exercise()
        self.assertTrue(json.loads(result)['blender_build_roundtrip'])
        self.assertEqual(len(environments), 1); self.assertEqual(len(processes), 1)
        args, options = processes[0]
        self.assertEqual(Path(args[2]), Path(installer.__file__).with_name('offline_standard.py'))
        self.assertEqual(args[3:], ['--source', str(self.root / 'stage')])
        self.assertTrue(options['start_new_session'])
        permitted = {'PATH','HOME','USER','LOGNAME','LANG','XDG_RUNTIME_DIR','DBUS_SESSION_BUS_ADDRESS','TMPDIR',
                     'PYTHONDONTWRITEBYTECODE','FROGE_FAST_DRAFT_V1'}
        for env in (environments[0], options['env']):
            self.assertTrue(set(env) <= permitted)
            self.assertNotIn('UNRELATED_CREDENTIAL', env)
            self.assertNotIn('OPENAI_API_KEY', env); self.assertNotIn('CODEX_API_KEY', env)
    def test_historical_verifier_success_marker_cannot_attest_upgrade(self):
        with self.assertRaisesRegex(installer.Refused, 'standard_pipeline_unverified'):
            self.exercise(marker='STANDARD_FIRST_EXEC_REAL_PIPELINE_OK')
    def test_new_marker_without_success_exit_refused(self):
        with self.assertRaisesRegex(installer.Refused, 'standard_pipeline_unverified'): self.exercise(code=1)
    def test_generic_failure_restores_parent_environment(self):
        with self.assertRaisesRegex(installer.Refused, 'generic_fixture_failure'): self.exercise(generic_error=True)


if __name__ == '__main__': unittest.main()
