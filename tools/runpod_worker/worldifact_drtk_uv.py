"""WORLDIFACT-owned adapter for MIT-licensed DRTK UV baking.

API-compatible only with the pinned TRELLIS.2 o_voxel.postprocess operations:
RasterizeCudaContext(), rasterize(), and interpolate().
This is NOT a copy of NVIDIA nvdiffrast. Actual CUDA parity is UNVERIFIED.
"""
from __future__ import annotations

from uv_contract import clip_to_pixel, validate_resolution


class RasterizeCudaContext:
    """A narrow marker to reject unreviewed rasterization contexts."""
    pass


def _dependencies():
    import torch
    import drtk
    return torch, drtk


def rasterize(ctx, pos, tri, resolution):
    """Return nvdiffrast-shaped UV raster [1,H,W,4] using the MIT DRTK API.

    RGB = barycentric weights in face corner order; alpha = local face ID + 1,
    or 0 for uncovered pixels. The caller adds each face-batch offset to alpha.
    """
    if type(ctx) is not RasterizeCudaContext:
        raise ValueError("UNREVIEWED_UV_CONTEXT")
    h, w = validate_resolution(resolution)
    torch, drtk = _dependencies()
    if (pos.ndim != 3 or pos.shape[0] != 1 or pos.shape[-1] != 4
            or tri.ndim != 2 or tri.shape[1] != 3
            or not 0 < tri.shape[0] <= 100_000
            or not pos.is_cuda or not tri.is_cuda):
        raise ValueError("INVALID_GPU_UV_GEOMETRY")
    if not bool(torch.isfinite(pos).all().item()) or not bool((pos[..., 3] > 0).all().item()):
        raise ValueError("INVALID_CLIP_SPACE_COORDINATES")
    if not bool((tri >= 0).all().item()) or not bool((tri < pos.shape[1]).all().item()):
        raise ValueError("INVALID_UV_FACE_INDEX")
    xy = pos[..., :2] / pos[..., 3:]
    x, y = clip_to_pixel(xy[..., 0], xy[..., 1], w, h)
    # All UV fragments use z = +1 in camera space for DRTK perspective barycentrics.
    v = torch.stack((x, y, torch.ones_like(x)), dim=-1).contiguous().float()
    faces = tri.contiguous().to(dtype=torch.int32)
    index = drtk.rasterize(v, faces, height=h, width=w)
    _, bary = drtk.render(v, faces, index)
    if tuple(index.shape) != (1, h, w) or tuple(bary.shape) != (1, 3, h, w):
        raise ValueError("DRTK_UNEXPECTED_RASTER_SHAPE")
    valid = index >= 0
    rgba = torch.zeros((1, h, w, 4), device=pos.device, dtype=torch.float32)
    rgba[..., :3] = torch.where(valid[..., None], bary.permute(0, 2, 3, 1), 0)
    rgba[..., 3] = torch.where(valid, index.float() + 1, 0)
    return rgba, None


def interpolate(attributes, raster, tri):
    """Return (one [1,H,W,C] tensor, None), matching pinned caller's [0][0].

    DRTK's index = -1 background; stored face alpha uses zero background,
    one-based face indices. Never interpolate background into material channels.
    """
    torch, drtk = _dependencies()
    if (attributes.ndim != 3 or attributes.shape[0] != 1
            or raster.ndim != 4 or raster.shape[0] != 1 or raster.shape[-1] != 4
            or tri.ndim != 2 or tri.shape[1] != 3
            or not attributes.is_cuda or not raster.is_cuda or not tri.is_cuda):
        raise ValueError("INVALID_GPU_UV_INTERPOLATION")
    ids = raster[..., 3].to(dtype=torch.int32) - 1
    if not bool(((ids >= -1) & (ids < tri.shape[0])).all().item()):
        raise ValueError("INVALID_UV_RASTER_FACE_ID")
    face_index = tri.to(dtype=torch.int32).contiguous()
    weights = raster[..., :3].permute(0, 3, 1, 2).contiguous()
    pixels = drtk.interpolate(attributes, face_index, ids, weights)
    if tuple(pixels.shape) != (1, attributes.shape[2], raster.shape[1], raster.shape[2]):
        raise ValueError("DRTK_UNEXPECTED_INTERPOLATION_SHAPE")
    pixels = torch.where((ids >= 0).unsqueeze(1), pixels, 0)
    return pixels.permute(0, 2, 3, 1).contiguous(), None
