"""Offline regression for RunPod Flash dev shipping ONLY decorated function bodies.

No GPU and no provider credentials are required for these tests.
"""
from __future__ import annotations

import ast
import hashlib
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "tools/gpu_trials/runpod_three_gpu.py"
GEOMETRY = ROOT / "tools/gpu_trials/procedural_models.py"
PINNED_GEOMETRY_BLOB = "91d87511b507b72652422ba7839ec28f0fcb1c93"
TASK_NAMES = ("l4_chess_512_trial", "a100_ecomech_trial", "h100_halloween_trial")


def isolated_worker(name: str):
    """Emulate Flash dev's function-body-only remote code packaging."""
    tree = ast.parse(SCRIPT.read_text(encoding="utf-8"), filename=str(SCRIPT))
    target = next(node for node in tree.body
                  if isinstance(node, ast.FunctionDef) and node.name == name)
    target.decorator_list = []
    standalone = ast.Module(body=[target], type_ignores=[])
    ast.fix_missing_locations(standalone)
    isolated_namespace = {"__name__": "_flash_remote_task_without_repo_files"}
    exec(compile(standalone, str(SCRIPT), "exec"), isolated_namespace)
    return isolated_namespace[name]


class FlashWorkerTransport(unittest.TestCase):
    def test_source_is_exact_git_blob_pinned_inside_worker_and_locally(self):
        raw = GEOMETRY.read_bytes()
        actual = hashlib.sha1(b"blob " + str(len(raw)).encode("ascii") + b"\0" + raw).hexdigest()
        self.assertEqual(actual, PINNED_GEOMETRY_BLOB)

    def test_all_remote_functions_refuse_modified_geometry_before_cuda(self):
        source = GEOMETRY.read_text(encoding="utf-8")
        for name in TASK_NAMES:
            with self.subTest(worker=name):
                task = isolated_worker(name)
                self.assertTrue(callable(task))
                with self.assertRaisesRegex(RuntimeError, "UNREVIEWED_REMOTE_GEOMETRY_SOURCE"):
                    task(source + "\n# tampered\n")

    def test_verified_source_reaches_cuda_gate_without_remote_filesystem_import(self):
        source = GEOMETRY.read_text(encoding="utf-8")
        fake_torch = types.SimpleNamespace(
            cuda=types.SimpleNamespace(is_available=lambda: False))
        for name in TASK_NAMES:
            with self.subTest(worker=name):
                task = isolated_worker(name)
                with patch.dict(sys.modules, {"torch": fake_torch}):
                    with self.assertRaisesRegex(RuntimeError, "CUDA_GPU_REQUIRED"):
                        task(source)

    def test_remote_generated_live_module_imports_without_sibling_source_file(self):
        # Exactly the failure seen in paid runs #38877860327 and #38879132929:
        # RunPod moves the source to /tmp/runpod_live_<hash>.py but does not
        # transfer repository-adjacent procedural_models.py.
        import subprocess
        import tempfile
        from pathlib import Path
        source = SCRIPT.read_text(encoding="utf-8")
        with tempfile.TemporaryDirectory(prefix="runpod-flash-isolation-") as isolated:
            target = Path(isolated) / "runpod_live_isolated.py"
            target.write_text(source, encoding="utf-8")
            self.assertFalse((Path(isolated) / "procedural_models.py").exists())
            program = (
                "import importlib.util; from pathlib import Path; "
                f"p=Path({str(target)!r}); "
                "spec=importlib.util.spec_from_file_location('worldifact_isolated_flash',p); "
                "module=importlib.util.module_from_spec(spec); spec.loader.exec_module(module); "
                "assert callable(module.l4_chess_512_trial.remote); "
                "assert callable(module.a100_ecomech_trial.remote); "
                "assert callable(module.h100_halloween_trial.remote)"
            )
            proc = subprocess.run([sys.executable, "-c", program],
                                  cwd=isolated, text=True,
                                  capture_output=True, timeout=30)
            self.assertEqual(proc.returncode, 0, proc.stderr[-1200:])

    def test_isolated_gpu_response_persistence_needs_no_repo_module(self):
        import json
        import subprocess
        import tempfile
        from pathlib import Path
        from tools.gpu_trials.procedural_models import construct
        fixture = construct("L4", require_cuda=False)
        # This is a CPU fixture with intentionally simulated GPU attestation
        # to validate serialization only, NEVER to publish as a true CUDA GLB.
        fixture["gpuName"] = "NVIDIA GeForce RTX 4090"
        fixture["gpuVramGiB"] = 23.9
        fixture["cudaMatrixChecksum"] = 1.0
        fixture["cudaComputeMs"] = 40.0
        with tempfile.TemporaryDirectory(prefix="runpod-store-response-") as isolated:
            directory = Path(isolated)
            (directory / "runpod_live_isolated.py").write_text(
                SCRIPT.read_text(encoding="utf-8"), encoding="utf-8")
            (directory / "input_receipt.json").write_text(json.dumps(fixture))
            (directory / "geometry_payload.txt").write_text(
                GEOMETRY.read_text(encoding="utf-8"))
            (directory / "gpu-trial-artifacts").mkdir()
            self.assertFalse((directory / "procedural_models.py").exists())
            program = """
import importlib.util, json
from pathlib import Path
source = Path('runpod_live_isolated.py')
spec = importlib.util.spec_from_file_location('worldifact_isolated_store',source)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
model = json.loads(Path('input_receipt.json').read_text())
payload = Path('geometry_payload.txt').read_text()
receipt = module.store_proven_trial(Path('gpu-trial-artifacts'),'L4',model,payload)
assert receipt['gpuResultValidated'] is True
assert Path('gpu-trial-artifacts/chess-cube-512-led-rook.glb').read_bytes()[:4] == b'glTF'
assert Path('gpu-trial-artifacts/chess-cube-512-led-rook.json').is_file()
"""
            proc = subprocess.run([sys.executable, "-c", program],
                                  cwd=directory, text=True,
                                  capture_output=True, timeout=45)
            self.assertEqual(proc.returncode, 0, proc.stderr[-1200:])

    def test_no_module_level_repo_imports_in_generated_worker(self):
        tree = ast.parse(SCRIPT.read_text(encoding="utf-8"))
        imports = [node for node in tree.body
                   if isinstance(node, ast.ImportFrom)]
        self.assertFalse(any(node.module == "procedural_models" for node in imports))
        self.assertFalse(any(isinstance(node, ast.Import) and
                             any(alias.name == "procedural_models" for alias in node.names)
                             for node in tree.body))

    def test_remote_worker_never_needs_repo_module_in_function_body(self):
        tree = ast.parse(SCRIPT.read_text(encoding="utf-8"))
        functions = {node.name: node for node in tree.body
                     if isinstance(node, ast.FunctionDef)}
        for name in TASK_NAMES:
            imports = [node for node in ast.walk(functions[name])
                       if isinstance(node, ast.ImportFrom)]
            self.assertFalse(any(node.module == "procedural_models" for node in imports))


if __name__ == "__main__":
    unittest.main()
