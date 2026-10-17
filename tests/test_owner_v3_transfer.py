"""Real cryptography and byte-integrity tests; storage/provider calls are mocks."""
import base64
import copy
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import unittest

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

ROOT = Path(__file__).parents[1]
spec = importlib.util.spec_from_file_location('owner_v3_transfer', ROOT / 'tools/runpod_owner_v3/transfer.py')
transfer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(transfer)


class MissingObject(Exception):
    response = {'Error': {'Code': 'NoSuchKey'}, 'ResponseMetadata': {'HTTPStatusCode': 404}}


class FakeStore:
    def __init__(self):
        self.client, self.bucket = self, 'private-fixture'
        self.objects, self.receipts, self.calls = {}, {}, []
        self.closed_bodies = []

    def add_object(self, key, body, mime):
        self.objects[key] = {'body': body, 'ContentLength': len(body),
                             'Metadata': {'sha256': hashlib.sha256(body).hexdigest()}, 'ContentType': mime}
        return {'key': key, 'bytes': len(body), 'sha256': hashlib.sha256(body).hexdigest(), 'mime': mime}

    def head_object(self, *, Bucket, Key):
        self.calls.append(('head', Key))
        if Key not in self.objects:
            raise MissingObject()
        return {name: value for name, value in self.objects[Key].items() if name != 'body'}

    def get_object(self, *, Bucket, Key):
        self.calls.append(('get', Key))
        result = {name: value for name, value in self.objects[Key].items() if name != 'body'}
        result['Body'] = io.BytesIO(self.objects[Key]['body'])
        self.closed_bodies.append(result['Body'])
        return result

    def read(self, key, limit):
        self.calls.append(('read', key))
        item = self.receipts.get(key)
        return json.dumps(item).encode() if item is not None else None

    def create_json(self, key, value):
        self.calls.append(('create', key))
        if key in self.receipts:
            return False
        self.receipts[key] = copy.deepcopy(value)
        return True

    def generate_presigned_url(self, operation, **kwargs):
        self.calls.append(('presign', operation, kwargs))
        return 'https://private.invalid/object?credential=SECRET_FIXTURE'


class TransferTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.private_key = rsa.generate_private_key(public_exponent=65537, key_size=3072)
        cls.public_pem = cls.private_key.public_key().public_bytes(
            serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo).decode()

    def setUp(self):
        self.cfg = {'id': transfer.BATCH_ID, 'scope': transfer.SCOPE, 'publicKeyPem': self.public_pem,
                    'jobs': []}
        self.sources = {}
        for name, job_id, subject in transfer.JOBS:
            job = {'name': name, 'jobId': job_id, 'subject': subject}
            for kind in ('reference', 'mask'):
                body = (name + ':' + kind + ':private-image-fixture').encode()
                self.sources[(name, kind)] = body
                job[kind] = {'sha256': hashlib.sha256(body).hexdigest(), 'bytes': len(body),
                             'width': 1024, 'height': 1024}
            self.cfg['jobs'].append(job)
        self.store = FakeStore()

    def decrypt(self, packet):
        symmetric = self.private_key.decrypt(base64.b64decode(packet['key']), padding.OAEP(
            mgf=padding.MGF1(hashes.SHA256()), algorithm=hashes.SHA256(), label=transfer.AAD))
        return json.loads(AESGCM(symmetric).decrypt(base64.b64decode(packet['nonce']),
                          base64.b64decode(packet['ciphertext']), transfer.AAD))

    def add_job(self, stage=1, complete=True):
        pinned = self.cfg['jobs'][stage - 1]
        prefix = transfer.prefix_for(pinned)
        job = {
            'revision': transfer.QUALITY_REVISION, 'jobId': pinned['jobId'], 'scope': transfer.SCOPE,
            'reference': {'key': prefix + 'reference.png', 'sha256': pinned['reference']['sha256']},
            'mask': {'key': prefix + 'mask.png', 'sha256': pinned['mask']['sha256']},
            'planner': {'model': 'gpt-6-astra', 'responseId': 'resp_test_fixture',
                        'referenceSha256': pinned['reference']['sha256']},
            'plan': {'subject': pinned['subject'], 'description': 'Preserve the original reference geometry.',
                     'preserve': ['Visible silhouette'], 'unseenSurfaces': 'Unknown surfaces are inferred.',
                     'makeStatus': 'NOT_VALIDATED'},
            'settings': {'seed': 1337, 'resolution': 1536, 'textureSize': 4096, 'targetFaces': 1000000},
            'budget': {'maxGpuMicroUsd': 2100000, 'rateMicroUsdPerSecond': 834, 'executionSeconds': 1800,
                       'coldStartAllowanceSeconds': 600, 'idleSeconds': 5, 'expiresAt': 1800000000000},
        }
        fp = transfer.fingerprint(job)
        self.store.receipts[prefix + 'operator-dispatch-claim.json'] = {'fingerprint': fp, 'job': job}
        self.store.receipts[prefix + 'claim.json'] = {'revision': job['revision'], 'fingerprint': fp}
        artifacts = []
        for relative, mime in transfer.ARTIFACT_TYPES.items():
            artifact = self.store.add_object(prefix + relative, (relative + ':stored-private-artifact').encode(), mime)
            artifacts.append(artifact)
            self.store.receipts[prefix + 'checkpoints/' + relative + '.json'] = {
                'revision': job['revision'], 'jobId': job['jobId'], 'fingerprint': fp,
                'state': 'ARTIFACT_DURABLE', 'artifact': artifact,
            }
        if complete:
            self.store.receipts[prefix + 'result.json'] = {
                'revision': job['revision'], 'jobId': job['jobId'], 'fingerprint': fp,
                'state': 'REVIEW_REQUIRED', 'visualAccepted': False, 'printReady': False,
                'supplierAccepted': False, 'inferenceAttempts': 1, 'artifacts': artifacts,
                'referenceSha256': pinned['reference']['sha256'], 'geometryEngine': 'microsoft/TRELLIS.2-4B',
            }
        return prefix, artifacts

    def test_four_create_only_uploads_are_encrypted_and_bound_to_exact_objects(self):
        packet, manifest = transfer.prepare_uploads(self.store, self.cfg, now=100)
        self.assertNotIn('SECRET_FIXTURE', json.dumps(packet))
        self.assertNotIn('SECRET_FIXTURE', json.dumps(manifest))
        payload = self.decrypt(packet)
        self.assertEqual(payload['expiresAt'], 3700)
        self.assertEqual(len(payload['uploads']), 4)
        self.assertEqual(manifest['uploadCount'], 4)
        expected = {transfer.prefix_for(job) + kind + '.png'
                    for job in self.cfg['jobs'] for kind in ('reference', 'mask')}
        self.assertEqual({item['key'] for item in payload['uploads']}, expected)
        for call in [item for item in self.store.calls if item[0] == 'presign']:
            self.assertEqual(call[1], 'put_object')
            self.assertEqual(call[2]['ExpiresIn'], 3600)
            self.assertEqual(call[2]['HttpMethod'], 'PUT')
            self.assertEqual(call[2]['Params']['IfNoneMatch'], '*')
            self.assertEqual(call[2]['Params']['ContentType'], 'image/png')
        self.assertFalse(any(call[0] == 'create' for call in self.store.calls))

    def test_existing_source_requires_full_hash_and_is_never_reuploaded(self):
        job = self.cfg['jobs'][0]
        key = transfer.prefix_for(job) + 'reference.png'
        self.store.add_object(key, self.sources[(job['name'], 'reference')], 'image/png')
        packet, manifest = transfer.prepare_uploads(self.store, self.cfg)
        self.assertEqual(manifest['uploadCount'], 3)
        self.assertEqual(manifest['sources'][0]['status'], 'ALREADY_PRESENT_VERIFIED')
        self.assertNotIn(key, {item['key'] for item in self.decrypt(packet)['uploads']})
        self.assertIn(('get', key), self.store.calls)
        self.store.objects[key]['body'] = b'x' * self.store.objects[key]['ContentLength']
        with self.assertRaisesRegex(transfer.TransferError, 'ARTIFACT_HASH_MISMATCH'):
            transfer.prepare_uploads(self.store, self.cfg)

    def test_scope_source_and_recipient_validation_refuses_broader_delegation(self):
        for mutate in (
                lambda cfg: cfg.update(scope='a' * 64),
                lambda cfg: cfg['jobs'].append(copy.deepcopy(cfg['jobs'][0])),
                lambda cfg: cfg['jobs'][0].update(jobId=cfg['jobs'][1]['jobId']),
                lambda cfg: cfg['jobs'][0]['reference'].update(bytes=True),
                lambda cfg: cfg['jobs'][0]['mask'].update(width=1023),
                lambda cfg: cfg.update(publicKeyPem='invalid')):
            cfg = copy.deepcopy(self.cfg)
            mutate(cfg)
            with self.assertRaises(transfer.TransferError):
                transfer.prepare_uploads(self.store, cfg)
        self.assertEqual(self.store.calls, [])

    def test_complete_collection_has_sixteen_verified_private_downloads_without_writes(self):
        prefix, _ = self.add_job()
        packet, manifest = transfer.collect(self.store, self.cfg, 1, now=100)
        payload = self.decrypt(packet)
        self.assertEqual(len(payload['downloads']), 16)
        self.assertEqual(payload['expiresAt'], 3700)
        self.assertTrue(manifest['stageGateSatisfied'])
        self.assertEqual(manifest['receiptSource'], 'FINAL_RESULT')
        self.assertNotIn('SECRET_FIXTURE', json.dumps(manifest))
        self.assertFalse(any(item[0] == 'create' for item in self.store.calls))
        self.assertFalse(any(item[0] == 'read' and '/checkpoints/' in item[1] for item in self.store.calls))
        self.assertTrue(all(item['key'].startswith(prefix) for item in payload['downloads']))
        self.assertTrue(all(body.closed for body in self.store.closed_bodies))

    def test_verified_gate_is_create_once_and_rechecks_existing_bytes(self):
        prefix, _ = self.add_job()
        first = transfer.verify(self.store, self.cfg, 1, now=100)
        gate = self.store.receipts[prefix + 'operator-verified.json']
        self.assertEqual(gate['status'], 'VERIFIED')
        self.assertEqual(first['verificationReceipt'], 'CREATED')
        second = transfer.verify(self.store, self.cfg, 1, now=200)
        self.assertEqual(second['verificationReceipt'], 'ALREADY_PRESENT_VERIFIED')
        self.assertEqual(gate, self.store.receipts[prefix + 'operator-verified.json'])
        self.assertEqual(len([item for item in self.store.calls if item[0] == 'create']), 1)
        gate['artifacts'][0]['sha256'] = 'a' * 64
        with self.assertRaisesRegex(transfer.TransferError, 'VERIFICATION_RECEIPT_CONFLICT'):
            transfer.verify(self.store, self.cfg, 1)

    def test_unfinished_checkpoints_recover_without_authorizing_next_stage(self):
        prefix, _ = self.add_job(complete=False)
        # A partially exported job survives even when no final result was committed.
        del self.store.receipts[prefix + 'checkpoints/outputs/qa.json.json']
        packet, manifest = transfer.collect(self.store, self.cfg, 1)
        self.assertEqual(manifest['artifactCount'], 15)
        self.assertEqual(manifest['missingArtifacts'], ['outputs/qa.json'])
        self.assertFalse(manifest['stageGateSatisfied'])
        self.assertEqual(len(self.decrypt(packet)['downloads']), 15)
        with self.assertRaisesRegex(transfer.TransferError, 'STAGE_NOT_COMPLETE_NO_ADVANCE'):
            transfer.verify(self.store, self.cfg, 1)
        self.assertNotIn(prefix + 'operator-verified.json', self.store.receipts)

    def test_failed_final_result_is_authoritative_over_additional_checkpoints(self):
        prefix, _ = self.add_job()
        final = self.store.receipts[prefix + 'result.json']
        final['state'], final['artifacts'] = 'FAILED_RECONCILE', final['artifacts'][:2]
        _, manifest = transfer.collect(self.store, self.cfg, 1)
        self.assertEqual(manifest['artifactCount'], 2)
        self.assertFalse(manifest['stageGateSatisfied'])
        self.assertFalse(any(item[0] == 'read' and '/checkpoints/' in item[1] for item in self.store.calls))

    def test_receipts_cannot_cross_job_scope_or_forge_fingerprint(self):
        for field, value in (('jobId', transfer.JOBS[1][1]), ('fingerprint', 'b' * 64),
                             ('revision', 'astra-runpod-blender-v1'), ('visualAccepted', True)):
            self.store = FakeStore()
            prefix, _ = self.add_job()
            self.store.receipts[prefix + 'result.json'][field] = value
            with self.assertRaises(transfer.TransferError):
                transfer.collect(self.store, self.cfg, 1)
            self.assertFalse(any(item[0] == 'presign' for item in self.store.calls))

    def test_duplicate_or_unapproved_artifacts_never_receive_download_delegation(self):
        prefix, artifacts = self.add_job()
        final = self.store.receipts[prefix + 'result.json']
        for bad in ('../private.pem', 'reference.png', 'raw/../decoder.npz', 'outputs/unknown.png'):
            final['artifacts'] = [{**artifacts[0], 'key': prefix + bad}]
            with self.assertRaises(transfer.TransferError):
                transfer.collect(self.store, self.cfg, 1)
        final['artifacts'] = [artifacts[0], artifacts[0]]
        with self.assertRaisesRegex(transfer.TransferError, 'DUPLICATE_ARTIFACT'):
            transfer.collect(self.store, self.cfg, 1)
        self.assertFalse(any(item[0] == 'presign' for item in self.store.calls))

    def test_only_native_decoder_has_one_gib_limit(self):
        prefix = transfer.prefix_for(self.cfg['jobs'][0])
        decoder = {'key': prefix + 'raw/decoder.npz', 'bytes': 1024 * transfer.MIB,
                   'sha256': 'a' * 64, 'mime': 'application/octet-stream'}
        transfer.check_artifact(decoder, prefix)
        for artifact in ({**decoder, 'bytes': 1024 * transfer.MIB + 1},
                         {**decoder, 'key': prefix + 'outputs/source.blend'},
                         {**decoder, 'bytes': True}, {**decoder, 'mime': 'image/png'}):
            with self.assertRaises(transfer.TransferError):
                transfer.check_artifact(artifact, prefix)

    def test_metadata_match_cannot_hide_changed_truncated_or_extended_object(self):
        for body in (b'abd', b'ab', b'abcd'):
            self.store = FakeStore()
            artifact = self.store.add_object('fixed-key', b'abc', 'image/png')
            self.store.objects['fixed-key']['body'] = body
            with self.assertRaises(transfer.TransferError):
                transfer.verify_object(self.store, artifact)
            self.assertTrue(self.store.closed_bodies[-1].closed)

    def test_checkpoint_receipt_must_name_its_exact_artifact(self):
        prefix, artifacts = self.add_job(complete=False)
        self.store.receipts[prefix + 'checkpoints/raw/decoder.npz.json']['artifact'] = artifacts[1]
        with self.assertRaisesRegex(transfer.TransferError, 'CHECKPOINT_PATH_MISMATCH'):
            transfer.collect(self.store, self.cfg, 1)

    def test_no_dispatch_is_empty_and_cannot_verify_or_create_gate(self):
        packet, manifest = transfer.collect(self.store, self.cfg, 2)
        self.assertEqual(manifest['state'], 'NOT_DISPATCHED')
        self.assertEqual(self.decrypt(packet)['downloads'], [])
        with self.assertRaisesRegex(transfer.TransferError, 'STAGE_NOT_COMPLETE_NO_ADVANCE'):
            transfer.verify(self.store, self.cfg, 2)
        self.assertFalse(any(item[0] == 'create' for item in self.store.calls))

    def test_gate_ambiguous_write_is_not_retried(self):
        self.add_job()
        attempts = []
        def unknown_write(key, value):
            attempts.append(key)
            raise RuntimeError('ambiguous network write')
        self.store.create_json = unknown_write
        with self.assertRaises(RuntimeError):
            transfer.verify(self.store, self.cfg, 1)
        self.assertEqual(len(attempts), 1)


if __name__ == '__main__':
    unittest.main()
