"""Assemble public, hash-verified context-v2 test bytes; no live host access."""
import argparse
import hashlib
import os
from pathlib import Path
import sys


def assemble(ancestor, source, destination):
    root = Path(__file__).resolve().parents[2]
    ancestor, source, destination = map(Path, (ancestor, source, destination))
    if destination.exists() or destination.is_symlink():
        raise ValueError('Use a new test fixture directory.')
    if any(path.is_symlink() for path in (destination.parent, *destination.parent.parents)):
        raise ValueError('Test fixture destination must not traverse links.')
    os.environ['MODEL_CONTEXT_ANCESTOR_REPOSITORY'] = str(ancestor.resolve(strict=True))
    os.environ['MODEL_COMPLETION_SOURCE'] = str(source.resolve(strict=True))
    os.environ.pop('MODEL_CONTEXT_INSTALLED', None)
    sys.path.insert(0, str(root / 'tools/model_context_upgrade'))
    import test_upgrade_transaction as lineage
    import runtime_patch
    values = lineage.installed_sources()
    values['context_policy.py'] = (root / 'tools/model_context_upgrade/context_policy.py').read_bytes()
    if {name: hashlib.sha256(raw).hexdigest() for name, raw in values.items()} != runtime_patch.EXPECTED:
        raise ValueError('Reconstructed source does not match the installed-v2 boundary.')
    destination.mkdir(mode=0o700, parents=True)
    for name, raw in values.items():
        path = destination / name
        path.write_bytes(raw)
        path.chmod(0o600)
    return len(values)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ancestor', required=True)
    parser.add_argument('--source', required=True)
    parser.add_argument('--destination', required=True)
    args = parser.parse_args()
    print('VERIFIED_PUBLIC_TEST_SOURCES', assemble(args.ancestor, args.source, args.destination))
