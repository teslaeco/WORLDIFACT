"""Strict offline format/provenance QA for WORLDIFACT reference trials.
No input images or paid provider APIs. Passing is NOT visual similarity approval.
"""
from __future__ import annotations
import hashlib
import json
import math
import struct
import sys
from pathlib import Path
from PIL import Image
import trimesh

TRIALS = {
    'ecomech-v4': {'nodes': {'cyborg', 'pepper'}, 'min_meshes': 2, 'min_faces': 1500},
    'halloween-music-room': {'nodes': {'performer', 'squirrel', 'keyboard', 'floating_instruments', 'room'},
                             'min_meshes': 5, 'min_faces': 3000},
}
VIEWS = tuple(f'{material}_{angle}' for material in ('pbr', 'clay')
              for angle in ('front', 'three_quarter', 'side', 'back'))
MAX_GLB_BYTES = 256 * 1024 * 1024

class Rejected(ValueError):
    pass

def require(ok, code):
    if not ok:
        raise Rejected(code)

def json_file(path):
    require(path.is_file() and path.stat().st_size < 262144, 'MISSING_OR_OVERSIZED_JSON')
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except (UnicodeError, ValueError):
        raise Rejected('INVALID_JSON') from None

def inspect_glb(path, spec):
    require(path.is_file() and 32 <= path.stat().st_size <= MAX_GLB_BYTES, 'GLB_MISSING_OR_OVERSIZED')
    with path.open('rb') as stream:
        header = stream.read(20)
        require(len(header) == 20, 'GLB_INVALID_HEADER')
        magic, version, length, json_length, kind = struct.unpack('<IIIII', header)
        require(magic == 0x46546c67 and version == 2 and length == path.stat().st_size
                and kind == 0x4e4f534a and 0 < json_length < 2621440, 'GLB_INVALID_HEADER')
        try:
            gltf = json.loads(stream.read(json_length))
        except (ValueError, UnicodeError):
            raise Rejected('GLB_INVALID_JSON') from None
    require(gltf.get('asset', {}).get('version') == '2.0', 'GLB_WRONG_VERSION')
    require(all('uri' not in entry or str(entry['uri']).startswith('data:')
                for entry in gltf.get('buffers', []) + gltf.get('images', [])), 'GLB_EXTERNAL_RESOURCE')
    require(any(isinstance(m, dict) and m.get('pbrMetallicRoughness', {}).get('baseColorTexture')
                for m in gltf.get('materials', [])), 'PBR_TEXTURE_MISSING')
    try:
        scene = trimesh.load(path, force='scene', process=False)
    except Exception:
        raise Rejected('GLB_MESH_PARSE_FAILED') from None
    meshes = list(scene.geometry.values())
    faces = sum(len(m.faces) for m in meshes)
    require(len(meshes) >= spec['min_meshes'] and faces >= spec['min_faces'], 'MESH_COMPONENT_OR_DENSITY_TOO_LOW')
    require(scene.bounds is not None, 'MESH_BOUNDS_MISSING')
    extents = scene.bounds[1] - scene.bounds[0]
    require(all(math.isfinite(float(x)) and float(x) > 0 for x in extents), 'MESH_INVALID_EXTENTS')
    require(float(min(extents) / max(extents)) >= 0.07, 'BILLBOARD_OR_FLAT_MESH')
    nodes = set(scene.graph.nodes_geometry)
    require(spec['nodes'].issubset(nodes), 'REQUIRED_3D_COMPONENTS_MISSING')
    return {'meshCount': len(meshes), 'triangleCount': faces, 'depthRatio': round(float(min(extents) / max(extents)), 4)}

def inspect_folder(folder, trial):
    require(trial in TRIALS, 'UNKNOWN_TRIAL')
    require(folder.is_dir() and not folder.is_symlink(), 'RESULT_FOLDER_MISSING')
    root = folder.resolve()
    def inside(name):
        path = root / name
        require(not path.is_symlink() and path.resolve().is_relative_to(root), 'UNSAFE_RESULT_PATH')
        return path
    receipt = json_file(inside('result.json'))
    qa = json_file(inside('outputs/qa.json'))
    require(receipt.get('state') == 'REVIEW_REQUIRED'
            and receipt.get('visualAccepted') is False
            and receipt.get('printReady') is False
            and receipt.get('supplierAccepted') is False, 'FALSE_GENERATION_APPROVAL')
    require(receipt.get('geometryEngine') == 'microsoft/TRELLIS.2-4B', 'GEOMETRY_PROVENANCE_REQUIRED')
    require(receipt.get('inferenceAttempts') == 1 and receipt.get('actualBilledMicroUsd') is None,
            'PROVIDER_RECEIPT_INCONSISTENT')
    require(qa.get('printReady') is False and qa.get('visualAccepted') is False,
            'FALSE_VISUAL_APPROVAL')
    require(set(qa.get('views', [])) == set(VIEWS) and len(qa['views']) == 8,
            'EIGHT_VIEWS_REQUIRED')
    original = inside('raw/original.glb')
    require(original.is_file() and qa.get('sourceSha256') == hashlib.sha256(original.read_bytes()).hexdigest(),
            'SOURCE_GLB_HASH_MISMATCH')
    blender = inside('outputs/source.blend')
    require(blender.is_file() and blender.stat().st_size > 1000, 'EDITABLE_BLEND_FORMAT_REQUIRED')
    with blender.open('rb') as stream:
        require(stream.read(7) == b'BLENDER', 'EDITABLE_BLEND_FORMAT_REQUIRED')
    hashes = set()
    for view in VIEWS:
        pic = inside(f'outputs/{view}.png')
        require(pic.is_file() and 0 < pic.stat().st_size <= 16 * 1024 * 1024, 'RENDER_MISSING')
        with Image.open(pic) as im:
            require(im.format == 'PNG' and min(im.size) >= 256, 'RENDER_NOT_CAMERA_PNG')
            im.verify()
        hashes.add(hashlib.sha256(pic.read_bytes()).hexdigest())
    require(len(hashes) == 8, 'REPEATED_OR_COPIED_CAMERA_IMAGES')
    mesh = inspect_glb(inside('outputs/game.glb'), TRIALS[trial])
    return {'trialId': trial, 'structuralFormatCheck': 'PASS', **mesh,
            'visualSimilarity': 'NOT_MEASURED', 'realProviderExecution': 'NOT_INDEPENDENTLY_VERIFIED',
            'actualBilledUsd': 'UNKNOWN', 'visualApproval': 'REVIEW_REQUIRED',
            'makeReady': False, 'publicDownloadVerified': False}

def main(argv):
    if len(argv) != 3:
        print('USAGE: verify-3d-trial-result.py <private-output-dir> <trial-id>')
        return 2
    try:
        result = inspect_folder(Path(argv[1]), argv[2])
        code = 0
    except (Rejected, OSError, Image.UnidentifiedImageError):
        result = {'trialId': argv[2], 'structuralFormatCheck': 'FAILED',
                  'visualSimilarity': 'NOT_MEASURED', 'visualApproval': 'BLOCKED'}
        code = 2
    print(json.dumps(result, sort_keys=True))
    return code

if __name__ == '__main__':
    sys.exit(main(sys.argv))
