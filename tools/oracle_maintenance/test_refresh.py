"""Local, inert-fixture checks. Downloads, key lookup, and all SSH are stubbed."""
import ast
import base64
from contextlib import ExitStack, redirect_stderr, redirect_stdout
import hashlib
import io
import json
import os
from pathlib import Path
import signal
import stat
import subprocess
import tempfile
import unittest
from unittest.mock import Mock, patch

import refresh


def b64(raw):
    return base64.b64encode(raw).decode('ascii')


def rsa_public(bits=4096, comment=refresh.KEY_COMMENT):
    fields = [b'ssh-rsa', b'\x01\x00\x01', b'\0\x80' + b'\x19' * (bits // 8 - 1)]
    blob = b''.join(len(field).to_bytes(4, 'big') + field for field in fields)
    return 'ssh-rsa ' + b64(blob) + ' ' + comment + '\n'


def result(kind='refreshed'):
    success = kind in ('refreshed', 'already_refreshed')
    return {'phase': refresh.READY if success else refresh.NOT_CONFIRMED, 'result': kind,
            'keys_changed': False, 'runtime_changed': False, 'old_apply_retired': success}


class RefreshTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name)
        self.folder = self.home / '.worldifact-maintenance-20261008'
        self.folder.mkdir(mode=0o700)
        (self.home / '.ssh').mkdir(mode=0o700)
        self.key, self.public = self.folder / 'id_rsa', self.folder / 'id_rsa.pub'
        self.admin, self.trust = self.home / 'ssh-key-2026-09-06.key', self.home / '.ssh/known_hosts'
        self.key.write_bytes(b'INERT_DEDICATED_PRIVATE_FIXTURE_DO_NOT_READ')
        self.admin.write_bytes(b'INERT_ADMIN_PRIVATE_FIXTURE_DO_NOT_READ')
        self.key.chmod(0o600)
        self.admin.chmod(0o600)
        self.public.write_text(rsa_public(), encoding='ascii')
        self.server_key = ' '.join(rsa_public().split()[:2]) + '\n'
        self.trust.write_text('# Keep all existing trust records.\n' + refresh.TARGET + ' ' + self.server_key
                              + 'unrelated.example ssh-ed25519 FIXTURE\n', encoding='ascii')
        self.before = {path: (path.read_bytes(), refresh.identity(path.stat()))
                       for path in (self.key, self.admin, self.public, self.trust)}
        self.commit_a, self.commit_b = 'a' * 40, 'b' * 40
        self.package_raw = b'# inert package fixture\n'
        blob_hash = hashlib.sha1(b'blob ' + str(len(self.package_raw)).encode() + b'\0' + self.package_raw).hexdigest()
        self.manifest = {'package' + str(index) + '.py': ('tools/fixture.py', blob_hash) for index in range(42)}
        self.package = {name: b64(self.package_raw) for name in self.manifest}
        self.launcher = ("FILES = " + repr(self.manifest) + '\n'
                         + 'def package(commit):\n'
                         + '    assert commit == ' + repr(self.commit_a) + '\n'
                         + '    return ' + repr(b64(json.dumps(self.package).encode())) + '\n').encode()
        self.source = {'refresh_receiver.py': b'raise AssertionError("receiver must never execute locally")\n',
                       'dispatcher.py': b'# inert dispatcher\n', 'status.py': b'# inert status\n'}
        self.source_hashes = {name: hashlib.sha256(raw).hexdigest() for name, raw in self.source.items()}
        self.stack = ExitStack()
        self.addCleanup(self.stack.close)
        for name, value in [('SOURCE_COMMIT', self.commit_a),
                            ('NEW_LAUNCHER_SHA', hashlib.sha256(self.launcher).hexdigest()),
                            ('REFRESH_FILES', self.source_hashes),
                            ('SERVER_KNOWN_HOST', refresh.TARGET + ' ' + self.server_key),
                            ('SERVER_RSA_SHA256', hashlib.sha256(self.server_key.encode()).hexdigest())]:
            self.stack.enter_context(patch.object(refresh, name, value))
        self.calls, self.downloads = [], []
        self.temporary_hosts = []
        self.lookup = '# Host found: line 2\n' + refresh.TARGET + ' ' + self.server_key
        self.reply = json.dumps(result())
        self.code = 0

    def reader(self, commit, path, expected):
        self.downloads.append((commit, path, expected))
        if path == refresh.LAUNCHER_PATH:
            self.assertEqual(commit, self.commit_a)
            return self.launcher
        self.assertEqual(commit, self.commit_b)
        return self.source[path.rsplit('/', 1)[-1]]

    def runner(self, argv, **kwargs):
        self.calls.append((argv, kwargs))
        if argv[0] == '/usr/bin/ssh-keygen':
            self.assertEqual(argv, ['/usr/bin/ssh-keygen', '-F', refresh.TARGET, '-f', str(self.trust)])
            return subprocess.CompletedProcess(argv, 0, self.lookup)
        self.assertEqual(argv[0], '/usr/bin/ssh')
        trust = Path(next(value.split('=', 1)[1] for value in argv if value.startswith('UserKnownHostsFile=')))
        self.assertNotEqual(trust, self.trust)
        self.assertEqual(trust.read_text(), refresh.SERVER_KNOWN_HOST)
        self.assertEqual(stat.S_IMODE(trust.stat().st_mode), 0o600)
        self.assertEqual(stat.S_IMODE(trust.parent.stat().st_mode), 0o700)
        self.assertEqual(trust.parent.parent, self.folder)
        self.temporary_hosts.append(trust)
        self.assertIs(kwargs['stderr'], subprocess.DEVNULL)
        self.assertEqual(kwargs['env'], refresh.SSH_ENV)
        self.assertEqual(argv[-2], refresh.TARGET)
        if argv[-1] == 'status':
            self.assertIn(str(self.key), argv)
            self.assertIs(kwargs['stdin'], subprocess.DEVNULL)
            value = {'revision': 'oracle-maintenance-initial-edit-v1', 'action': 'status',
                     'result': 'inconclusive', 'status': {'read_only': True}, 'installer': None}
            return subprocess.CompletedProcess(argv, 0, json.dumps(value))
        self.assertEqual(argv[-1], '/usr/bin/python3 -I -B -')
        self.assertIn(str(self.admin), argv)
        return subprocess.CompletedProcess(argv, self.code, self.reply)

    def invoke(self, **kwargs):
        return refresh.refresh(self.commit_b, home=self.home, run=kwargs.get('run', self.runner),
                               reader=kwargs.get('reader', self.reader))

    def assert_preserved(self):
        for path, (raw, info) in self.before.items():
            self.assertEqual(path.read_bytes(), raw)
            self.assertEqual(refresh.identity(path.stat()), info)
        for path in self.temporary_hosts:
            self.assertFalse(path.parent.exists())
        self.assertFalse(list(self.folder.glob('refresh-host-*')))

    def public_main(self, *, run=None, reader=None):
        output = io.StringIO()
        with redirect_stdout(output), patch.object(Path, 'home', return_value=self.home), \
                patch.object(refresh, 'public_file', side_effect=reader or self.reader), \
                patch.object(refresh.subprocess, 'run', side_effect=run or self.runner):
            code = refresh.main(['--source-commit', self.commit_b, '--approve-grant-refresh',
                                 '--approve-exact-cancelled-cleanup'])
        return code, json.loads(output.getvalue())

    def test_exact_payload_and_existing_files_preserved_without_private_reads(self):
        opened = []
        original_open = os.open

        def public_only(path, flags, *args, **kwargs):
            opened.append(Path(path))
            self.assertNotIn(Path(path), (self.key, self.admin))
            if flags & (os.O_WRONLY | os.O_RDWR | os.O_CREAT | os.O_TRUNC):
                self.assertEqual(Path(path).name, 'known_hosts')
                self.assertEqual(Path(path).parent.parent, self.folder)
                self.assertTrue(flags & os.O_EXCL)
                self.assertTrue(flags & os.O_NOFOLLOW)
            elif Path(path) not in (self.public, self.trust):
                self.assertTrue(Path(path).name.startswith('refresh-host-'))
            return original_open(path, flags, *args, **kwargs)

        with patch('os.open', side_effect=public_only), patch('builtins.open', side_effect=AssertionError('unexpected open')):
            observed = self.invoke()
        self.assertEqual(observed, result())
        self.assertTrue(opened)
        self.assert_preserved()
        self.assertEqual(len(self.downloads), 4)
        self.assertEqual(len(self.calls), 3)
        program = self.calls[1][1]['input']
        payload = ast.literal_eval(program.splitlines()[0].removeprefix('PAYLOAD = '))
        self.assertEqual(set(payload), {'files', 'public_key'})
        self.assertEqual(payload['public_key'], rsa_public().strip())
        self.assertEqual(set(payload['files']), {'dispatcher.py', 'status.py'}
                         | {'update-initial-edit-v1/' + name for name in self.package}
                         | {'update-initial-edit-v1/oracle_construction_launch.py'})
        self.assertEqual(len(payload['files']), 45)
        self.assertNotIn('INERT_DEDICATED_PRIVATE', program)
        self.assertNotIn('INERT_ADMIN_PRIVATE', program)
        self.assertTrue(all(argv[-1] not in ('apply-b6dce84d', 'apply-initial-edit-v1') for argv, _ in self.calls))

    def test_both_ssh_calls_disable_alternate_auth_trust_and_execution_routes(self):
        self.invoke()
        required = {'IdentitiesOnly=yes', 'IdentityAgent=none', 'StrictHostKeyChecking=yes',
                    'GlobalKnownHostsFile=/dev/null',
                    'HostKeyAlgorithms=rsa-sha2-512,rsa-sha2-256', 'UpdateHostKeys=no',
                    'VerifyHostKeyDNS=no', 'CheckHostIP=yes', 'PreferredAuthentications=publickey',
                    'PasswordAuthentication=no', 'KbdInteractiveAuthentication=no', 'ForwardAgent=no',
                    'ForwardX11=no', 'ClearAllForwardings=yes', 'Tunnel=no', 'RequestTTY=no',
                    'PermitLocalCommand=no', 'ProxyCommand=none', 'ProxyJump=none',
                    'ControlMaster=no', 'ControlPath=none', 'ControlPersist=no', 'CertificateFile=none',
                    'ConnectionAttempts=1', 'AddKeysToAgent=no'}
        for argv, kwargs in self.calls[1:]:
            self.assertTrue(required <= set(argv))
            self.assertEqual(argv[1:4], ['-F', '/dev/null', '-T'])
            self.assertEqual(kwargs['cwd'], '/')
        self.assertNotIn('-n', self.calls[1][0])
        self.assertIn('-n', self.calls[2][0])
        self.assertEqual(self.temporary_hosts[0], self.temporary_hosts[1])

    def test_missing_or_partial_key_pair_does_not_generate_or_download(self):
        for path in (self.key, self.public, self.admin, self.trust):
            with self.subTest(path=path):
                saved = path.with_name(path.name + '.saved')
                path.rename(saved)
                try:
                    with self.assertRaises((refresh.RefreshError, FileNotFoundError)):
                        self.invoke()
                    self.assertFalse(self.calls)
                    self.assertFalse(self.downloads)
                    self.assertFalse(path.exists())
                finally:
                    saved.rename(path)

    def test_linked_private_key_and_unsafe_permissions_refuse(self):
        original = self.key.with_name('original')
        self.key.rename(original)
        self.key.symlink_to(original)
        with self.assertRaises(refresh.RefreshError):
            self.invoke()
        self.key.unlink()
        original.rename(self.key)
        self.key.chmod(0o644)
        with self.assertRaises(refresh.RefreshError):
            self.invoke()
        self.assertFalse(self.calls)
        self.assertFalse(self.downloads)

    def test_wrong_public_key_size_comment_or_wire_encoding_refuses(self):
        for value in (rsa_public(2048), rsa_public(comment='different'), rsa_public() + '\n',
                      'ssh-rsa AAAA ' + refresh.KEY_COMMENT, rsa_public().replace('ssh-rsa', 'ssh-ed25519', 1)):
            with self.subTest(value=value[:30]):
                self.public.write_text(value)
                with self.assertRaises((refresh.RefreshError, ValueError)):
                    self.invoke()
        self.assertFalse(self.calls)
        self.assertFalse(self.downloads)

    def test_known_host_lookup_supports_hashed_records_without_rewriting_trust(self):
        def hashed(argv, **kwargs):
            value = self.runner(argv, **kwargs)
            if argv[0] == '/usr/bin/ssh-keygen':
                value.stdout = '# Host found\n|1|salt|digest ' + self.server_key
            return value
        self.assertEqual(self.invoke(run=hashed), result())
        self.assert_preserved()

    def test_original_non_rsa_trust_uses_approved_temporary_rsa_pin(self):
        # Public wire-format fixtures: an ED25519 public value and the NIST P-256
        # base point. Neither fixture is used as a credential or SSH host pin.
        point = bytes.fromhex('04'
            '6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296'
            '4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5')
        for algorithm, words in (('ssh-ed25519', [bytes(range(32))]),
                                 ('ecdsa-sha2-nistp256', [b'nistp256', point])):
            with self.subTest(algorithm=algorithm):
                fields = [algorithm.encode(), *words]
                key = b64(b''.join(len(value).to_bytes(4, 'big') + value for value in fields))
                self.lookup = refresh.TARGET + ' ' + algorithm + ' ' + key + '\n'
                self.trust.write_text(self.lookup)
                self.before[self.trust] = (self.trust.read_bytes(), refresh.identity(self.trust.stat()))
                self.assertEqual(self.invoke(), result())
                self.assert_preserved()

    def test_unknown_or_multiple_different_server_rsa_keys_refuse_before_download(self):
        for output in ('', refresh.TARGET + ' unknown-algorithm fixture\n',
                       refresh.TARGET + ' ssh-rsa invalid\n',
                       refresh.TARGET + ' ' + self.server_key + refresh.TARGET + ' ssh-rsa invalid\n',
                       '@revoked ' + refresh.TARGET + ' ' + self.server_key):
            with self.subTest(output=output[:30]):
                run = Mock(return_value=subprocess.CompletedProcess([], 0, output))
                with self.assertRaises(refresh.RefreshError):
                    self.invoke(run=run)
                self.assertEqual(run.call_count, 1)
        self.assertFalse(self.downloads)

    def test_changed_compiled_host_identity_refuses_before_local_reads_or_ssh(self):
        for value in (refresh.SERVER_KNOWN_HOST.replace(refresh.TARGET, '192.0.2.1'),
                      refresh.SERVER_KNOWN_HOST.replace('ssh-rsa', 'ssh-ed25519'),
                      refresh.SERVER_KNOWN_HOST + 'extra\n',
                      refresh.SERVER_KNOWN_HOST.replace('AAAAB3', 'AAAAB4')):
            with self.subTest(value=value[:25]), patch.object(refresh, 'SERVER_KNOWN_HOST', value), \
                    patch.object(refresh, 'owned_path') as inspect:
                code, observed = self.public_main()
                self.assertEqual(code, 1)
                self.assertEqual(observed, refresh.failure('local_preflight', 'host_pin_mismatch'))
                inspect.assert_not_called()
        self.assertFalse(self.calls)
        self.assertFalse(self.downloads)

    def test_unfrozen_pins_and_nonimmutable_source_fail_before_reads(self):
        with patch.object(refresh, 'owned_path') as inspect, patch.object(refresh, 'SOURCE_COMMIT', 'PENDING_REVIEW'):
            with self.assertRaises(refresh.RefreshError):
                self.invoke()
            inspect.assert_not_called()
        for commit in (None, 'main', 'A' * 40, 'b' * 39, self.commit_b + '\n'):
            with patch.object(refresh, 'owned_path') as inspect:
                with self.assertRaises(refresh.RefreshError):
                    refresh.refresh(commit, home=self.home, reader=self.reader, run=self.runner)
                inspect.assert_not_called()
        self.assertFalse(self.calls)
        self.assertFalse(self.downloads)

    def test_changed_download_refuses_before_any_ssh(self):
        for name in ('refresh_receiver.py', 'dispatcher.py', 'status.py', 'oracle_construction_launch.py'):
            with self.subTest(name=name):
                self.calls.clear()
                def tampered(commit, path, expected):
                    raw = self.reader(commit, path, expected)
                    return raw + b'# changed\n' if path.endswith('/' + name) else raw
                with self.assertRaises(refresh.RefreshError):
                    self.invoke(reader=tampered)
                self.assertEqual(len(self.calls), 1)

    def test_refused_rolled_back_and_unconfirmed_do_not_retry_or_run_status(self):
        for kind in ('refused', 'rolled_back', 'unconfirmed'):
            with self.subTest(kind=kind):
                self.calls.clear()
                self.reply, self.code = json.dumps(result(kind)), 1
                self.assertEqual(self.invoke(), result(kind))
                self.assertEqual(len(self.calls), 2)
                self.assert_preserved()

    def test_ssh_failure_timeout_and_private_output_are_not_retried(self):
        for failure in (subprocess.CompletedProcess([], 255, 'private transport error'),
                        subprocess.TimeoutExpired('private command', 180, output='private output')):
            calls = []
            def failed(argv, **kwargs):
                calls.append(argv)
                if argv[0] == '/usr/bin/ssh-keygen':
                    return self.runner(argv, **kwargs)
                if isinstance(failure, Exception):
                    raise failure
                return failure
            with self.assertRaises((refresh.RefreshError, ValueError, subprocess.TimeoutExpired)):
                self.invoke(run=failed)
            self.assertEqual(len(calls), 2)
            self.assert_preserved()

    def test_status_failure_cannot_claim_ready_or_retry_refresh(self):
        def denied(argv, **kwargs):
            value = self.runner(argv, **kwargs)
            if argv[-1] == 'status':
                value.returncode = 255
            return value
        with self.assertRaises(refresh.RefreshError):
            self.invoke(run=denied)
        self.assertEqual(len(self.calls), 3)
        self.assert_preserved()

    def test_public_file_changes_before_ssh_prevent_remote_refresh(self):
        def changed(commit, path, expected):
            raw = self.reader(commit, path, expected)
            if path == refresh.LAUNCHER_PATH:
                self.trust.write_text('# changed trust\n')
            return raw
        with self.assertRaises(refresh.RefreshError):
            self.invoke(reader=changed)
        self.assertEqual(len(self.calls), 1)

    def test_nonpublic_reads_are_refused_even_when_called_directly(self):
        with patch('os.open') as opened:
            for path in (self.key, self.admin, self.home / 'other'):
                with self.assertRaises(refresh.RefreshError):
                    refresh.read_public(path, self.home, 16384)
            opened.assert_not_called()

    def test_home_with_ssh_path_expansion_or_multiple_trust_paths_is_refused(self):
        for suffix in (' space', '%d', '${HOME}', '"quoted', '\\escape'):
            home = self.home / ('unsafe' + suffix)
            with patch.object(Path, 'lstat') as inspect:
                with self.assertRaises(refresh.RefreshError):
                    refresh.owned_path(home / '.ssh/known_hosts', home)
                inspect.assert_not_called()

    def test_package_extra_missing_or_changed_blob_refuses(self):
        for package in ({}, {**self.package, 'extra.py': b64(self.package_raw)},
                        {**self.package, 'package0.py': b64(b'# changed\n')}):
            source = ('FILES = ' + repr(self.manifest) + '\ndef package(commit):\n    return '
                      + repr(b64(json.dumps(package).encode())) + '\n').encode()
            with self.assertRaises(refresh.RefreshError):
                refresh.package_files(source)

    def test_public_diagnostics_distinguish_boundaries_without_private_output(self):
        def failed_download(*_args):
            raise OSError('PRIVATE_DOWNLOAD_DETAIL')

        def transport(argv, **kwargs):
            if argv[0] == '/usr/bin/ssh-keygen':
                return self.runner(argv, **kwargs)
            self.calls.append((argv, kwargs))
            return subprocess.CompletedProcess(argv, 255, 'PRIVATE_TRANSPORT_DETAIL')

        def malformed(argv, **kwargs):
            value = self.runner(argv, **kwargs)
            if argv[-1] != 'status' and argv[0] == '/usr/bin/ssh':
                value.stdout = 'PRIVATE_RESPONSE_DETAIL'
            return value

        def timed_out(argv, **kwargs):
            if argv[0] == '/usr/bin/ssh-keygen':
                return self.runner(argv, **kwargs)
            self.calls.append((argv, kwargs))
            raise subprocess.TimeoutExpired('PRIVATE_COMMAND', 180, output='PRIVATE_OUTPUT')

        def status_denied(argv, **kwargs):
            value = self.runner(argv, **kwargs)
            if argv[-1] == 'status':
                value.returncode, value.stdout = 255, 'PRIVATE_STATUS_DETAIL'
            return value

        cases = (({'reader': failed_download}, 'download', 'package_unavailable', 1),
                 ({'run': transport}, 'ssh', 'transport_failed', 2),
                 ({'run': malformed}, 'ssh', 'invalid_response', 2),
                 ({'run': timed_out}, 'ssh', 'timeout', 2),
                 ({'run': status_denied}, 'post_status', 'status_not_confirmed', 3))
        for kwargs, stage, error, count in cases:
            with self.subTest(stage=stage, error=error):
                self.calls.clear()
                code, observed = self.public_main(**kwargs)
                self.assertEqual(code, 1)
                self.assertEqual(observed, refresh.failure(stage, error))
                self.assertEqual(len(self.calls), count)
                self.assert_preserved()

    def test_public_diagnostics_identify_missing_key_and_unknown_local_failure(self):
        saved = self.key.with_name('saved-key')
        self.key.rename(saved)
        try:
            code, observed = self.public_main()
            self.assertEqual((code, observed), (1, refresh.failure('local_preflight', 'missing_local_file')))
        finally:
            saved.rename(self.key)
        with patch.object(refresh, 'public_key', side_effect=RuntimeError('PRIVATE_KEY_DETAIL')):
            code, observed = self.public_main()
        self.assertEqual((code, observed), (1, refresh.failure('local_preflight', 'local_check_failed')))
        self.assertFalse(self.calls)
        self.assertFalse(self.downloads)

    def test_identity_change_even_with_same_public_bytes_prevents_ready(self):
        for path in (self.key, self.admin, self.public, self.trust):
            with self.subTest(path=path):
                original = self.before[path][0]

                def changed(argv, **kwargs):
                    value = self.runner(argv, **kwargs)
                    if argv[-1] == '/usr/bin/python3 -I -B -':
                        replacement = path.with_name(path.name + '.replacement')
                        replacement.write_bytes(original)
                        replacement.chmod(path.stat().st_mode & 0o777)
                        replacement.replace(path)
                    return value

                self.calls.clear()
                code, observed = self.public_main(run=changed)
                self.assertEqual((code, observed), (1, refresh.failure('preservation', 'local_files_changed')))
                self.assertEqual(len(self.calls), 2)
                self.before[path] = (original, refresh.identity(path.stat()))
                self.assert_preserved()

    def test_temporary_trust_change_prevents_ssh_and_cleans_up(self):
        def changed(commit, path, expected):
            raw = self.reader(commit, path, expected)
            if path == refresh.LAUNCHER_PATH:
                temporary = next(self.folder.glob('refresh-host-*/known_hosts'))
                temporary.write_text('PRIVATE_UNEXPECTED_TRUST')
            return raw
        code, observed = self.public_main(reader=changed)
        self.assertEqual((code, observed), (1, refresh.failure('preservation', 'local_files_changed')))
        self.assertEqual(len(self.calls), 1)
        self.assert_preserved()

    def test_signals_during_ssh_clean_private_trust_and_never_retry(self):
        for number in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP):
            with self.subTest(signal=number):
                before = signal.getsignal(number)

                def interrupted(argv, **kwargs):
                    value = self.runner(argv, **kwargs)
                    if argv[-1] == '/usr/bin/python3 -I -B -':
                        signal.getsignal(number)(number, None)
                    return value

                self.calls.clear()
                code, observed = self.public_main(run=interrupted)
                self.assertEqual((code, observed), (1, refresh.failure('ssh', 'interrupted')))
                self.assertEqual(len(self.calls), 2)
                self.assertIs(signal.getsignal(number), before)
                self.assert_preserved()

    def test_cleanup_failure_after_remote_success_is_preservation_not_preflight(self):
        cleanup = tempfile.TemporaryDirectory.cleanup

        def unconfirmed(temporary):
            cleanup(temporary)
            raise OSError('PRIVATE_CLEANUP_DETAIL')

        with patch.object(tempfile.TemporaryDirectory, 'cleanup', unconfirmed):
            code, observed = self.public_main()
        self.assertEqual((code, observed), (1, refresh.failure('preservation', 'local_files_changed')))
        self.assertEqual(len(self.calls), 3)
        self.assert_preserved()

    def test_public_success_and_remote_refusal_keep_receiver_contract_distinct(self):
        code, observed = self.public_main()
        self.assertEqual((code, observed), (0, {**result(), 'stage': 'complete', 'error': None}))
        for kind in ('refused', 'rolled_back', 'unconfirmed'):
            with self.subTest(kind=kind):
                self.calls.clear()
                self.reply, self.code = json.dumps(result(kind)), 1
                code, observed = self.public_main()
                self.assertEqual((code, observed), (1, {**result(kind), 'stage': 'remote_refusal', 'error': kind}))
                self.assertEqual(len(self.calls), 2)
                self.assert_preserved()


class RefreshPublicBoundaryTests(unittest.TestCase):
    def test_plan_only_has_no_local_reads_network_subprocess_or_refresh(self):
        output = io.StringIO()
        with redirect_stdout(output), patch.object(refresh, 'refresh') as apply, patch('os.open') as opened, \
                patch.object(Path, 'lstat') as inspect, patch('subprocess.run') as run, \
                patch('urllib.request.build_opener') as network, patch.object(Path, 'home') as home:
            self.assertEqual(refresh.main([]), 0)
        for call in (apply, opened, inspect, run, network, home):
            call.assert_not_called()
        self.assertEqual(json.loads(output.getvalue()),
                         {'phase': 'PLAN_ONLY', 'keys_changed': False, 'runtime_changed': False})

    def test_each_approval_alone_and_unknown_arguments_are_private_fail_closed(self):
        for args in (['--approve-grant-refresh'], ['--approve-exact-cancelled-cleanup'],
                     ['--host', 'PRIVATE_TARGET'], ['--source-commit'], ['--approve-grant']):
            output = io.StringIO()
            with redirect_stderr(output), patch.object(refresh, 'refresh') as apply:
                with self.assertRaises(SystemExit) as stopped:
                    refresh.main(args)
            self.assertEqual(stopped.exception.code, 2)
            self.assertEqual(output.getvalue(), 'STOP: invalid refresh arguments; no connection made.\n')
            apply.assert_not_called()

    def test_main_prints_only_finite_failure_after_any_private_exception(self):
        for error in (RuntimeError('private key text'), KeyboardInterrupt()):
            output = io.StringIO()
            with redirect_stdout(output), patch.object(refresh, 'refresh', side_effect=error) as apply:
                code = refresh.main(['--source-commit', 'a' * 40, '--approve-grant-refresh',
                                     '--approve-exact-cancelled-cleanup'])
            self.assertEqual(code, 1)
            self.assertEqual(json.loads(output.getvalue()), refresh.failure('unknown',
                'interrupted' if isinstance(error, KeyboardInterrupt) else 'unconfirmed'))
            apply.assert_called_once_with('a' * 40)

    def test_unknown_diagnostic_fields_cannot_reveal_data_or_break_json_boundary(self):
        for stage, error in (('PRIVATE_STAGE', 'PRIVATE_ERROR'), ('ssh', 'PRIVATE_ERROR'),
                             ('ssh', ['PRIVATE_ERROR']), (None, 'timeout')):
            output = io.StringIO()
            with redirect_stdout(output), patch.object(refresh, 'refresh',
                    side_effect=refresh.StageError(stage, error)):
                code = refresh.main(['--source-commit', 'a' * 40, '--approve-grant-refresh',
                                     '--approve-exact-cancelled-cleanup'])
            self.assertEqual((code, json.loads(output.getvalue())),
                             (1, refresh.failure('unknown', 'unconfirmed')))

    def test_result_schema_rejects_raw_extra_duplicate_and_inconsistent_fields(self):
        invalid = [{**result(), 'stdout': 'private'}, {**result(), 'keys_changed': 0},
                   {**result(), 'runtime_changed': True}, {**result(), 'old_apply_retired': 1},
                   {**result(), 'old_apply_retired': False}, {**result(), 'result': 'rolled_back'},
                   {**result(), 'phase': refresh.NOT_CONFIRMED}, ['private']]
        for value in invalid:
            with self.subTest(value=value), self.assertRaises(refresh.RefreshError):
                refresh.safe_result(value, 0)
        for code in (1, 255, False):
            with self.assertRaises(refresh.RefreshError):
                refresh.safe_result(result(), code)
        for value in ('{"phase":"x","phase":"y"}', 'x' * (refresh.WIRE_LIMIT + 1)):
            with self.assertRaises(refresh.RefreshError):
                refresh.parse_result(value)
        self.assertEqual(refresh.safe_result(result('already_refreshed'), 0), result('already_refreshed'))

    def test_network_reader_refuses_unpinned_commit_path_or_digest_without_network(self):
        with patch('urllib.request.build_opener') as network:
            for commit, path, digest in [('main', refresh.LAUNCHER_PATH, 'a' * 64),
                                         ('a' * 40, '/etc/passwd', 'a' * 64),
                                         ('a' * 40, refresh.LAUNCHER_PATH, 'PENDING')]:
                with self.assertRaises(refresh.RefreshError):
                    refresh.public_file(commit, path, digest)
            network.assert_not_called()
        self.assertIsNone(refresh.NoRedirect().redirect_request(None, None, None, None, None, None))

    def test_public_download_bound_status_and_checksum(self):
        raw = b'# inert source\n'
        expected = hashlib.sha256(raw).hexdigest()
        response = Mock(status=200)
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=False)
        response.read.return_value = raw
        opener = Mock()
        opener.open.return_value = response
        with patch('urllib.request.build_opener', return_value=opener):
            self.assertEqual(refresh.public_file('a' * 40, refresh.LAUNCHER_PATH, expected), raw)
        response.read.assert_called_once_with(refresh.LIMIT + 1)
        opener.open.assert_called_once_with(refresh.PUBLIC_ROOT + 'a' * 40 + '/' + refresh.LAUNCHER_PATH, timeout=30)


if __name__ == '__main__':
    unittest.main()
