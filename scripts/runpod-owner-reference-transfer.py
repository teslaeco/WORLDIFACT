"""Delegate three short-lived, create-only uploads; never export storage credentials.

Only an RSA-OAEP/AES-GCM encrypted packet leaves the protected runner. The local
operator owns the private key, checks the pinned hashes and uploads original bytes.
"""
import base64
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import sys

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

MANIFEST = Path('ops/RUNPOD_OWNER_REFERENCES_20261016.json')
AAD = b'WORLDIFACT-private-reference-transfer-v1'


def validate(manifest, now):
    if manifest['id'] != 'owner-models-20261016':
        raise ValueError('WRONG_TRANSFER_SCOPE')
    expiry = datetime.fromisoformat(manifest['expiresBefore'].replace('Z', '+00:00'))
    if now >= expiry:
        raise ValueError('TRANSFER_AUTHORIZATION_EXPIRED')
    names = set()
    for source in manifest['sources']:
        if (not re.fullmatch(r'[a-z0-9-]+\.png', source['name'])
                or not re.fullmatch(r'[a-f0-9]{64}', source['sha256'])
                or type(source['bytes']) is not int or not 1 <= source['bytes'] <= 12*1024*1024
                or source['name'] in names):
            raise ValueError('INVALID_PINNED_SOURCE')
        names.add(source['name'])
    if len(names) != 3:
        raise ValueError('EXACT_THREE_REFERENCES_REQUIRED')
    key = serialization.load_pem_public_key(manifest['publicKeyPem'].encode())
    if not isinstance(key, rsa.RSAPublicKey) or key.key_size < 3072:
        raise ValueError('INVALID_RECIPIENT_KEY')
    return key


def create_packet(client, bucket, manifest, now):
    key = validate(manifest, now)
    uploads = []
    for source in manifest['sources']:
        target = 'ops/owner-models-20261016/sources/' + source['name']
        params = {'Bucket': bucket, 'Key': target, 'ContentType': 'image/png',
                  'ContentLength': source['bytes'], 'IfNoneMatch': '*',
                  'Metadata': {'sha256': source['sha256']}}
        url = client.generate_presigned_url('put_object', Params=params,
                                           ExpiresIn=900, HttpMethod='PUT')
        uploads.append({**source, 'key': target, 'url': url, 'method': 'PUT',
                        'headers': {'Content-Type': 'image/png', 'Content-Length': str(source['bytes']),
                                    'If-None-Match': '*', 'x-amz-meta-sha256': source['sha256']}})
    plaintext = json.dumps({'id': manifest['id'], 'expiresAt': int(now.timestamp())+900,
                            'uploads': uploads}, separators=(',', ':')).encode()
    symmetric, nonce = AESGCM.generate_key(bit_length=256), os.urandom(12)
    wrapped = key.encrypt(symmetric, padding.OAEP(mgf=padding.MGF1(hashes.SHA256()),
                                                 algorithm=hashes.SHA256(), label=AAD))
    ciphertext = AESGCM(symmetric).encrypt(nonce, plaintext, AAD)
    encode = lambda value: base64.b64encode(value).decode()
    return {'version': 1, 'key': encode(wrapped), 'nonce': encode(nonce), 'ciphertext': encode(ciphertext)}


def main():
    import boto3
    from botocore.config import Config
    endpoint = os.environ['ARTIFACT_S3_ENDPOINT']
    if not re.fullmatch(r'https://[a-f0-9]{32}\.r2\.cloudflarestorage\.com/?', endpoint):
        raise ValueError('WRONG_STORAGE_DESTINATION')
    client = boto3.client('s3', endpoint_url=endpoint, region_name='auto',
                         aws_access_key_id=os.environ['ARTIFACT_ACCESS_KEY_ID'],
                         aws_secret_access_key=os.environ['ARTIFACT_SECRET_ACCESS_KEY'],
                         config=Config(signature_version='s3v4', retries={'total_max_attempts': 1},
                                       s3={'addressing_style': 'path'}))
    manifest = json.loads(MANIFEST.read_text())
    packet = create_packet(client, os.environ['ARTIFACT_BUCKET'], manifest, datetime.now(timezone.utc))
    Path('owner-reference-upload.sealed.json').write_text(json.dumps(packet)+'\n')
    print('PRIVATE_UPLOAD_PACKET_READY: three fixed objects, create-only, 15-minute expiry; no GPU or AI calls.')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('TRANSFER_PREPARATION_FAILED: '+type(error).__name__, file=sys.stderr)
        sys.exit(1)
