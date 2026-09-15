"""Prepare an unapproved OBJ/MTL/PNG review package from a self-contained GLB.

PBR roughness, metallic response and alpha may not survive a print pipeline.
The original geometry is preserved; production repairs are a separate revision.
"""
import argparse
import hashlib
import json
import re
import zipfile
from pathlib import Path

import numpy as np
import trimesh
from trimesh.exchange.obj import export_obj

p = argparse.ArgumentParser(description=__doc__)
p.add_argument("source", type=Path)
p.add_argument("output", type=Path)
p.add_argument("--size-mm", type=float, default=100)
a = p.parse_args()
if not 10 <= a.size_mm <= 500:
    p.error("Choose a size between 10 and 500 mm.")
if a.output.exists():
    p.error("Use a fresh output directory.")
scene = trimesh.load(a.source, force="scene", process=False)
before = scene.to_mesh()
scene.apply_scale(a.size_mm / before.extents.max())
for mesh in scene.geometry.values():
    uv = getattr(mesh.visual, "uv", None)
    if uv is None or len(uv) != len(mesh.vertices) or not np.isfinite(uv).all():
        p.error("Every vertex must have valid UVs; repair the source first.")
obj, resources = export_obj(scene, include_normals=True, return_texture=True,
                            write_texture=False, mtl_name="materials.mtl",
                            header="WORLDIFACT legacy color candidate; units millimetres; NOT PRINT APPROVED")
a.output.mkdir(parents=True)
(a.output / "Queen-legacy-COLOR-REVIEW-ONLY.obj").write_text(obj)
for name, data in resources.items():
    if Path(name).name != name:
        raise ValueError("Unsafe export resource name")
    (a.output / name).write_bytes(data)
mtl = (a.output / "materials.mtl").read_text()
used = set(re.findall(r"^usemtl (.+)$", obj, re.M))
defined = set(re.findall(r"^newmtl (.+)$", mtl, re.M))
assert used <= defined, "Missing material definitions"
for name in re.findall(r"^map_Kd (.+)$", mtl, re.M):
    assert (a.output / name).is_file(), "Missing color texture"
reloaded = trimesh.load(a.output / "Queen-legacy-COLOR-REVIEW-ONLY.obj", force="scene", process=False).to_mesh()
assert len(reloaded.faces) == len(before.faces), "Triangle count changed"
assert np.allclose(reloaded.extents, before.extents * a.size_mm / before.extents.max(), atol=1e-5), "Bounds changed"
report = {
    "source": a.source.name,
    "source_sha256": hashlib.sha256(a.source.read_bytes()).hexdigest(),
    "units": "mm", "dimensions_mm": reloaded.extents.tolist(),
    "triangles": len(reloaded.faces), "materials": len(defined),
    "color_textures": len(re.findall(r"^map_Kd (.+)$", mtl, re.M)),
    "checks": ["OBJ round-trip face count", "millimetre bounds", "material references", "texture files present"],
    "visual_color_review": "NOT PERFORMED", "supplier_review": "NOT PERFORMED", "print_approved": False,
    "limitations": ["Legacy design, not current Queen", "No mesh repair in color package", "PBR converted to MTL; color/alpha/metallic appearance must be inspected", "Original texture resolution retained; no artificial 4K claim", "No supplier upload or order for this package"],
}
(a.output / "color-package-audit.json").write_text(json.dumps(report, indent=2) + "\n")
(a.output / "README.txt").write_text(
    "QUEEN LEGACY — COLOR REVIEW ONLY — NOT PRINT APPROVED\n"
    "Units: millimetres. Largest dimension: " + str(a.size_mm) + " mm.\n"
    "This is the older long-dress design. It is not the current Queen revision.\n"
    "OBJ, MTL and PNG are packaged together for a future color-process review.\n"
    "No supplier approval, watertight repair or visual color certification is claimed.\n"
    "Review color-package-audit.json before use. Do not order from this file.\n")
zip_path = a.output.parent / (a.output.name + ".zip")
if zip_path.exists():
    raise FileExistsError(zip_path)
with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as z:
    for file in sorted(a.output.iterdir()):
        z.write(file, file.name)
report["archive_bytes"] = zip_path.stat().st_size
report["expanded_bytes"] = sum(x.stat().st_size for x in a.output.iterdir())
print(json.dumps(report, indent=2))
print(zip_path)
