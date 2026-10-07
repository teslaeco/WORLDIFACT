"""Opt-in, exact-job inspection of existing candidate bytes. Never runs a model.

No installed source is imported. No SQLite, provider API, credentials, financial
ledger, model export/copy, subprocess, file write or repair is performed. A found
candidate remains unfinished and requires separate visual review and recovery.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import struct

JOB = '7b20b76f-d476-4a47-a98f-a48d27c3e3f0'
MAX_MODEL = 48 * 1024 * 1024


class Refused(ValueError):
    pass


def checked_path(path):
    path = Path(path).absolute()
    if any(part.is_symlink() for part in (path, *path.parents)):
        raise Refused('LINKED_PATH')
    return path


def signature(info):
    return (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns, info.st_ctime_ns)


class Reader:
    def __init__(self, folder):
        self.folder = checked_path(folder)
        self.observed = {}

    def bytes(self, relative, maximum):
        if not isinstance(relative, str) or not re.fullmatch(r'[A-Za-z0-9_./-]+', relative) or '..' in relative or relative.startswith('/'):
            raise Refused('INVALID_PATH')
        path = checked_path(self.folder / relative)
        try:
            fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        except FileNotFoundError:
            raise Refused('MISSING_FILE') from None
        with os.fdopen(fd, 'rb') as stream:
            before = os.fstat(stream.fileno())
            if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1 or not 0 < before.st_size <= maximum:
                raise Refused('INVALID_FILE')
            data = stream.read(maximum + 1)
            after = os.fstat(stream.fileno())
        if len(data) != before.st_size or signature(before) != signature(after) or signature(os.stat(path, follow_symlinks=False)) != signature(after):
            raise Refused('CHANGED_FILE')
        self.observed[path] = signature(after)
        return data

    def record(self, relative, maximum):
        value = json.loads(self.bytes(relative, maximum).decode('utf-8'))
        if not isinstance(value, dict):
            raise Refused('INVALID_RECORD')
        return value

    def stable(self):
        for path, before in self.observed.items():
            if signature(os.stat(checked_path(path), follow_symlinks=False)) != before:
                raise Refused('CHANGED_FILE')


def glb_container(data):
    if not 20 <= len(data) <= MAX_MODEL:
        raise Refused('INVALID_GLB')
    magic, version, length = struct.unpack_from('<III', data)
    if magic != 0x46546c67 or version != 2 or length != len(data):
        raise Refused('INVALID_GLB')
    offset = 12; document = None; binary = False
    while offset < len(data):
        if offset + 8 > len(data):
            raise Refused('INVALID_GLB')
        length, kind = struct.unpack_from('<II', data, offset); offset += 8
        if length % 4 or offset + length > len(data):
            raise Refused('INVALID_GLB')
        chunk = data[offset:offset + length]; offset += length
        if kind == 0x4e4f534a and document is None and not binary and length <= 4 * 1024 * 1024:
            document = json.loads(chunk.decode('utf-8').rstrip(' \x00'))
        elif kind == 0x004e4942 and document is not None and not binary:
            binary = True
        else:
            raise Refused('INVALID_GLB')
    if not isinstance(document, dict) or not isinstance(document.get('asset'), dict) or document['asset'].get('version') != '2.0':
        raise Refused('INVALID_GLB')
    for name in ('buffers', 'images', 'meshes', 'nodes', 'materials'):
        if not isinstance(document.get(name, []), list):
            raise Refused('INVALID_GLB')
    for entry in document.get('buffers', []) + document.get('images', []):
        if not isinstance(entry, dict) or entry.get('uri') is not None and (not isinstance(entry['uri'], str) or not entry['uri'].startswith('data:')):
            raise Refused('EXTERNAL_RESOURCE')
    return {'container_valid': True, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(),
            'mesh_count': len(document.get('meshes', [])), 'material_count': len(document.get('materials', [])),
            'node_count': len(document.get('nodes', [])), 'image_count': len(document.get('images', []))}


def inspect(source):
    report = {'phase': 'CURRENT_CANDIDATE_UNVERIFIED', 'read_only': True,
              'paid_generation_requested': False, 'job_rows_changed': False,
              'financial_settlement_requested': False, 'artifact_copied': False,
              'completion_verified': False, 'visual_quality_verified': False}
    try:
        reader = Reader(checked_path(source) / 'state' / 'jobs' / JOB)
        request = reader.record('agent-request.json', 100000)
        info = reader.record('agent-candidate.json', 10000)
        execution = request.get('execution_id')
        if not isinstance(execution, str) or not 1 <= len(execution) <= 256 or info.get('execution_id') != execution:
            raise Refused('EXECUTION_MISMATCH')
        if type(info.get('revision')) is not int or not 1 <= info['revision'] <= 5:
            raise Refused('REVISION_INVALID')
        relative = info.get('path')
        if not isinstance(relative, str) or not re.fullmatch(r'candidates/[1-5]', relative):
            raise Refused('INVALID_CANDIDATE_PATH')
        data = reader.bytes(relative + '/model.glb', MAX_MODEL)
        model = glb_container(data)
        ready = reader.record(relative + '/model-ready.json', 2 * 1024 * 1024)
        result = reader.record(relative + '/result.json', 2 * 1024 * 1024)
        triangles = result.get('triangles')
        if ready.get('revision') != 1 or ready.get('phase') not in ('core_export', 'interchange_exports') or (ready.get('bytes'), ready.get('sha256')) != (model['bytes'], model['sha256']):
            raise Refused('CHECKPOINT_MISMATCH')
        if type(triangles) is not int or not 1 <= triangles <= 9_000_000 or not isinstance(ready.get('result'), dict) or ready['result'].get('triangles') != triangles:
            raise Refused('RESULT_MISMATCH')
        reader.stable()
        report.update(phase='CURRENT_CANDIDATE_FOUND_UNREVIEWED', revision=info['revision'], model=model,
                      renderer_reported_triangles=triangles)
    except Refused as error:
        report['reason'] = str(error)
    except (OSError, ValueError, TypeError, KeyError, struct.error, OverflowError):
        report['reason'] = 'READ_UNVERIFIED'
    return report


def main(arguments=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--inspect-approved-candidate', action='store_true')
    parser.add_argument('--source', type=Path, default=Path.home() / 'froge-connector')
    args = parser.parse_args(arguments)
    if not args.inspect_approved_candidate:
        print('PLAN ONLY. No candidate files or server state were read.')
        return 0
    print(json.dumps(inspect(args.source), sort_keys=True))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
