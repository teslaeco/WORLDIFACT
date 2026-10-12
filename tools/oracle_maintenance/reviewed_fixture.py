"""Offline copies of the immutable maintenance grant, never current runtime code."""
import hashlib
from pathlib import Path


SOURCE_COMMIT = '5e375f0f7d6f42d8c4d8944fa024bfb474143c04'
ROOT = Path(__file__).resolve().parent / 'fixtures' / SOURCE_COMMIT
PINS = {
    'oracle_construction_launch.py': 'c87d9826480173dead7c175db75f0d4f143c8f8bc63fea753cc84ebc6e1e2f57',
    'construction_health.py': 'f63c2731c501fa73037ea0205e8bbd73e8cc58f93ab6601d51ba7bd271ae56cf',
    'construction_payload.py': '475e8251a2255775889d00d0611bb8954044cfd7f2dfba27c6735403408c35b8',
    'phased_controller.py': '1825f3cbff6e229799d22001481d8075a8e8b5c567e60b3736a9208126c99d6b',
    'runtime_controller.py': '9188b29c60ac26ab9f63781660db548b1757ee430fc4b33a43930f6868168b0d',
}


def read(name, root=ROOT):
    if name not in PINS:
        raise ValueError('unreviewed_fixture')
    path = root / (name + '.source')
    if path.is_symlink() or not path.is_file():
        raise ValueError('missing_or_unsafe_reviewed_fixture')
    raw = path.read_bytes()
    if hashlib.sha256(raw).hexdigest() != PINS[name]:
        raise ValueError('reviewed_fixture_integrity')
    return raw
