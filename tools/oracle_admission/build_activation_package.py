"""Assemble only public reviewed installer modules. Never read or change a VM."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import sys
import tarfile

HERE = Path(__file__).resolve().parent
sys.path.append(str(HERE.parent / 'model_construction'))
import oracle_construction_launch as original
import activation_manifest as manifest

NEW = ('activation.py', 'activation_manifest.py', 'activation_evidence.py', 'activation_receipts.py',
       'activation_lease.py', 'activation_ops.py', 'offline_admission.py', 'read_only_probe.py',
       'patch_server.py', 'worker_recovery.py', 'durable_inbox.py', 'durable_admission.py', 'install_admission.py')


def build(repo, ancestor, destination, commit):
    if not re.fullmatch('[a-f0-9]{40}', commit):
        raise ValueError('An exact source commit is required.')
    repo, ancestor, destination = map(lambda p: Path(p).absolute(), (repo, ancestor, destination))
    if destination.exists() or any(p.is_symlink() for p in (destination, *destination.parents)):
        raise ValueError('A new private output directory is required.')
    values = {}
    for name, (path, expected) in original.FILES.items():
        base = repo if path.startswith(original.CURRENT_PREFIXES) else ancestor
        source = base / path
        if any(p.is_symlink() for p in (source, *source.parents)):
            raise ValueError('No linked package input is permitted.')
        raw = source.read_bytes()
        if original.blob(raw) != expected:
            raise ValueError('Historical module changed: ' + name)
        values[name] = raw
    for name in NEW:
        source = repo / 'tools/oracle_admission' / name
        if any(p.is_symlink() for p in (source, *source.parents)):
            raise ValueError('No linked package input is permitted.')
        values[name] = source.read_bytes()
    for name, raw in values.items():
        if not re.fullmatch(r'[a-z_]+[0-9a-z_]*\.py', name) or not 0 < len(raw) <= 262144:
            raise ValueError('Unexpected package entry.')
        compile(raw, name, 'exec')
    destination.mkdir(mode=0o700)
    package = destination / 'oracle-activation'
    package.mkdir(mode=0o700)
    for name, raw in values.items():
        (package / name).write_bytes(raw)
        (package / name).chmod(0o600)
    proof = {'source_commit': commit, 'kind': 'UNINSTALLED_REVIEWED_CODE_PACKAGE',
             'files': {n: hashlib.sha256(b).hexdigest() for n, b in sorted(values.items())},
             'runtime_server_sha256': manifest.AFTER_SERVER_SHA256,
             'production_activation_verified': False, 'paid_generation_requested': False}
    (package / 'PACKAGE.json').write_text(json.dumps(proof, sort_keys=True, indent=2) + '\n')
    (package / 'PACKAGE.json').chmod(0o600)
    with tarfile.open(destination / 'oracle-activation-package.tar.gz', 'w:gz') as archive:
        for path in sorted(package.iterdir()):
            archive.add(path, arcname='oracle-activation/' + path.name, recursive=False)
    print('UNINSTALLED_ACTIVATION_PACKAGE', len(values))
    return proof


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__, allow_abbrev=False)
    parser.add_argument('--repo', required=True)
    parser.add_argument('--ancestor', required=True)
    parser.add_argument('--destination', required=True)
    parser.add_argument('--source-commit', required=True)
    args = parser.parse_args()
    build(args.repo, args.ancestor, args.destination, args.source_commit)
