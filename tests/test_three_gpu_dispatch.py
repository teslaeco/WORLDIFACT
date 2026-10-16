"""Offline operator controls for a future paid three-GPU procedural smoke test."""
from __future__ import annotations
import importlib
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from tools.gpu_trials.procedural_models import construct

TRIALS = importlib.import_module('tools.gpu_trials.runpod_three_gpu')


class SDKContractTests(unittest.TestCase):
    def test_runpod_2_app_and_ephemeral_task_handles_are_defined(self):
        import runpod
        self.assertTrue(hasattr(runpod, 'App'))
        self.assertTrue(hasattr(runpod, 'local_entrypoint'))
        for fn in (TRIALS.l4_chess_512_trial, TRIALS.a100_ecomech_trial,
                   TRIALS.h100_halloween_trial):
            self.assertTrue(callable(getattr(fn,'remote',None)))

    def test_quote_wont_authorize_unpriced_gpu_or_insufficient_budget(self):
        valid = {'gpus': [
            {'id':'NVIDIA L4','memory':24,'price':{'secure':.75},'availability':'HIGH',
             'dataCenters':[{'availability':'HIGH'}]},
            {'id':'NVIDIA A100 80GB PCIe','memory':80,'price':{'secure':2.0},'availability':'HIGH',
             'dataCenters':[{'availability':'HIGH'}]},
            {'id':'NVIDIA H100 80GB HBM3','memory':80,'price':{'secure':4.0},'availability':'MEDIUM',
             'dataCenters':[{'availability':'MEDIUM'}]},
        ]}
        result = TRIALS.quote_catalog(valid)
        self.assertAlmostEqual(result['estimated15MinutesEachUsd'],1.6875)
        self.assertEqual(set(result['hourly']),{'L4','A100','H100'})
        for bad in ({'gpus':[]},
                    {'gpus':valid['gpus'][:2]},
                    {'gpus':[{**valid['gpus'][0],'price':{'secure':8}},
                             *valid['gpus'][1:]]}):
            with self.assertRaises(TRIALS.Refused):
                TRIALS.quote_catalog(bad)

    def test_no_authorization_means_no_catalog_and_no_gpu(self):
        with patch.dict(os.environ,{'WORLDIFACT_PAID_GPU_APPROVAL':'no'},
                        clear=True):
            def impossible(*_):
                self.fail('A provider request was attempted without approval')
            with self.assertRaisesRegex(TRIALS.Refused,'NO_ONE_TIME_OWNER_APPROVAL'):
                TRIALS.operator_run(quotefn=impossible, dispatch=impossible)

    def test_cannot_submit_duplicate_or_reordered_expensive_tasks(self):
        env={'WORLDIFACT_PAID_GPU_APPROVAL':TRIALS.APPROVAL,
             'WORLDIFACT_GPU_TARGETS':'H100,A100,L4'}
        with patch.dict(os.environ,env,clear=True):
            with self.assertRaisesRegex(TRIALS.Refused,'UNEXPECTED_GPU_TEST_ORDER'):
                TRIALS.operator_run(quotefn=self.fail)

    def test_real_glb_receipt_synthetic_cpu_cannot_masquerade_as_gpu(self):
        with tempfile.TemporaryDirectory() as t:
            fake=construct('L4')
            with self.assertRaisesRegex(TRIALS.Refused,
                                        'WRONG_OR_UNVERIFIED_GPU_HARDWARE'):
                TRIALS.store_proven_trial(Path(t),'L4',fake)
            self.assertFalse(list(Path(t).iterdir()))

    def test_different_tasks_never_share_photos_or_claim_astra(self):
        for gpu in ('L4','A100','H100'):
            r=construct(gpu)
            self.assertEqual(r['gpuClass'],gpu)
            self.assertFalse(r['astraCallExecuted'])
            self.assertFalse(r['neuralImageTo3D'])
            self.assertEqual(r['originalImageMatch'],'NOT_MEASURED')
            self.assertTrue(r['meshCount']>=14)
            self.assertTrue(r['glbSha256'])

if __name__=='__main__':
    unittest.main(verbosity=2)
