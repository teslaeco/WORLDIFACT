"""Synthetic fixtures test the tool, NOT a model, Kaggle score or real exports."""
import copy
import hashlib
import json
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

from preflight import BIN_CHUNK, JSON_CHUNK, check_bytes, check_file

DOC = {
    "asset": {"version": "2.0", "generator": "WORLDIFACT synthetic test fixture"},
    "buffers": [{"byteLength": 36}],
    "bufferViews": [{"buffer": 0, "byteLength": 36}],
    "accessors": [{"bufferView": 0, "componentType": 5126, "count": 3,
                   "type": "VEC3", "min": [0, 0, 0], "max": [1, 1, 0]}],
    "meshes": [{"primitives": [{"attributes": {"POSITION": 0}}]}],
    "nodes": [{"mesh": 0}], "scenes": [{"nodes": [0]}], "scene": 0,
}
POSITIONS = struct.pack("<9f", 0, 0, 0, 1, 0, 0, 0, 1, 0)


def glb(doc=None, binary=POSITIONS, raw_json=None, extra=b""):
    raw = raw_json if raw_json is not None else json.dumps(DOC if doc is None else doc).encode()
    raw += b" " * (-len(raw) % 4)
    chunks = struct.pack("<II", len(raw), JSON_CHUNK) + raw
    if binary is not None:
        binary += b"\x00" * (-len(binary) % 4)
        chunks += struct.pack("<II", len(binary), BIN_CHUNK) + binary
    chunks += extra
    return struct.pack("<4sII", b"glTF", 2, 12 + len(chunks)) + chunks


class PreflightTests(unittest.TestCase):
    def error(self, data, expected):
        report = check_bytes(data)
        self.assertNotEqual(report["status"], "PASS_PARTIAL_CHECKS")
        self.assertEqual(report["error"], expected)

    def test_valid_triangle_has_partial_status_only(self):
        report = check_bytes(glb())
        self.assertEqual(report["status"], "PASS_PARTIAL_CHECKS")
        self.assertEqual(report["mesh_declarations"], 1)
        self.assertEqual(report["full_gltf_validation"], "NOT_RUN")
        self.assertEqual(report["geometry_quality"], "UNKNOWN")
        self.assertEqual(report["manufacturing"], "NOT_APPROVED")
        self.assertEqual(report["model_inference"], "NOT_RUN")

    def test_empty_valid_container_is_not_claimed_to_be_model(self):
        report = check_bytes(glb({"asset": {"version": "2.0"}}, None))
        self.assertEqual(report["status"], "PASS_PARTIAL_CHECKS")
        self.assertEqual(report["mesh_declarations"], 0)

    def test_sha256_reproducible(self):
        self.assertEqual(check_bytes(glb())["sha256"], hashlib.sha256(glb()).hexdigest())

    def test_empty_file(self): self.error(b"", "TRUNCATED_HEADER")
    def test_html_error_disguised_as_glb(self): self.error(b"<html>server error</html>", "BAD_MAGIC")

    def test_wrong_version(self):
        data = bytearray(glb()); struct.pack_into("<I", data, 4, 1)
        self.error(bytes(data), "UNSUPPORTED_GLB_VERSION")

    def test_truncated_download(self): self.error(glb()[:-4], "FILE_LENGTH_MISMATCH")
    def test_extra_download_bytes(self): self.error(glb() + b"more", "FILE_LENGTH_MISMATCH")

    def test_chunk_bounds(self):
        data = bytearray(glb()); struct.pack_into("<I", data, 12, 100000)
        self.error(bytes(data), "TRUNCATED_CHUNK_DATA")

    def test_chunk_alignment(self):
        data = bytearray(glb()); struct.pack_into("<I", data, 12, 7)
        self.error(bytes(data), "CHUNK_ALIGNMENT")

    def test_json_must_be_first(self):
        data = bytearray(glb()); struct.pack_into("<I", data, 16, BIN_CHUNK)
        self.error(bytes(data), "CHUNK_ORDER")

    def test_duplicate_json_chunk(self):
        self.error(glb({"asset": {"version": "2.0"}}, None,
                       extra=struct.pack("<II", 4, JSON_CHUNK) + b"{}  "), "CHUNK_ORDER")

    def test_unknown_chunk_is_unsupported_not_validated(self):
        report = check_bytes(glb({"asset": {"version": "2.0"}}, None,
                                 extra=struct.pack("<II", 4, 123) + b"1234"))
        self.assertEqual(report["status"], "UNSUPPORTED_PROFILE")

    def test_bad_json(self): self.error(glb(raw_json=b"no json"), "INVALID_JSON")
    def test_json_root_array(self): self.error(glb(raw_json=b"[]"), "JSON_ROOT_NOT_OBJECT")
    def test_duplicate_key(self): self.error(glb(raw_json=b'{"a":1,"a":2}'), "JSON_DUPLICATE_KEY")

    def test_nonfinite_numbers(self):
        for value in (b"NaN", b"Infinity", b"-Infinity", b"1e999"):
            with self.subTest(value=value):
                self.error(glb(raw_json=b'{"x":' + value + b'}'), "JSON_NONFINITE_NUMBER")

    def test_json_size_limit(self):
        with patch("preflight.MAX_JSON_BYTES", 4): self.error(glb(), "JSON_SIZE_LIMIT")

    def test_file_size_limit(self):
        with patch("preflight.MAX_FILE_BYTES", 4): self.error(glb(), "FILE_TOO_LARGE")

    def test_asset_version(self): self.error(glb({"asset": {"version": "1.0"}}, None), "ASSET_VERSION")

    def test_missing_bin(self): self.error(glb(binary=None), "MISSING_BIN_CHUNK")
    def test_short_binary(self): self.error(glb(binary=b"abcd"), "BIN_LENGTH_MISMATCH")
    def test_long_binary(self): self.error(glb(binary=POSITIONS + b"1234"), "BIN_LENGTH_MISMATCH")

    def test_zero_padding_allowed_and_nonzero_rejected(self):
        doc = copy.deepcopy(DOC); doc["buffers"][0]["byteLength"] = 35
        doc["bufferViews"][0]["byteLength"] = 35
        self.assertEqual(check_bytes(glb(doc, b"x" * 35))["status"], "PASS_PARTIAL_CHECKS")
        self.error(glb(doc, b"x" * 36), "BIN_PADDING")

    def test_boolean_not_integer(self):
        doc = copy.deepcopy(DOC); doc["buffers"][0]["byteLength"] = True
        self.error(glb(doc), "BUFFER_LENGTH")

    def test_buffer_view_out_of_bounds(self):
        doc = copy.deepcopy(DOC); doc["bufferViews"][0]["byteOffset"] = 4
        self.error(glb(doc), "BUFFER_VIEW_BOUNDS")

    def test_wrong_buffer_index(self):
        doc = copy.deepcopy(DOC); doc["bufferViews"][0]["buffer"] = 1
        self.error(glb(doc), "BUFFER_VIEW_INDEX")

    def test_external_and_data_resources_never_fetched(self):
        for uri in ("https://example.invalid/model.bin", "../../private.bin", "data:image/png;base64,AA=="):
            with self.subTest(uri=uri):
                doc = copy.deepcopy(DOC); doc["images"] = [{"uri": uri}]
                report = check_bytes(glb(doc))
                self.assertEqual(report["status"], "UNSUPPORTED_PROFILE")
                self.assertEqual(report["error"], "URI_RESOURCES_NOT_EVALUATED")

    def test_extension_policy(self):
        doc = copy.deepcopy(DOC); doc["extensionsRequired"] = ["KHR_draco_mesh_compression"]
        self.assertEqual(check_bytes(glb(doc))["status"], "UNSUPPORTED_PROFILE")

    def test_image_reference(self):
        doc = copy.deepcopy(DOC); doc["images"] = [{"bufferView": 3, "mimeType": "image/png"}]
        self.error(glb(doc), "IMAGE_BUFFER_VIEW")

    def test_invalid_collections(self):
        doc = copy.deepcopy(DOC); doc["buffers"] = "incorrect"
        self.error(glb(doc), "INVALID_BUFFERS")

    def test_file_read_is_readonly_and_missing_file_is_reported(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / "model.glb"; path.write_bytes(glb())
            self.assertEqual(check_file(path)["status"], "PASS_PARTIAL_CHECKS")
            self.assertEqual(path.read_bytes(), glb())
            self.assertEqual(check_file(Path(root) / "missing.glb")["error"], "FILE_READ_ERROR")
            self.assertNotEqual(check_file(Path(root))["status"], "PASS_PARTIAL_CHECKS")

    def test_symlink_is_rejected(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / "model.glb"; path.write_bytes(glb())
            link = Path(root) / "link.glb"; link.symlink_to(path)
            self.assertEqual(check_file(link)["error"], "SYMLINK_NOT_ALLOWED")

    def test_cli_exit_codes(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / "model.glb"
            unsupported = copy.deepcopy(DOC); unsupported["extensionsUsed"] = ["custom"]
            for data, code in ((glb(), 0), (b"bad", 1), (glb(unsupported), 2)):
                path.write_bytes(data)
                result = subprocess.run([sys.executable, str(Path(__file__).with_name("preflight.py")), str(path)],
                                        capture_output=True, text=True, timeout=10, check=False)
                self.assertEqual(result.returncode, code)
                self.assertIn("status", json.loads(result.stdout))


if __name__ == "__main__":
    unittest.main()
