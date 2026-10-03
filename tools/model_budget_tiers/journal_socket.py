"""Read-only kernel proof for inherited systemd journal stdout streams.

Only AF_UNIX stream pairs with stable kernel cookies, reciprocal peers and the
root-owned journal stdout filesystem socket can qualify. No process memory,
environment, socket duplication, signals or connection establishment are used.
"""
from contextlib import contextmanager
import os
from pathlib import Path
import socket
import stat
import struct

PATH = '/run/systemd/journal/stdout'
U32 = 0xffffffff


class JournalUnproven(RuntimeError):
    pass


def _require(condition):
    if not condition:
        raise JournalUnproven('Inherited journal stream could not be proven.')


def _decode(data, sequence, port, inode):
    """Parse one exact SOCK_DIAG_BY_FAMILY response, never a truncated dump."""
    _require(32 <= len(data) <= 16384)
    size, kind, flags, seq, sender = struct.unpack_from('=IHHII', data)
    _require(size == len(data) and kind == 20 and flags == 0 and
             seq == sequence and sender == port)
    family, socktype, state, pad, ino, low, high = struct.unpack_from('=BBBBIII', data, 16)
    _require(family == socket.AF_UNIX and socktype == socket.SOCK_STREAM and
             state == 1 and pad == 0 and ino == inode and
             (low, high) not in ((0, 0), (U32, U32)))
    attrs = {}
    offset = 32
    while offset < len(data):
        _require(offset + 4 <= len(data))
        length, attr = struct.unpack_from('=HH', data, offset)
        _require(length >= 4 and offset + length <= len(data) and
                 attr <= 7 and attr not in attrs)
        attrs[attr] = data[offset + 4:offset + length]
        offset += (length + 3) & ~3
    _require(offset == len(data) and 2 in attrs and len(attrs[2]) == 4)
    peer, = struct.unpack('=I', attrs[2])
    _require(peer > 0 and peer != inode)
    value = {'inode': ino, 'cookie': [low, high], 'peer': peer}
    if 0 in attrs:
        value['name'] = attrs[0]
    if 1 in attrs:
        _require(len(attrs[1]) == 8)
        value['vfs'] = list(struct.unpack('=II', attrs[1]))
    return value


def query(inode, cookie=None):
    """Exact inode lookup, optionally constrained by the previously read cookie."""
    _require(type(inode) is int and 0 < inode <= U32)
    if cookie is None:
        cookie = (U32, U32)
    _require(len(cookie) == 2 and all(type(n) is int and 0 <= n <= U32 for n in cookie))
    request = struct.pack('=BBHIIIII', socket.AF_UNIX, 0, 0, U32, inode, 7, *cookie)
    with socket.socket(socket.AF_NETLINK, socket.SOCK_RAW, 4) as channel:
        channel.settimeout(1.0)
        channel.bind((0, 0))
        port = channel.getsockname()[0]
        sequence = 1
        channel.sendto(struct.pack('=IHHII', 16 + len(request), 20, 1, sequence, port) + request, (0, 0))
        data, ancillary, flags, address = channel.recvmsg(16384)
        _require(address == (0, 0) and not ancillary and not flags)
        result = _decode(data, sequence, port, inode)
        if cookie != (U32, U32):
            _require(result['cookie'] == list(cookie))
        return result


@contextmanager
def journal_path():
    """Hold no-follow O_PATH handles through proof and check path binding again."""
    descriptors = []
    saved = []
    def identity(info):
        return (info.st_ino, info.st_dev, info.st_mode, info.st_uid)
    try:
        parent = os.open('/', os.O_PATH | os.O_DIRECTORY | os.O_NOFOLLOW)
        descriptors.append(parent)
        root = os.fstat(parent)
        saved.append(identity(root))
        _require(root.st_uid == 0 and not root.st_mode & 0o022)
        components = Path(PATH).parts[1:]
        for index, component in enumerate(components):
            descriptor = os.open(component, os.O_PATH | os.O_NOFOLLOW, dir_fd=parent)
            descriptors.append(descriptor)
            info = os.fstat(descriptor)
            saved.append(identity(info))
            if index < len(components) - 1:
                _require(stat.S_ISDIR(info.st_mode) and info.st_uid == 0 and not info.st_mode & 0o022)
            else:
                _require(stat.S_ISSOCK(info.st_mode) and info.st_uid == 0)
            parent = descriptor
        major, minor = os.major(info.st_dev), os.minor(info.st_dev)
        _require(0 < info.st_ino <= U32 and major < (1 << 12) and minor < (1 << 20))
        vfs_identity = [info.st_ino, (major << 20) | minor]
        yield vfs_identity
        # Every held directory must still be reached by the original secure path.
        current = os.lstat('/')
        _require(identity(current) == saved[0] and identity(os.fstat(descriptors[0])) == saved[0])
        for index, component in enumerate(components):
            current = os.stat(component, dir_fd=descriptors[index], follow_symlinks=False)
            held = os.fstat(descriptors[index + 1])
            _require(identity(current) == saved[index + 1] and identity(held) == saved[index + 1])
    finally:
        for descriptor in reversed(descriptors):
            os.close(descriptor)


def prove(inodes, expected=None):
    """Return a JSON-safe identity proof, replayable while the worker is frozen."""
    _require(isinstance(inodes, dict) and set(inodes) == {'1', '2'})
    expected_pairs = {} if expected is None else expected.get('pairs', {})
    pairs = {}
    with journal_path() as vfs:
        for inode in sorted(set(inodes.values())):
            prior = expected_pairs.get(str(inode))
            client = query(inode, None if prior is None else prior['client_cookie'])
            _require('name' not in client and 'vfs' not in client)
            peer = query(client['peer'], None if prior is None else prior['peer_cookie'])
            _require(peer['peer'] == inode and peer.get('name') == PATH.encode() + b'\0' and
                     peer.get('vfs') == vfs)
            # Requery both exact kernel objects to detect close/reuse while resolving peers.
            _require(query(inode, client['cookie']) == client)
            _require(query(peer['inode'], peer['cookie']) == peer)
            pairs[str(inode)] = {'client_cookie': client['cookie'], 'peer_inode': peer['inode'],
                                  'peer_cookie': peer['cookie']}
        result = {'fds': inodes, 'vfs': vfs, 'pairs': pairs}
        _require(expected is None or result == expected)
        return result
