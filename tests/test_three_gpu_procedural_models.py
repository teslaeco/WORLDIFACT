"""Tests use CPU only and public synthetic geometry; NO provider or user images."""
from __future__ import annotations
import importlib.util
import json
import struct
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('worldifact_trials',ROOT/'tools/gpu_trials/procedural_models.py')
models=importlib.util.module_from_spec(spec)
spec.loader.exec_module(models)

class RealProceduralGLBTests(unittest.TestCase):
    def test_three_distinct_complete_real_glb_models(self):
        checks={}
        for name in ('L4','A100','H100'):
            with self.subTest(gpu=name):
                result=models.construct(name, require_cuda=False)
                raw=models.verified_model(result)
                self.assertTrue(raw.startswith(b'glTF'))
                self.assertEqual(result['gpuName'],'CPU_OFFLINE_ONLY')
                self.assertFalse(result['astraCallExecuted'])
                self.assertFalse(result['neuralImageTo3D'])
                self.assertFalse(result['makeReady'])
                checks[name]=result['glbSha256']
                length,kind=struct.unpack_from('<II',raw,12)
                self.assertEqual(kind,0x4e4f534a)
                scene=json.loads(raw[20:20+length])
                self.assertGreaterEqual(len(scene['meshes']),14)
                self.assertTrue(any('pbrMetallicRoughness' in m for m in scene.get('materials',[])))
                self.assertGreaterEqual(len(scene.get('nodes',[])),14)
        self.assertEqual(len(set(checks.values())),3)

    def test_repeatability_same_geometry_same_sha(self):
        first=models.construct('L4')
        second=models.construct('L4')
        self.assertEqual(first['glbSha256'],second['glbSha256'])

    def test_gpu_branch_requires_actual_cuda(self):
        # CI CPU runners must never invent a CUDA result.
        import torch
        if not torch.cuda.is_available():
            with self.assertRaisesRegex(RuntimeError,'CUDA_GPU_REQUIRED'):
                models.construct('L4',require_cuda=True)

    def test_false_claim_never_accepted(self):
        value=models.construct('A100')
        value['astraCallExecuted']=True
        with self.assertRaises(ValueError):
            models.verified_model(value)

    def test_wrong_task_rejected(self):
        with self.assertRaisesRegex(ValueError,'UNKNOWN_BOUNDED_3D_TASK'):
            models.construct('GPU_WHICH_DOES_NOT_EXIST')
if __name__=='__main__': unittest.main(verbosity=2)
