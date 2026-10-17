"""Publish only two owner-approved, UV-corrected GAME derivatives.

Reads two fixed saved GLBs from private R2. No inference, storage writes,
credential exports, original source images, Blender files or decoder data.
"""
import hashlib
import json
import math
import os
from pathlib import Path
import re
import struct
import sys

SCOPE = '2c9f2e043bfaab9ef6a3e8c19d5d2f1fc79060ffab0b29f82a7376cbc1c05de9'
MODELS = (
    dict(name='ecomech-v4-b8532d8c.glb', job='0b055bd4-e94b-4acd-a875-b958f0be9c11',
         size=18063228, source='c8776223a07520bb6e47fb2a60f21116f882eb2e5d5c0098cf744f88fa525c46',
         result='b8532d8ca7c90e5f4eac0798811b54d4d9447508f4398d325933dd3cca472d54'),
    dict(name='halloween-music-room-d9f01fa8.glb', job='e80edb76-99b3-43b9-97aa-b46e12ef28a5',
         size=18085924, source='17762a0dbd371841f404e39d4259699019da744b49c767100b581166a16b419e',
         result='d9f01fa8ce21ca1759ee6a76ccbb08a27b65749dd25e04810e532e75c69ec197'),
)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def flip_uv(raw):
    """Change only float32 V values; preserve every other byte, including images."""
    if len(raw) < 28 or struct.unpack_from('<III', raw) != (0x46546c67, 2, len(raw)):
        raise ValueError('INVALID_GLB')
    size, kind = struct.unpack_from('<II', raw, 12)
    if kind != 0x4e4f534a or size % 4 or size + 28 > len(raw):
        raise ValueError('INVALID_GLB_JSON')
    doc = json.loads(raw[20:20+size])
    start = size + 28
    binary_size, binary_kind = struct.unpack_from('<II', raw, size+20)
    if binary_kind != 0x004e4942 or start + binary_size != len(raw):
        raise ValueError('INVALID_GLB_BIN')
    if len(doc['buffers']) != 1 or 'uri' in doc['buffers'][0]:
        raise ValueError('EXTERNAL_BUFFER')
    if any('uri' in image for image in doc.get('images', [])):
        raise ValueError('EXTERNAL_IMAGE')
    uv_accessors = {primitive['attributes']['TEXCOORD_0'] for mesh in doc['meshes'] for primitive in mesh['primitives']}
    if not uv_accessors:
        raise ValueError('MISSING_UV')
    result = bytearray(raw)
    changed = set()
    for index in uv_accessors:
        accessor = doc['accessors'][index]
        if accessor['type'] != 'VEC2' or accessor['componentType'] != 5126 or accessor.get('sparse') or accessor.get('normalized'):
            raise ValueError('UNSUPPORTED_UV')
        view = doc['bufferViews'][accessor['bufferView']]
        stride = view.get('byteStride', 8)
        count = accessor['count']
        relative = accessor.get('byteOffset', 0)
        offset = start + view.get('byteOffset', 0) + relative
        if view.get('buffer', 0) != 0 or stride < 8 or stride % 4 or not 1 <= count <= 600000:
            raise ValueError('INVALID_UV_LAYOUT')
        if relative < 0 or relative + (count-1)*stride + 8 > view['byteLength'] or offset < start or offset + (count-1)*stride + 8 > len(raw):
            raise ValueError('UV_OUT_OF_BOUNDS')
        for vertex in range(count):
            at = offset + vertex*stride + 4
            if at in changed:
                raise ValueError('OVERLAPPING_UV')
            value = struct.unpack_from('<f', raw, at)[0]
            if not math.isfinite(value) or not 0 <= value <= 1:
                raise ValueError('INVALID_UV_VALUE')
            struct.pack_into('<f', result, at, 1-value)
            changed.add(at)
    return bytes(result)


def prepare(store, output):
    """All source and result hashes must pass before either derivative is written."""
    ready = []
    for model in MODELS:
        key = f"jobs/{SCOPE}/{model['job']}/outputs/game.glb"
        raw = store.read(key, model['size'])
        if raw is None or len(raw) != model['size'] or digest(raw) != model['source']:
            raise ValueError('SAVED_MODEL_MISMATCH')
        corrected = flip_uv(raw)
        if len(corrected) != model['size'] or digest(corrected) != model['result']:
            raise ValueError('CORRECTED_MODEL_MISMATCH')
        ready.append((model, corrected))
    output.mkdir(parents=True, exist_ok=True)
    if output.is_symlink():
        raise ValueError('UNREVIEWED_OUTPUT_DIRECTORY')
    for model, corrected in ready:
        path = output / model['name']
        if path.is_symlink() or (path.exists() and path.read_bytes() != corrected):
            raise ValueError('EXISTING_MODEL_DIFFERS')
    for model, corrected in ready:
        (output / model['name']).write_bytes(corrected)
    return [{'file': model['name'], 'bytes': model['size'], 'sha256': model['result']} for model, _ in ready]


def connect():
    if not re.fullmatch(r'https://[0-9a-f]{32}\.r2\.cloudflarestorage\.com/?', os.environ.get('ARTIFACT_S3_ENDPOINT', '')):
        raise ValueError('INVALID_STORAGE_ENDPOINT')
    if os.environ.get('ARTIFACT_BUCKET') != 'worldifact-artifacts' or os.environ.get('ARTIFACT_REGION') != 'auto':
        raise ValueError('INVALID_STORAGE_SCOPE')
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools/runpod_worker'))
    from storage import S3Store
    return S3Store.from_env()


if __name__ == '__main__':
    try:
        if len(sys.argv) != 1:
            raise ValueError('ARGUMENTS_NOT_ALLOWED')
        report = prepare(connect(), Path('public/owner-models'))
        print(json.dumps({'status': 'OWNER_WORKING_COPIES_VERIFIED', 'models': report, 'inferenceCalls': 0}))
    except Exception as error:
        print('OWNER_SHOWCASE_IMPORT_FAILED:' + type(error).__name__, file=sys.stderr)
        sys.exit(1)
