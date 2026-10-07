"""Finite helper-only upgrade from the exact installed PR214 pricing runtime.

No target-supplied manifest may extend this allowlist. This module never writes.
The helper hash binds this local review candidate; publication is a separate action.
"""
import hashlib

ANCESTOR_COMMIT = '2380a7e2dad05a40b3753faf06c2635ed444be51'
OLD_REVISION = 'worldifact-standard-context-v1'
REVISION = 'worldifact-standard-context-v2'
EXPECTED = {
    'server.py': 'd401a99fc2b271b886fa8c629e802d107ec8f6f05eb3da99c27dab040abc4c97',
    'codex_runner.py': '71066e32e858e7e81a45e597d7472d00c77bb699355e833bf948c3e78c20eed5',
    'blender_mcp.py': '85c4fe62f76aaa33e87a40ec0db03965e1ffac0a28b1459a73e3676bf66b020b',
    'astra_spend_v2.py': 'eafbf9d261b471bb5e10b2e5bf7def25a75909c019a5ec658abb855b11483673',
    'completion_policy.py': '664e9f3b2326116fe9aeeb78e7a84aac254ca8a3054cdccdfb5224e112890110',
    'prebuild_policy.py': 'b157f93ab4c68402f921576b897ea05f2b68454092167731c74fd9ee45b87033',
    'studio_pricing.py': 'ad765f9193e973146a8fd9e0761d13006ba939db7926275f628ad21c83350584',
    'terminal_budget.py': '3e8a1654aede456eeeb673bb67f508a56996602239c56127123ba7e71a5a39f0',
    'context_policy.py': 'b3ddb8cfd0574a3669a1d873e0eb5eb3d7a2474e7fce2590d0af4cfbbe00017d',
}
# Locally frozen helper after presentation and verifier protocol tests.
HELPER_SHA256 = 'cb87fd0d342ef94a6c5f0f306ea3891669aaf70feed9830f7058de6087a4cd59'
PRICING_EXPECTED = {name: digest for name, digest in EXPECTED.items() if name != 'context_policy.py'}
PRICING_RECEIPTS = ('.worldifact-terminal-budget-runtime.json', '.worldifact-studio-pricing-runtime.json')


def upgraded_manifest():
    if not isinstance(HELPER_SHA256, str) or len(HELPER_SHA256) != 64 or any(c not in '0123456789abcdef' for c in HELPER_SHA256):
        raise ValueError('The upgrade helper is not frozen.')
    if HELPER_SHA256 == EXPECTED['context_policy.py']:
        raise ValueError('The upgrade helper did not change.')
    return {**EXPECTED, 'context_policy.py': HELPER_SHA256}


def reviewed_sources(original):
    if {name: hashlib.sha256(raw).hexdigest() for name, raw in original.items()} != EXPECTED:
        raise ValueError('Exact installed PR214 STANDARD pricing sources are required.')
    return 'PRICING'


def reviewed_manifest(expected):
    if expected == EXPECTED:
        return True
    try:
        return expected == upgraded_manifest()
    except ValueError:
        return False


def changes(original, helper):
    reviewed_sources(original)
    expected = upgraded_manifest()
    if hashlib.sha256(helper).hexdigest() != expected['context_policy.py']:
        raise ValueError('The upgrade helper differs from the frozen package.')
    compile(helper, 'context_policy.py', 'exec')
    return {**original, 'context_policy.py': helper}
