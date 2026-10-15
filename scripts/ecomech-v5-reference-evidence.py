#!/usr/bin/env python3
"""Read-only ECOMECH reference and binary GLB truth audit; no AI/paid requests.

PNG byte SHA-256 proves source provenance; decoded RGB SHA-256 proves
visual equivalence across a lossless re-encoded original. These are separate.
GLB structural quality does NOT prove likeness, game readiness or photorealism.
"""
from __future__ import annotations
import argparse, hashlib, io, json, math, struct
from pathlib import Path
from PIL import Image

APPROVED_RGB_SHA = '3d601608694b61932ccf11a4e0eff979f49e0c08c2a20e161c117f8e10126508'
APPROVED_SOURCE_SHA = frozenset({
 '9f3b9a994315c0578859486a1c9dc17c8916316ba9e96300409772a1b8f5e053',
 'be79f5e1b543c0b3663319b11356ab5c436b56e5589d545527cf397084ff8f42'
})
EXPECTED_SIZE = (1122, 1402)

def digest(raw):
    return hashlib.sha256(raw).hexdigest()

def load_exact_ref(filename: Path) -> dict:
    raw = filename.read_bytes()
    rawhash = digest(raw)
    if rawhash not in APPROVED_SOURCE_SHA:
        raise ValueError('UNAPPROVED_REFERENCE_SOURCE_SHA')
    if not raw.startswith(b'\x89PNG\r\n\x1a\n') or len(raw) > 12 * 1024 * 1024:
        raise ValueError('REFERENCE_NOT_PINNED_PNG')
    with Image.open(io.BytesIO(raw)) as im:
        if im.format != 'PNG' or im.size != EXPECTED_SIZE or im.width*im.height > 80_000_000:
            raise ValueError('REFERENCE_FORMAT_OR_DIMENSIONS_CHANGED')
        pixels = im.convert('RGB').tobytes()
    pixelhash = digest(pixels)
    if pixelhash != APPROVED_RGB_SHA:
        raise ValueError('REFERENCE_VISIBLE_PIXELS_CHANGED')
    return {'rawSha256': rawhash, 'pixelRgbSha256': pixelhash,
            'width': EXPECTED_SIZE[0], 'height': EXPECTED_SIZE[1],
            'bytes': len(raw), 'provenance': 'EXACT_ORIGINAL_REFERENCE_ONLY'}

def compare_pngs(a: Path, b: Path) -> dict:
    x, y = load_exact_ref(a), load_exact_ref(b)
    return {'differentEncodedBytes': x['rawSha256'] != y['rawSha256'],
            'identicalDecodedRgb': x['pixelRgbSha256'] == y['pixelRgbSha256'],
            'bothApprovedOriginals': True,
            'reason': 'PNG compression/metadata may differ while all decoded RGB pixels match'}

def inspect_original_glb(glb: Path) -> dict:
    data = glb.read_bytes()
    if len(data) < 48 or len(data) > 50_000_000 or struct.unpack_from('<III', data) != (0x46546c67, 2, len(data)):
        raise ValueError('NOT_ORIGINAL_GLTF2_CONTAINER')
    size, kind = struct.unpack_from('<II', data, 12)
    if kind != 0x4e4f534a or size < 2 or size % 4 or 20 + size + 8 > len(data):
        raise ValueError('GLTF_CHUNK_INVALID')
    doc = json.loads(data[20:20+size])
    if doc.get('asset', {}).get('version') != '2.0':
        raise ValueError('UNSUPPORTED_GLTF_VERSION')
    meshes, mats = doc.get('meshes', []), doc.get('materials', [])
    if not meshes or not mats:
        raise ValueError('NO_REAL_MATERIAL_MESHES')
    import trimesh
    scene = trimesh.load(glb, force='scene', process=False)
    models = [m for m in scene.dump(concatenate=False)
              if isinstance(m, trimesh.Trimesh) and len(m.faces) > 0]
    triangles = sum(len(m.faces) for m in models)
    if triangles < 1000:
        raise ValueError('SPARSE_OR_EMPTY_ORIGINAL_GLTF')
    if any(not math.isfinite(float(m.bounds[0, 0])) or
           not math.isfinite(float(m.bounds[1, 2])) for m in models):
        raise ValueError('MESH_NONFINITE')
    base = sum(bool(m.get('pbrMetallicRoughness', {}).get('baseColorTexture')) for m in mats)
    metalrough = sum(bool(m.get('pbrMetallicRoughness', {}).get('metallicRoughnessTexture')) for m in mats)
    normals = sum(bool(m.get('normalTexture')) for m in mats)
    return {'sha256': digest(data), 'bytes': len(data), 'glTFMeshDefinitions': len(meshes),
       'instantiatedGeometryCount': len(models), 'actualInstantiatedTriangles': triangles,
       'materials': len(mats), 'images': len(doc.get('images', [])),
       'baseColorTextureMaterialCount': base,
       'metallicRoughnessTextureMaterialCount': metalrough,
       'normalTextureMaterialCount': normals,
       'skins': len(doc.get('skins', [])), 'animations': len(doc.get('animations', [])),
       'visualLikeness': 'NOT_MEASURED_BY_GEOMETRY_METADATA',
       'meshFidelityApproved': False, 'gameReadyCertified': False, 'makeReadyCertified': False}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--original', required=True, type=Path)
    parser.add_argument('--compare-with', type=Path)
    parser.add_argument('--glb', type=Path)
    parser.add_argument('--out', required=True, type=Path)
    args = parser.parse_args()
    evidence = {'revision': 'worldifact-ecomech-v5-readonly-reference-evidence-v1',
      'reference': load_exact_ref(args.original),
      'pixelComparison': compare_pngs(args.original, args.compare_with) if args.compare_with else None,
      'geometry': inspect_original_glb(args.glb) if args.glb else None,
      'photorealismClaim': 'NOT_PROVEN',
      'finalDecision': 'NO_GO_VISUAL_REVIEW_REQUIRED',
      'paidRequestsStarted': 0, 'apiLiabilityUsd': 0, 'newCustomerCharges': 0}
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(evidence, indent=2) + '\n')
    print(json.dumps({'source': evidence['reference']['rawSha256'],
        'canonicalRgb': evidence['reference']['pixelRgbSha256'],
        'samePixels': evidence['pixelComparison']['identicalDecodedRgb'] if evidence['pixelComparison'] else None,
        'actualTriangles': evidence['geometry']['actualInstantiatedTriangles'] if evidence['geometry'] else None,
        'release': evidence['finalDecision']}))

if __name__ == '__main__':
    main()
