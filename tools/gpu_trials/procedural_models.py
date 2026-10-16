"""Deterministic REAL procedural 3D GPU qualification scenes for WORLDIFACT.

These GLBs are not TRELLIS.2/photogrammetry, not derived from private source
photos, and NOT proof of image-to-3D likeness. One scenario per GPU class.
Geometry vertices and an independent matrix multiplication execute on CUDA
when require_cuda=True. The same geometry can be audited offline on CPU.
"""
from __future__ import annotations

import base64
import hashlib
import io
import math
import time


TASKS = {
    "L4": "chess-cube-512-led-rook",
    "A100": "ecomech-asymmetric-mechanical-study",
    "H100": "halloween-multi-asset-room-study",
}


def construct(task, require_cuda=False):
    if task not in TASKS:
        raise ValueError("UNKNOWN_BOUNDED_3D_TASK")

    import numpy as np
    import trimesh
    from PIL import Image

    device = None
    gpu_identity = "CPU_OFFLINE_ONLY"
    gpu_vram_gb = 0
    torch = None
    if require_cuda:
        import torch
        if not torch.cuda.is_available():
            raise RuntimeError("CUDA_GPU_REQUIRED")
        device = torch.device("cuda:0")
        gpu_identity = torch.cuda.get_device_name(0)
        gpu_vram_gb = round(torch.cuda.get_device_properties(0).total_memory / (1024 ** 3), 2)
        expected = {"L4": "L4", "A100": "A100", "H100": "H100"}[task]
        if expected not in gpu_identity.upper():
            raise RuntimeError("WRONG_PHYSICAL_GPU")
        start = time.monotonic()
        a = torch.linspace(-1, 1, 512 * 512, device=device).reshape(512, 512)
        check = torch.mm(a, a)
        cuda_checksum = round(float(check[0, 0].item()), 5)
        torch.cuda.synchronize()
        gpu_compute_ms = round(1000 * (time.monotonic() - start), 2)
    else:
        cuda_checksum = None
        gpu_compute_ms = None

    scene = trimesh.Scene()
    colors = {
        "green": (32, 174, 87, 255),
        "blue": (23, 107, 219, 255),
        "cyan": (19, 246, 225, 255),
        "black": (20, 26, 30, 255),
        "steel": (115, 125, 139, 255),
        "silver": (188, 200, 214, 255),
        "orange": (232, 85, 20, 255),
        "purple": (87, 45, 128, 255),
        "white": (222, 228, 229, 255),
        "brown": (109, 63, 35, 255),
        "red": (191, 45, 43, 255),
    }
    material_cache = {}

    def add(name, mesh, position, color="steel", metallic=0.6, roughness=0.3, tilt=0):
        if name in scene.graph.nodes:
            raise ValueError("DUPLICATE_SCENE_OBJECT")
        pos = np.asarray(position, dtype=np.float64)
        if pos.shape != (3,) or not np.isfinite(pos).all():
            raise ValueError("INVALID_POSITION")
        if abs(tilt) > math.pi:
            raise ValueError("INVALID_TILT")

        # This transform happens on CUDA on real RunPod tasks, and on NumPy
        # during offline reproducibility tests. It changes REAL mesh vertices.
        values = np.asarray(mesh.vertices, dtype=np.float32)
        c, s = math.cos(tilt), math.sin(tilt)
        transform = np.asarray([[c, 0, s], [0, 1, 0], [-s, 0, c]], dtype=np.float32)
        if require_cuda:
            vertices = torch.as_tensor(values, device=device)
            matrix = torch.as_tensor(transform, device=device)
            translation = torch.as_tensor(pos, device=device, dtype=torch.float32)
            moved = (vertices @ matrix.T + translation).cpu().numpy()
        else:
            moved = values @ transform.T + pos
        mesh.vertices = moved
        raw = colors[color]
        key = (color, metallic, roughness)
        if key not in material_cache:
            image = Image.new("RGBA", (4, 4), raw)
            material_cache[key] = trimesh.visual.material.PBRMaterial(
                baseColorTexture=image, metallicFactor=float(metallic),
                roughnessFactor=float(roughness), doubleSided=True)
        coords = np.asarray(mesh.vertices, dtype=np.float32)
        uv = np.mod(coords[:, :2] * .31 + .5, 1.0)
        mesh.visual = trimesh.visual.TextureVisuals(uv=uv, material=material_cache[key])
        scene.add_geometry(mesh, geom_name=name, node_name=name)

    def box(name, xyz, size, color="steel", metallic=.7, tilt=0):
        add(name, trimesh.creation.box(extents=size), xyz, color, metallic, tilt=tilt)

    def tube(name, xyz, radius, height, color="steel", sections=24, metallic=.7, tilt=0):
        add(name, trimesh.creation.cylinder(radius=radius, height=height, sections=sections),
            xyz, color, metallic, tilt=tilt)

    def globe(name, xyz, radius, color, metallic=.5):
        add(name, trimesh.creation.icosphere(subdivisions=2, radius=radius),
            xyz, color, metallic)

    # L4: a playable 3D LED rook with 8 visibly separated height bands.
    if task == "L4":
        tube("rook_foot", (0, 0, .10), .54, .20, "black")
        tube("rook_foot_green_ring", (0, 0, .19), .51, .05, "green")
        tube("rook_column", (0, 0, .85), .32, 1.30, "silver")
        for i in range(8):
            h = .31 + i * .16
            tube(f"eight_level_led_band_{i}", (0, 0, h), .355, .028,
                 "cyan" if i % 2 == 0 else "blue", 32, .25)
        tube("rook_crown", (0, 0, 1.54), .50, .25, "green")
        for i in range(4):
            angle = i * math.pi / 2
            box(f"rook_crown_crenellation_{i}",
                (.37 * math.cos(angle), .37 * math.sin(angle), 1.76),
                (.24, .24, .24), "blue")
        globe("rook_light_core", (0, 0, 1.54), .16, "cyan", .1)
    # A100: true, asymmetric, multi-mesh mechanical robot STUDY, not recovered
    # from the user's reference photograph; includes a separate chili prop.
    elif task == "A100":
        box("ecomech_torso_frame", (0, 0, 1.72), (.9, .48, 1.0), "black")
        box("ecomech_left_green_chest_plate", (-.26, -.29, 1.94), (.46, .14, .55), "green")
        box("ecomech_left_blue_waist_plate", (-.27, -.29, 1.42), (.43, .16, .35), "blue")
        tube("ecomech_right_exposed_spine", (.28, -.30, 1.72), .12, .84, "steel")
        for i in range(8):
            tube(f"right_external_mechanism_{i}", (.17+i*.017, -.39, 1.35+i*.095),
                 .035, .075, "steel", 12)
        globe("ecomech_reactor_cyan", (0, -.37, 2.00), .24, "cyan", .05)
        tube("ecomech_neck", (0, 0, 2.35), .16, .24, "steel")
        globe("ecomech_helmet", (0, 0, 2.59), .32, "green")
        box("ecomech_eye_visor", (0, -.26, 2.59), (.39, .14, .10), "cyan", .1)
        tube("ecomech_antenna", (.16, .06, 2.97), .038, .40, "steel", 12, tilt=.25)
        for side,label in [(-1, "left"), (1, "right")]:
            col = "green" if side < 0 else "steel"
            globe(f"{label}_shoulder", (.55*side, 0, 2.06), .22, col)
            tube(f"{label}_upper_arm", (.64*side, 0, 1.78), .16, .52, col)
            globe(f"{label}_elbow", (.70*side, 0, 1.50), .14, "silver")
            tube(f"{label}_forearm", (.74*side, 0, 1.25), .14, .44, col)
            globe(f"{label}_hand", (.75*side, 0, .99), .13, "black")
            box(f"{label}_hip", (.32*side, 0, 1.18), (.36, .36, .23), "blue" if side<0 else "steel")
            tube(f"{label}_thigh", (.35*side, 0, .86), .23, .6, col)
            globe(f"{label}_knee", (.36*side, 0, .59), .2, "black")
            tube(f"{label}_shin", (.38*side, 0, .34), .18, .45, col)
            box(f"{label}_large_mecha_boot", (.37*side, -.13, .13), (.43, .65, .26), "blue" if side<0 else "steel")
            for j in range(3):
                tube(f"{label}_exposed_cable_{j}", (.51*side, -.25, 1.1+j*.12),
                     .025, .26, "cyan" if side<0 else "black", 10)
        tube("separate_green_chili_prop", (-.75, -.3, 1.1), .09, .47, "green", 14, tilt=.8)
        tube("separate_chili_stem", (-.93, -.3, 1.3), .035, .22, "green", 10, tilt=1.3)
    # H100: EDITABLE multi-asset room study. Human/squirrel are intentionally
    # stylized placeholders, NEVER claimed as realistic reconstructed likeness.
    else:
        box("room_floor", (0, 0, -.12), (5.5, 4.4, .20), "black", .1)
        box("room_back_wall", (0, 2.17, 1.6), (5.5, .12, 3.2), "purple", .1)
        box("room_side_wall", (-2.69, 0, 1.6), (.12, 4.4, 3.2), "purple", .1)
        box("keyboard_main_body", (0, -.45, .82), (2.65, .62, .30), "red")
        for key in range(28):
            x = -1.25 + key * .092
            box(f"keyboard_white_key_{key}", (x, -.79, .93), (.076, .32, .045), "white", .05)
            if key % 7 not in (2, 6):
                box(f"keyboard_black_key_{key}", (x+.046, -.61, .975),
                    (.045, .19, .07), "black", .04)
        box("keyboard_stand_left", (-1.03, -.35, .39), (.15, .15, .78), "steel")
        box("keyboard_stand_right", (1.03, -.35, .39), (.15, .15, .78), "steel")
        tube("performer_body", (0, .55, 1.36), .39, 1.02, "black", metallic=.1)
        globe("performer_human_face", (0, .27, 2.09), .31, "orange", .04)
        globe("performer_black_hair_back", (0, .65, 2.08), .37, "black", .02)
        for side in [-1, 1]:
            tube(f"performer_arm_{side}", (.47*side, .17, 1.49), .11, .73,
                 "orange", 16, .04, tilt=side*.78)
            globe(f"performer_hand_{side}", (.78*side, -.1, 1.12), .13, "orange", .04)
        globe("squirrel_body_separate", (.56, .44, 2.18), .20, "brown", .01)
        globe("squirrel_head_separate", (.61, .22, 2.36), .13, "orange", .01)
        globe("squirrel_tail_separate", (.86, .69, 2.35), .19, "brown", .01)
        box("squirrel_pumpkin_hoodie", (.56, .37, 2.17), (.27, .24, .19), "orange", .0)
        for k in range(5):
            x = -2 + k*.9
            globe(f"floating_magic_instrument_{k}", (x, 1.1, 2.35+(k%2)*.2), .18,
                  "orange" if k%2 else "cyan", .2)
            globe(f"floating_note_{k}", (x+.2, .8, 2.75), .05, "cyan", .1)
        for k in range(3):
            globe(f"halloween_pumpkin_{k}", (-1.9+k*1.9, 1.65, .28), .24, "orange")
        for k in range(2):
            tube(f"candle_{k}", (-1.4+k*2.8, 1.55, .63), .05, .24, "white", 12, .05)
            globe(f"candle_fire_{k}", (-1.4+k*2.8, 1.55, .79), .07, "orange", .01)

    if require_cuda:
        torch.cuda.synchronize()
    raw = scene.export(file_type="glb")
    if not isinstance(raw, (bytes, bytearray)) or raw[:4] != b"glTF":
        raise RuntimeError("REAL_GLB_EXPORT_REQUIRED")
    import struct
    if struct.unpack_from("<I", raw, 8)[0] != len(raw):
        raise RuntimeError("GLB_HEADER_SIZE_MISMATCH")
    # This is real multi-part triangular geometry and PBR textures. It is NOT
    # evidence of any kind of image-conditioned neural reconstruction.
    count = sum(len(mesh.faces) for mesh in scene.geometry.values())
    if len(scene.geometry) < 14 or count < 500:
        raise RuntimeError("INSUFFICIENT_3D_GEOMETRY")
    return {
        "revision": "worldifact-three-gpu-procedural-qualification-v1",
        "kind": "GPU_PROCEDURAL_TEST_NOT_PHOTO_RECONSTRUCTION",
        "task": TASKS[task],
        "gpuClass": task,
        "gpuName": gpu_identity,
        "gpuVramGiB": gpu_vram_gb,
        "cudaMatrixChecksum": cuda_checksum,
        "cudaComputeMs": gpu_compute_ms,
        "meshCount": len(scene.geometry),
        "triangleCount": count,
        "glbSha256": hashlib.sha256(raw).hexdigest(),
        "glbBase64": base64.b64encode(raw).decode("ascii"),
        "astraCallExecuted": False,
        "neuralImageTo3D": False,
        "originalImageMatch": "NOT_MEASURED",
        "makeReady": False,
    }


def verified_model(result):
    import base64
    import hashlib
    import io
    import struct

    import trimesh

    if result.get("kind") != "GPU_PROCEDURAL_TEST_NOT_PHOTO_RECONSTRUCTION":
        raise ValueError("MISSING_NONNEURAL_DISCLOSURE")
    if result.get("originalImageMatch") != "NOT_MEASURED" or result.get("astraCallExecuted") is not False:
        raise ValueError("FALSE_GPU_MODEL_CLAIM")
    raw = base64.b64decode(result["glbBase64"], validate=True)
    if len(raw) < 100 or len(raw) > 3_000_000:
        raise ValueError("WRONG_SIZE")
    if raw[:4] != b"glTF" or struct.unpack_from("<I", raw, 8)[0] != len(raw):
        raise ValueError("BAD_GLB")
    if hashlib.sha256(raw).hexdigest() != result["glbSha256"]:
        raise ValueError("GLB_HASH_MISMATCH")
    scene = trimesh.load(io.BytesIO(raw), file_type="glb", force="scene", process=False)
    triangles = sum(len(mesh.faces) for mesh in scene.geometry.values())
    if len(scene.geometry) < 14 or triangles < 500:
        raise ValueError("FAKE_OR_FLAT_3D")
    if triangles != result["triangleCount"]:
        raise ValueError("TRIANGLE_COUNT_MISMATCH")
    return raw
