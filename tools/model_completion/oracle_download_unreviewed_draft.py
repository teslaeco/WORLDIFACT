"""Read-only download of an existing failed job's UNREVIEWED, INCOMPLETE GLB.

Default PLAN ONLY. Explicit execution belongs in the original OCI Cloud Shell.
Private UUID/revision/exact size are caller inputs; an independent SHA256 is
optional, but the candidate's model-ready SHA256 is always verified. This copies
existing bytes only. It never generates, renders, completes or approves a model,
imports worker code, reads SQLite, writes remotely, or publishes an artifact.
"""
import argparse
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import re
import secrets
import selectors
import subprocess
import sys
import tempfile
import time

MODEL_LIMIT = 50_000_000
TRANSFER_TIMEOUT = 180

class DownloadError(RuntimeError):
    """Fixed diagnostics; private remote output is never printed."""

LaunchError = DownloadError

def parameters(job, revision, expected_bytes, expected_hash=None):
    if (not isinstance(job, str) or not re.fullmatch(r'[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}', job)
            or type(revision) is not int or not 1 <= revision <= 999999
            or type(expected_bytes) is not int or not 20 <= expected_bytes <= MODEL_LIMIT
            or (expected_hash is not None and (not isinstance(expected_hash, str)
                or not re.fullmatch('[0-9a-f]{64}', expected_hash)))):
        raise DownloadError('Invalid private draft parameters; no connection made.')
    return {'job': job, 'revision': revision, 'expected_bytes': expected_bytes, 'expected_hash': expected_hash}

# Shared local/remote guards, self-contained and independent of installed code.
GUARDS = r'''
import hashlib, json, math, os, pathlib, re, stat, struct, sys, urllib.request

def require(condition):
    if not condition:
        raise ValueError('Unreviewed failed-job candidate not verified')

def directory(path):
    path = pathlib.Path(path)
    require(path.is_absolute() and '..' not in path.parts)
    fd = os.open('/', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        for name in path.parts[1:]:
            next_fd = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            os.close(fd)
            fd = next_fd
        return fd
    except BaseException:
        os.close(fd)
        raise

def regular(base, relative, limit, private=False):
    parts = relative.split('/')
    require(parts and all(part and part not in ('.', '..') for part in parts))
    fd = os.dup(base)
    try:
        for part in parts[:-1]:
            next_fd = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            os.close(fd)
            fd = next_fd
        if private:
            info = os.fstat(fd)
            require(info.st_uid == os.geteuid() and not info.st_mode & 0o077)
        file_fd = os.open(parts[-1], os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=fd)
        with os.fdopen(file_fd, 'rb') as stream:
            before = os.fstat(stream.fileno())
            require(stat.S_ISREG(before.st_mode) and before.st_nlink == 1 and 0 < before.st_size <= limit)
            if private:
                require(before.st_uid == os.geteuid() and not before.st_mode & 0o077)
            raw = stream.read(limit + 1)
            after = os.fstat(stream.fileno())
            require(len(raw) == before.st_size and len(raw) <= limit
                    and (before.st_dev, before.st_ino, before.st_nlink, before.st_size, before.st_mtime_ns, before.st_ctime_ns)
                    == (after.st_dev, after.st_ino, after.st_nlink, after.st_size, after.st_mtime_ns, after.st_ctime_ns))
            return raw
    finally:
        os.close(fd)

def record(base, relative, limit=100000, private=False):
    value = json.loads(regular(base, relative, limit, private))
    require(isinstance(value, dict))
    return value

def glb(raw):
    require(20 <= len(raw) <= 50_000_000)
    magic, version, length = struct.unpack_from('<III', raw)
    require(magic == 0x46546c67 and version == 2 and length == len(raw))
    cursor = 12
    chunks = []
    while cursor < len(raw):
        require(cursor + 8 <= len(raw) and len(chunks) < 2)
        size, kind = struct.unpack_from('<II', raw, cursor)
        cursor += 8
        require(size % 4 == 0 and size > 0 and cursor + size <= len(raw))
        require(kind == (0x4e4f534a if not chunks else 0x004e4942)
                and (chunks or size <= 5000000))
        chunks.append((kind, raw[cursor:cursor + size]))
        cursor += size
    require(len(chunks) == 2 and chunks[0][0] == 0x4e4f534a and chunks[1][0] == 0x004e4942)
    document = json.loads(chunks[0][1])
    require(isinstance(document, dict) and isinstance(document.get('asset'), dict)
            and document['asset'].get('version') == '2.0'
            and isinstance(document.get('meshes'), list) and bool(document['meshes']))
    buffers = document.get('buffers')
    require(isinstance(buffers, list) and len(buffers) == 1 and isinstance(buffers[0], dict)
            and type(buffers[0].get('byteLength')) is int
            and 0 < buffers[0]['byteLength'] <= len(chunks[1][1])
            and len(chunks[1][1]) - buffers[0]['byteLength'] <= 3)
    # This route accepts only embedded GLBs; external or data URI resources stop.
    safe_extensions = {'KHR_materials_unlit', 'KHR_materials_specular', 'KHR_materials_ior',
                       'KHR_materials_transmission', 'KHR_materials_volume',
                       'KHR_materials_clearcoat', 'KHR_materials_sheen',
                       'KHR_materials_emissive_strength', 'KHR_texture_transform'}
    for key in ('extensionsUsed', 'extensionsRequired'):
        require(isinstance(document.get(key, []), list)
                and all(isinstance(name, str) and name in safe_extensions for name in document.get(key, [])))
    pending = [document]
    while pending:
        value = pending.pop()
        if isinstance(value, dict):
            require('uri' not in value and isinstance(value.get('extensions', {}), dict)
                    and set(value.get('extensions', {})) <= safe_extensions)
            pending.extend(value.values())
        elif isinstance(value, list):
            pending.extend(value)
        elif type(value) is float:
            require(math.isfinite(value))

    views = document.get('bufferViews', [])
    accessors = document.get('accessors', [])
    require(isinstance(views, list) and 0 < len(views) <= 50000
            and isinstance(accessors, list) and 0 < len(accessors) <= 50000)
    def integer(value, low, high):
        require(type(value) is int and low <= value <= high)
        return value
    for view in views:
        require(isinstance(view, dict) and type(view.get('buffer')) is int and view['buffer'] == 0)
        start = integer(view.get('byteOffset', 0), 0, buffers[0]['byteLength'])
        size = integer(view.get('byteLength'), 1, buffers[0]['byteLength'])
        require(start + size <= buffers[0]['byteLength'])
        if 'byteStride' in view:
            require(integer(view['byteStride'], 4, 252) % 4 == 0)
    widths = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}
    dimensions = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT2': 4, 'MAT3': 9, 'MAT4': 16}
    layouts = []
    for accessor in accessors:
        require(isinstance(accessor, dict) and 'sparse' not in accessor)
        view = views[integer(accessor.get('bufferView'), 0, len(views) - 1)]
        component = accessor.get('componentType')
        kind = accessor.get('type')
        require(type(component) is int and component in widths and kind in dimensions)
        width = widths[component]
        element = width * dimensions[kind]
        if kind.startswith('MAT'):
            columns = int(kind[-1]); element = columns * ((columns * width + 3) // 4 * 4)
        count = integer(accessor.get('count'), 1, 9000000)
        offset = integer(accessor.get('byteOffset', 0), 0, view['byteLength'])
        stride = view.get('byteStride', element)
        require(stride >= element and stride % width == 0 and offset % width == 0
                and (view.get('byteOffset', 0) + offset) % width == 0
                and offset + (count - 1) * stride + element <= view['byteLength'])
        layouts.append((view.get('byteOffset', 0) + offset, stride, component))
    require(isinstance(document.get('images', []), list) and len(document.get('images', [])) <= 1000)
    for picture in document.get('images', []):
        require(isinstance(picture, dict) and picture.get('mimeType') in ('image/png', 'image/jpeg'))
        integer(picture.get('bufferView'), 0, len(views) - 1)
    triangles = 0
    mesh_triangles = []
    index_maxima = {}
    scanned_indices = primitives = 0
    require(len(document['meshes']) <= 5000)
    for mesh in document['meshes']:
        before = triangles
        require(isinstance(mesh, dict) and isinstance(mesh.get('primitives'), list)
                and 0 < len(mesh['primitives']) <= 5000)
        for part in mesh['primitives']:
            primitives += 1
            require(primitives <= 50000)
            require(isinstance(part, dict) and isinstance(part.get('attributes'), dict))
            position = accessors[integer(part['attributes'].get('POSITION'), 0, len(accessors) - 1)]
            require(position.get('type') == 'VEC3' and position.get('componentType') == 5126)
            for attribute in part['attributes'].values():
                require(accessors[integer(attribute, 0, len(accessors) - 1)]['count'] == position['count'])
            count = position['count']
            if 'indices' in part:
                index = integer(part['indices'], 0, len(accessors) - 1)
                item = accessors[index]; start, stride, component = layouts[index]
                require(item['type'] == 'SCALAR' and component in (5121, 5123, 5125))
                count = item['count']; fmt = {5121: '<B', 5123: '<H', 5125: '<I'}[component]
                if index not in index_maxima:
                    scanned_indices += count
                    require(scanned_indices <= 9000000)
                    index_maxima[index] = max(struct.unpack_from(fmt, chunks[1][1], start + i * stride)[0]
                                              for i in range(count))
                require(index_maxima[index] < position['count'])
            mode = integer(part.get('mode', 4), 0, 6)
            if mode == 4:
                require(count % 3 == 0); triangles += count // 3
            elif mode in (5, 6):
                triangles += max(0, count - 2)
            require(triangles <= 3000000)
        mesh_triangles.append(triangles - before)
    require(triangles > 0)
    nodes = document.get('nodes', [])
    require(isinstance(nodes, list) and len(nodes) <= 5000)
    parents = set()
    rendered = 0
    for node in nodes:
        require(isinstance(node, dict) and isinstance(node.get('children', []), list))
        if 'mesh' in node:
            rendered += mesh_triangles[integer(node['mesh'], 0, len(mesh_triangles) - 1)]
        for child in node.get('children', []):
            integer(child, 0, len(nodes) - 1)
            require(child not in parents)
            parents.add(child)
    visited = set()
    def visit(index, active):
        require(index not in active and len(active) < 128)
        if index in visited:
            return
        for child in nodes[index].get('children', []):
            visit(child, active | {index})
        visited.add(index)
    for index in range(len(nodes)):
        visit(index, set())
    require(rendered <= 3000000)
    return triangles

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None

def failed_status(root, job):
    # The only HTTP action is an authenticated GET to the fixed local service.
    token = record(root, 'state/config.json', 16384).get('token')
    require(isinstance(token, str) and re.fullmatch(r'[A-Za-z0-9_-]{32,256}', token) is not None)
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    request = urllib.request.Request('http://127.0.0.1:8765/v1/jobs/' + job,
                                    headers={'Authorization': 'Bearer ' + token}, method='GET')
    with opener.open(request, timeout=10) as response:
        require(response.status == 200)
        raw = response.read(1000001)
        require(0 < len(raw) <= 1000000)
    value = json.loads(raw)
    require(isinstance(value, dict) and value.get('id') == job and value.get('state') == 'failed')
    return value

def verified_model(home, private):
    root = directory(pathlib.Path(home) / 'froge-connector')
    try:
        status = failed_status(root, private['job'])
        folder = 'state/jobs/' + private['job'] + '/'
        snapshots = {}
        def checkpoint(name, limit=2000000, optional=False):
            try:
                raw = regular(root, folder + name, limit)
            except FileNotFoundError:
                require(optional)
                raw = None
            snapshots[name] = raw
            if raw is None:
                return {}
            value = json.loads(raw)
            require(isinstance(value, dict))
            return value
        request = checkpoint('agent-request.json', 1000000)
        candidate = checkpoint('agent-candidate.json', 10000)
        require(isinstance(request.get('execution_id'), str) and 0 < len(request['execution_id']) <= 256
                and candidate.get('execution_id') == request['execution_id']
                and type(candidate.get('revision')) is int and candidate['revision'] == private['revision']
                and candidate.get('path') == 'candidates/' + str(private['revision']))
        for name in ('agent-outcome.json', 'visual-review.json'):
            value = checkpoint(name, 100000, optional=True)
            require(value.get('accepted') is not True and value.get('finished') is not True)
        current = candidate['path'] + '/'
        ready = checkpoint(current + 'model-ready.json')
        result = checkpoint(current + 'result.json')
        # model-ready revision is the checkpoint schema, not the candidate revision.
        require(type(ready.get('revision')) is int and ready['revision'] == 1
                and ready.get('phase') in ('core_export', 'interchange_exports')
                and type(ready.get('bytes')) is int and ready['bytes'] == private['expected_bytes']
                and isinstance(ready.get('sha256'), str) and re.fullmatch('[0-9a-f]{64}', ready['sha256'])
                and (private['expected_hash'] is None or ready['sha256'] == private['expected_hash'])
                and isinstance(ready.get('result'), dict)
                and type(result.get('triangles')) is int and result['triangles'] > 0
                and type(ready['result'].get('triangles')) is int
                and ready['result']['triangles'] == result['triangles'])
        # Later export metadata may differ; the shared geometry must not.
        for key in ('vertices', 'objects'):
            if key in ready['result'] or key in result:
                require(type(ready['result'].get(key)) is int and type(result.get(key)) is int
                        and 0 <= result[key] <= 9000000 and ready['result'][key] == result[key])
        raw = regular(root, folder + current + 'model.glb', private['expected_bytes'])
        require(len(raw) == private['expected_bytes'] and hashlib.sha256(raw).hexdigest() == ready['sha256']
                and glb(raw) > 0)
        # Blender reports triangles per object; glTF can share one mesh across
        # instances. Bind the two report snapshots, not different count metrics.
        # No root model or success is required: failed jobs preserve candidates.
        # Re-read every source barrier before any artifact bytes leave this VM.
        require(regular(root, folder + current + 'model.glb', private['expected_bytes']) == raw)
        for name, previous in snapshots.items():
            try:
                present = regular(root, folder + name, 2000000)
            except FileNotFoundError:
                present = None
            require(present == previous)
        require(failed_status(root, private['job']) == status)
        return raw
    finally:
        os.close(root)
'''

exec(GUARDS, globals())

def script(private):
    if not isinstance(private, dict) or set(private) != {'job', 'revision', 'expected_bytes', 'expected_hash'}:
        raise DownloadError('Invalid private draft parameters; no connection made.')
    parameters(**private)
    return (GUARDS + '\nPRIVATE = ' + repr(private) + """
try:
    raw = verified_model(pathlib.Path.home(), PRIVATE)
except BaseException:
    raise SystemExit(1)
sys.stdout.buffer.write(raw)
sys.stdout.buffer.flush()
""").encode()

def download(ssh, program, private, home=None, popen=subprocess.Popen, timeout=TRANSFER_TIMEOUT):
    """Bounded binary stream into a new private directory; atomic no-clobber link."""
    parameters(**private)
    home = Path.home() if home is None else Path(home)
    parent = directory(home)
    folder = None
    child = None
    process = None
    finalized = False
    created_directory = False
    created_ready = False
    try:
        folder = 'worldifact-UNREVIEWED-INCOMPLETE-' + secrets.token_hex(12)
        os.mkdir(folder, mode=0o700, dir_fd=parent)
        created_directory = True
        child = os.open(folder, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent)
        info = os.fstat(child)
        require(info.st_uid == os.geteuid() and not info.st_mode & 0o077)
        fd = os.open('.model.glb.part', os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                     0o600, dir_fd=child)
        with os.fdopen(fd, 'wb') as output, tempfile.TemporaryFile() as source:
            source.write(program)
            source.seek(0)
            process = popen(ssh, stdin=source, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
            deadline = time.monotonic() + timeout
            total = 0
            hasher = hashlib.sha256()
            with selectors.DefaultSelector() as selector:
                selector.register(process.stdout, selectors.EVENT_READ)
                while True:
                    remaining = deadline - time.monotonic()
                    require(remaining > 0)
                    require(bool(selector.select(remaining)))
                    data = os.read(process.stdout.fileno(), min(65536, private['expected_bytes'] - total + 1))
                    if not data:
                        break
                    total += len(data)
                    require(total <= private['expected_bytes'])
                    output.write(data)
                    hasher.update(data)
            require(process.wait(timeout=max(0.001, deadline - time.monotonic())) == 0
                    and total == private['expected_bytes']
                    and (private['expected_hash'] is None or hasher.hexdigest() == private['expected_hash']))
            output.flush()
            os.fsync(output.fileno())
        # Validate the local container independently before exposing a ready name.
        local_raw = regular(child, '.model.glb.part', private['expected_bytes'])
        require(hashlib.sha256(local_raw).hexdigest() == hasher.hexdigest())
        glb(local_raw)
        os.link('.model.glb.part', 'model-UNREVIEWED-INCOMPLETE.glb', src_dir_fd=child, dst_dir_fd=child, follow_symlinks=False)
        created_ready = True
        os.unlink('.model.glb.part', dir_fd=child)
        require(regular(child, 'model-UNREVIEWED-INCOMPLETE.glb', private['expected_bytes']) == local_raw)
        os.fsync(child)
        os.fsync(parent)
        finalized = True
        return {'path': str(home / folder / 'model-UNREVIEWED-INCOMPLETE.glb'), 'bytes': private['expected_bytes'],
                'sha256': hasher.hexdigest(), 'state': 'UNREVIEWED_INCOMPLETE',
                'sourceState': 'failed', 'completed': False, 'accepted': False,
                'visualQuality': 'UNREVIEWED',
                'manufacturingApproval': False}
    except BaseException:
        if process is not None and process.poll() is None:
            process.kill()
            process.wait()
        if child is not None and not finalized:
            if created_ready:
                os.unlink('model-UNREVIEWED-INCOMPLETE.glb', dir_fd=child)
            try:
                os.unlink('.model.glb.part', dir_fd=child)
            except FileNotFoundError:
                pass
        raise DownloadError('Download not confirmed. No automatic retry.') from None
    finally:
        if process is not None and process.stdout is not None:
            process.stdout.close()
        if child is not None:
            os.close(child)
        if created_directory and not finalized:
            try:
                os.rmdir(folder, dir_fd=parent)
            except OSError:
                pass
        os.close(parent)

# Copied verbatim from oracle_launch.py blob ba7bb96db4fe1dd0b32f3cfb8c858bd1fd62230c.
def lookup(args):
    try:
        answer = subprocess.run(args, stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=60)
    except Exception:
        raise LaunchError('OCI lookup unavailable. Use the original Cloud Shell; no worker change.') from None
    if answer.returncode or len(answer.stdout) > 65536:
        raise LaunchError('OCI lookup failed; no worker change.')
    try:
        values = json.loads(answer.stdout)
    except ValueError:
        raise LaunchError('Invalid OCI lookup response; no worker change.') from None
    if not isinstance(values, list) or len(values) != 1 or not isinstance(values[0], str):
        raise LaunchError('Expected exactly one existing VM/address; no worker change.')
    return values[0]

def connection(home=None):
    home = Path.home() if home is None else Path(home)
    key = home / 'ssh-key-2026-09-06.key'
    if any(p.is_symlink() for p in (key, *key.parents)) or not key.is_file() or not os.access(key, os.R_OK):
        raise LaunchError('Original Cloud Shell SSH key is unavailable. Do not share or replace it.')
    oci = ['oci', '--region', 'eu-amsterdam-1']
    instance = lookup(oci + ['search', 'resource', 'structured-search', '--query-text',
        "query instance resources where displayName = 'froge-blender' && lifeCycleState = 'RUNNING'",
        '--query', 'data.items[].identifier', '--output', 'json'])
    if not re.fullmatch(r'ocid1\.instance\.[A-Za-z0-9._-]+', instance):
        raise LaunchError('Invalid instance identifier; no worker change.')
    address = lookup(oci + ['compute', 'instance', 'list-vnics', '--instance-id', instance, '--all',
        '--query', 'data[?"is-primary" == `true`]."public-ip"', '--output', 'json'])
    try:
        public_ip = ipaddress.ip_address(address)
        if not public_ip.is_global or public_ip.is_multicast or '%' in address:
            raise ValueError()
    except ValueError:
        raise LaunchError('Invalid public VM address; no worker change.') from None
    return ['ssh', '-F', '/dev/null', '-T', '-i', str(key), '-o', 'IdentitiesOnly=yes', '-o', 'StrictHostKeyChecking=yes',
            '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20', '-o', 'ServerAliveInterval=15',
            '-o', 'ServerAliveCountMax=3', 'opc@' + address, 'PYTHONDONTWRITEBYTECODE=1 python3 -B -']

class PrivateParser(argparse.ArgumentParser):
    def error(self, message):
        self.exit(2, 'STOP: invalid draft download arguments.\n')

def main(argv=None):
    parser = PrivateParser(description=__doc__, allow_abbrev=False)
    parser.add_argument('--download-unreviewed-draft', action='store_true')
    parser.add_argument('--job')
    parser.add_argument('--revision', type=int)
    parser.add_argument('--expected-glb-bytes', type=int)
    parser.add_argument('--expected-glb-sha256')
    args = parser.parse_args(argv)
    if not args.download_unreviewed_draft:
        print('PLAN ONLY. No file reads, OCI lookup, SSH, transfer or worker changes.')
        return
    private = parameters(args.job, args.revision, args.expected_glb_bytes, args.expected_glb_sha256)
    program = script(private)
    result = download(connection(), program, private)
    print(json.dumps(result, sort_keys=True), flush=True)
    return result

if __name__ == '__main__':
    try:
        main()
    except (Exception, KeyboardInterrupt):
        print('STOP: UNREVIEWED draft download not confirmed. No automatic retry or worker change.', file=sys.stderr)
        sys.exit(1)
