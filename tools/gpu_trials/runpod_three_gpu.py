"""RunPod SDK 2.0: three separate ephemeral GPU Pods, automatically terminated.

Cost/use scope: at most one job per L4, A100-80GB and H100-80GB,
sequential; outputs are real procedural GLBs, NOT pretrained AI images.
Do not create a persistent GPU endpoint or persistent network volume.
Official SDK: https://docs.runpod.io/sdk/overview
"""
from __future__ import annotations

import base64
import json
import math
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

# Runpod CLI imports this file by path, not as a repository-root package.
# Keep the worker geometry module adjacent and importable after serialization.
LOCAL_MODULE_DIR = Path(__file__).resolve().parent
if str(LOCAL_MODULE_DIR) not in sys.path:
    sys.path.insert(0, str(LOCAL_MODULE_DIR))

import runpod

from procedural_models import TASKS, verified_model

APP_NAME = "worldifact-ephemeral-three-gpu-qualification-20261016"
APPROVAL = "GO-WORLDIFACT-THREE-EPHEMERAL-GPU-PROCEDURAL-20261016"
MAX_TOTAL_PROJECTED_USD = 8.0
MIN_REPORTED_WALLET_USD = 33.68
ESTIMATED_MAX_MINUTES_EACH = 15
GPU_CAPS = {"L4": 1.50, "A100": 3.50, "H100": 6.0}

app = runpod.App(APP_NAME)


@app.task(gpu=runpod.GpuType.NVIDIA_L4, gpu_count=1,
          container_disk_gb=40, dependencies=["torch==2.6.0", "numpy==2.3.5", "trimesh==4.11.1", "Pillow==12.3.0"])
def l4_chess_512_trial():
    from procedural_models import construct
    return construct("L4", require_cuda=True)


@app.task(gpu="A100", gpu_count=1,
          container_disk_gb=40, dependencies=["torch==2.6.0", "numpy==2.3.5", "trimesh==4.11.1", "Pillow==12.3.0"])
def a100_ecomech_trial():
    from procedural_models import construct
    return construct("A100", require_cuda=True)


@app.task(gpu="H100", gpu_count=1,
          container_disk_gb=40, dependencies=["torch==2.6.0", "numpy==2.3.5", "trimesh==4.11.1", "Pillow==12.3.0"])
def h100_halloween_trial():
    from procedural_models import construct
    return construct("H100", require_cuda=True)


class Refused(Exception):
    pass


def quote_catalog(data):
    if not isinstance(data, dict) or not isinstance(data.get("gpus"), list):
        raise Refused("GPU_POD_CATALOG_UNKNOWN")
    quote = {}
    names = {"L4": "NVIDIA L4", "A100": "A100", "H100": "H100"}
    for model, exact in names.items():
        prices = []
        for gpu in data["gpus"]:
            if not isinstance(gpu, dict) or not isinstance(gpu.get("id"), str):
                continue
            if model == "L4" and gpu["id"] != exact:
                continue
            if model != "L4" and exact not in gpu["id"].upper():
                continue
            if model in ("A100", "H100") and gpu.get("memory", 0) < 80:
                continue
            value = gpu.get("price", {}).get("secure")
            if not isinstance(value, (int, float)) or not math.isfinite(value):
                continue
            if not 0 < value <= GPU_CAPS[model]:
                continue
            if gpu.get("availability") not in ("HIGH", "MEDIUM", "LOW"):
                continue
            if not any(x.get("availability") in ("HIGH", "MEDIUM", "LOW")
                       for x in gpu.get("dataCenters", [])):
                continue
            prices.append(float(value))
        if not prices:
            raise Refused(f"NO_VERIFIED_POD_{model}_HARDWARE_OR_PRICE")
        quote[model] = min(prices)
    exposure = sum(quote.values()) * ESTIMATED_MAX_MINUTES_EACH / 60
    if exposure > MAX_TOTAL_PROJECTED_USD or exposure >= MIN_REPORTED_WALLET_USD / 2:
        raise Refused("PROJECTED_GPU_TEST_EXPOSURE_TOO_HIGH")
    return {"hourly": quote, "estimated15MinutesEachUsd": round(exposure, 4)}


def live_quote(key: str) -> dict:
    if not isinstance(key, str) or len(key) < 12:
        raise Refused("MISSING_SERVER_ONLY_RUNPOD_API_KEY")
    url = ("https://api.runpod.io/v2/catalog/gpus?"
           "include=AVAILABILITY&product=POD&count=1&cloud=SECURE")
    request = urllib.request.Request(url, headers={
        "Authorization": "Bearer " + key, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=14) as response:
            if response.status != 200:
                raise Refused("POD_CATALOG_NOT_CONFIRMED")
            if "json" not in response.headers.get("content-type", ""):
                raise Refused("WRONG_PROVIDER_CATALOG_TYPE")
            data = response.read(300_001)
            if len(data) > 300_000:
                raise Refused("OVERSIZED_PROVIDER_CATALOG")
    except (urllib.error.URLError, TimeoutError):
        raise Refused("RUNPOD_POD_CATALOG_UNAVAILABLE") from None
    try:
        return quote_catalog(json.loads(data))
    except (ValueError, TypeError, KeyError):
        raise Refused("INVALID_PROVIDER_CATALOG") from None


def store_proven_trial(out_dir: Path, gpu_class: str, response: dict):
    if not isinstance(response, dict) or response.get("gpuClass") != gpu_class:
        raise Refused("GPU_RESPONSE_INVALID_OR_WRONG_CLASS")
    gpu = response.get("gpuName", "")
    if gpu_class not in str(gpu).upper() or response.get("gpuVramGiB", 0) < (
            21 if gpu_class == "L4" else 72):
        raise Refused("WRONG_OR_UNVERIFIED_GPU_HARDWARE")
    if response.get("cudaMatrixChecksum") is None or response.get("cudaComputeMs") is None:
        raise Refused("GPU_MATH_NOT_CONFIRMED")
    raw = verified_model(response)
    out = out_dir / (TASKS[gpu_class] + ".glb")
    out.write_bytes(raw)
    public_receipt = {k: value for k, value in response.items()
                      if k != "glbBase64"}
    public_receipt["gpuResultValidated"] = True
    (out_dir / (TASKS[gpu_class] + ".json")).write_text(
        json.dumps(public_receipt, indent=2, sort_keys=True) + "\n")
    return public_receipt


def operator_run(allowed: list[str] | None = None, dispatch=None, quotefn=live_quote):
    if os.getenv("WORLDIFACT_PAID_GPU_APPROVAL") != APPROVAL:
        raise Refused("NO_ONE_TIME_OWNER_APPROVAL")
    raw_targets = os.getenv("WORLDIFACT_GPU_TARGETS", "L4,A100,H100")
    targets = raw_targets.split(",")
    if targets != ["L4", "A100", "H100"]:
        raise Refused("UNEXPECTED_GPU_TEST_ORDER_OR_DUPLICATE")
    quote = quotefn(os.environ.get("RUNPOD_API_KEY", ""))
    if allowed is not None and allowed != targets:
        raise Refused("UNEXPECTED_TARGET_SELECTION")
    out_dir = Path("gpu-trial-artifacts")
    out_dir.mkdir(exist_ok=False)
    functions = {"L4": l4_chess_512_trial, "A100": a100_ecomech_trial,
                 "H100": h100_halloween_trial}
    for name in targets:
        start = time.monotonic()
        try:
            if dispatch is not None:
                response = dispatch(name)
            else:
                # Exactly one call, never retry an ambiguous GPU provisioning.
                response = functions[name].remote()
            report = store_proven_trial(out_dir, name, response)
            report["wallClockSeconds"] = round(time.monotonic() - start, 2)
            print(json.dumps({"gpuClass": name, "status": "ACTUAL_PROCEDURAL_GPU_GLB",
                              "sha256": report["glbSha256"],
                              "gpuName": report["gpuName"],
                              "model": report["task"],
                              "triangles": report["triangleCount"]}), flush=True)
        except Exception:
            print(json.dumps({"gpuClass": name,
                              "status": "FAILED_NO_AUTOMATIC_PAID_RETRY"}), flush=True)
            raise
    print(json.dumps({"completed": 3, "mode": "PROCEDURAL_NOT_NEURAL",
                      "quoted15MinuteMaximum": quote["estimated15MinutesEachUsd"],
                      "permanentStorageCreated": False}), flush=True)


@runpod.local_entrypoint
def main():
    try:
        operator_run()
    except Refused as exc:
        print(json.dumps({"status": "NOT_DISPATCHED", "reason": str(exc)}))
        raise SystemExit(2)
