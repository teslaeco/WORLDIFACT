"""Security fixtures use inert public-key bytes; no credentials are generated."""
import base64
import hashlib
import os
from pathlib import Path
import struct
import tempfile
import unittest
from unittest.mock import patch

import receiver


def fixture_key():
    words = [b'ssh-rsa', (65537).to_bytes(3, 'big'), b'\x00\x80' + b'\x01' * 511]
    return 'ssh-rsa ' + base64.b64encode(b''.join(struct.pack('>I', len(w)) + w for w in words)).decode() + ' ' + receiver.COMMENT


class ReceiverTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=Path(__file__).parent)
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).absolute()
        self.key = receiver.public_key(fixture_key())
        self.line = ('restrict,command="/usr/bin/python3 -I -B /home/opc/.local/share/worldifact-maintenance/dispatcher.py" ' + self.key + ' ' + receiver.COMMENT).encode()

    def test_preserves_existing_bytes_and_is_idempotent(self):
        original = b'# existing owner\nssh-ed25519 AAAA owner-key-without-final-newline'
        (self.root / 'authorized_keys').write_bytes(original)
        self.assertFalse(receiver.authorize(self.root, self.line, self.key))
        expected = original + b'\n' + self.line + b'\n'
        self.assertEqual((self.root / 'authorized_keys').read_bytes(), expected)
        self.assertTrue(receiver.authorize(self.root, self.line, self.key))
        self.assertEqual((self.root / 'authorized_keys').read_bytes(), expected)

    def test_conflicting_dedicated_entry_cannot_be_relaxed(self):
        original = (self.key + ' unrestricted\n').encode()
        (self.root / 'authorized_keys').write_bytes(original)
        with self.assertRaises(ValueError):
            receiver.authorize(self.root, self.line, self.key)
        self.assertEqual((self.root / 'authorized_keys').read_bytes(), original)

    def test_valid_line_cannot_hide_later_unrestricted_duplicate(self):
        original = self.line + b'\n' + (self.key + ' unrestricted\n').encode()
        (self.root / 'authorized_keys').write_bytes(original)
        with self.assertRaises(ValueError):
            receiver.authorize(self.root, self.line, self.key)
        self.assertEqual((self.root / 'authorized_keys').read_bytes(), original)

    def test_authorized_keys_symlink_refused(self):
        other = self.root / 'other'; other.write_bytes(b'original')
        (self.root / 'authorized_keys').symlink_to(other)
        with self.assertRaises(OSError):
            receiver.authorize(self.root, self.line, self.key)
        self.assertEqual(other.read_bytes(), b'original')

    def test_authorized_keys_hardlink_refused(self):
        other = self.root / 'other'; other.write_bytes(b'original')
        os.link(other, self.root / 'authorized_keys')
        with self.assertRaises(ValueError):
            receiver.authorize(self.root, self.line, self.key)
        self.assertEqual(other.read_bytes(), b'original')

    def test_package_file_is_immutable_and_interrupted_stage_not_accepted(self):
        target = self.root / 'dispatcher.py'
        with patch('os.link', side_effect=InterruptedError):
            with self.assertRaises(InterruptedError):
                receiver.install_immutable(target, b'pass\n')
        self.assertFalse(target.exists())
        receiver.install_immutable(target, b'pass\n')
        receiver.install_immutable(target, b'pass\n')
        with self.assertRaises(ValueError):
            receiver.install_immutable(target, b'changed\n')
        self.assertEqual(target.read_bytes(), b'pass\n')

    def test_unknown_and_injected_public_key_refused(self):
        for key in [fixture_key() + '\nssh-rsa other', fixture_key().replace('ssh-rsa', 'ssh-ed25519', 1), fixture_key().replace(receiver.COMMENT, 'unapproved')]:
            with self.assertRaises(ValueError):
                receiver.public_key(key)

    def test_killed_before_link_leaves_orphan_outside_package_and_can_resume(self):
        staging = self.root / '.staging'; staging.mkdir(mode=0o700)
        orphan = staging / ('.staged-' + hashlib.sha256(b'pass\n').hexdigest() + '-abcdefgh')
        orphan.write_bytes(b'partial')
        package = self.root / 'update'; package.mkdir(mode=0o700)
        target = package / 'example.py'
        receiver.install_immutable(target, b'pass\n', staging)
        self.assertEqual(list(package.iterdir()), [target])
        self.assertEqual(orphan.read_bytes(), b'partial')

    def test_killed_after_link_recovers_only_exact_owned_stage_link(self):
        staging = self.root / '.staging'; staging.mkdir(mode=0o700)
        raw = b'pass\n'
        stage = staging / ('.staged-' + hashlib.sha256(raw).hexdigest() + '-abcdefgh')
        stage.write_bytes(raw); stage.chmod(0o600)
        target = self.root / 'dispatcher.py'; os.link(stage, target)
        self.assertEqual(target.stat().st_nlink, 2)
        receiver.install_immutable(target, raw, staging)
        self.assertEqual(target.stat().st_nlink, 1)
        self.assertEqual(target.read_bytes(), raw)
        self.assertFalse(stage.exists())

    def test_unknown_extra_package_link_still_refused(self):
        raw = b'pass\n'
        other = self.root / 'owner-file'; other.write_bytes(raw)
        target = self.root / 'dispatcher.py'; os.link(other, target)
        with self.assertRaises(ValueError):
            receiver.install_immutable(target, raw)
        self.assertEqual(other.read_bytes(), raw)

    def test_unreviewed_payload_cannot_authorize_key(self):
        with patch.object(receiver, 'authorize') as authorize:
            with self.assertRaises(ValueError):
                receiver.install({'files': {}, 'host': '8.8.8.8', 'public_key': fixture_key()}, home=self.root)
            authorize.assert_not_called()


if __name__ == '__main__':
    unittest.main()
