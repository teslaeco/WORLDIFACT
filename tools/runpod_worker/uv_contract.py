"""Pure, portable UV math contracts for WORLDIFACT's DRTK bridge.

Pixel-center projection follows DRTK's top-left (-0.5,-0.5) convention.
These helpers do not import Torch or launch CUDA.
"""
from __future__ import annotations


def validate_resolution(value):
    if (not isinstance(value, (tuple, list)) or len(value) != 2
            or any(type(x) is not int or x < 16 or x > 4096 for x in value)):
        raise ValueError("INVALID_UV_RESOLUTION")
    return value[0], value[1]


def clip_to_pixel(ndc_x, ndc_y, width, height):
    if (type(width) is not int or type(height) is not int
            or not 16 <= width <= 4096 or not 16 <= height <= 4096):
        raise ValueError("INVALID_UV_RESOLUTION")
    return ((ndc_x + 1) * width / 2 - 0.5,
            (1 - ndc_y) * height / 2 - 0.5)


def face_alpha(index):
    """Local face index >=0 -> stored alpha face_id+1; background -1 -> 0."""
    if type(index) is not int or index < -1 or index > 100_000:
        raise ValueError("INVALID_FACE_INDEX")
    return index + 1


def decode_face_alpha(alpha, offset, total_faces):
    """Only call for alpha>0; NEVER map a hole/background pixel into a face."""
    if (type(alpha) is not int or alpha <= 0
            or type(offset) is not int or offset < 0
            or type(total_faces) is not int or total_faces <= 0):
        raise ValueError("INVALID_COVERED_PIXEL")
    index = alpha + offset - 1
    if not 0 <= index < total_faces:
        raise ValueError("UV_FACE_INDEX_OUT_OF_BOUNDS")
    return index
