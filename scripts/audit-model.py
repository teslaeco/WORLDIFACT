"""Conservative geometry-only preflight; never certifies a part for production.
Usage: python scripts/audit-model.py original.glb output-directory --size-mm 100
"""
import argparse
import hashlib
import json
from pathlib import Path
import numpy as np
import trimesh

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("source", type=Path)
parser.add_argument("output", type=Path)
parser.add_argument("--size-mm", type=float, default=100)
args = parser.parse_args()
if not 10 <= args.size_mm <= 500:
    parser.error("Size must be between 10 and 500 mm.")
source = args.source.resolve()
args.output.mkdir(parents=True, exist_ok=True)
report_path = args.output / "model-preflight.json"
clean_path = args.output / f"{source.stem}-{args.size_mm:g}mm-CLEANED-NOT-PRINT-READY.stl"
if report_path.exists() or clean_path.exists() or clean_path.resolve() == source:
    parser.error("Use a fresh output directory; existing artifacts will not be overwritten.")
scene = trimesh.load(source, force="scene", process=False)
original = scene.to_mesh()
if original.is_empty or not np.isfinite(original.vertices).all():
    parser.error("Empty or invalid geometry.")
scale = args.size_mm / float(original.extents.max())
parts = []
for name, mesh in scene.geometry.items():
    before = len(mesh.vertices)
    mesh.update_faces(mesh.nondegenerate_faces())
    mesh.update_faces(mesh.unique_faces())
    mesh.remove_unreferenced_vertices()
    mesh.merge_vertices(merge_tex=True, merge_norm=True)
    mesh.fix_normals()
    parts.append({"name": name, "vertices_before": before,
                  "vertices_after": len(mesh.vertices), "faces": len(mesh.faces),
                  "watertight_after": bool(mesh.is_watertight)})
cleaned = scene.to_mesh()
cleaned.apply_scale(scale)
cleaned.export(clean_path)
thin = []
for node in scene.graph.nodes_geometry:
    transform, name = scene.graph[node]
    mesh = scene.geometry[name].copy()
    mesh.apply_transform(transform)
    mesh.apply_scale(scale)
    span = float(mesh.extents.min())
    if span < 1.5:
        thin.append({"instance": node, "geometry": name,
                     "smallest_axis_span_mm": round(span, 5)})
report = {
    "source": source.name,
    "sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
    "source_bytes": source.stat().st_size,
    "triangles_before": len(original.faces), "triangles_after": len(cleaned.faces),
    "vertices_before": len(original.vertices), "vertices_after": len(cleaned.vertices),
    "geometry_count": len(parts), "instance_count": len(scene.graph.nodes_geometry),
    "closed_geometries_after": sum(p["watertight_after"] for p in parts),
    "open_geometries_after": sum(not p["watertight_after"] for p in parts),
    "dimensions_mm": cleaned.extents.tolist(),
    "watertight_after": bool(cleaned.is_watertight),
    "minimum_span_flags": sorted(thin, key=lambda x: x["smallest_axis_span_mm"]),
    "minimum_span_note": "Bounding-box spans only, not a wall-thickness test. Joining parts can change the conclusion. Inspect in the final assembly.",
    "output": clean_path.name, "print_approved": False,
    "operations": ["remove degenerate/duplicate faces", "remove unused vertices", "weld UV/normal seams in monochrome copy", "fix normals", "scale largest dimension"],
    "not_performed": ["hole filling", "boolean union", "self-intersection check", "wall-thickness analysis", "support/slicer review", "supplier engineering approval", "textured GLB modification"],
    "parts": parts,
}
report_path.write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps({k:v for k,v in report.items() if k not in ["parts", "minimum_span_flags"]}, indent=2))
print(f"Small-axis-span flags: {len(thin)}. Review report: {report_path}")
