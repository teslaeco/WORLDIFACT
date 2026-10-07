"""Test-only immutable ancestor/flat-package assembly. Never imported at install.

Current main may intentionally differ from PR214. Integration tests must use
its separate exact checkout and the same flattened, blob-pinned package used by
the launcher, rather than changing historical files on current main.
"""
import hashlib
import importlib
import os
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[2]
ANCESTOR = Path(os.environ.get('MODEL_CONTEXT_ANCESTOR_REPOSITORY', ROOT)).resolve()
COMMIT = '2380a7e2dad05a40b3753faf06c2635ed444be51'
_PACKAGE = None


def package_bytes(path):
    root = ROOT if path.startswith('tools/model_context_upgrade/') else ANCESTOR
    return (root / path).read_bytes()


def bootstrap():
    global _PACKAGE
    if _PACKAGE is not None:
        return Path(_PACKAGE.name)
    observed = subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=ANCESTOR,
                              capture_output=True, text=True, check=True).stdout.strip()
    if observed != COMMIT:
        raise RuntimeError('Tests require exact PR214 MODEL_CONTEXT_ANCESTOR_REPOSITORY checkout.')
    # Existing tracked ancestry must remain unchanged; untracked upgrade files
    # do not participate in this check on the original development checkout.
    subprocess.run(['git', 'diff', '--quiet', 'HEAD', '--', 'tools/model_context',
                    'tools/model_prebuild', 'tools/model_completion', 'tools/model_budget_tiers',
                    'tools/model_budget_receipt', 'tools/profit_guard', 'tools/fast_preview'],
                   cwd=ANCESTOR, check=True)
    import oracle_upgrade_launch as launcher
    values = {}
    for name, (path, expected) in launcher.FILES.items():
        raw = package_bytes(path)
        if launcher.blob(raw) != expected:
            raise RuntimeError('Test package differs from frozen blob: ' + name)
        values[name] = raw
    _PACKAGE = tempfile.TemporaryDirectory(prefix='worldifact-upgrade-test-package-')
    folder = Path(_PACKAGE.name)
    for name, raw in values.items(): (folder / name).write_bytes(raw)
    sys.path.insert(0, str(folder))
    # Bind shared runtime/installer modules before individual test fixture paths
    # are added. Production package resolution is independent of this test env.
    for name in ('install_upgrade', 'upgrade_patch', 'upgrade_fence', 'verification_scope'):
        module = importlib.import_module(name)
        if Path(module.__file__).resolve().parent != folder:
            raise RuntimeError('Test runtime module did not come from the pinned flat package.')
    return folder
