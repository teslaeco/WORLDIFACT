"""Source guardrails so a future edit cannot silently turn one-shot GPU jobs into idle pods."""
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
WF=(ROOT/'.github/workflows/three-gpu-trials-live-once.yml').read_text()
CODE=(ROOT/'tools/gpu_trials/runpod_three_gpu.py').read_text()

class Safety(unittest.TestCase):
    def test_only_main_marker_may_run_paid_generation(self):
        self.assertIn("branches: ['main']",WF)
        self.assertIn("paths: ['ops/THREE_GPU_EPHEMERAL_PAID_ONCE_20261016.json']",WF)
        self.assertNotIn('pull_request:',WF)
        self.assertIn('environment: Production',WF)
        self.assertIn('PAID_GPU_APPROVAL_MARKER_MISMATCH',WF)
    def test_official_sdk_dev_session_runs_once_then_exits(self):
        self.assertIn('rp flash dev tools/gpu_trials/runpod_three_gpu.py --once',WF)
        self.assertIn('timeout --signal=INT --kill-after=120s 35m',WF)
        self.assertIn('provider-postflight:',WF)
        self.assertIn('if: always()',WF)
    def test_no_permanent_disk_and_one_gpu_per_task(self):
        self.assertEqual(CODE.count('@app.task('),3)
        self.assertEqual(CODE.count('gpu_count=1'),3)
        self.assertNotIn('runpod.NetworkVolume',CODE)
        self.assertNotIn('runpod.GlobalVolume',CODE)
        self.assertNotIn('@app.queue',CODE)
        self.assertNotIn('@app.api',CODE)
        self.assertNotIn('runpod.create_pod(',CODE)
    def test_at_most_one_paid_call_per_gpu_class_no_automatic_retry(self):
        self.assertIn('for name in targets:',CODE)
        self.assertIn('response = functions[name].remote()',CODE)
        self.assertIn('FAILED_NO_AUTOMATIC_PAID_RETRY',CODE)
        self.assertIn('NO_ONE_TIME_OWNER_APPROVAL',CODE)
        self.assertIn('MAX_TOTAL_PROJECTED_USD = 8.0',CODE)
    def test_paid_and_offline_workflows_have_valid_yaml_and_two_phase_cleanup(self):
        import yaml
        live=yaml.safe_load(WF)
        offline=yaml.safe_load((ROOT/'.github/workflows/three-gpu-trials-offline.yml').read_text())
        self.assertIn('three-gpu',live['jobs'])
        self.assertIn('provider-postflight',live['jobs'])
        self.assertIn('cpu-only-real-glb',offline['jobs'])
        # Python PyYAML 1.1 parses literal YAML 'on' as the boolean key True.
        self.assertIn('main',live.get(True,live.get('on'))['push']['branches'])
        steps=live['jobs']['three-gpu']['steps']
        self.assertTrue(any('--once' in str(x.get('run','')) for x in steps))
        self.assertEqual(live['jobs']['provider-postflight']['needs'],'three-gpu')
if __name__=='__main__':unittest.main()
