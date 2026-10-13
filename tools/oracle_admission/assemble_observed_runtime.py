"""Reproduce the operator-observed public runtime, never install/attest it."""
import argparse
import hashlib
import importlib.util
from pathlib import Path
import sys

REPO = Path(__file__).resolve().parents[2]
TRANSPORT_COMMIT = '496b8c9f2120346993720357c3f920a4e3e9f2ae'
TRANSPORT_SHA256 = '3c6ef1ec460ae6346d34fbed611af50cee2a8a29171bcf30d0d5bc20c61aee7e'


def assemble(context, transport, destination):
    context, transport, destination = map(Path, (context, transport, destination))
    if destination.exists() or destination.is_symlink() or any(p.is_symlink() for p in (destination.parent, *destination.parent.parents)):
        raise ValueError('A new isolated directory is required.')
    sys.path[:0] = [str(REPO / 'tools/model_construction'), str(REPO / 'tools/model_execution')]
    import construction_manifest as manifest
    import runtime_patch
    original = {name: (context / name).read_bytes() for name in runtime_patch.EXPECTED}
    helpers = {name: (REPO / 'tools/model_construction' / name).read_bytes() for name in runtime_patch.HELPERS}
    values = manifest.changes(original, helpers)
    # The historical transform is immutable. The complete final manifest also
    # independently checks every reconstructed byte, including untouched files.
    raw = transport.read_bytes()
    if hashlib.sha256(raw).hexdigest() != TRANSPORT_SHA256:
        raise ValueError('The reviewed transport transform is required.')
    spec = importlib.util.spec_from_file_location('observed_transport_repair', transport)
    repair = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(repair)
    values.update(repair.patch_sources({name: values[name] for name in repair.EXPECTED}))
    values = manifest.execution_changes(values)
    values = manifest.model_changes(values, (REPO / 'tools/model_execution/studio_execution.py').read_bytes())
    if {name: hashlib.sha256(raw).hexdigest() for name, raw in values.items()} != manifest.model_manifest():
        raise ValueError('Observed source manifest mismatch.')
    destination.mkdir(mode=0o700)
    for name, raw in values.items():
        (destination / name).write_bytes(raw)
    return len(values)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--context', required=True)
    parser.add_argument('--transport', required=True)
    parser.add_argument('--destination', required=True)
    args = parser.parse_args()
    print('OBSERVED_PUBLIC_RUNTIME_RECONSTRUCTED', assemble(args.context, args.transport, args.destination))
