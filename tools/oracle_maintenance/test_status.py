"""Local synthetic reconciliation fixtures; no Oracle, credentials or providers."""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import runpy
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import status


REPO = Path(__file__).absolute().parents[2]
HEALTH_SOURCE = REPO / 'tools/model_construction/construction_health.py'
HEALTH = runpy.run_path(str(HEALTH_SOURCE))
OLD = b'# synthetic previous parser\n'
NEW = (REPO / 'tools/model_construction/construction_payload.py').read_bytes()


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def result(success=True, restored=None, committed=True):
    value = {'phase': status.SUCCESS if success else status.FAILURE, 'revision': status.REVISION,
             'paid_generation_requested': False, 'job_rows_changed': False,
             'provider_limits_changed': False, 'previous_source_restored': restored,
             'activation_committed': committed}
    if not success:
        value['refusal_code'] = 'unconfirmed'
    return value


class StatusTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.home = Path(self.tmp.name)
        self.source = self.home / 'froge-connector'
        self.source.mkdir()
        self.attempt_root = self.home / '.local/state/worldifact-astra-guard'
        self.attempt_root.mkdir(parents=True)
        self.lock = self.home / '.local/state/worldifact-fast/installation.lock'
        self.lock.parent.mkdir()
        self.lock.write_bytes(b'')
        old = patch.object(status, 'OLD_PARSER', sha(OLD))
        old.start()
        self.addCleanup(old.stop)
        self.install()

    def test_pure_helper_pin_and_new_parser_match_unchanged_reviewed_bytes(self):
        self.assertEqual(sha(HEALTH_SOURCE.read_bytes()), status.HEALTH_HASH)
        self.assertEqual(sha(NEW), status.NEW_PARSER)

    def install(self, updated=False):
        for name in HEALTH['SOURCES'] | {'astra_spend.py', 'fast_preview.py'}:
            raw = ('# Synthetic attested source: ' + name + '\n').encode()
            if name == 'construction_health.py':
                raw = HEALTH_SOURCE.read_bytes()
            elif name == 'construction_payload.py':
                raw = NEW if updated else OLD
            (self.source / name).write_bytes(raw)
        hashes = {name: sha((self.source / name).read_bytes()) for name in HEALTH['SOURCES']}
        fenced = {'maintenance_fence': HEALTH['FENCE_REVISION'],
                  'cancelled_cleanup_interruption_approved': False,
                  'offline_generic_pipeline': True, 'offline_cabinet_pipeline': True,
                  'offline_standard_pipeline': True}
        chain = {}
        for name, (revision, names) in HEALTH['CHAIN_LAYOUT'].items():
            chain[name] = {'revision': revision, 'sha256': {key: hashes[key] for key in names}}
            if names in (HEALTH['PRICING_SOURCES'], HEALTH['CORE_SOURCES']):
                chain[name].update(fenced)
        chain[HEALTH['GENERIC_RECEIPT']] = {
            'sources': {name: hashes[name] for name in ('codex_runner.py', 'blender_mcp.py')},
            'cli_mcp_roundtrip': True, 'code_mode_roundtrip': True, 'blender_build_roundtrip': True}
        chain[HEALTH['GUARD_RECEIPT']] = {
            'revision': 'astra-usd175-v1',
            'sha256': {name: sha((self.source / name).read_bytes())
                       for name in ('codex_runner.py', 'astra_spend.py', 'fast_preview.py')},
            'outputPolicy': {'revision': 'astra-low-reconciled-v2', 'sha256': hashes['astra_spend_v2.py']}}
        for name, value in chain.items():
            path = self.source / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(value))
        receipt = {'revision': HEALTH['REVISION'], 'sha256': hashes, **fenced,
                   'offline_phased_standard_pipeline': True,
                   'receipt_sha256': {name: sha((self.source / name).read_bytes()) for name in chain}}
        if updated:
            receipt['payload_update'] = {'revision': 'responses-reasoning-content-v1',
                                        'previous_construction_receipt_sha256': 'a' * 64,
                                        'verified_generic_receipt_sha256': 'b' * 64}
        (self.source / HEALTH['RECEIPT']).write_text(json.dumps(receipt))

    def attempt(self, timestamp, report=None):
        directory = self.attempt_root / ('standard-construction-' + timestamp + '-1234abcd')
        directory.mkdir()
        if report is not None:
            (directory / 'INSTALL_STATUS.json').write_text(json.dumps(report))
        return directory

    def probe(self, change=None, states=None):
        calls = []

        def run(argv, **kwargs):
            self.assertEqual(argv, ['/usr/bin/systemctl', '--user', 'show', 'froge-worker.service',
                                    '--property=ActiveState,SubState,MainPID'])
            self.assertNotIn('shell', kwargs)
            self.assertEqual(kwargs['env']['HOME'], str(self.home))
            calls.append(1)
            if change and len(calls) == 1:
                change()
            stdout = states[len(calls) - 1] if states else 'ActiveState=active\nSubState=running\nMainPID=1234\n'
            return SimpleNamespace(returncode=0, stdout=stdout)

        with patch.object(status.subprocess, 'run', side_effect=run):
            return status.read_status(self.home)

    def test_previous_complete_chain_is_read_only_and_ready(self):
        before = {p: p.read_bytes() for p in self.home.rglob('*') if p.is_file()}
        value = self.probe()
        self.assertEqual(value['parser_version'], 'previous')
        self.assertTrue(value['snapshot_stable'])
        self.assertTrue(value['construction_health_verified'])
        self.assertEqual(status.classify(value), 'ready_to_apply')
        self.assertEqual(before, {p: p.read_bytes() for p in self.home.rglob('*') if p.is_file()})

    def test_updated_requires_current_receipt_and_completed_attempt(self):
        self.install(True)
        self.assertEqual(status.classify(self.probe()), 'inconclusive')
        self.attempt('20261008T090000Z', result())
        value = self.probe()
        self.assertEqual(value['parser_sha256'], status.NEW_PARSER)
        self.assertEqual(status.classify(value), 'already_updated')

    def test_pending_latest_two_only_and_maintenance_busy(self):
        self.attempt('20261008T085126Z', {'secret': 'excluded'})
        self.attempt('20261008T085200Z')
        self.attempt('20261008T085300Z', status.STAGED)
        (self.source / '.worldifact-standard-maintenance.json').write_text('{}')
        value = self.probe()
        self.assertEqual([v['attempt_utc'] for v in value['recent_attempts']],
                         ['20261008T085300Z', '20261008T085200Z'])
        self.assertEqual(status.classify(value), 'busy')
        self.assertNotIn('excluded', json.dumps(value))

    def test_interrupted_and_contradictory_attempts_refuse(self):
        attempt = self.attempt('20261008T090000Z')
        for report in (None, status.STAGED, result(), result(False, None, None), result(False, False, False)):
            with self.subTest(report=report):
                if report is not None:
                    (attempt / 'INSTALL_STATUS.json').write_text(json.dumps(report))
                self.assertEqual(status.classify(self.probe()), 'inconclusive')
        (attempt / 'INSTALL_STATUS.json').write_text(json.dumps(result(False, True, False)))
        self.assertEqual(status.classify(self.probe()), 'ready_to_apply')

    def test_unsafe_links_and_parent_refuse_without_contents(self):
        for filename in ('construction_payload.py', HEALTH['RECEIPT'], '.worldifact-standard-maintenance.json'):
            with self.subTest(filename=filename):
                path = self.source / filename
                raw = path.read_bytes() if path.exists() else None
                path.unlink(missing_ok=True)
                path.symlink_to('/etc/passwd')
                self.assertEqual(self.probe().get('refusal'), 'unsafe_or_unavailable_read')
                path.unlink()
                if raw is not None:
                    path.write_bytes(raw)
        real = self.home / 'real-source'
        self.source.rename(real)
        self.source.symlink_to(real, target_is_directory=True)
        self.assertEqual(self.probe().get('refusal'), 'unsafe_or_unavailable_read')

    def test_state_change_flagged(self):
        value = self.probe(lambda: self.install(True))
        self.assertFalse(value['snapshot_stable'])
        self.assertIn('source_or_receipt', value['changed_components'])
        self.assertEqual(status.classify(value), 'inconclusive')

    def test_new_attempt_during_snapshot_flagged(self):
        value = self.probe(lambda: self.attempt('20261008T090000Z'))
        self.assertIn('attempt_selection', value['changed_components'])
        self.assertEqual(status.classify(value), 'inconclusive')

    def test_unsafe_report_is_never_released(self):
        self.attempt('20261008T090000Z', {**result(False), 'secret': 'never-print'})
        value = self.probe()
        self.assertEqual(value.get('refusal'), 'unsafe_or_unavailable_read')
        self.assertNotIn('never-print', json.dumps(value))

    def test_tampered_helper_never_executes(self):
        (self.source / 'construction_health.py').write_text("raise RuntimeError('private-text')\n")
        value = self.probe()
        self.assertFalse(value['construction_health_verified'])
        self.assertEqual(status.classify(value), 'inconclusive')
        self.assertNotIn('private-text', json.dumps(value))

    def test_other_bound_source_change_invalidates_health(self):
        (self.source / 'server.py').write_text('# changed\n')
        self.assertFalse(self.probe()['construction_health_verified'])

    def test_real_local_flock_is_reported_without_touching_lock(self):
        before = status.identity(self.lock.stat())
        with self.lock.open('rb') as held:
            fcntl.flock(held, fcntl.LOCK_EX | fcntl.LOCK_NB)
            value = self.probe()
            self.assertEqual(status.classify(value), 'busy')
            self.assertEqual(value['observed_flock_holders'][0]['pid'], os.getpid())
            self.assertGreater(value['observed_flock_holders'][0]['start_ticks'], 0)
        self.assertEqual(status.identity(self.lock.stat()), before)
        self.assertEqual(status.classify(self.probe()), 'ready_to_apply')

    def test_worker_transition_is_inconclusive(self):
        value = self.probe(states=['ActiveState=active\nSubState=running\nMainPID=1234\n',
                                  'ActiveState=inactive\nSubState=dead\nMainPID=0\n'])
        self.assertIn('worker', value['changed_components'])
        self.assertEqual(status.classify(value), 'inconclusive')

    def test_duplicate_oversized_and_special_files_refuse(self):
        receipt = self.source / HEALTH['RECEIPT']
        for raw in (b'{"revision":null,"revision":null}', b'x' * 16385):
            receipt.write_bytes(raw)
            self.assertEqual(self.probe().get('refusal'), 'unsafe_or_unavailable_read')
        receipt.unlink()
        os.mkfifo(receipt)
        self.assertEqual(self.probe().get('refusal'), 'unsafe_or_unavailable_read')

    def test_strict_result_schema_rejects_flags_and_unknown_data(self):
        for value in ({**result(), 'paid_generation_requested': 0},
                      {**result(), 'previous_source_restored': False},
                      {**result(False), 'refusal_code': 'private text'},
                      {**result(False), 'unrecognized': 'data'}):
            with self.subTest(value=value), self.assertRaises(ValueError):
                status.safe_result(value)


if __name__ == '__main__':
    unittest.main()
