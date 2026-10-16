import base64
from datetime import datetime, timezone
import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import Mock
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

spec = importlib.util.spec_from_file_location('transfer', Path(__file__).parents[1]/'scripts/runpod-owner-reference-transfer.py')
transfer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(transfer)


class TransferTests(unittest.TestCase):
    def setUp(self):
        self.key = rsa.generate_private_key(public_exponent=65537, key_size=3072)
        self.manifest = {'id': 'owner-models-20261016', 'expiresBefore': '2026-10-17T12:00:00Z',
                         'publicKeyPem': self.key.public_key().public_bytes(serialization.Encoding.PEM,
                                            serialization.PublicFormat.SubjectPublicKeyInfo).decode(),
                         'sources': [{'name': name+'.png', 'sha256': 'a'*64, 'bytes': 100}
                                     for name in ('robot', 'room', 'alternate')]}
        self.now = datetime(2026, 10, 16, 21, tzinfo=timezone.utc)

    def test_only_recipient_can_read_bound_short_lived_urls(self):
        client = Mock()
        client.generate_presigned_url.return_value = 'https://private.invalid/upload?credential=SECRET_FIXTURE'
        packet = transfer.create_packet(client, 'private-fixture', self.manifest, self.now)
        self.assertNotIn('SECRET_FIXTURE', json.dumps(packet))
        symmetric = self.key.decrypt(base64.b64decode(packet['key']), padding.OAEP(
            mgf=padding.MGF1(hashes.SHA256()), algorithm=hashes.SHA256(), label=transfer.AAD))
        payload = json.loads(AESGCM(symmetric).decrypt(base64.b64decode(packet['nonce']),
                             base64.b64decode(packet['ciphertext']), transfer.AAD))
        self.assertEqual(payload['expiresAt'], int(self.now.timestamp())+900)
        self.assertEqual(len(payload['uploads']), 3)
        for call in client.generate_presigned_url.call_args_list:
            self.assertEqual(call.args, ('put_object',))
            self.assertEqual(call.kwargs['HttpMethod'], 'PUT')
            self.assertEqual(call.kwargs['ExpiresIn'], 900)
            self.assertEqual(call.kwargs['Params']['IfNoneMatch'], '*')
            self.assertEqual(call.kwargs['Params']['ContentLength'], 100)
            self.assertTrue(call.kwargs['Params']['Key'].startswith('ops/owner-models-20261016/sources/'))

    def test_expired_authorization_and_path_escape_rejected_before_signing(self):
        with self.assertRaises(ValueError):
            transfer.validate(self.manifest, datetime(2026, 10, 18, tzinfo=timezone.utc))
        self.manifest['sources'][0]['name'] = '../other.png'
        client = Mock()
        with self.assertRaises(ValueError):
            transfer.create_packet(client, 'private-fixture', self.manifest, self.now)
        client.generate_presigned_url.assert_not_called()


if __name__ == '__main__':
    unittest.main()
