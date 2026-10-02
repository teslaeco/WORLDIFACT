"""Prepare/observe ONE original-input Oracle cabinet test, never run on install.

Default is PLAN ONLY: no file reads, network, claim or paid request. Run only on
the original VM after separate explicit approval for the fixed USD 1.75 test.
The fixed claim is consumed before the sole POST, even when its outcome is
unknown or rejected. Never remove it or reset a spend ledger to retry.

Original prompt, agent instructions, ordered reference metadata and JPEG bytes
remain on this VM. Only the existing authenticated localhost worker receives
them. There is no customer account, checkout or points-debit operation here.
The provider reservation excludes any unknown taxes; invoice cost is UNKNOWN.
"""
import argparse
import ast
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import stat
import struct
import sys
import time
import urllib.error
import urllib.request

# Original and test identifiers and artifact binding are private runtime inputs.
APPROVAL = 'ORIGINAL_INPUT_ASTRA175_ONCE'
MAX_PROVIDER_RESERVATION_USD = 1.75
CABINET_FLOORS = {'renderedTriangles': 20000, 'meshCount': 8,
                  'substantialMeshCount': 6, 'primitiveCount': 8,
                  'materialCount': 3, 'nodeCount': 8}
POLICY = 'worldifact-reference-completion-v1'
CABINET = 'WORLDIFACT INDUSTRIAL ELECTRICAL CABINET — TRUE 3D MODE:'
EXPIRY = 1793145600
PHOTO_SOURCE_BLOB = '0c374e83ba5d03eaac9ed8f17837abf45f55da76'
ORIGIN = 'http://127.0.0.1:8765'
POLL_SECONDS = 2100
JSON_LIMIT = 1_000_000
PHOTO_LIMIT = 2 * 1024 * 1024
MODEL_LIMIT = 50_000_000
UUID = re.compile(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}')
SHA = re.compile(r'[a-f0-9]{64}')
STATES = {'queued', 'generating', 'retrying', 'building', 'succeeded', 'failed', 'cancelled'}
TERMINAL = {'succeeded', 'failed', 'cancelled'}


class TestError(RuntimeError):
    """Messages are fixed public diagnostics, never upstream/private text."""


def safe(path):
    path = Path(path).absolute()
    if '..' in path.parts or any(p.is_symlink() for p in (path, *path.parents)):
        raise TestError('UNSAFE_LOCAL_PATH')
    return path


def read_regular(path, limit):
    path = safe(path)
    fd = os.open(str(path), os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, 'rb') as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or not 0 < info.st_size <= limit:
            raise TestError('INVALID_LOCAL_FILE')
        value = stream.read(limit + 1)
        if len(value) != info.st_size or len(value) > limit:
            raise TestError('LOCAL_FILE_CHANGED_OR_TOO_LARGE')
        return value


def read_json(path, limit=100_000):
    try:
        return json.loads(read_regular(path, limit))
    except (ValueError, UnicodeError):
        raise TestError('INVALID_LOCAL_JSON') from None


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def job_identity(value):
    if not isinstance(value, str) or not UUID.fullmatch(value):
        raise TestError('CANONICAL_PRIVATE_JOB_UUID_REQUIRED')
    return value


def descriptor(source_job, test_job, expected_original_artifact_sha256=None):
    source_job, test_job = job_identity(source_job), job_identity(test_job)
    if source_job == test_job:
        raise TestError('DISTINCT_SOURCE_AND_TEST_UUIDS_REQUIRED')
    if expected_original_artifact_sha256 is not None and (not isinstance(expected_original_artifact_sha256, str)
            or not SHA.fullmatch(expected_original_artifact_sha256)):
        raise TestError('CANONICAL_EXPECTED_ARTIFACT_SHA256_REQUIRED')
    return {'approval': APPROVAL, 'sourceJobId': source_job, 'jobId': test_job,
            'maxProviderReservationUsd': MAX_PROVIDER_RESERVATION_USD,
            'expectedOriginalArtifactSha256': expected_original_artifact_sha256}


def checked_descriptor(value):
    if not isinstance(value, dict):
        raise TestError('PRIVATE_TEST_DESCRIPTOR_INVALID')
    expected = descriptor(value.get('sourceJobId'), value.get('jobId'), value.get('expectedOriginalArtifactSha256'))
    if value != expected or type(value.get('maxProviderReservationUsd')) is not float:
        raise TestError('PRIVATE_TEST_DESCRIPTOR_INVALID')
    return expected


def verify_sources(root):
    """No installed Python is imported/executed. Verify receipts and paths."""
    proof = read_json(root / '.worldifact-model-completion.json')
    names = {'server.py', 'codex_runner.py', 'blender_mcp.py', 'completion_policy.py', 'astra_spend_v2.py'}
    if not isinstance(proof, dict) or proof.get('revision') != POLICY or set(proof.get('sha256', {})) != names:
        raise TestError('COMPLETION_RECEIPT_NOT_VERIFIED')
    hashes = proof['sha256']
    sources = {}
    for name in names:
        raw = read_regular(root / name, 1_048_576)
        if not isinstance(hashes[name], str) or not SHA.fullmatch(hashes[name]) or digest(raw) != hashes[name]:
            raise TestError('COMPLETION_SOURCE_NOT_VERIFIED')
        sources[name] = raw
    runtime = read_json(root / 'tools/codex/verified.json')
    if (not isinstance(runtime, dict) or runtime.get('sources') != {n: hashes[n] for n in ('codex_runner.py', 'blender_mcp.py')}
            or not all(runtime.get(k) is True for k in ('cli_mcp_roundtrip', 'code_mode_roundtrip', 'blender_build_roundtrip'))):
        raise TestError('OFFLINE_RUNTIME_NOT_VERIFIED')
    guard = read_json(root / '.worldifact-astra-guard.json')
    guard_names = {'codex_runner.py', 'fast_preview.py', 'astra_spend.py'}
    if (not isinstance(guard, dict) or guard.get('revision') != 'astra-usd175-v1'
            or set(guard.get('sha256', {})) != guard_names
            or guard.get('outputPolicy') != {'revision': 'astra-low-reconciled-v2', 'sha256': hashes['astra_spend_v2.py']}):
        raise TestError('COST_GUARD_RECEIPT_NOT_VERIFIED')
    for name in guard_names:
        if digest(read_regular(root / name, 1_048_576)) != guard['sha256'][name]:
            raise TestError('COST_GUARD_SOURCE_NOT_VERIFIED')
    photo = read_regular(root / 'photo_input.py', 1_048_576)
    if hashlib.sha1(b'blob ' + str(len(photo)).encode() + b'\0' + photo).hexdigest() != PHOTO_SOURCE_BLOB:
        raise TestError('PHOTO_CONTRACT_NOT_VERIFIED')
    # The server's own reviewed source must identify these exact local paths.
    tree = ast.parse(sources['server.py'])
    required = {'ROOT': 'Path(__file__).resolve().parent', 'STATE': "ROOT / 'state'",
                'JOBS': "STATE / 'jobs'", 'CONFIG': "STATE / 'config.json'"}
    for name, expression in required.items():
        values = [n.value for n in tree.body if isinstance(n, ast.Assign)
                  and any(isinstance(t, ast.Name) and t.id == name for t in n.targets)]
        if len(values) != 1 or ast.dump(values[0]) != ast.dump(ast.parse(expression, mode='eval').body):
            raise TestError('SERVER_STATE_PATH_NOT_VERIFIED')
    database = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'database']
    expected = ast.dump(ast.parse("STATE / 'jobs.sqlite'", mode='eval').body)
    if len(database) != 1 or not any(isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute)
            and isinstance(n.func.value, ast.Name) and n.func.value.id == 'sqlite3' and n.func.attr == 'connect'
            and n.args and ast.dump(n.args[0]) == expected for n in ast.walk(database[0])):
        raise TestError('SERVER_DATABASE_PATH_NOT_VERIFIED')


def local_token(root):
    value = read_json(root / 'state/config.json', 16_384)
    token = value.get('token') if isinstance(value, dict) else None
    if not isinstance(token, str) or not re.fullmatch(r'[A-Za-z0-9_-]{32,256}', token):
        raise TestError('LOCAL_AUTHORIZATION_UNAVAILABLE')
    return token


def jpeg_size(data):
    if len(data) < 20 or data[:2] != b'\xff\xd8' or data[-2:] != b'\xff\xd9':
        raise TestError('INVALID_REFERENCE_JPEG')
    at = 2
    while at + 9 < len(data):
        if data[at] != 255:
            break
        at += 1
        while at < len(data) and data[at] == 255:
            at += 1
        if at + 2 >= len(data):
            break
        marker = data[at]
        at += 1
        if marker in (218, 217):
            break
        size = int.from_bytes(data[at:at + 2], 'big')
        if size < 2 or at + size > len(data):
            break
        if marker in (192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207):
            height = int.from_bytes(data[at + 3:at + 5], 'big')
            width = int.from_bytes(data[at + 5:at + 7], 'big')
            if size < 8 or not 1 <= width <= 8192 or not 1 <= height <= 8192:
                break
            return width, height
        at += size
    raise TestError('INVALID_REFERENCE_DIMENSIONS')


def photos(folder):
    entries = read_json(folder / 'reference-photos.json', 160_000)
    if not isinstance(entries, list) or len(entries) != 3:
        raise TestError('EXACT_THREE_REFERENCES_REQUIRED')
    result = []
    total_bytes = total_pixels = 0
    allowed = {'name', 'view', 'sha256', 'subject', 'faceLandmarks', 'textureMaxSize'}
    for index, item in enumerate(entries):
        if (not isinstance(item, dict) or not set(item) <= allowed or not {'name', 'view', 'sha256'} <= set(item)
                or not isinstance(item['name'], str) or not 1 <= len(item['name']) <= 120 or item['name'].strip() != item['name']
                or item['view'] not in ('front', 'three_quarter', 'side', 'back', 'detail', 'other')
                or not isinstance(item['sha256'], str) or not SHA.fullmatch(item['sha256'])):
            raise TestError('REFERENCE_METADATA_NOT_VERIFIED')
        if 'subject' in item and (not isinstance(item['subject'], str) or not 1 <= len(item['subject']) <= 160
                                  or item['subject'].strip() != item['subject']):
            raise TestError('REFERENCE_METADATA_NOT_VERIFIED')
        if 'textureMaxSize' in item and (type(item['textureMaxSize']) is not int or item['textureMaxSize'] not in (2048, 4096, 8192)):
            raise TestError('REFERENCE_METADATA_NOT_VERIFIED')
        if 'faceLandmarks' in item:
            # Cabinet inputs should never contain portrait landmarks. Their
            # absence is verified rather than normalizing an unknown contract.
            raise TestError('UNEXPECTED_PORTRAIT_METADATA')
        data = read_regular(folder / ('reference-%d.jpg' % index), PHOTO_LIMIT)
        if digest(data) != item['sha256']:
            raise TestError('REFERENCE_BYTES_DO_NOT_MATCH_METADATA')
        width, height = jpeg_size(data)
        total_bytes += len(data)
        total_pixels += width * height
        result.append({**{k: v for k, v in item.items() if k != 'sha256'},
                       'dataUrl': 'data:image/jpeg;base64,' + base64.b64encode(data).decode('ascii')})
    if total_bytes > 6 * 1024 * 1024 or total_pixels > 80 * 1024 * 1024:
        raise TestError('REFERENCE_TOTAL_LIMIT_EXCEEDED')
    return result, entries


def retained_geometry(raw):
    """Measure the public cabinet completion floors from the bound GLB itself."""
    if not isinstance(raw, bytes) or not 20 <= len(raw) <= MODEL_LIMIT:
        raise TestError('ORIGINAL_RETAINED_GLB_INVALID')
    magic, version, length, chunk, kind = struct.unpack_from('<IIIII', raw)
    if magic != 0x46546c67 or version != 2 or length != len(raw) or kind != 0x4e4f534a or chunk % 4 or 20 + chunk > len(raw):
        raise TestError('ORIGINAL_RETAINED_GLB_INVALID')
    try:
        document = json.loads(raw[20:20 + chunk])
        if not isinstance(document, dict) or document.get('asset', {}).get('version') != '2.0':
            raise ValueError()
        arrays = {k: document.get(k, []) for k in ('meshes', 'accessors', 'nodes', 'materials', 'images', 'buffers')}
        if any(not isinstance(v, list) for v in arrays.values()):
            raise ValueError()
        for entry in arrays['buffers'] + arrays['images']:
            if not isinstance(entry, dict) or (entry.get('uri') and not str(entry['uri']).startswith('data:')):
                raise ValueError()
        mesh_triangles, primitives = [], 0
        for mesh in arrays['meshes']:
            parts = mesh.get('primitives')
            if not isinstance(parts, list):
                raise ValueError()
            total = 0
            for part in parts:
                mode = part.get('mode', 4)
                if type(mode) is not int or mode not in range(7):
                    raise ValueError()
                index = part.get('indices', part.get('attributes', {}).get('POSITION'))
                if type(index) is not int or not 0 <= index < len(arrays['accessors']):
                    raise ValueError()
                count = arrays['accessors'][index].get('count')
                if type(count) is not int or not 0 <= count <= 9000000:
                    raise ValueError()
                if mode == 4:
                    total += count // 3
                elif mode in (5, 6):
                    total += max(0, count - 2)
                primitives += 1
            mesh_triangles.append(total)
        nodes = arrays['nodes']
        if len(nodes) > 5000:
            raise ValueError()
        rendered, parents = 0, set()
        for node in nodes:
            if not isinstance(node, dict) or node.get('extensions', {}).get('EXT_mesh_gpu_instancing') is not None:
                raise ValueError()
            if 'mesh' in node:
                index = node['mesh']
                if type(index) is not int or not 0 <= index < len(mesh_triangles):
                    raise ValueError()
                rendered += mesh_triangles[index]
            children = node.get('children', [])
            if not isinstance(children, list):
                raise ValueError()
            for child in children:
                if type(child) is not int or not 0 <= child < len(nodes) or child in parents:
                    raise ValueError()
                parents.add(child)
        visiting, heights = set(), {}
        def visit(index, depth):
            if depth > 128 or index in visiting:
                raise ValueError()
            if index in heights:
                return heights[index]
            visiting.add(index)
            height = max([0] + [1 + visit(child, depth + 1) for child in nodes[index].get('children', [])])
            visiting.remove(index)
            heights[index] = height
            if height > 128:
                raise ValueError()
            return height
        for index in range(len(nodes)):
            visit(index, 0)
        if sum(mesh_triangles) > 3000000 or rendered > 3000000:
            raise ValueError()
        return {'triangles': sum(mesh_triangles), 'renderedTriangles': rendered,
                'meshCount': len(mesh_triangles), 'primitiveCount': primitives,
                'substantialMeshCount': sum(n >= 24 for n in mesh_triangles),
                'materialCount': len(arrays['materials']), 'nodeCount': len(nodes)}
    except (ValueError, TypeError, AttributeError, KeyError, IndexError, UnicodeError, RecursionError):
        raise TestError('ORIGINAL_RETAINED_SHAPE_NOT_VERIFIED') from None


def unfinished_retained_source(root, source_job, client, expected_original_artifact_sha256):
    """Admit only an explicitly hash-bound, unfinished, structurally deficient draft.

    Missing evidence cannot turn a normal success into a retry. All source HTTP
    requests are authenticated read-only observations of the private descriptor.
    """
    source_job = job_identity(source_job)
    if expected_original_artifact_sha256 is None:
        raise TestError('EXPECTED_UNFINISHED_ARTIFACT_SHA256_REQUIRED')
    folder = safe(root / 'state/jobs' / source_job)
    if client is None or safe(folder / 'agent-outcome.json').exists():
        raise TestError('ORIGINAL_COMPLETION_OUTCOME_PRESENT_OR_UNKNOWN')
    request = read_json(folder / 'agent-request.json')
    candidate = read_json(folder / 'agent-candidate.json', 10_000)
    if (not isinstance(request, dict) or not isinstance(request.get('execution_id'), str) or not request['execution_id']
            or not isinstance(candidate, dict) or candidate.get('execution_id') != request['execution_id']
            or type(candidate.get('revision')) is not int or candidate['revision'] < 1
            or not isinstance(candidate.get('path'), str) or not re.fullmatch(r'candidates/[1-9][0-9]{0,5}', candidate['path'])):
        raise TestError('ORIGINAL_CURRENT_CANDIDATE_IDENTITY_INVALID')
    current = safe(folder / candidate['path'])
    ready = read_json(current / 'model-ready.json', 2 * 1024 * 1024)
    root_ready = read_json(folder / 'model-ready.json', 2 * 1024 * 1024)
    result = read_json(current / 'result.json', 2 * 1024 * 1024)
    root_result = read_json(folder / 'result.json', 2 * 1024 * 1024)
    raw = read_regular(current / 'model.glb', MODEL_LIMIT)
    model_hash = digest(raw)
    measured = retained_geometry(raw)
    if model_hash != expected_original_artifact_sha256:
        raise TestError('EXPECTED_ORIGINAL_ARTIFACT_HASH_MISMATCH')
    if not any(measured[key] < floor for key, floor in CABINET_FLOORS.items()):
        raise TestError('ORIGINAL_ARTIFACT_PASSES_PUBLIC_COMPLETION_FLOORS')
    if (not isinstance(ready, dict) or type(ready.get('revision')) is not int or ready['revision'] != 1
            or ready.get('phase') not in ('core_export', 'interchange_exports') or root_ready != ready
            or type(ready.get('bytes')) is not int or ready['bytes'] != len(raw) or ready.get('sha256') != model_hash
            or not isinstance(result, dict) or root_result != result or type(result.get('triangles')) is not int
            or result['triangles'] != measured['triangles'] or not isinstance(ready.get('result'), dict)
            or type(ready['result'].get('triangles')) is not int or ready['result']['triangles'] != measured['triangles']
            or read_regular(folder / 'model.glb', MODEL_LIMIT) != raw):
        raise TestError('ORIGINAL_CURRENT_ARTIFACT_BINDING_INVALID')
    review = read_json(folder / 'visual-review.json', 100_000)
    if (not isinstance(review, dict) or review.get('status') != 'not_completed'
            or review.get('assessment_completed') is not False or review.get('accepted') is not False):
        raise TestError('ORIGINAL_EXPLICIT_UNFINISHED_REVIEW_REQUIRED')
    code, status = client.request('/v1/jobs/' + source_job)
    if (code != 200 or not isinstance(status, dict) or status.get('id') != source_job
            or status.get('state') != 'succeeded' or status.get('modelStatus') != 'draft'):
        raise TestError('ORIGINAL_RETAINED_STATUS_NOT_VERIFIED')
    code, quality = client.request('/v1/jobs/' + source_job + '/quality')
    if (code != 200 or not isinstance(quality, dict) or quality.get('state') != 'succeeded'
            or quality.get('modelStatus') != 'draft' or quality.get('hasModel') is not True
            or quality.get('automaticQualityAccepted') is not False or quality.get('agent') != {}
            or quality.get('visualReview') != review or not isinstance(quality.get('geometry'), dict)
            or quality['geometry'].get('triangles') != measured['triangles']):
        raise TestError('ORIGINAL_UNFINISHED_QUALITY_NOT_VERIFIED')
    code, served = client.request('/v1/jobs/' + source_job + '/model', binary=True)
    if code != 200 or served != raw:
        raise TestError('ORIGINAL_SERVED_ARTIFACT_BINDING_INVALID')
    # Recheck the completion barrier after GETs. Never reinterpret a new finish.
    if safe(folder / 'agent-outcome.json').exists():
        raise TestError('ORIGINAL_COMPLETION_OUTCOME_CHANGED')
    return {'sha256': model_hash, 'bytes': len(raw), 'checkpointSha256': digest(json.dumps(ready, sort_keys=True).encode())}


def original_input(root, private_descriptor, client=None):
    private_descriptor = checked_descriptor(private_descriptor)
    source_job = private_descriptor['sourceJobId']
    folder = safe(root / 'state/jobs' / source_job)
    if not folder.is_dir():
        raise TestError('ORIGINAL_JOB_UNAVAILABLE')
    database = safe(root / 'state/jobs.sqlite')
    info = database.stat()
    if not stat.S_ISREG(info.st_mode) or not 1 <= info.st_size <= 64 * 1024 * 1024:
        raise TestError('INVALID_LOCAL_DATABASE')
    for suffix in ('-wal', '-shm', '-journal'):
        sidecar = safe(str(database) + suffix)
        if sidecar.exists() and (not stat.S_ISREG(sidecar.stat().st_mode) or sidecar.stat().st_size > 64 * 1024 * 1024):
            raise TestError('INVALID_DATABASE_SIDECAR')
    connection = sqlite3.connect(database.as_uri() + '?mode=ro', uri=True, timeout=3)
    try:
        connection.execute('PRAGMA query_only=ON')
        connection.execute('PRAGMA trusted_schema=OFF')
        started = time.monotonic()
        connection.set_progress_handler(lambda: 1 if time.monotonic() - started > 3 else 0, 1000)
        row = connection.execute('SELECT prompt,state FROM jobs WHERE id=? AND length(CAST(prompt AS BLOB))<=20000', (source_job,)).fetchone()
        if not row or row[1] not in ('failed', 'succeeded') or not isinstance(row[0], str) or not row[0].strip() or row[0].strip() != row[0]:
            raise TestError('ORIGINAL_PROMPT_AND_STATE_NOT_VERIFIED')
        prompt = row[0]
        if len(prompt.encode('utf-16-le')) // 2 > 5000:
            raise TestError('ORIGINAL_PROMPT_TOO_LARGE')
        if connection.execute("SELECT COUNT(*) FROM jobs WHERE state NOT IN ('succeeded','failed','cancelled')").fetchone()[0]:
            raise TestError('WORKER_HAS_ACTIVE_JOB')
        latest = connection.execute('SELECT id,state,substr(detail,1,1200) FROM jobs WHERE prompt=? ORDER BY created DESC LIMIT 1', (prompt,)).fetchone()
    finally:
        connection.close()
    if not latest or not isinstance(latest[0], str) or not UUID.fullmatch(latest[0]):
        raise TestError('LATEST_IDENTICAL_JOB_UNVERIFIED')
    if latest[1] == 'failed':
        failure_path = safe(root / 'state/jobs' / latest[0] / 'failure.json')
        failure = read_json(failure_path, 10_000) if failure_path.exists() else {}
        detail = str(latest[2]).lower()
        if (isinstance(failure, dict) and failure.get('kind') == 'timeout') or 'przekroczono limit czasu' in detail or 'failed to denoise' in detail:
            raise TestError('IDENTICAL_INPUT_MAY_REPLAY_OLD_SCENE_REVIEW_REQUIRED')
    instructions = read_json(folder / 'agent-instructions.json')
    if (not isinstance(instructions, dict) or set(instructions) != {'text', 'revision'} or instructions['revision'] != 1
            or not isinstance(instructions['text'], str) or CABINET not in instructions['text']
            or len(instructions['text'].encode('utf-16-le')) // 2 > 12000):
        raise TestError('ORIGINAL_CABINET_INSTRUCTIONS_NOT_VERIFIED')
    request_path = safe(folder / 'agent-request.json')
    if request_path.exists():
        request = read_json(request_path)
        if not isinstance(request, dict) or request.get('prompt') != prompt or request.get('instructions') != instructions['text']:
            raise TestError('ORIGINAL_EXECUTION_INPUTS_DIFFER')
    for name in ('source-job.json', 'generation-profile.json', 'render-recovery.json'):
        if safe(folder / name).exists():
            raise TestError('ORIGINAL_IS_NOT_UNMODIFIED_STANDARD_INPUT')
    images, metadata = photos(folder)
    payload = {'id': private_descriptor['jobId'], 'prompt': prompt, 'agentInstructions': instructions['text'], 'photos': images}
    binding = {'promptSha256': digest(prompt.encode()), 'instructionsSha256': digest(instructions['text'].encode()),
               'photoMetadataSha256': digest(json.dumps(metadata, sort_keys=True, separators=(',', ':')).encode()),
               'photoSha256': [p['sha256'] for p in metadata]}
    if row[1] == 'succeeded':
        binding['unfinishedRetainedArtifact'] = unfinished_retained_source(
            root, source_job, client, private_descriptor['expectedOriginalArtifactSha256'])
    elif private_descriptor['expectedOriginalArtifactSha256'] is not None:
        raw = read_regular(folder / 'model.glb', MODEL_LIMIT)
        if digest(raw) != private_descriptor['expectedOriginalArtifactSha256']:
            raise TestError('EXPECTED_ORIGINAL_ARTIFACT_HASH_MISMATCH')
        if client is None:
            raise TestError('ORIGINAL_SERVED_ARTIFACT_BINDING_INVALID')
        code, served = client.request('/v1/jobs/' + source_job + '/model', binary=True)
        if code != 200 or served != raw:
            raise TestError('ORIGINAL_SERVED_ARTIFACT_BINDING_INVALID')
        binding['failedSourceArtifact'] = {'sha256': digest(raw), 'bytes': len(raw)}
    return payload, binding


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


class LocalClient:
    def __init__(self, token, private_descriptor):
        self.descriptor = checked_descriptor(private_descriptor)
        self.token = token
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())

    def request(self, path, payload=None, binary=False, timeout=None):
        allowed = {'/v1/health'}
        for job in (self.descriptor['sourceJobId'], self.descriptor['jobId']):
            allowed.update('/v1/jobs/' + job + suffix for suffix in ('', '/quality', '/model'))
        if not ((payload is None and path in allowed)
                or (isinstance(payload, dict) and path == '/v1/jobs' and payload.get('id') == self.descriptor['jobId'])):
            raise TestError('LOCAL_REQUEST_SCOPE_INVALID')
        limit = MODEL_LIMIT if binary else JSON_LIMIT
        body = json.dumps(payload, ensure_ascii=False, separators=(',', ':')).encode() if payload is not None else None
        if body is not None and len(body) > 9 * 1024 * 1024:
            raise TestError('LOCAL_REQUEST_TOO_LARGE')
        headers = {'Authorization': 'Bearer ' + self.token, 'Accept': 'application/octet-stream' if binary else 'application/json'}
        if body is not None:
            headers['Content-Type'] = 'application/json'
        request = urllib.request.Request(ORIGIN + path, data=body, headers=headers)
        try:
            maximum_timeout = 120 if binary else 30
            timeout = maximum_timeout if timeout is None else min(maximum_timeout, max(.1, timeout))
            with self.opener.open(request, timeout=timeout) as response:
                code = response.status
                length = response.headers.get('Content-Length')
                if length is not None and (not length.isdigit() or int(length) > limit):
                    raise TestError('LOCAL_RESPONSE_TOO_LARGE')
                if not binary and not response.headers.get('Content-Type', '').startswith('application/json'):
                    raise TestError('LOCAL_RESPONSE_TYPE_INVALID')
                raw = response.read(limit + 1)
                if len(raw) > limit:
                    raise TestError('LOCAL_RESPONSE_TOO_LARGE')
        except urllib.error.HTTPError as error:
            code = error.code
            error.close()  # Never echo an upstream error, prompt, key or name.
            return code, None
        except TestError:
            raise
        except Exception:
            raise TestError('LOCAL_REQUEST_UNCONFIRMED_NO_POST_RETRY') from None
        if binary:
            return code, raw
        try:
            value = json.loads(raw)
        except (ValueError, UnicodeError):
            raise TestError('LOCAL_RESPONSE_JSON_INVALID') from None
        return code, value


def validate_health(value, now):
    expected = {'ready': True, 'codexReady': True, 'provider': 'openai', 'model': 'gpt-6-astra',
                'photoInput': True, 'executionEngine': 'codex-mcp', 'astraBudgetRevision': 'astra-usd175-v1',
                'astraBudgetMaxUsd': 1.75, 'astraBudgetPreflight': 'input-tokens', 'astraBudgetExpiry': EXPIRY,
                'astraOutputPolicy': 'astra-low-reconciled-v2', 'astraReasoningEffort': 'low', 'astraMaxOutputTokens': 16000,
                'astraUsageSettlement': 'authenticated-completed-only', 'astraCacheAccounting': 'astra-confirmed-cache-v1',
                'worldifactCompletionPolicy': POLICY, 'worldifactCompletionMaxContinuations': 1}
    if (not isinstance(value, dict) or any(type(value.get(k)) is not type(v) or value.get(k) != v for k, v in expected.items())
            or not type(value.get('connectorVersion')) is int or not 33 <= value['connectorVersion'] <= 10000
            or not now < EXPIRY):
        raise TestError('FRESH_COMPLETION_AND_COST_HEALTH_NOT_VERIFIED')


def claim_path(root):
    # Deliberately independent of every runtime parameter: no second attempt.
    return safe(root / 'state/worldifact-original-test-claims/one-shot.json')


def claim(root, binding, private_descriptor):
    private_descriptor = checked_descriptor(private_descriptor)
    path = claim_path(root)
    path.parent.mkdir(mode=0o700, exist_ok=True)
    if not path.parent.is_dir() or path.parent.stat().st_mode & 0o077:
        raise TestError('CLAIM_DIRECTORY_NOT_PRIVATE')
    record = {**private_descriptor, 'inputBinding': binding}
    try:
        fd = os.open(str(path), os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    except FileExistsError:
        # A race is consumed too. Do not observe a different descriptor or input.
        existing = check_claim(root, private_descriptor)
        if existing is None or existing['inputBinding'] != binding:
            raise TestError('EXISTING_CLAIM_INPUT_CHANGED_NO_POST')
        return False
    with os.fdopen(fd, 'wb') as stream:
        stream.write(json.dumps(record, sort_keys=True).encode())
        stream.flush()
        os.fsync(stream.fileno())
    # Persist both the file entry and any newly created private directory.
    for parent in (path.parent, path.parent.parent):
        directory = os.open(str(parent), os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    return True


def check_claim(root, private_descriptor=None):
    path = claim_path(root)
    if not path.exists():
        return None
    value = read_json(path)
    if not isinstance(value, dict) or 'inputBinding' not in value:
        raise TestError('EXISTING_CLAIM_INVALID_NO_POST')
    existing = checked_descriptor({k: v for k, v in value.items() if k != 'inputBinding'})
    binding = value['inputBinding']
    hash_keys = ('promptSha256', 'instructionsSha256', 'photoMetadataSha256')
    if (not isinstance(binding, dict)
            or any(not isinstance(binding.get(k), str) or not SHA.fullmatch(binding[k]) for k in hash_keys)
            or not isinstance(binding.get('photoSha256'), list) or len(binding['photoSha256']) != 3
            or any(not isinstance(h, str) or not SHA.fullmatch(h) for h in binding['photoSha256'])):
        raise TestError('EXISTING_CLAIM_INPUT_BINDING_INVALID_NO_POST')
    if private_descriptor is not None and existing != checked_descriptor(private_descriptor):
        raise TestError('EXISTING_CLAIM_PARAMETERS_CHANGED_NO_POST')
    return value


def job_state(code, value, test_job):
    if code == 404:
        return 'absent'
    if code != 200 or not isinstance(value, dict) or value.get('id') != test_job or value.get('state') not in STATES:
        raise TestError('FIXED_JOB_STATUS_UNVERIFIED')
    return value['state']


def report(client, test_job, state, submitted):
    value = {'jobId': test_job, 'state': state,
             'result': ('FIXED_JOB_ABSENT_NO_RETRY' if state == 'absent' else
                        'JOB_DID_NOT_COMPLETE' if state in TERMINAL else 'JOB_STILL_RUNNING'),
             'submittedThisRun': submitted, 'automaticPostRetries': 0, 'maximumProviderReservationUsd': 1.75,
             'actualInvoiceUsd': None, 'taxUsd': None, 'customerCharges': 0, 'customerPointsDebited': 0,
             'visualQuality': 'REQUIRES_HUMAN_REVIEW', 'manufacturingApproval': False}
    if state != 'succeeded':
        return value
    code, quality = client.request('/v1/jobs/' + test_job + '/quality')
    if code != 200 or not isinstance(quality, dict) or quality.get('state') != 'succeeded' or quality.get('hasModel') is not True:
        raise TestError('SUCCEEDED_JOB_QUALITY_UNVERIFIED')
    code, raw = client.request('/v1/jobs/' + test_job + '/model', binary=True)
    if code != 200 or not isinstance(raw, bytes) or not 20 <= len(raw) <= MODEL_LIMIT:
        raise TestError('SUCCEEDED_JOB_MODEL_UNVERIFIED')
    magic, version, length, chunk, kind = struct.unpack_from('<IIIII', raw)
    if magic != 0x46546c67 or version != 2 or length != len(raw) or kind != 0x4e4f534a or chunk % 4 or 20 + chunk > len(raw):
        raise TestError('SUCCEEDED_JOB_GLB_INVALID')
    try:
        document = json.loads(raw[20:20 + chunk])
    except (ValueError, UnicodeError):
        raise TestError('SUCCEEDED_JOB_GLB_INVALID') from None
    if not isinstance(document, dict) or document.get('asset', {}).get('version') != '2.0' or not document.get('meshes'):
        raise TestError('SUCCEEDED_JOB_GLB_INVALID')
    model_hash = digest(raw)
    # Drafts may legitimately omit a host-accepted hash; never call them reviewed.
    quality_hash = quality.get('modelSha256')
    if quality_hash is not None and quality_hash != model_hash:
        raise TestError('QUALITY_MODEL_HASH_MISMATCH')
    geometry = quality.get('geometry', {})
    value['glb'] = {'bytes': len(raw), 'sha256': model_hash}
    value['geometry'] = {k: geometry[k] for k in ('vertices', 'triangles', 'objects')
                         if isinstance(geometry, dict) and type(geometry.get(k)) is int and 0 <= geometry[k] <= 20_000_000}
    value['hostModelStatus'] = quality.get('modelStatus') if quality.get('modelStatus') in ('draft', 'reviewed') else 'unknown'
    gate = quality.get('acceptanceGate', {})
    value['structuralCompletionChecked'] = (quality_hash == model_hash and value['hostModelStatus'] == 'reviewed'
                                           and isinstance(gate, dict) and gate.get('passed') is True)
    value['result'] = ('VERIFIED_MODEL_READY_FOR_VISUAL_REVIEW' if value['structuralCompletionChecked']
                       else 'REJECTED_OR_UNREVIEWED_DRAFT')
    return value


def observe(client, test_job, submitted=False, wait=True, clock=time.monotonic, sleep=time.sleep):
    test_job = job_identity(test_job)
    deadline = clock() + POLL_SECONDS
    state = None
    while True:
        remaining = deadline - clock()
        if state is not None and remaining <= 0:
            return report(client, test_job, state, submitted)
        state = job_state(*client.request('/v1/jobs/' + test_job, timeout=min(30, remaining)), test_job)
        if state in TERMINAL or state == 'absent' or not wait or clock() >= deadline:
            return report(client, test_job, state, submitted)
        sleep(min(10, max(0, deadline - clock())))


def run(root, approval=None, status_only=False, client_factory=LocalClient,
        source_job=None, test_job=None, expected_original_artifact_sha256=None):
    if approval is None and not status_only:
        return {'phase': 'PLAN_ONLY', 'paidGenerationRequested': False}
    if status_only and approval is not None:
        raise TestError('CHOOSE_STATUS_OR_APPROVED_ONE_SHOT')
    if approval is not None and approval != APPROVAL:
        raise TestError('EXPLICIT_PAID_APPROVAL_MISSING')
    supplied = (source_job, test_job, expected_original_artifact_sha256)
    private_descriptor = None
    if approval is not None or any(value is not None for value in supplied):
        # Validate every paid-mode parameter before any filesystem or HTTP read.
        private_descriptor = descriptor(*supplied)
    root = safe(root)
    existing = check_claim(root, private_descriptor)
    if status_only and existing is None:
        raise TestError('STATUS_REQUIRES_EXISTING_IMMUTABLE_CLAIM')
    if existing is not None:
        bound = {k: v for k, v in existing.items() if k != 'inputBinding'}
        client = client_factory(local_token(root), bound)
        # A missing job after an uncertain claim can NEVER cause another POST.
        return observe(client, bound['jobId'], wait=not status_only)
    client = client_factory(local_token(root), private_descriptor)
    verify_sources(root)
    payload, binding = original_input(root, private_descriptor, client)
    code, health = client.request('/v1/health')
    if code != 200:
        raise TestError('FRESH_HEALTH_UNAVAILABLE')
    validate_health(health, time.time())
    state = job_state(*client.request('/v1/jobs/' + test_job), test_job)
    if state != 'absent':
        raise TestError('TEST_JOB_ALREADY_EXISTS_WITHOUT_CLAIM_NO_POST')
    if not claim(root, binding, private_descriptor):
        # Recheck the full descriptor after a lost O_EXCL race before observing.
        existing = check_claim(root, private_descriptor)
        if existing is None or existing['inputBinding'] != binding:
            raise TestError('EXISTING_CLAIM_INPUT_CHANGED_NO_POST')
        return observe(client, test_job)
    # Exactly one POST site. No retry loop and no new UUID on any exception.
    code, value = client.request('/v1/jobs', payload=payload)
    if code not in (200, 201, 202) or not isinstance(value, dict) or value.get('id') != test_job or value.get('state') not in STATES:
        raise TestError('POST_UNCONFIRMED_OR_REJECTED_CLAIM_CONSUMED_NO_RETRY')
    return observe(client, test_job, submitted=True)


class PrivateArgumentParser(argparse.ArgumentParser):
    def error(self, message):
        # argparse's ordinary error can echo private argument values.
        raise TestError('CLI_ARGUMENTS_INVALID')


def main(argv=None):
    parser = PrivateArgumentParser(description=__doc__, allow_abbrev=False)
    parser.add_argument('--approve-paid-test', metavar='EXACT_APPROVAL')
    parser.add_argument('--source-job', metavar='PRIVATE_ORIGINAL_UUID', help='Private canonical original job UUID.')
    parser.add_argument('--test-job', metavar='PRIVATE_TEST_UUID', help='Private canonical distinct one-shot test UUID.')
    parser.add_argument('--expected-original-artifact-sha256', metavar='PRIVATE_SHA256',
                        help='Private expected original GLB hash; required for succeeded unfinished sources.')
    parser.add_argument('--status', action='store_true', help='GET one snapshot of the already-claimed test; never POST.')
    args = parser.parse_args(argv)
    if args.approve_paid_test and args.status:
        raise TestError('CHOOSE_STATUS_OR_APPROVED_ONE_SHOT')
    value = run(Path.home() / 'froge-connector', args.approve_paid_test, args.status, source_job=args.source_job,
                test_job=args.test_job, expected_original_artifact_sha256=args.expected_original_artifact_sha256)
    print(json.dumps(value, sort_keys=True), flush=True)
    return value


if __name__ == '__main__':
    try:
        main()
    except TestError as error:
        print('STOP: ' + str(error) + '. No automatic new job or POST retry.', file=sys.stderr)
        sys.exit(1)
    except (Exception, KeyboardInterrupt):
        print('STOP: one-shot result unconfirmed. Preserve the claim; observe the fixed job. No cancellation or automatic retry.', file=sys.stderr)
        sys.exit(1)
