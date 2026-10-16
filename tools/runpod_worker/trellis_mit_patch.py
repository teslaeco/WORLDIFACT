"""Strict reproducible one-file TRELLIS.2 source patch, done at IMAGE BUILD time.

Pinned official MIT source is retained in Git; ONE import is changed to the
WORLDIFACT MIT DRTK bridge. A dirty/unpinned checkout is rejected. Never patch
source during a customer GPU request or install model dependencies per request.
"""
from __future__ import annotations
import argparse
import hashlib
import os
import subprocess
import tempfile
from pathlib import Path

CODE_REVISION = '75fbf0183001ed9876c8dbb35de6b68552ee08bd'
SOURCE = 'o-voxel/o_voxel/postprocess.py'
ORIGINAL = b'import nvdiffrast.torch as dr\n'
REPLACEMENT = b'import worldifact_drtk_uv as dr\n'


class Rejected(Exception):
    pass


def replace_import(data):
    if not isinstance(data, bytes) or data.count(ORIGINAL) != 1 or REPLACEMENT in data:
        raise Rejected('UPSTREAM_IMPORT_CHANGED')
    patched = data.replace(ORIGINAL, REPLACEMENT)
    if patched.count(REPLACEMENT) != 1 or ORIGINAL in patched:
        raise Rejected('UNEXPECTED_PATCH_CONTENT')
    return patched


def git(root, *args):
    try:
        return subprocess.check_output(
            ['git', '-c', 'safe.directory=' + str(root), '-C', str(root), *args],
            stderr=subprocess.DEVNULL, timeout=10)
    except (OSError, subprocess.SubprocessError):
        raise Rejected('UPSTREAM_GIT_VERIFICATION_FAILED') from None


def audit(root, apply=False, expected_revision=CODE_REVISION):
    root = Path(root).resolve(strict=True)
    path = root / SOURCE
    if not path.is_file() or path.is_symlink() or not path.resolve().is_relative_to(root):
        raise Rejected('UNSAFE_UPSTREAM_SOURCE_PATH')
    revision = git(root, 'rev-parse', 'HEAD').decode('ascii').strip()
    if revision != expected_revision:
        raise Rejected('UPSTREAM_REVISION_CHANGED')
    pristine = git(root, 'show', 'HEAD:' + SOURCE)
    patched = replace_import(pristine)
    changed = git(root, 'diff', '--name-only', 'HEAD', '--').decode('utf-8').splitlines()
    staged = git(root, 'diff', '--cached', '--name-only', 'HEAD', '--')
    if staged or (changed != [SOURCE] if not apply else bool(changed)):
        raise Rejected('UPSTREAM_UNRELATED_SOURCE_CHANGED')
    data = path.read_bytes()
    if apply:
        if data != pristine:
            raise Rejected('UPSTREAM_FILE_NOT_PRISTINE')
        # No customer job can ever reach this build-time command.
        fd, dest = tempfile.mkstemp(prefix='.worldifact-drtk-', dir=str(path.parent))
        try:
            os.fchmod(fd, path.stat().st_mode & 0o777)
            with os.fdopen(fd, 'wb') as output:
                output.write(patched)
                output.flush()
                os.fsync(output.fileno())
            os.replace(dest, path)
        finally:
            if os.path.exists(dest):
                os.unlink(dest)
    else:
        if data != patched:
            raise Rejected('COMMERCIAL_SOURCE_PATCH_NOT_APPLIED')
    return {'revision': revision, 'patchedSha256': hashlib.sha256(patched).hexdigest(),
            'commercialRasterizer': 'drtk/MIT', 'sourceDiffScope': [SOURCE]}


def main():
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--apply', action='store_true')
    mode.add_argument('--check', action='store_true')
    parser.add_argument('--source', default='/opt/TRELLIS.2')
    args = parser.parse_args()
    try:
        result = audit(args.source, apply=args.apply)
    except (Rejected, OSError, ValueError):
        print('WORLDIFACT_COMMERCIAL_UPSTREAM_NOT_VERIFIED')
        return 2
    # No absolute paths, credentials, source blobs or model data in build logs.
    print('WORLDIFACT_DRTK_PATCH_' + ('APPLIED' if args.apply else 'VERIFIED') +
          ': ' + result['patchedSha256'])
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
