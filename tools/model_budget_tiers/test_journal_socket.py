"""Kernel journal identity proof and fail-closed fence regression fixtures.

Real socket tests use only disposable local UNIX streams; they never contact
Oracle or the real journal, touch model files, run systemctl or signal services.
"""
from contextlib import contextmanager
import copy
import hashlib
import importlib.util
import os
from pathlib import Path
import socket
import stat
import struct
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import journal_socket as journal
import install_tiers as installer


class KernelJournalFixture(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='worldifact-journal-proof-')
        self.addCleanup(self.temporary.cleanup)
        self.path = str(Path(self.temporary.name) / 'stdout')
        self.listener = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.addCleanup(self.listener.close)
        self.listener.bind(self.path)
        self.listener.listen()
        self.client = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.addCleanup(self.client.close)
        self.client.connect(self.path)
        self.peer, _ = self.listener.accept()
        self.addCleanup(self.peer.close)
        self.inode = os.fstat(self.client.fileno()).st_ino
        info = os.lstat(self.path)
        self.vfs = [info.st_ino, (os.major(info.st_dev) << 20) | os.minor(info.st_dev)]

    @contextmanager
    def fixture_path(self):
        # Only the protected-filesystem anchor is substituted in this disposable
        # fixture. Query parsing, kernel peer/VFS/cookies and replay stay real.
        yield self.vfs

    def test_real_kernel_pair_cookies_vfs_and_replay(self):
        with patch.object(journal, 'PATH', self.path), patch.object(journal, 'journal_path', self.fixture_path):
            proof = journal.prove({'1': self.inode, '2': self.inode})
            self.assertEqual(proof['vfs'], self.vfs)
            self.assertEqual(journal.prove({'1': self.inode, '2': self.inode}, proof), proof)
            bad = copy.deepcopy(proof)
            bad['pairs'][str(self.inode)]['client_cookie'][0] ^= 1
            with self.assertRaises((journal.JournalUnproven, OSError)):
                journal.prove({'1': self.inode, '2': self.inode}, bad)

    def test_other_named_unix_stream_never_proves_real_journal(self):
        with patch.object(journal, 'journal_path', self.fixture_path):
            with self.assertRaises(journal.JournalUnproven):
                journal.prove({'1': self.inode, '2': self.inode})

    def test_stale_or_wrong_inode_and_peer_cookie_refused(self):
        value = journal.query(self.inode)
        with self.assertRaises((journal.JournalUnproven, OSError)):
            journal.query(self.inode, [value['cookie'][0] ^ 1, value['cookie'][1]])
        with self.assertRaises(journal.JournalUnproven):
            journal.query(os.fstat(self.listener.fileno()).st_ino)
        self.peer.close()
        with self.assertRaises((journal.JournalUnproven, OSError)):
            journal.query(self.inode)


class JournalProtocol(unittest.TestCase):
    def response(self, attributes=None, **overrides):
        fields = {'size': None, 'kind': 20, 'flags': 0, 'seq': 1, 'sender': 123,
                  'family': socket.AF_UNIX, 'socktype': socket.SOCK_STREAM, 'state': 1,
                  'pad': 0, 'ino': 55, 'low': 77, 'high': 0}
        fields.update(overrides)
        def attribute(kind, content):
            value = struct.pack('=HH', 4 + len(content), kind) + content
            return value + b'\0' * (-len(value) % 4)
        payload = struct.pack('=BBBBIII', *(fields[k] for k in ('family','socktype','state','pad','ino','low','high')))
        payload += b''.join(attribute(k,v) for k,v in (attributes or [(2,struct.pack('=I',66))]))
        return struct.pack('=IHHII', fields['size'] or (16+len(payload)), *(fields[k] for k in ('kind','flags','seq','sender'))) + payload

    def test_bad_identity_truncated_duplicate_and_missing_peer_refused(self):
        good = self.response()
        self.assertEqual(journal._decode(good, 1, 123, 55)['peer'], 66)
        for value in [good[:-1],good+b'\0',self.response(seq=9),self.response(sender=0),
                      self.response(state=10),self.response(socktype=socket.SOCK_DGRAM),
                      self.response(ino=56),self.response(low=0),self.response(low=0xffffffff,high=0xffffffff),
                      self.response([(2,struct.pack('=I',66)),(2,struct.pack('=I',66))]),
                      self.response([(0,b'x\0')]),self.response([(2,b'123')]),
                      self.response([(2,struct.pack('=I',55))]),self.response(flags=2)]:
            with self.subTest(packet=value):
                with self.assertRaises(journal.JournalUnproven):
                    journal._decode(value, 1, 123, 55)

    def test_reciprocal_peer_name_vfs_and_reuse_all_required(self):
        client = {'inode':55,'cookie':[77,0],'peer':66}
        peer = {'inode':66,'cookie':[78,0],'peer':55,'name':journal.PATH.encode()+b'\0','vfs':[100,2]}
        @contextmanager
        def anchor(): yield [100,2]
        cases = [({**peer,'peer':99},client),({**peer,'vfs':[101,2]},client),
                 ({**peer,'name':b'\0'+journal.PATH.encode()},client),
                 (peer,{**client,'name':journal.PATH.encode()+b'\0'}),
                 ({k:v for k,v in peer.items() if k!='vfs'},client)]
        for bad_peer,bad_client in cases:
            with patch.object(journal,'journal_path',anchor),patch.object(journal,'query',side_effect=[bad_client,bad_peer]):
                with self.assertRaises(journal.JournalUnproven):journal.prove({'1':55,'2':55})
        with patch.object(journal,'journal_path',anchor),patch.object(journal,'query',side_effect=[client,peer,{**client,'cookie':[88,0]}]):
            with self.assertRaises(journal.JournalUnproven):journal.prove({'1':55,'2':55})


class JournalPath(unittest.TestCase):
    def fixture(self):
        temp = tempfile.TemporaryDirectory(prefix='worldifact-secure-journal-')
        self.addCleanup(temp.cleanup)
        # /tmp itself is intentionally insecure, so this test proves rejection
        # even when the leaf is owned by root and superficially a socket.
        path = Path(temp.name)/'stdout'
        listener = socket.socket(socket.AF_UNIX,socket.SOCK_STREAM)
        self.addCleanup(listener.close)
        listener.bind(str(path))
        return path

    def test_secure_path_anchor_rechecks_identity_permissions_and_symlinks(self):
        def info(inode, mode, uid=0):
            return SimpleNamespace(st_ino=inode, st_dev=os.makedev(0, 2), st_mode=mode, st_uid=uid)
        initial = [info(n, stat.S_IFDIR | 0o755) for n in range(1, 5)] + [info(5, stat.S_IFSOCK | 0o666)]
        for alteration in ('none', 'mode', 'owner', 'replacement', 'symlink'):
            values = copy.deepcopy(initial)
            opens = iter(range(5))
            def fstat(fd): return values[fd]
            def current(name, *, dir_fd, follow_symlinks): return values[dir_fd + 1]
            with patch.object(journal.os, 'open', side_effect=lambda *args, **kwargs:next(opens)), patch.object(journal.os,'close'), patch.object(journal.os,'fstat',side_effect=fstat), patch.object(journal.os,'lstat',side_effect=lambda path:values[0]), patch.object(journal.os,'stat',side_effect=current):
                def exercise():
                    with journal.journal_path() as value:
                        self.assertEqual(value,[5,2])
                        if alteration=='mode': values[2].st_mode |= 0o002
                        elif alteration=='owner': values[2].st_uid = 1000
                        elif alteration=='replacement': values[4].st_ino += 1
                        elif alteration=='symlink': values[2].st_mode = stat.S_IFLNK | 0o777
                if alteration=='none': exercise()
                else:
                    with self.assertRaises(journal.JournalUnproven):exercise()

    def test_world_writable_ancestor_refused(self):
        with patch.object(journal,'PATH',str(self.fixture())):
            with self.assertRaises(journal.JournalUnproven):
                with journal.journal_path():self.fail('unsafe path admitted')


class FenceJournalIntegration(unittest.TestCase):
    def setUp(self):
        self.fence = installer.maintenance_fence()
        self.unit={'StandardOutput':'journal','StandardError':'inherit'}
        self.proof={'fds':{'1':55,'2':55},'vfs':[100,2],'pairs':{'55':{'client_cookie':[77,0],'peer_inode':66,'peer_cookie':[78,0]}}}

    def test_nonsocket_stdio_preserves_original_strict_listener_path(self):
        with patch.object(self.fence,'_fd_sockets',return_value={'3':99}):
            self.assertIsNone(self.fence._journal_snapshot(100,{'StandardOutput':'file','StandardError':'inherit'}))
            with self.assertRaises(self.fence.FenceRefused):
                self.fence._journal_snapshot(100,self.unit,self.proof)

    def test_pinned_helper_loaded_and_modified_helper_refused(self):
        helper=self.fence._journal_helper()
        self.assertEqual(helper.PATH,journal.PATH)
        raw=Path(journal.__file__).read_bytes()
        with patch.object(self.fence,'_regular',return_value=(raw+b'\n',None)):
            with self.assertRaises(self.fence.FenceRefused) as error:self.fence._journal_helper()
        self.assertEqual(error.exception.code,'journal_helper_unproven')

    def test_only_exact_stdio_inheritance_exempt(self):
        helper=type('Helper',(),{'prove':staticmethod(lambda fds,expected:self.proof)})
        for mapping,unit in [({'1':55,'2':56},self.unit),({'1':55},self.unit),({'1':55,'2':55},{**self.unit,'StandardOutput':'socket'})]:
            with patch.object(self.fence,'_fd_sockets',return_value=mapping),patch.object(self.fence,'_journal_helper',return_value=helper):
                with self.assertRaises(self.fence.FenceRefused):self.fence._journal_snapshot(100,unit)
        with patch.object(self.fence,'_fd_sockets',side_effect=[{'1':55,'2':55},{'1':55,'2':56}]),patch.object(self.fence,'_journal_helper',return_value=helper):
            with self.assertRaises(self.fence.FenceRefused):self.fence._journal_snapshot(100,self.unit)

    def test_extra_duplicate_accepted_tcp_and_unknown_socket_still_refused(self):
        header='header\n'
        listener='0: 0100007F:223D 00000000:0000 0A 0 0 0 0 0 99\n'
        accepted='1: 0100007F:223D 0100007F:9999 01 0 0 0 0 0 100\n'
        def tables(path):return header+(listener+accepted if path.name=='tcp' else '')
        baseline={'1':55,'2':55,'3':99}
        with patch.object(Path,'read_text',tables),patch.object(self.fence,'_journal_snapshot',return_value=self.proof):
            with patch.object(self.fence,'_fd_sockets',return_value=baseline):self.fence._socket_idle(100,self.unit,self.proof)
            for extra in (55,100,101):
                with patch.object(self.fence,'_fd_sockets',return_value={**baseline,'4':extra}):
                    with self.assertRaises(self.fence.FenceRefused):self.fence._socket_idle(100,self.unit,self.proof)

    def test_guard_replays_same_journal_before_term(self):
        import ast
        tree=ast.parse(Path(self.fence.__file__).read_text())
        guard=next(node for node in tree.body if isinstance(node,ast.FunctionDef) and node.name=='_guard_stop')
        calls=[node.func.id if isinstance(node.func,ast.Name) else ast.unparse(node.func) for node in ast.walk(guard) if isinstance(node,ast.Call)]
        self.assertIn('_socket_idle',calls)
        # Exercise the refusal path: no signal may be sent after a changed peer.
        config={'source':'/fixture','files':{},'expected_sources':{},'worker':self.unit,'tunnel':{},'pid':123,'ticks':1,'journal':self.proof}
        with patch.object(self.fence,'_same_files'),patch.object(self.fence,'_source'),patch.object(self.fence,'_same_worker'),patch.object(self.fence,'_same_tunnel'),patch.object(self.fence,'_default_term'),patch.object(self.fence,'_socket_idle',side_effect=self.fence.FenceRefused('journal_peer_unproven','changed')) as check,patch.object(self.fence.signal,'pidfd_send_signal') as signals:
            with self.assertRaises(self.fence.FenceRefused):self.fence._guard_stop(config,999,999999)
            check.assert_called_once_with(123,self.unit,self.proof)
            signals.assert_not_called()


if __name__=='__main__':unittest.main()
