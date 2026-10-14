"""Read-only, explicit CloudShell download of the existing claimed test GLB.

Default PLAN ONLY. Run approved mode only in the original OCI CloudShell,
with private IDs and exact GLB size/hash from the verified one-shot result.
No provider requests, installation, service changes, claim or ledger changes,
remote writes, credential reads/uploads, public artifact route, or retry.
The downloaded model still needs actual browser preview and human review.
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
import stat
import subprocess
import sys
import tempfile
import time

MODEL_LIMIT = 50_000_000
TRANSFER_TIMEOUT = 180
APPROVAL = 'ORIGINAL_INPUT_ASTRA175_ONCE'


class DownloadError(RuntimeError):
    """Fixed diagnostics only, never remote output or private metadata."""


# Keep the existing reviewed connection routine's fixed safe errors unchanged.
LaunchError = DownloadError


def parameters(source_job, test_job, original_hash, expected_bytes, expected_hash):
    pattern = r'[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}'
    if (not isinstance(source_job, str) or not re.fullmatch(pattern, source_job)
            or not isinstance(test_job, str) or not re.fullmatch(pattern, test_job)
            or source_job == test_job):
        raise DownloadError('Distinct canonical private source and test UUIDs are required.')
    if any(not isinstance(value, str) or not re.fullmatch('[0-9a-f]{64}', value)
           for value in (original_hash, expected_hash)):
        raise DownloadError('Private original and reviewed GLB SHA256 values are required.')
    if type(expected_bytes) is not int or not 20 <= expected_bytes <= MODEL_LIMIT:
        raise DownloadError('Exact verified GLB byte count must be within the 50 MB limit.')
    return {'source_job': source_job, 'test_job': test_job, 'original_hash': original_hash,
            'expected_bytes': expected_bytes, 'expected_hash': expected_hash}


# Shared local/remote guards. Remote execution imports no installed worker code.
GUARDS = r'''
import hashlib, json, os, pathlib, re, stat, struct, sys

def require(condition):
    if not condition:
        raise ValueError('Reviewed model proof not verified')

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
            require(stat.S_ISREG(before.st_mode) and 0 < before.st_size <= limit)
            if private:
                require(before.st_uid == os.geteuid() and not before.st_mode & 0o077)
            raw = stream.read(limit + 1)
            after = os.fstat(stream.fileno())
            require(len(raw) == before.st_size and len(raw) <= limit
                    and (before.st_size, before.st_mtime_ns, before.st_ctime_ns)
                    == (after.st_size, after.st_mtime_ns, after.st_ctime_ns))
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
        require(cursor + 8 <= len(raw))
        size, kind = struct.unpack_from('<II', raw, cursor)
        cursor += 8
        require(size % 4 == 0 and size > 0 and cursor + size <= len(raw))
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
    pending = [document]
    while pending:
        value = pending.pop()
        if isinstance(value, dict):
            require('uri' not in value)
            pending.extend(value.values())
        elif isinstance(value, list):
            pending.extend(value)

def verified_model(home, private):
    root = directory(pathlib.Path(home) / 'froge-connector')
    try:
        claim_path = 'state/worldifact-original-test-claims/one-shot.json'
        claim = record(root, claim_path, private=True)
        descriptor = {'approval': 'ORIGINAL_INPUT_ASTRA175_ONCE',
                      'sourceJobId': private['source_job'], 'jobId': private['test_job'],
                      'maxProviderReservationUsd': 1.75,
                      'expectedOriginalArtifactSha256': private['original_hash']}
        require(set(claim) == set(descriptor) | {'inputBinding'}
                and {k: claim[k] for k in descriptor} == descriptor
                and type(claim['maxProviderReservationUsd']) is float)
        binding = claim['inputBinding']
        def sha(value):
            return isinstance(value, str) and re.fullmatch('[0-9a-f]{64}', value) is not None
        require(isinstance(binding, dict)
                and all(sha(binding.get(k)) for k in ('promptSha256', 'instructionsSha256', 'photoMetadataSha256'))
                and isinstance(binding.get('photoSha256'), list) and len(binding['photoSha256']) == 3
                and all(sha(value) for value in binding['photoSha256']))
        folder = 'state/jobs/' + private['test_job'] + '/'
        request = record(root, folder + 'agent-request.json', 1_000_000)
        candidate = record(root, folder + 'agent-candidate.json', 10000)
        outcome = record(root, folder + 'agent-outcome.json', 10000)
        review = record(root, folder + 'visual-review.json', 10000)
        execution = request.get('execution_id')
        revision = candidate.get('revision')
        require(isinstance(execution, str) and 0 < len(execution) <= 256
                and candidate.get('execution_id') == execution
                and outcome.get('execution_id') == execution
                and type(revision) is int and 1 <= revision <= 999999
                and type(outcome.get('revision')) is int and outcome['revision'] == revision
                and outcome.get('finished') is True and outcome.get('accepted') is True
                and outcome.get('model_sha256') == private['expected_hash']
                and type(review.get('model_revision')) is int and review['model_revision'] == revision
                and review.get('status') == 'reviewed' and review.get('assessment_completed') is True
                and review.get('accepted') is True and review.get('issues') == [])
        relative = candidate.get('path')
        require(isinstance(relative, str) and re.fullmatch('candidates/[1-9][0-9]{0,5}', relative) is not None)
        current = folder + relative + '/'
        ready = record(root, current + 'model-ready.json', 2_000_000)
        result = record(root, current + 'result.json', 2_000_000)
        require(type(ready.get('revision')) is int and ready['revision'] == 1
                and ready.get('phase') in ('core_export', 'interchange_exports')
                and type(ready.get('bytes')) is int and ready['bytes'] == private['expected_bytes']
                and ready.get('sha256') == private['expected_hash']
                and type(result.get('triangles')) is int and result['triangles'] > 0
                and isinstance(ready.get('result'), dict)
                and ready['result'].get('triangles') == result['triangles']
                and record(root, folder + 'result.json', 2_000_000) == result
                and record(root, folder + 'model-ready.json', 2_000_000) == ready)
        raw = regular(root, folder + 'model.glb', private['expected_bytes'])
        require(len(raw) == private['expected_bytes']
                and hashlib.sha256(raw).hexdigest() == private['expected_hash']
                and regular(root, current + 'model.glb', private['expected_bytes']) == raw)
        glb(raw)
        # Recheck completion and claim barriers after reading the exact artifact.
        require(record(root, claim_path, private=True) == claim
                and record(root, folder + 'agent-request.json', 1_000_000) == request
                and record(root, folder + 'agent-candidate.json', 10000) == candidate
                and record(root, folder + 'agent-outcome.json', 10000) == outcome
                and record(root, folder + 'visual-review.json', 10000) == review)
        return raw
    finally:
        os.close(root)
'''
exec(GUARDS, globals())


def script(private):
    if not isinstance(private, dict) or set(private) != {
            'source_job', 'test_job', 'original_hash', 'expected_bytes', 'expected_hash'}:
        raise DownloadError('Private download parameters differ; no connection made.')
    parameters(**private)
    return (GUARDS + '\nPRIVATE = ' + repr(private) + r'''
try:
    raw = verified_model(pathlib.Path.home(), PRIVATE)
except BaseException:
    raise SystemExit(1)
sys.stdout.buffer.write(raw)
sys.stdout.buffer.flush()
''').encode()


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
        folder = 'worldifact-reviewed-model-' + secrets.token_hex(12)
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
                    and hasher.hexdigest() == private['expected_hash'])
            output.flush()
            os.fsync(output.fileno())
        # Validate the local container independently before exposing a ready name.
        glb(regular(child, '.model.glb.part', private['expected_bytes']))
        os.link('.model.glb.part', 'model.glb', src_dir_fd=child, dst_dir_fd=child, follow_symlinks=False)
        created_ready = True
        os.unlink('.model.glb.part', dir_fd=child)
        os.fsync(child)
        os.fsync(parent)
        finalized = True
        return {'path': str(home / folder / 'model.glb'), 'bytes': private['expected_bytes'],
                'sha256': private['expected_hash'], 'visualQuality': 'REQUIRES_ACTUAL_BROWSER_PREVIEW',
                'manufacturingApproval': False}
    except BaseException:
        if process is not None and process.poll() is None:
            process.kill()
            process.wait()
        if child is not None and not finalized:
            if created_ready:
                os.unlink('model.glb', dir_fd=child)
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


# The two functions below are copied verbatim from reviewed oracle_launch.py.
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


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--download-reviewed-model', action='store_true')
    parser.add_argument('--source-job')
    parser.add_argument('--test-job')
    parser.add_argument('--expected-original-artifact-sha256')
    parser.add_argument('--expected-glb-bytes', type=int)
    parser.add_argument('--expected-glb-sha256')
    args = parser.parse_args(argv)
    if not args.download_reviewed_model:
        print('PLAN ONLY. No file reads, OCI lookup, SSH, download, or worker changes.')
        return
    private = parameters(args.source_job, args.test_job, args.expected_original_artifact_sha256,
                         args.expected_glb_bytes, args.expected_glb_sha256)
    program = script(private)
    result = download(connection(), program, private)
    print(json.dumps(result, sort_keys=True), flush=True)
    return result


if __name__ == '__main__':
    try:
        main()
    except (Exception, KeyboardInterrupt):
        print('STOP: reviewed model download not confirmed. No automatic retry. Keep the original claim.', file=sys.stderr)
        sys.exit(1)
