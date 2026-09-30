"""Read-only, partial GLB screening for Forge Agent research. No model or network.

PASS_PARTIAL_CHECKS is NOT a full glTF validation, rendered preview, quality
assessment, or manufacturing approval. URI resources/extensions are unsupported.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import stat
import struct
from typing import Any

MAX_FILE_BYTES = 100 * 1024 * 1024
MAX_JSON_BYTES = 1024 * 1024
JSON_CHUNK = 0x4E4F534A
BIN_CHUNK = 0x004E4942


class CheckError(ValueError):
    def __init__(self, code: str, status: str = "FAIL_PARTIAL_CHECKS") -> None:
        super().__init__(code)
        self.code, self.status = code, status


def require(condition: bool, code: str) -> None:
    if not condition:
        raise CheckError(code)


def integer(value: Any, minimum: int = 0) -> bool:
    return type(value) is int and value >= minimum


def unique_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        require(key not in result, "JSON_DUPLICATE_KEY")
        result[key] = value
    return result


def finite_number(raw: str) -> float:
    value = float(raw)
    require(math.isfinite(value), "JSON_NONFINITE_NUMBER")
    return value


def reject_constant(_: str) -> None:
    raise CheckError("JSON_NONFINITE_NUMBER")


def object_array(doc: dict[str, Any], key: str) -> list[dict[str, Any]]:
    items = doc.get(key, [])
    require(isinstance(items, list) and all(isinstance(x, dict) for x in items),
            "INVALID_" + key.upper())
    return items


def check_bytes(data: bytes) -> dict[str, Any]:
    """Screen an immutable byte sequence. Never opens resources named in JSON."""
    report: dict[str, Any] = {
        "schema_version": 1, "tool": "forge-glb-preflight-v0.1",
        "status": "FAIL_PARTIAL_CHECKS", "size_bytes": len(data),
        "sha256": None, "error": None, "model_inference": "NOT_RUN",
        "full_gltf_validation": "NOT_RUN", "rendering": "NOT_RUN",
        "geometry_quality": "UNKNOWN", "manufacturing": "NOT_APPROVED",
    }
    try:
        require(len(data) <= MAX_FILE_BYTES, "FILE_TOO_LARGE")
        report["sha256"] = hashlib.sha256(data).hexdigest()
        require(len(data) >= 20, "TRUNCATED_HEADER")
        magic, version, length = struct.unpack_from("<4sII", data)
        require(magic == b"glTF", "BAD_MAGIC")
        require(version == 2, "UNSUPPORTED_GLB_VERSION")
        require(length == len(data), "FILE_LENGTH_MISMATCH")
        chunks: list[tuple[int, bytes]] = []
        offset = 12
        while offset < length:
            require(offset + 8 <= length, "TRUNCATED_CHUNK_HEADER")
            size, kind = struct.unpack_from("<II", data, offset)
            require(size % 4 == 0, "CHUNK_ALIGNMENT")
            require(offset + 8 + size <= length, "TRUNCATED_CHUNK_DATA")
            require(len(chunks) < 2, "TOO_MANY_CHUNKS")
            if kind not in (JSON_CHUNK, BIN_CHUNK):
                raise CheckError("UNKNOWN_CHUNK_TYPE", "UNSUPPORTED_PROFILE")
            require(kind == (JSON_CHUNK if not chunks else BIN_CHUNK), "CHUNK_ORDER")
            if kind == JSON_CHUNK:
                require(0 < size <= MAX_JSON_BYTES, "JSON_SIZE_LIMIT")
            chunks.append((kind, data[offset + 8:offset + 8 + size]))
            offset += 8 + size
        require(bool(chunks), "MISSING_JSON_CHUNK")
        try:
            doc = json.loads(chunks[0][1].decode("utf-8"),
                             object_pairs_hook=unique_object,
                             parse_float=finite_number, parse_constant=reject_constant)
        except (UnicodeError, json.JSONDecodeError, RecursionError) as exc:
            raise CheckError("INVALID_JSON") from exc
        require(isinstance(doc, dict), "JSON_ROOT_NOT_OBJECT")
        asset = doc.get("asset")
        require(isinstance(asset, dict) and asset.get("version") == "2.0", "ASSET_VERSION")
        if asset.get("minVersion", "2.0") != "2.0":
            raise CheckError("ASSET_MIN_VERSION", "UNSUPPORTED_PROFILE")
        if doc.get("extensionsUsed") or doc.get("extensionsRequired"):
            raise CheckError("EXTENSIONS_NOT_EVALUATED", "UNSUPPORTED_PROFILE")
        buffers = object_array(doc, "buffers")
        views = object_array(doc, "bufferViews")
        images = object_array(doc, "images")
        meshes = object_array(doc, "meshes")
        if any("uri" in x for x in buffers + images):
            raise CheckError("URI_RESOURCES_NOT_EVALUATED", "UNSUPPORTED_PROFILE")
        require(len(buffers) <= 1, "MULTIPLE_URI_LESS_BUFFERS")
        binary = chunks[1][1] if len(chunks) == 2 else None
        if buffers:
            declared = buffers[0].get("byteLength")
            require(integer(declared, 1), "BUFFER_LENGTH")
            require(binary is not None, "MISSING_BIN_CHUNK")
            require(declared <= len(binary) <= declared + 3, "BIN_LENGTH_MISMATCH")
            require(all(b == 0 for b in binary[declared:]), "BIN_PADDING")
        else:
            require(binary is None, "UNREFERENCED_BIN_CHUNK")
        for view in views:
            index, start, size = view.get("buffer"), view.get("byteOffset", 0), view.get("byteLength")
            require(integer(index) and index < len(buffers), "BUFFER_VIEW_INDEX")
            require(integer(start) and integer(size, 1), "BUFFER_VIEW_RANGE")
            require(start + size <= buffers[index]["byteLength"], "BUFFER_VIEW_BOUNDS")
        for image in images:
            index = image.get("bufferView")
            require(integer(index) and index < len(views), "IMAGE_BUFFER_VIEW")
            require(image.get("mimeType") in ("image/png", "image/jpeg"), "IMAGE_MIME")
        report.update(status="PASS_PARTIAL_CHECKS", mesh_declarations=len(meshes),
                      image_declarations=len(images), buffer_views=len(views))
    except CheckError as exc:
        report.update(status=exc.status, error=exc.code)
    except (ValueError, OverflowError, RecursionError):
        report.update(status="FAIL_PARTIAL_CHECKS", error="INVALID_JSON_NUMBER_OR_DEPTH")
    return report


def check_file(path: Path) -> dict[str, Any]:
    """Bounded regular-file read; source bytes are never rewritten."""
    try:
        if path.is_symlink():
            raise CheckError("SYMLINK_NOT_ALLOWED")
        # O_NONBLOCK prevents a FIFO supplied in place of a file from hanging.
        fd = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_NONBLOCK", 0))
        with os.fdopen(fd, "rb") as handle:
            info = os.fstat(handle.fileno())
            require(stat.S_ISREG(info.st_mode), "REGULAR_FILE_REQUIRED")
            require(info.st_size <= MAX_FILE_BYTES, "FILE_TOO_LARGE")
            return check_bytes(handle.read(MAX_FILE_BYTES + 1))
    except (OSError, CheckError) as exc:
        report = check_bytes(b"")
        report.update(error=exc.code if isinstance(exc, CheckError) else "FILE_READ_ERROR",
                      sha256=None, size_bytes=None)
        return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("file", type=Path, help="GLB file to screen without modifying it")
    args = parser.parse_args()
    report = check_file(args.file)
    print(json.dumps(report, sort_keys=True, indent=2, allow_nan=False))
    return {"PASS_PARTIAL_CHECKS": 0, "FAIL_PARTIAL_CHECKS": 1, "UNSUPPORTED_PROFILE": 2}[report["status"]]


if __name__ == "__main__":
    raise SystemExit(main())
