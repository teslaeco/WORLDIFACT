#!/usr/bin/env python3
"""CPU-only geometric silhouette audit against HUMAN-ANNOTATED user-image outline.

Not a neural similarity metric or color/PBR/artistic approval. Never rewards
polygon count. Uses real transformed GLB triangles, not thumbnail pixels.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path

import cv2
import numpy as np
import trimesh

W, H = 448, 560
TARGET_HEIGHT = .952
SOURCE_EXPECTED = "be79f5e1b543c0b3663319b11356ab5c436b56e5589d545527cf397084ff8f42"

def load_target(path):
    data = json.loads(Path(path).read_text(encoding='utf-8'))
    if (data.get('version') != 'ecomech-reference-target-v1'
        or data.get('sourceImageOriginalSha256') != SOURCE_EXPECTED
        or data.get('validation') != 'HUMAN_ESTIMATED_FROM_USER_REFERENCE_NOT_AI_MEASURED'):
        raise ValueError('Unreviewed reference target/annotation provenance')
    coords = np.asarray(data['outline'], dtype=np.float64)
    if coords.ndim != 2 or coords.shape[1] != 2 or len(coords) < 20:
        raise ValueError('The reference image has no meaningful human-reviewed silhouette')
    if not np.isfinite(coords).all() or (coords < 0).any() or (coords > 1).any():
        raise ValueError('Reference silhouette coordinates are not normalized')
    mask = np.zeros((H, W), dtype=np.uint8)
    xy = np.rint(coords * [W, H]).astype(np.int32)
    cv2.fillPoly(mask, [xy], 255)
    return mask, data

def real_mesh_faces(glb):
    raw = Path(glb).read_bytes()
    if len(raw) < 1024 or raw[:4] != b'glTF':
        raise ValueError('Original GLB missing or not a GLB 2.0 file')
    scene = trimesh.load(glb, force='scene', process=False)
    result = []
    for mesh in scene.dump(concatenate=False):
        if not isinstance(mesh, trimesh.Trimesh) or len(mesh.faces) < 1:
            continue
        vertices = np.asarray(mesh.vertices, dtype=np.float32)
        faces = np.asarray(mesh.faces, dtype=np.int32)
        if not np.isfinite(vertices).all() or len(vertices) < 3:
            raise ValueError('GLB has non-finite/empty geometry')
        if faces.min() < 0 or faces.max() >= len(vertices):
            raise ValueError('GLB face index leaves the original binary vertices')
        result.append((vertices, faces))
    if sum(len(f) for _, f in result) < 3000:
        raise ValueError('Insufficient real geometry to evaluate a full robot')
    return result, hashlib.sha256(raw).hexdigest()

def make_mask(parts, yaw):
    img = np.zeros((H, W), dtype=np.uint8)
    rad = math.radians(yaw)
    ca, sa = math.cos(rad), math.sin(rad)
    ratio = H * .92 / 2.75
    for vertices, faces in parts:
        # Orthographic three-quarter camera approximation, calibrated to a
        # 2.75m virtual model height. Not asserted to be the exact photograph lens.
        horizontal = (vertices[:, 0] - .09) * ca + vertices[:, 2] * sa
        xy = np.stack((
            (.49 + horizontal * ratio / W) * W,
            (.952 - vertices[:, 1] * .92 / 2.75) * H
        ), axis=1)
        projected = np.rint(xy).astype(np.int32)[faces]
        for offset in range(0, len(projected), 5000):
            cv2.fillPoly(img, projected[offset:offset + 5000], 255)
    return img

def measure(a, b):
    union = np.count_nonzero((a > 0) | (b > 0))
    both = np.count_nonzero((a > 0) & (b > 0))
    if not union:
        raise ValueError('Empty projected silhouette')
    def extent(m):
        y, x = np.nonzero(m)
        if len(x) < 10:
            return None
        return [round(float(x.min()) / W, 4), round(float(y.min()) / H, 4),
                round(float(x.max()) / W, 4), round(float(y.max()) / H, 4)]
    return {'annotatedOutlineOverlap': round(float(both / union), 5),
            'humanTargetBounds': extent(a), 'projectedRealMeshBounds': extent(b),
            'targetAreaPixels': int(np.count_nonzero(a)),
            'renderedAreaPixels': int(np.count_nonzero(b))}

def run(glb, blueprint, output):
    target, targetdata = load_target(blueprint)
    parts, model_sha = real_mesh_faces(glb)
    candidates = {}
    for angle in (-45, -25, 0, 25, 45):
        candidate = make_mask(parts, angle)
        candidates[str(angle)] = measure(target, candidate)
    best = max(candidates, key=lambda key: candidates[key]['annotatedOutlineOverlap'])
    observed = make_mask(parts, int(best))
    top = np.concatenate((target, observed), axis=1)
    Path(output).mkdir(parents=True, exist_ok=True)
    image = Path(output) / 'ecomech_human_outline_vs_projected_GLB.png'
    cv2.imwrite(str(image), top)
    report = {
      'revision': 'worldifact-reference-geometry-audit-v1',
      'sourceImageSha256': targetdata['sourceImageOriginalSha256'],
      'sourceKind': 'HUMAN_ANNOTATED_USER_IMAGE_CONTOUR',
      'realGLBSha256': model_sha,
      'metric': 'PROJECTED_SILHOUETTE_INTERSECTION_OVER_UNION_ONLY',
      'camera': 'ORTHOGRAPHIC_APPROXIMATION_NOT_CAMERA_SOLVED',
      'bestApproximationYawDegrees': int(best),
      'angleMeasurements': candidates,
      'artisticFidelity': 'NOT_REVIEWED',
      'pixelTextureFidelity': 'NOT_MEASURED',
      'printApproved': False,
      'passGate': candidates[best]['annotatedOutlineOverlap'] >= .72,
      'notes': 'Polygon count cannot substitute a correctly modeled reference silhouette.'
    }
    (Path(output) / 'reference_geometry_qa.json').write_text(
        json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'bestYaw': int(best), 'annotatedIoU':
        candidates[best]['annotatedOutlineOverlap'], 'passGate': report['passGate'],
        'sha256': model_sha}))
    return report

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--glb', required=True)
    parser.add_argument('--target', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--expect-no-go', action='store_true')
    parser.add_argument('--report-only', action='store_true', help='Do not claim quality PASS; preserve numeric baseline for human QA')
    argv = parser.parse_args()
    result = run(argv.glb, argv.target, argv.output)
    if argv.expect_no_go and result['passGate']:
        raise SystemExit('Unexpected automatic approval; rerun visual review')
    if not argv.expect_no_go and not argv.report_only and not result['passGate']:
        raise SystemExit('Reference silhouette gate did not pass')
