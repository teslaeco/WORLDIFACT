"""Offline tests for independent, owner-approved, one-GPU RunPod batches.

Tests never provision GPU hardware or call a paid provider.
"""
from __future__ import annotations

import os
import unittest
from pathlib import Path
from unittest.mock import patch

from tools.gpu_trials import runpod_three_gpu as trial


def catalog(rows):
    return {"gpus": [
        {"id": name, "memory": memory, "price": {"secure": price},
         "availability": "HIGH", "dataCenters": [{"availability": "HIGH"}]}
        for name, memory, price in rows
    ]}


class SingleGpuTests(unittest.TestCase):
    def test_each_gpu_quote_is_independent_of_other_gpu_stock(self):
        profiles = [
            ("L4", "NVIDIA GeForce RTX 4090", 24, 1.2),
            ("A100", "NVIDIA A100 80GB PCIe", 80, 2.5),
            ("H100", "NVIDIA H100 80GB HBM3", 80, 4.5),
        ]
        for target, name, mem, cost in profiles:
            with self.subTest(target=target):
                result = trial.quote_catalog(catalog([(name, mem, cost)]), targets=(target,))
                self.assertEqual(list(result["hourly"]), [target])
                self.assertAlmostEqual(result["estimated15MinutesEachUsd"], cost / 4, places=4)
        with self.assertRaisesRegex(trial.Refused, "NO_VERIFIED_POD_H100"):
            trial.quote_catalog(catalog([("NVIDIA L4", 24, 1.1)]), targets=("H100",))

    def test_worst_case_price_wins_when_sdk_can_choose_multiple_skus(self):
        available = catalog([
            ("NVIDIA L4", 24, 0.69),
            ("NVIDIA GeForce RTX 4090", 24, 1.29),
        ])
        result = trial.quote_catalog(available, targets=("L4",))
        self.assertEqual(result["hourly"]["L4"], 1.29)
        self.assertEqual(result["quoteBasis"], "WORST_CASE_AVAILABLE_SECURE_POD_SKU")
        self.assertIs(result["walletVerified"], False)
        self.assertIsNone(result["actualBilledCostUsd"])

    def test_over_cap_second_choice_blocks_both_gpu_choices(self):
        # Reject even if the first eligible device is cheap: the RunPod SDK
        # can provision another allowed SKU, so min(price) was unsafe.
        available = catalog([
            ("NVIDIA L4", 24, 0.69),
            ("NVIDIA GeForce RTX 4090", 24, 1.90),
        ])
        with self.assertRaisesRegex(trial.Refused, "UNPRICED_OR_OVER_CAP_ELIGIBLE_L4_SKU"):
            trial.quote_catalog(available, targets=("L4",))

    def test_available_sku_without_secure_price_is_fail_closed(self):
        data = catalog([
            ("NVIDIA L4", 24, 0.69),
            ("NVIDIA GeForce RTX 4090", 24, 1.10),
        ])
        data["gpus"][1]["price"] = {"community": 0.2}
        with self.assertRaisesRegex(trial.Refused, "UNPRICED_OR_OVER_CAP_ELIGIBLE_L4_SKU"):
            trial.quote_catalog(data, targets=("L4",))

    def test_a100_alternative_cost_is_not_silently_understated(self):
        data = catalog([
            ("NVIDIA A100 80GB PCIe", 80, 2.0),
            ("NVIDIA A100-SXM4-80GB", 80, 3.4),
        ])
        result = trial.quote_catalog(data, targets=("A100",))
        self.assertEqual(result["hourly"]["A100"], 3.4)
        data["gpus"][1]["price"]["secure"] = 4.1
        with self.assertRaisesRegex(trial.Refused, "UNPRICED_OR_OVER_CAP_ELIGIBLE_A100_SKU"):
            trial.quote_catalog(data, targets=("A100",))

    def test_wrong_or_unavailable_skus_are_never_quoted(self):
        # A blacklisted/out-of-stock device is not a possible allocation.
        available = catalog([
            ("NVIDIA L4", 24, 0.95),
            ("NVIDIA GeForce RTX 4090", 24, 99.0),
        ])
        available["gpus"][1]["availability"] = "NONE"
        available["gpus"][1]["dataCenters"] = []
        result = trial.quote_catalog(available, targets=("L4",))
        self.assertEqual(result["hourly"]["L4"], 0.95)
        available["gpus"][0]["memory"] = 8
        with self.assertRaisesRegex(trial.Refused, "NO_VERIFIED_POD_L4"):
            trial.quote_catalog(available, targets=("L4",))

    def test_economy_l4_uses_4090_when_l4_is_unavailable(self):
        quote = trial.quote_catalog(catalog([
            ("NVIDIA GeForce RTX 4090", 24, 1.2)
        ]), targets=("L4",))
        self.assertEqual(quote["hourly"]["L4"], 1.2)

    def test_no_wrong_or_duplicate_batch_targets_are_accepted(self):
        for targets in (("L4","L4"), ("H100","A100","L4"), ("L4","UNKNOWN"), ()):
            with self.subTest(targets=targets):
                with self.assertRaises(trial.Refused):
                    trial.quote_catalog(catalog([]), targets=targets)

    def test_only_one_remote_dispatch_per_batch(self):
        quote_calls = []
        launched = []
        def quote_fn(key, targets):
            quote_calls.append(tuple(targets))
            return {"hourly": {targets[0]: 1.0}, "estimated15MinutesEachUsd": 0.25}
        def dispatch(target):
            launched.append(target)
            return {"gpuClass": target}
        verified = {"glbSha256": "a" * 64, "gpuName": "NVIDIA L4",
                    "task": "chess-cube-512-led-rook", "triangleCount": 900}
        with patch.dict(os.environ, {
            "WORLDIFACT_PAID_GPU_APPROVAL": trial.APPROVAL,
            "WORLDIFACT_GPU_TARGETS": "L4",
            "RUNPOD_API_KEY": "offline-test-never-send",
        }), patch.object(Path, "mkdir", return_value=None), \
             patch.object(trial, "store_proven_trial", return_value=verified):
            trial.operator_run(allowed=["L4"], dispatch=dispatch, quotefn=quote_fn)
        self.assertEqual(quote_calls, [("L4",)])
        self.assertEqual(launched, ["L4"])

    def test_no_implicit_bulk_or_missing_gpu_target(self):
        # A marker-approved run cannot spend on three GPUs by accident.
        for selected in ("L4,A100,H100", "", "A100,H100", "H100,L4"):
            with self.subTest(selected=selected):
                with patch.dict(os.environ, {
                    "WORLDIFACT_PAID_GPU_APPROVAL": trial.APPROVAL,
                    "WORLDIFACT_GPU_TARGETS": selected,
                }):
                    def never(*args, **kwargs):
                        self.fail("Unexpected provider call")
                    with self.assertRaisesRegex(trial.Refused, "UNEXPECTED_GPU_TEST_ORDER"):
                        trial.operator_run(quotefn=never, dispatch=never)

    def test_no_generation_without_explicit_approval(self):
        with patch.dict(os.environ, {
            "WORLDIFACT_PAID_GPU_APPROVAL": "DO_NOT_SPEND",
            "WORLDIFACT_GPU_TARGETS": "L4",
        }):
            def never(*args, **kwargs):
                self.fail("Provider invoked without owner approval")
            with self.assertRaisesRegex(trial.Refused, "NO_ONE_TIME_OWNER_APPROVAL"):
                trial.operator_run(dispatch=never, quotefn=never)


if __name__ == "__main__":
    unittest.main()
