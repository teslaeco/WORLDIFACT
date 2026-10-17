"""Private, fixed-scope V3 source ingress and durable artifact recovery.

Only encrypted, one-hour object URLs leave the protected runner. Collection is
read-only. Verification can create one immutable, URL-free stage gate, after
streaming every byte of the complete final artifact set. No prefix listing,
inference dispatch, object replacement, or automatic write retry is supported.
"""
from __future__ import annotations

import argparse
import base64
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import time

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'runpod_worker'))
from contracts import QUALITY_REVISION, fingerprint, validate_job
from storage import S3Store

AAD = b'WORLDIFACT-private-owner-v3-transfer-v1'
BATCH_ID = 'owner-models-20261017-v3'
SCOPE = '7995e5146670062672b65386bfcefab8278072cf2ba3bad2dd8b5f342660075f'
JOBS = (
    ('ECOMECH_V4', '3b3b9cc5-8f43-4e48-bf56-ce2d3e2390c1', 'robot'),
    ('HALLOWEEN_MUSIC_ROOM', 'af2fc596-68c7-44a7-a8a8-7e8d4fd2b7e8', 'person'),
)
MIB = 1024 * 1024
MAX_RECEIPT = 262144
LIFETIME_SECONDS = 3600
SHA = re.compile(r'[a-f0-9]{64}')
ARTIFACT_TYPES = {
    'raw/decoder.npz': 'application/octet-stream',
    'raw/original.glb': 'model/gltf-binary',
    'raw/engine.json': 'application/json',
    'outputs/game.glb': 'model/gltf-binary',
    'outputs/source.blend': 'application/octet-stream',
    'outputs/qa.json': 'application/json',
    'outputs/qa.initial.json': 'application/json',
    'outputs/scene-report.json': 'application/json',
    **{f'outputs/{kind}_{view}.png': 'image/png'
       for kind in ('clay', 'pbr') for view in ('front', 'three_quarter', 'side', 'back')},
}


class TransferError(ValueError):
    """Constant error codes only; raw provider exception text is never logged."""


def require(condition, code):
    if not condition:
        raise TransferError(code)


def valid_hash(value):
    return type(value) is str and SHA.fullmatch(value) is not None


def validate_config(cfg):
    require(type(cfg) is dict and cfg.get('id') == BATCH_ID and cfg.get('scope') == SCOPE,
            'UNAPPROVED_BATCH')
    require(type(cfg.get('jobs')) is list and len(cfg['jobs']) == 2, 'EXACT_TWO_JOBS_REQUIRED')
    for item, (name, job_id, subject) in zip(cfg['jobs'], JOBS):
        require(type(item) is dict and item.get('name') == name
                and item.get('jobId') == job_id and item.get('subject') == subject,
                'UNAPPROVED_JOB_IDENTITY')
        for kind in ('reference', 'mask'):
            source = item.get(kind)
            require(type(source) is dict and valid_hash(source.get('sha256'))
                    and type(source.get('bytes')) is int and 1 <= source['bytes'] <= 12 * MIB
                    and type(source.get('width')) is int and type(source.get('height')) is int
                    and min(source['width'], source['height']) >= 32
                    and source['width'] * source['height'] <= 16000000,
                    'INVALID_PINNED_SOURCE')
        require((item['reference']['width'], item['reference']['height'])
                == (item['mask']['width'], item['mask']['height']), 'MASK_DIMENSIONS_DIFFER')
    try:
        key = serialization.load_pem_public_key(cfg['publicKeyPem'].encode())
    except (KeyError, TypeError, ValueError, AttributeError):
        raise TransferError('INVALID_RECIPIENT_KEY') from None
    require(isinstance(key, rsa.RSAPublicKey) and key.key_size >= 3072, 'INVALID_RECIPIENT_KEY')
    return key


def stage_job(cfg, stage):
    require(type(stage) is int and stage in (1, 2), 'INVALID_STAGE')
    return cfg['jobs'][stage - 1]


def prefix_for(job):
    return f"jobs/{SCOPE}/{job['jobId']}/"


def seal(payload, public_key):
    plain = json.dumps(payload, ensure_ascii=False, separators=(',', ':')).encode()
    symmetric, nonce = AESGCM.generate_key(bit_length=256), os.urandom(12)
    wrapped = public_key.encrypt(symmetric, padding.OAEP(
        mgf=padding.MGF1(hashes.SHA256()), algorithm=hashes.SHA256(), label=AAD))
    encode = lambda value: base64.b64encode(value).decode()
    return {'version': 1, 'key': encode(wrapped), 'nonce': encode(nonce),
            'ciphertext': encode(AESGCM(symmetric).encrypt(nonce, plain, AAD))}


def missing_error(error):
    response = getattr(error, 'response', {})
    return (response.get('Error', {}).get('Code') in ('NoSuchKey', 'NotFound', '404')
            or response.get('ResponseMetadata', {}).get('HTTPStatusCode') == 404)


def object_head(store, key):
    try:
        return store.client.head_object(Bucket=store.bucket, Key=key)
    except Exception as error:
        if missing_error(error):
            return None
        raise TransferError('STORAGE_HEAD_FAILED') from None


def verify_object(store, artifact, *, allow_missing=False):
    """Check both stored metadata and bounded, complete GET bytes, never an ETag."""
    head = object_head(store, artifact['key'])
    if head is None:
        require(allow_missing, 'ARTIFACT_NOT_DURABLE')
        return False
    require(head.get('ContentLength') == artifact['bytes']
            and head.get('Metadata', {}).get('sha256') == artifact['sha256']
            and head.get('ContentType') == artifact['mime'], 'ARTIFACT_METADATA_MISMATCH')
    try:
        response = store.client.get_object(Bucket=store.bucket, Key=artifact['key'])
    except Exception:
        raise TransferError('STORAGE_GET_FAILED') from None
    body = response.get('Body')
    require(body is not None, 'STORAGE_BODY_MISSING')
    try:
        require(response.get('ContentLength') == artifact['bytes']
                and response.get('Metadata', {}).get('sha256') == artifact['sha256']
                and response.get('ContentType') == artifact['mime'], 'ARTIFACT_GET_METADATA_MISMATCH')
        count, digest = 0, hashlib.sha256()
        while True:
            # Read one extra byte after the expected size to reject hidden tails.
            chunk = body.read(min(MIB, artifact['bytes'] - count + 1))
            if not chunk:
                break
            count += len(chunk)
            require(count <= artifact['bytes'], 'ARTIFACT_SIZE_MISMATCH')
            digest.update(chunk)
        require(count == artifact['bytes'] and digest.hexdigest() == artifact['sha256'],
                'ARTIFACT_HASH_MISMATCH')
    finally:
        body.close()
    return True


def prepare_uploads(store, cfg, *, now=None):
    public_key = validate_config(cfg)
    now = int(time.time()) if now is None else int(now)
    uploads, sources = [], []
    for job in cfg['jobs']:
        for kind in ('reference', 'mask'):
            source = job[kind]
            target = prefix_for(job) + kind + '.png'
            artifact = {'key': target, 'bytes': source['bytes'], 'sha256': source['sha256'], 'mime': 'image/png'}
            present = verify_object(store, artifact, allow_missing=True)
            record = {'name': job['name'], 'kind': kind, **artifact,
                      'width': source['width'], 'height': source['height'],
                      'status': 'ALREADY_PRESENT_VERIFIED' if present else 'UPLOAD_REQUIRED'}
            sources.append(record)
            if present:
                continue
            params = {'Bucket': store.bucket, 'Key': target, 'ContentType': 'image/png',
                      'ContentLength': source['bytes'], 'IfNoneMatch': '*',
                      'Metadata': {'sha256': source['sha256']}}
            url = store.client.generate_presigned_url('put_object', Params=params,
                ExpiresIn=LIFETIME_SECONDS, HttpMethod='PUT')
            uploads.append({**record, 'url': url, 'method': 'PUT', 'headers': {
                'Content-Type': 'image/png', 'Content-Length': str(source['bytes']),
                'If-None-Match': '*', 'x-amz-meta-sha256': source['sha256']}})
    manifest = {'batch': BATCH_ID, 'scope': SCOPE, 'sourceCount': 4,
                'uploadCount': len(uploads), 'sources': sources,
                'status': 'PRIVATE_UPLOAD_PACKET_READY'}
    packet = seal({'batch': BATCH_ID, 'expiresAt': now + LIFETIME_SECONDS,
                   'uploads': uploads, 'sources': sources}, public_key)
    return packet, manifest


def read_json(store, key):
    raw = store.read(key, MAX_RECEIPT)
    if raw is None:
        return None
    require(len(raw) <= MAX_RECEIPT, 'RECEIPT_TOO_LARGE')
    try:
        value = json.loads(raw)
    except (TypeError, ValueError):
        raise TransferError('INVALID_RECEIPT_JSON') from None
    require(type(value) is dict, 'INVALID_RECEIPT_JSON')
    return value


def expected_fingerprint(store, cfg, job):
    claim = read_json(store, prefix_for(job) + 'operator-dispatch-claim.json')
    if claim is None:
        return None
    require(type(claim.get('job')) is dict, 'INVALID_DISPATCH_CLAIM')
    envelope = claim['job']
    try:
        # This verifies a historical signed-in operator decision, not a fresh
        # authorization to run inference. Completed jobs remain recoverable.
        expiry = envelope['budget']['expiresAt']
        require(type(expiry) is int, 'INVALID_DISPATCH_CLAIM')
        validate_job(envelope, now_ms=expiry - 3600000 + 1)
        fp = fingerprint(envelope)
    except (KeyError, TypeError, ValueError):
        raise TransferError('INVALID_DISPATCH_CLAIM') from None
    require(envelope['revision'] == QUALITY_REVISION and envelope['scope'] == SCOPE
            and envelope['jobId'] == job['jobId'] and envelope['plan']['subject'] == job['subject']
            and envelope['reference']['sha256'] == job['reference']['sha256']
            and envelope['mask']['sha256'] == job['mask']['sha256']
            and claim.get('fingerprint') == fp, 'DISPATCH_IDENTITY_MISMATCH')
    return fp


def check_artifact(artifact, prefix):
    require(type(artifact) is dict and set(artifact) == {'key', 'bytes', 'sha256', 'mime'},
            'INVALID_ARTIFACT_FIELDS')
    key = artifact['key']
    require(type(key) is str and key.startswith(prefix), 'UNAPPROVED_OUTPUT_OBJECT')
    relative = key[len(prefix):]
    limit = 1024 * MIB if relative == 'raw/decoder.npz' else 256 * MIB
    require(relative in ARTIFACT_TYPES and type(artifact['bytes']) is int
            and 1 <= artifact['bytes'] <= limit and valid_hash(artifact['sha256'])
            and artifact['mime'] == ARTIFACT_TYPES[relative], 'UNAPPROVED_OUTPUT_OBJECT')
    return relative


def check_receipt_identity(receipt, job, fp):
    require(receipt.get('revision') == QUALITY_REVISION and receipt.get('jobId') == job['jobId']
            and receipt.get('fingerprint') == fp, 'RECEIPT_IDENTITY_MISMATCH')


def inspect_stage(store, cfg, stage):
    """Read only fixed receipt names and stream-hash each referenced artifact."""
    validate_config(cfg)
    job = stage_job(cfg, stage)
    prefix = prefix_for(job)
    fp = expected_fingerprint(store, cfg, job)
    artifacts, state, origin = [], 'NOT_DISPATCHED', 'NONE'
    if fp is not None:
        worker_claim = read_json(store, prefix + 'claim.json')
        if worker_claim is not None:
            require(worker_claim.get('revision') == QUALITY_REVISION
                    and worker_claim.get('fingerprint') == fp, 'WORKER_CLAIM_MISMATCH')
        final = read_json(store, prefix + 'result.json')
        if final is not None:
            require(worker_claim is not None, 'WORKER_CLAIM_MISSING')
            check_receipt_identity(final, job, fp)
            state = final.get('state')
            require(state in ('REVIEW_REQUIRED', 'FAILED_RECONCILE'), 'INVALID_FINAL_STATE')
            require(final.get('visualAccepted') is False and final.get('printReady') is False,
                    'FALSE_APPROVAL')
            if state == 'REVIEW_REQUIRED':
                require(final.get('supplierAccepted') is False and final.get('inferenceAttempts') == 1
                        and final.get('referenceSha256') == job['reference']['sha256']
                        and final.get('geometryEngine') == 'microsoft/TRELLIS.2-4B',
                        'INVALID_FINAL_PROVENANCE')
            require(type(final.get('artifacts')) is list and len(final['artifacts']) <= len(ARTIFACT_TYPES),
                    'INVALID_ARTIFACT_LIST')
            artifacts, origin = final['artifacts'], 'FINAL_RESULT'
        else:
            state, origin = 'INCOMPLETE_CHECKPOINTS', 'IMMUTABLE_CHECKPOINTS'
            for relative in sorted(ARTIFACT_TYPES):
                saved = read_json(store, prefix + 'checkpoints/' + relative + '.json')
                if saved is None:
                    continue
                require(worker_claim is not None, 'WORKER_CLAIM_MISSING')
                check_receipt_identity(saved, job, fp)
                require(saved.get('state') == 'ARTIFACT_DURABLE', 'INVALID_CHECKPOINT_STATE')
                artifact = saved.get('artifact')
                require(check_artifact(artifact, prefix) == relative, 'CHECKPOINT_PATH_MISMATCH')
                artifacts.append(artifact)
    seen, checked = set(), []
    for artifact in artifacts:
        relative = check_artifact(artifact, prefix)
        require(relative not in seen, 'DUPLICATE_ARTIFACT')
        seen.add(relative)
        verify_object(store, artifact)
        checked.append(dict(artifact))
    checked.sort(key=lambda item: item['key'])
    missing = sorted(set(ARTIFACT_TYPES) - seen)
    return {'batch': BATCH_ID, 'scope': SCOPE, 'stage': stage, 'name': job['name'],
            'jobId': job['jobId'], 'revision': QUALITY_REVISION, 'fingerprint': fp,
            'state': state, 'receiptSource': origin, 'artifactCount': len(checked),
            'artifacts': checked, 'missingArtifacts': missing,
            'allArtifactBytesVerified': not missing,
            'stageGateSatisfied': state == 'REVIEW_REQUIRED' and not missing,
            'visualAccepted': False, 'printReady': False, 'supplierAccepted': False}


def collect(store, cfg, stage, *, now=None):
    public_key = validate_config(cfg)
    manifest = inspect_stage(store, cfg, stage)
    now = int(time.time()) if now is None else int(now)
    job = stage_job(cfg, stage)
    prefix = prefix_for(job)
    downloads = []
    for artifact in manifest['artifacts']:
        url = store.client.generate_presigned_url('get_object', Params={
            'Bucket': store.bucket, 'Key': artifact['key']},
            ExpiresIn=LIFETIME_SECONDS, HttpMethod='GET')
        downloads.append({**artifact, 'name': job['name'] + '/' + artifact['key'][len(prefix):], 'url': url})
    packet = seal({'batch': BATCH_ID, 'stage': stage, 'expiresAt': now + LIFETIME_SECONDS,
                   'manifest': manifest, 'downloads': downloads}, public_key)
    return packet, manifest


def verify(store, cfg, stage, *, now=None):
    manifest = inspect_stage(store, cfg, stage)
    require(manifest['stageGateSatisfied'], 'STAGE_NOT_COMPLETE_NO_ADVANCE')
    checked_at = datetime.fromtimestamp(time.time() if now is None else now, timezone.utc).isoformat()
    gate = {'jobId': manifest['jobId'], 'scope': SCOPE, 'revision': QUALITY_REVISION,
            'fingerprint': manifest['fingerprint'], 'status': 'VERIFIED',
            'artifacts': manifest['artifacts'], 'checkedAt': checked_at}
    target = prefix_for(stage_job(cfg, stage)) + 'operator-verified.json'
    existing = read_json(store, target)
    if existing is None:
        if store.create_json(target, gate):
            return {**manifest, 'verificationReceipt': 'CREATED'}
        # A known conditional conflict is reconciled once. An uncertain write
        # raises from S3Store and never causes a second write attempt.
        existing = read_json(store, target)
    require(type(existing) is dict and set(existing) == set(gate)
            and all(existing[key] == value for key, value in gate.items() if key != 'checkedAt')
            and type(existing.get('checkedAt')) is str, 'VERIFICATION_RECEIPT_CONFLICT')
    return {**manifest, 'verificationReceipt': 'ALREADY_PRESENT_VERIFIED'}


def configured_store():
    import boto3
    from botocore.config import Config
    endpoint = os.environ['ARTIFACT_S3_ENDPOINT']
    require(re.fullmatch(r'https://[a-f0-9]{32}\.r2\.cloudflarestorage\.com/?', endpoint),
            'WRONG_STORAGE_DESTINATION')
    store = S3Store.from_env()
    store.client = boto3.client('s3', endpoint_url=endpoint, region_name='auto',
        aws_access_key_id=os.environ['ARTIFACT_ACCESS_KEY_ID'],
        aws_secret_access_key=os.environ['ARTIFACT_SECRET_ACCESS_KEY'],
        config=Config(signature_version='s3v4', connect_timeout=10, read_timeout=30,
                      retries={'total_max_attempts': 1}, s3={'addressing_style': 'path'}))
    return store


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('operation', choices=('prepare_uploads', 'collect', 'verify'))
    parser.add_argument('--stage', type=int, choices=(1, 2))
    parser.add_argument('--config', default='ops/RUNPOD_OWNER_V3_20261017.json')
    parser.add_argument('--out-dir', default='owner-v3-private')
    args = parser.parse_args(argv)
    require((args.operation == 'prepare_uploads' and args.stage is None)
            or (args.operation != 'prepare_uploads' and args.stage in (1, 2)), 'INVALID_OPERATION_STAGE')
    cfg = json.loads(Path(args.config).read_text())
    validate_config(cfg)
    store = configured_store()
    if args.operation == 'prepare_uploads':
        packet, manifest = prepare_uploads(store, cfg)
        basename = 'uploads'
    elif args.operation == 'collect':
        packet, manifest = collect(store, cfg, args.stage)
        basename = f'stage{args.stage}-results'
    else:
        packet, manifest = None, verify(store, cfg, args.stage)
        basename = f'stage{args.stage}-verification'
    out = Path(args.out_dir)
    out.mkdir(parents=True, exist_ok=True)
    if packet is not None:
        (out / (basename + '.sealed.json')).write_text(json.dumps(packet) + '\n')
    (out / (basename + '.manifest.json')).write_text(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps({'status': 'PRIVATE_V3_' + args.operation.upper() + '_COMPLETE',
                      'stage': args.stage, 'artifactCount': manifest.get('artifactCount'),
                      'uploadCount': manifest.get('uploadCount'),
                      'stageGateSatisfied': manifest.get('stageGateSatisfied')}))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # Do not expose provider URLs, authorization headers or source bytes.
        code = str(error) if isinstance(error, TransferError) else type(error).__name__
        print('PRIVATE_V3_TRANSFER_FAILED:' + code, file=sys.stderr)
        sys.exit(1)
