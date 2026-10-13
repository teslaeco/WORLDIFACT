"""Read-only, fail-closed construction attestation for the installed runtime.

The installer creates this receipt only after genuine isolated offline gates.
It binds the runtime helpers, modified core, and every existing receipt by their
actual bytes. The existing context health route calls this helper after its old
checks; this module must never call context health and create a verification
cycle. A valid receipt is runtime evidence, not provider or visual-quality proof.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import stat


REVISION = 'worldifact-standard-construction-v1'
RECEIPT = '.worldifact-standard-construction.json'
FENCE_REVISION = 'pidfd-origin-terminal-consent-v2'
CORE_SOURCES = frozenset(('server.py', 'codex_runner.py', 'blender_mcp.py',
    'astra_spend_v2.py', 'completion_policy.py', 'prebuild_policy.py',
    'studio_pricing.py', 'terminal_budget.py', 'context_policy.py'))
RUNTIME_HELPERS = frozenset(('construction_policy.py', 'construction_payload.py',
    'phased_controller.py', 'runtime_controller.py', 'construction_health.py'))
SOURCES = CORE_SOURCES | RUNTIME_HELPERS
COMPLETION_SOURCES = frozenset(('server.py', 'codex_runner.py', 'blender_mcp.py',
    'astra_spend_v2.py', 'completion_policy.py'))
PREBUILD_SOURCES = COMPLETION_SOURCES | {'prebuild_policy.py'}
PRICING_SOURCES = PREBUILD_SOURCES | {'studio_pricing.py', 'terminal_budget.py'}
CHAIN_LAYOUT = {
    '.worldifact-model-completion.json': ('worldifact-reference-completion-v1', COMPLETION_SOURCES),
    '.worldifact-prebuild.json': ('worldifact-cabinet-prebuild-v1', PREBUILD_SOURCES),
    '.worldifact-terminal-budget-runtime.json': ('worldifact-terminal-budget-v1', PRICING_SOURCES),
    '.worldifact-studio-pricing-runtime.json': ('studio-pricing-v1', PRICING_SOURCES),
    '.worldifact-standard-context.json': ('worldifact-standard-context-v2', CORE_SOURCES),
}
GUARD_RECEIPT = '.worldifact-astra-guard.json'
GENERIC_RECEIPT = 'tools/codex/verified.json'
CHAIN_RECEIPTS = frozenset(CHAIN_LAYOUT) | {GUARD_RECEIPT, GENERIC_RECEIPT}
GATES = ('offline_generic_pipeline', 'offline_cabinet_pipeline', 'offline_phased_standard_pipeline')
HASH = re.compile(r'[0-9a-f]{64}')


def _read_regular(path, limit):
    """Reject links, special files, oversized content and observed replacements."""
    if any(item.is_symlink() for item in (path, *path.parents)):
        raise ValueError('Linked attestation path.')
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        before = os.fstat(descriptor)
        if not stat.S_ISREG(before.st_mode) or not 0 < before.st_size <= limit:
            raise ValueError('Invalid attestation file.')
        with os.fdopen(descriptor, 'rb', closefd=False) as stream:
            raw = stream.read(limit + 1)
        identity = lambda value: (value.st_dev, value.st_ino, value.st_size,
                                  value.st_mtime_ns, value.st_ctime_ns)
        if (len(raw) != before.st_size or identity(before) != identity(os.fstat(descriptor))
                or identity(before) != identity(path.lstat()) or path.is_symlink()):
            raise ValueError('Changed attestation file.')
        return raw
    finally:
        os.close(descriptor)


def _unique(pairs):
    value = {}
    for key, item in pairs:
        if key in value:
            raise ValueError('Duplicate attestation key.')
        value[key] = item
    return value


def _json(raw):
    value = json.loads(raw.decode('utf-8'), object_pairs_hook=_unique)
    if not isinstance(value, dict):
        raise ValueError('Invalid attestation object.')
    return value


def _hashes(value, names):
    return (isinstance(value, dict) and set(value) == names
            and all(isinstance(digest, str) and HASH.fullmatch(digest) for digest in value.values()))


def _fenced(proof, gates):
    return (proof.get('maintenance_fence') == FENCE_REVISION
            and type(proof.get('cancelled_cleanup_interruption_approved')) is bool
            and all(proof.get(gate) is True for gate in gates))


def verified_health(root=None):
    """Return the construction health flag only for the complete bound chain."""
    root = Path(root).absolute() if root is not None else Path(__file__).absolute().parent
    try:
        proof = _json(_read_regular(root / RECEIPT, 16384))
        expected, receipts = proof.get('sha256'), proof.get('receipt_sha256')
        if (proof.get('revision') != REVISION or not _hashes(expected, SOURCES)
                or not _hashes(receipts, CHAIN_RECEIPTS) or not _fenced(proof, GATES)):
            return {}
        for name, digest in expected.items():
            if hashlib.sha256(_read_regular(root / name, 1048576)).hexdigest() != digest:
                return {}
        chain = {}
        for name, digest in receipts.items():
            raw = _read_regular(root / name, 16384)
            if hashlib.sha256(raw).hexdigest() != digest:
                return {}
            chain[name] = _json(raw)
        for name, (revision, names) in CHAIN_LAYOUT.items():
            prior = chain[name]
            if (prior.get('revision') != revision
                    or prior.get('sha256') != {key: expected[key] for key in names}):
                return {}
            if name == '.worldifact-standard-context.json':
                if not _fenced(prior, ('offline_generic_pipeline', 'offline_standard_pipeline')):
                    return {}
            elif names == PRICING_SOURCES:
                if not _fenced(prior, ('offline_generic_pipeline', 'offline_cabinet_pipeline')):
                    return {}
        generic = chain[GENERIC_RECEIPT]
        if (generic.get('sources') != {name: expected[name] for name in ('codex_runner.py', 'blender_mcp.py')}
                or any(generic.get(key) is not True for key in
                       ('cli_mcp_roundtrip', 'code_mode_roundtrip', 'blender_build_roundtrip'))):
            return {}
        guard = chain[GUARD_RECEIPT]
        guard_names = {'codex_runner.py', 'fast_preview.py', 'astra_spend.py'}
        if (guard.get('revision') != 'astra-usd175-v1' or not _hashes(guard.get('sha256'), guard_names)
                or guard.get('outputPolicy') != {'revision': 'astra-low-reconciled-v2',
                                                'sha256': expected['astra_spend_v2.py']}):
            return {}
        for name, digest in guard['sha256'].items():
            if hashlib.sha256(_read_regular(root / name, 1048576)).hexdigest() != digest:
                return {}
        return {'worldifactStandardConstructionPolicy': REVISION}
    except (OSError, ValueError, TypeError, KeyError, AttributeError, RecursionError):
        return {}
