"""Offline grant transaction tests. No SSH, credentials, providers or services."""
import base64
import fcntl
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import signal
import io
from contextlib import redirect_stdout
import struct
import tempfile
import unittest
from unittest.mock import patch

import refresh_receiver as receiver


def fixture_public():
    field = lambda value: struct.pack('>I', len(value)) + value
    raw = field(b'ssh-rsa') + field(b'\x01\x00\x01') + field(b'\x00\xff' + b'\xab' * 511)
    return 'ssh-rsa ' + base64.b64encode(raw).decode() + ' ' + receiver.COMMENT


def fixture_package(label):
    raw = ('# inert ' + label + '\n').encode()
    blob = hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()
    files = {('install_construction.py' if index == 0 else 'file_' + str(index) + '.py'): ('unused', blob)
             for index in range(42)}
    launcher = ('import hashlib\nFILES = ' + repr(files) + '\n'
                "def blob(raw): return hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\\0' + raw).hexdigest()\n").encode()
    return {**{name: raw for name in files}, 'oracle_construction_launch.py': launcher}


class RefreshTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name)
        self.root = self.home / receiver.ACCESS_ROOT
        self.root.mkdir(parents=True, mode=0o700)
        self.source = self.home / 'froge-connector'
        self.source.mkdir()
        (self.source / 'state').mkdir()
        self.database = self.source / 'state/jobs.sqlite'
        with sqlite3.connect(self.database) as connection:
            connection.execute('CREATE TABLE jobs (id TEXT, state TEXT, prompt TEXT)')
            connection.execute("INSERT INTO jobs VALUES ('fixture-cancelled', 'cancelled', 'PRIVATE_PROMPT')")
        self.old = {'dispatcher.py': b'# old dispatcher\n', 'status.py': b'# old status\n'}
        self.new = {'dispatcher.py': b'# new dispatcher\n', 'status.py': b'# new status\n'}
        self.old_package, self.new_package = fixture_package('old'), fixture_package('new')
        for name, raw in self.old.items():
            (self.root / name).write_bytes(raw)
        (self.root / 'update').mkdir(mode=0o700)
        for name, raw in self.old_package.items():
            (self.root / 'update' / name).write_bytes(raw)
        (self.root / '.staging').mkdir(mode=0o700)
        (self.root / 'setup.lock').touch(mode=0o600)
        self.install_lock = self.home / '.local/state/worldifact-fast/installation.lock'
        self.install_lock.parent.mkdir(parents=True)
        self.install_lock.touch(mode=0o600)
        ssh = self.home / '.ssh'
        ssh.mkdir(mode=0o700)
        self.public = fixture_public()
        key = receiver.public_key(self.public)
        grant = 'restrict,command="/usr/bin/python3 -I -B ' + str(self.root / 'dispatcher.py') + '" ' + key + ' ' + receiver.COMMENT
        self.authorized = b'preserved-other-key\n' + grant.encode() + b'\n'
        (ssh / 'authorized_keys').write_bytes(self.authorized)
        self.private_key = self.home / 'id_rsa'
        self.private_key.write_text('INERT_PRIVATE_MUST_NOT_READ')
        self.files = {**self.new, **{receiver.NEW_PACKAGE + '/' + name: raw for name, raw in self.new_package.items()}}
        self.payload = {'public_key': self.public, 'files': {name: base64.b64encode(raw).decode() for name, raw in self.files.items()}}
        patches = [('SOURCE_COMMIT', 'a' * 40), ('OLD_DISPATCHER_SHA', receiver.sha(self.old['dispatcher.py'])),
                   ('OLD_STATUS_SHA', receiver.sha(self.old['status.py'])),
                   ('OLD_LAUNCHER_SHA', receiver.sha(self.old_package['oracle_construction_launch.py'])),
                   ('NEW_DISPATCHER_SHA', receiver.sha(self.new['dispatcher.py'])),
                   ('NEW_STATUS_SHA', receiver.sha(self.new['status.py'])),
                   ('NEW_LAUNCHER_SHA', receiver.sha(self.new_package['oracle_construction_launch.py']))]
        for name, value in patches:
            handle = patch.object(receiver, name, value)
            handle.start()
            self.addCleanup(handle.stop)
        self.host = patch.object(receiver, 'host_public')
        self.host.start()
        self.addCleanup(self.host.stop)
        self.runtime = patch.object(receiver, 'runtime_check')
        self.runtime_mock = self.runtime.start()
        self.addCleanup(self.runtime.stop)

    def run_refresh(self):
        return receiver.refresh(self.payload, self.home)

    def assert_original(self):
        self.assertEqual({name: (self.root / name).read_bytes() for name in self.old}, self.old)
        self.assertEqual((self.home / '.ssh/authorized_keys').read_bytes(), self.authorized)
        self.assertEqual({name: (self.root / 'update' / name).read_bytes() for name in self.old_package}, self.old_package)

    def test_refresh_is_idempotent_commits_dispatcher_last_and_preserves_keys(self):
        order, original = [], receiver.replace_known
        private_info = receiver.identity(self.private_key.stat())
        auth_info = receiver.identity((self.home / '.ssh/authorized_keys').stat())
        database = self.database.read_bytes()
        def replace(path, before, after, home, stage):
            order.append(path.name)
            for lock in (self.root / 'setup.lock', self.install_lock):
                with lock.open('rb') as stream:
                    with self.assertRaises(BlockingIOError):
                        fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
            with sqlite3.connect(self.database, timeout=0) as connection:
                with self.assertRaises(sqlite3.OperationalError):
                    connection.execute('BEGIN IMMEDIATE')
            original(path, before, after, home, stage)
        with patch.object(receiver, 'replace_known', side_effect=replace):
            self.assertEqual(self.run_refresh(), receiver.result('refreshed'))
        self.assertEqual(order, ['status.py', 'dispatcher.py'])
        self.assertEqual(self.run_refresh(), receiver.result('already_refreshed'))
        self.assertEqual(receiver.identity(self.private_key.stat()), private_info)
        self.assertEqual(receiver.identity((self.home / '.ssh/authorized_keys').stat()), auth_info)
        self.assertEqual(self.database.read_bytes(), database)
        self.assertEqual((self.root / receiver.BACKUP / 'dispatcher.py').read_bytes(), self.old['dispatcher.py'])
        self.assertFalse(any(path.name.startswith('.refresh-') for path in self.root.iterdir()))

    def test_wrong_old_grant_missing_members_unknown_files_or_key_refuse(self):
        changes = [self.root / 'dispatcher.py', self.root / 'status.py', self.root / 'update/file_1.py',
                   self.home / '.ssh/authorized_keys']
        for target in changes:
            before = target.read_bytes()
            target.write_bytes(b'# unknown\n')
            self.assertEqual(self.run_refresh()['result'], 'refused')
            self.assertEqual(target.read_bytes(), b'# unknown\n')
            target.write_bytes(before)
        extra = self.root / 'update/private_key.py'
        extra.write_text('PRIVATE_KEY_DO_NOT_OPEN')
        original = receiver.read
        def read(path, *args):
            self.assertNotEqual(path, extra)
            return original(path, *args)
        with patch.object(receiver, 'read', side_effect=read):
            self.assertEqual(self.run_refresh()['result'], 'refused')
        extra.unlink()
        self.payload['public_key'] = self.public.replace('q6ur', 'q6us', 1)
        self.assertEqual(self.run_refresh()['result'], 'refused')
        self.assert_original()

    def test_active_jobs_refuse_without_row_change(self):
        with sqlite3.connect(self.database) as connection:
            connection.execute("INSERT INTO jobs VALUES ('active', 'running', 'PRIVATE_PROMPT')")
        before = self.database.read_bytes()
        observed = self.run_refresh()
        self.assertEqual(observed, receiver.result('refused'))
        self.assertNotIn('PRIVATE', json.dumps(observed))
        self.assertEqual(self.database.read_bytes(), before)
        self.assert_original()

    def test_held_setup_or_installer_lock_refuses(self):
        for lock in (self.root / 'setup.lock', self.install_lock):
            with lock.open('rb') as stream:
                fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
                self.assertEqual(self.run_refresh()['result'], 'refused')
        self.assert_original()

    def test_symlink_hardlink_and_unsafe_permissions_refuse(self):
        target = self.root / 'update/file_1.py'
        old = target.read_bytes()
        for mode in ('symlink', 'hardlink', 'writable'):
            if mode != 'writable':
                target.unlink()
                if mode == 'symlink':
                    target.symlink_to(self.root / 'update/file_2.py')
                else:
                    os.link(self.root / 'update/file_2.py', target)
            else:
                target.chmod(0o666)
            self.assertEqual(self.run_refresh()['result'], 'refused')
            target.unlink()
            target.write_bytes(old)
        self.assert_original()

    def test_failure_after_either_write_rolls_back_while_locks_stay_held(self):
        original = receiver.replace_known
        for failed_name in ('status.py', 'dispatcher.py'):
            def fail(path, before, after, home, stage):
                original(path, before, after, home, stage)
                if path.name == failed_name and after == self.new[failed_name]:
                    raise ValueError('INTERNAL_PRIVATE_DETAIL')
            with patch.object(receiver, 'replace_known', side_effect=fail):
                observed = self.run_refresh()
            self.assertEqual(observed, receiver.result('rolled_back'))
            self.assert_original()
            self.assertEqual(self.run_refresh()['result'], 'refreshed')
            # Restore only fixtures for the second fault position.
            for name, raw in self.old.items():
                (self.root / name).write_bytes(raw)

    def test_unknown_concurrent_bytes_are_preserved_during_rollback(self):
        original = receiver.replace_known
        def interfere(path, before, after, home, stage):
            if path.name == 'dispatcher.py' and after == self.new['dispatcher.py']:
                (self.root / 'status.py').write_bytes(b'# unknown concurrent editor\n')
                raise ValueError('stop')
            original(path, before, after, home, stage)
        with patch.object(receiver, 'replace_known', side_effect=interfere):
            self.assertEqual(self.run_refresh(), receiver.result('unconfirmed'))
        self.assertEqual((self.root / 'status.py').read_bytes(), b'# unknown concurrent editor\n')
        self.assertEqual((self.root / 'dispatcher.py').read_bytes(), self.old['dispatcher.py'])
        self.assertEqual(self.run_refresh()['result'], 'refused')

    def test_no_replace_cannot_overwrite_concurrent_empty_directory(self):
        source, target = self.home / 'stage', self.home / 'target'
        source.mkdir(); target.mkdir()
        before = target.stat().st_ino
        with self.assertRaises(OSError):
            receiver.rename_absent(source, target)
        self.assertEqual(target.stat().st_ino, before)
        self.assertTrue(source.is_dir())

    def test_bad_new_checksum_and_unfrozen_release_refuse_before_host(self):
        for name, value in [('SOURCE_COMMIT', 'PENDING'), ('NEW_STATUS_SHA', 'PENDING'), ('NEW_LAUNCHER_SHA', '0' * 64)]:
            with patch.object(receiver, name, value), patch.object(receiver, 'host_public') as host:
                self.assertEqual(self.run_refresh()['result'], 'refused')
                host.assert_not_called()
        self.assert_original()

    def test_status_or_source_change_before_commit_refuses(self):
        self.runtime_mock.side_effect = [None, ValueError('PRIVATE_RUNTIME_DETAIL')]
        observed = self.run_refresh()
        self.assertEqual(observed, receiver.result('refused'))
        self.assert_original()

    def test_remote_result_exit_and_signal_handlers_are_consistent(self):
        original = signal.getsignal(signal.SIGHUP)
        output = io.StringIO()
        def interrupted(_payload):
            signal.getsignal(signal.SIGHUP)(signal.SIGHUP, None)
        with patch.object(receiver, 'refresh', side_effect=interrupted), redirect_stdout(output):
            self.assertEqual(receiver.main({}), 1)
        self.assertEqual(json.loads(output.getvalue()), receiver.result('unconfirmed'))
        self.assertIs(signal.getsignal(signal.SIGHUP), original)
        script = 'PAYLOAD = {}\n' + Path(receiver.__file__).read_text()
        child = subprocess.run(['/usr/bin/python3', '-I', '-B', '-'], input=script,
                               text=True, capture_output=True, timeout=5)
        self.assertEqual(child.returncode, 1)
        self.assertEqual(child.stderr, '')
        self.assertEqual(json.loads(child.stdout), receiver.result('refused'))

    def test_current_runtime_requires_complete_known_source_map_and_own_lock(self):
        expected = {'one.py': receiver.sha(b'# known source\n')}
        (self.source / 'one.py').write_bytes(b'# known source\n')
        raw = ("import os\nHELPERS_AFTER = {}\n"
               "def read_status(home): return {'observed_flock_holders': [{'pid': os.getpid()}], 'receipt_sha256': 'a' * 64}\n"
               "def classify(value): return 'ready_to_apply'\n").encode()
        self.runtime.stop()
        try:
            with patch.object(receiver, 'SOURCE_BEFORE', expected):
                self.assertEqual(receiver.runtime_check(self.home, raw), (expected, 'a' * 64))
                (self.source / 'one.py').write_bytes(b'# unknown source\n')
                with self.assertRaisesRegex(ValueError, 'unknown_runtime'):
                    receiver.runtime_check(self.home, raw)
                (self.source / 'one.py').write_bytes(b'# known source\n')
                bad = raw.replace(b"[{'pid': os.getpid()}]", b'[]')
                with self.assertRaisesRegex(ValueError, 'unexpected_lock_holders'):
                    receiver.runtime_check(self.home, bad)
        finally:
            self.runtime_mock = self.runtime.start()

    def test_unknown_backup_prevents_replacement(self):
        backup = self.root / receiver.BACKUP
        backup.mkdir(mode=0o700)
        (backup / 'status.py').write_bytes(b'# unknown\n')
        self.assertEqual(self.run_refresh()['result'], 'refused')
        self.assert_original()


if __name__ == '__main__':
    unittest.main()
