"""No real key generation, SSH, network access or provider calls."""
import base64
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import bootstrap


class BootstrapTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=Path(__file__).parent)
        self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name).absolute()
        self.public = 'ssh-rsa ' + base64.b64encode(b'inert public fixture' * 30).decode() + ' ' + bootstrap.KEY_COMMENT
        self.calls = []

    def runner(self, argv, **kwargs):
        self.calls.append((argv, kwargs))
        if '-q' in argv:
            # The runner only accepts OpenSSH private keys; older clients need
            # an explicit format selection instead of their RSA PEM default.
            self.assertIn('-o', argv)
            key = Path(argv[-1])
            key.write_text('INERT-PRIVATE-FIXTURE-NEVER-OUTPUT')
            key.chmod(0o600)
            key.with_suffix('.pub').write_text(self.public + '\n')
            return subprocess.CompletedProcess(argv, 0)
        stdout = ('4096 SHA256:abcdefghijk ' + bootstrap.KEY_COMMENT + ' (RSA)\n') if '-l' in argv else ' '.join(self.public.split()[:2]) + '\n'
        return subprocess.CompletedProcess(argv, 0, stdout)

    def test_repeated_setup_reuses_same_key_without_reading_secret(self):
        one = bootstrap.dedicated_key(self.home, self.runner)
        two = bootstrap.dedicated_key(self.home, self.runner)
        self.assertEqual(one, two)
        self.assertEqual(sum('-q' in a for a, _ in self.calls), 1)
        self.assertNotIn('INERT-PRIVATE', repr(one) + repr(two) + repr(self.calls))
        self.assertTrue(all(k['stdin'] is subprocess.DEVNULL and k['stderr'] is subprocess.DEVNULL for _, k in self.calls))

    def test_partial_pair_is_never_rotated(self):
        folder = self.home / '.worldifact-maintenance-20261008'
        folder.mkdir(mode=0o700)
        (folder / 'id_rsa').write_text('preserve')
        (folder / 'id_rsa').chmod(0o600)
        with self.assertRaises(FileNotFoundError):
            bootstrap.dedicated_key(self.home, self.runner)
        self.assertFalse(self.calls)
        self.assertEqual((folder / 'id_rsa').read_text(), 'preserve')

    def test_symlink_private_key_refused(self):
        folder = self.home / '.worldifact-maintenance-20261008'
        folder.mkdir(mode=0o700)
        original = self.home / 'original'
        original.write_text('preserve'); original.chmod(0o600)
        (folder / 'id_rsa').symlink_to(original)
        (folder / 'id_rsa.pub').write_text(self.public)
        with self.assertRaises(bootstrap.SetupError):
            bootstrap.dedicated_key(self.home, self.runner)
        self.assertFalse(self.calls)

    def test_wrong_key_pair_refused(self):
        bootstrap.dedicated_key(self.home, self.runner)
        def mismatch(argv, **kwargs):
            answer = self.runner(argv, **kwargs)
            if '-y' in argv:
                answer.stdout = 'ssh-rsa unrelated'
            return answer
        with self.assertRaises(bootstrap.SetupError):
            bootstrap.dedicated_key(self.home, mismatch)

    def test_openssh_public_derivation_preserves_comment(self):
        def with_comment(argv, **kwargs):
            answer = self.runner(argv, **kwargs)
            if '-y' in argv:
                answer.stdout = self.public + '\n'
            return answer
        self.assertEqual(bootstrap.dedicated_key(self.home, with_comment)[1], self.public)

    def test_concurrent_setup_cannot_generate_second_identity(self):
        def concurrent(argv, **kwargs):
            if '-q' in argv:
                with self.assertRaises(BlockingIOError):
                    bootstrap.dedicated_key(self.home, self.runner)
            return self.runner(argv, **kwargs)
        bootstrap.dedicated_key(self.home, concurrent)
        self.assertEqual(sum('-q' in argv for argv, _ in self.calls), 1)

    def test_unreviewed_source_refused_before_network(self):
        with patch('urllib.request.build_opener') as network:
            for commit, digest in [('main', '0'*64), ('0'*40, 'PENDING_REVIEW')]:
                with self.assertRaises(bootstrap.SetupError):
                    bootstrap.public_file(commit, 'x.py', digest)
            network.assert_not_called()

    def test_status_self_check_uses_dedicated_identity_and_trusted_pin(self):
        key, _ = bootstrap.dedicated_key(self.home, self.runner)
        def status(argv, **kwargs):
            self.assertEqual(argv[-1], 'status')
            self.assertIn(str(key), argv)
            self.assertIn('HostKeyAlgorithms=rsa-sha2-512,rsa-sha2-256', argv)
            self.assertIn('StrictHostKeyChecking=yes', argv)
            self.assertIs(kwargs['stderr'], subprocess.DEVNULL)
            self.assertIs(kwargs['stdin'], subprocess.DEVNULL)
            return subprocess.CompletedProcess(argv, 0, json.dumps({'revision': 'oracle-maintenance-b6dce84d-v1', 'action': 'status', 'result': 'inconclusive', 'status': {'read_only': True}, 'installer': None}))
        result = bootstrap.check_restricted_status(key, '8.8.8.8', '8.8.8.8 ssh-rsa AAAA', status)
        self.assertEqual(result, 'inconclusive')

    def test_authentication_failure_cannot_report_ready_or_apply(self):
        key, _ = bootstrap.dedicated_key(self.home, self.runner)
        calls = []
        def denied(argv, **kwargs):
            calls.append(argv)
            return subprocess.CompletedProcess(argv, 255, 'private error hidden')
        with self.assertRaises(bootstrap.SetupError):
            bootstrap.check_restricted_status(key, '8.8.8.8', '8.8.8.8 ssh-rsa AAAA', denied)
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0][-1], 'status')

    def test_explicit_access_approval_required(self):
        with patch('sys.argv', ['bootstrap.py', '--source-commit', '0'*40]), patch.object(bootstrap, 'setup') as setup:
            with self.assertRaises(SystemExit):
                bootstrap.main()
            setup.assert_not_called()


if __name__ == '__main__':
    unittest.main()
