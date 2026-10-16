"""Compose independently generated 3D GLBs into an editable Halloween scene.

NO image-conditioned model is executed here; this consumes verified private meshes.
No fake backdrop, texture billboard, synthetic geometry fallback, or provider URLs.
"""
from __future__ import annotations
import hashlib
import json
import math
import re
from pathlib import Path

import numpy as np
import trimesh

REQUIRED = ('performer', 'squirrel', 'keyboard', 'floating_instruments', 'room')
SHA = re.compile(r'[a-f0-9]{64}')
MAX_BYTES = 256 * 1024 * 1024

class Rejected(ValueError):
    pass

def need(value, code):
    if not value:
        raise Rejected(code)

def validate_transform(value):
    need(type(value) is list and len(value) == 4 and all(type(row) is list and len(row) == 4 for row in value),
         'INVALID_SCENE_TRANSFORM')
    need(all(type(v) in (int, float) and math.isfinite(v) for row in value for v in row),
         'NONFINITE_SCENE_TRANSFORM')
    matrix = np.array(value, dtype=np.float64)
    need(np.allclose(matrix[3], [0, 0, 0, 1], atol=1e-9), 'INVALID_TRANSFORM_HOMOGENEOUS_ROW')
    basis = matrix[:3, :3]
    scale = np.linalg.norm(basis, axis=0)
    need(np.all((scale >= 0.05) & (scale <= 20)) and 0.0001 < abs(np.linalg.det(basis)) < 8000,
         'INVALID_TRANSFORM_SCALE')
    need(np.all(np.abs(matrix[:3, 3]) <= 25), 'INVALID_TRANSFORM_TRANSLATION')
    return matrix

def manifest_path(root, relative):
    need(type(relative) is str and re.fullmatch(r'parts/[a-z0-9_-]{3,64}\.glb', relative), 'INVALID_PRIVATE_SOURCE_PATH')
    src = root / relative
    need(not src.is_symlink() and src.resolve().is_relative_to(root.resolve()), 'ESCAPED_SOURCE_PATH')
    need(src.is_file() and 28 <= src.stat().st_size <= MAX_BYTES, 'MISSING_SOURCE_GLB')
    return src

def load_part(root, slot, entry):
    need(type(entry) is dict and set(entry) == {'path', 'sha256', 'transform'}, 'INVALID_PART_FIELDS')
    source = manifest_path(root, entry['path'])
    need(type(entry['sha256']) is str and SHA.fullmatch(entry['sha256']),
         'INVALID_PART_DIGEST')
    data = source.read_bytes()
    need(hashlib.sha256(data).hexdigest() == entry['sha256'], 'PART_HASH_MISMATCH')
    need(data[:4] == b'glTF', 'NOT_GLTF_BINARY')
    try:
        model = trimesh.load(source, force='scene', process=False)
    except Exception:
        raise Rejected('UNREADABLE_3D_GEOMETRY') from None
    need(isinstance(model, trimesh.Scene) and model.geometry, 'EMPTY_PART_SCENE')
    transform = validate_transform(entry['transform'])
    components = []
    for node in sorted(model.graph.nodes_geometry):
        local, geometry_name = model.graph[node]
        geom = model.geometry.get(geometry_name)
        need(isinstance(geom, trimesh.Trimesh) and len(geom.faces) >= 4,
             'INVALID_GEOMETRY_COMPONENT')
        need(np.isfinite(geom.vertices).all(), 'NONFINITE_GEOMETRY')
        components.append((geom.copy(), transform @ local))
    need(components and sum(len(mesh.faces) for mesh, _ in components) >= 12,
         'INSUFFICIENT_REAL_GEOMETRY')
    return components

def compose(root, manifest, out_dir):
    root = Path(root).resolve()
    out_dir = Path(out_dir).resolve()
    need(out_dir != root and not out_dir.is_relative_to(root), 'OUTPUT_INSIDE_PRIVATE_INPUT')
    need(type(manifest) is dict and set(manifest) == {'revision', 'assetType', 'assets', 'visualAccepted'},
         'INVALID_SCENE_MANIFEST')
    need(manifest['revision'] == 'worldifact-scene-assembly-v1' and manifest['assetType'] == 'MULTI_ASSET_SCENE'
         and manifest['visualAccepted'] is False, 'FALSE_SCENE_APPROVAL')
    assets = manifest['assets']
    need(type(assets) is dict and set(assets) == set(REQUIRED), 'MISSING_INDEPENDENT_SCENE_PART')
    combined = trimesh.Scene()
    triangles = {}
    for slot in REQUIRED:
        meshes = load_part(root, slot, assets[slot])
        triangles[slot] = sum(len(mesh.faces) for mesh, _ in meshes)
        for i, (mesh, mat) in enumerate(meshes):
            label = f'{slot}_{i:04d}'
            combined.add_geometry(mesh, node_name=label, geom_name=label, transform=mat)
    need(len(combined.geometry) >= len(REQUIRED), 'FLATTENED_SCENE_NOT_ALLOWED')
    out_dir.mkdir(parents=True, exist_ok=False)
    dst = out_dir / 'scene.glb'
    combined.export(dst)
    output = {'revision': manifest['revision'], 'state': 'REVIEW_REQUIRED',
              'assetType': 'MULTI_ASSET_SCENE', 'parts': list(REQUIRED),
              'trianglesByPart': triangles, 'sourcePartsSha256': {k: assets[k]['sha256'] for k in REQUIRED},
              'sceneSha256': hashlib.sha256(dst.read_bytes()).hexdigest(),
              'visualAccepted': False, 'printReady': False,
              'sourceView': 'FRONT_ONLY', 'unseenSurfaces': 'GENERATED_INFERRED',
              'blenderEditable': False, 'providerExecutionVerified': False}
    (out_dir / 'scene-receipt.json').write_text(json.dumps(output, indent=2) + '\n')
    return output
