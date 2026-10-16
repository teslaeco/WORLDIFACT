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
