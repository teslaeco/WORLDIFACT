"""Finite source authority for the prospective construction transaction.

The exact post-transform manifest deliberately refuses activation until reviewed
bytes are frozen. Tests may replace this finite map in process; neither a CLI
argument nor a target receipt can provide or expand the production allowlist.
"""
import hashlib
import re

import construction_health as health
import runtime_patch


ANCESTOR_COMMIT = '2380a7e2dad05a40b3753faf06c2635ed444be51'
EXPECTED = dict(runtime_patch.EXPECTED)
INSTALLED_V1 = {'astra_spend_v2.py': '6ff61de4356388ecbec9d5eda1ae61f0ca2098deeb8ed10f1c2928dec67b3028',
 'blender_mcp.py': '85c4fe62f76aaa33e87a40ec0db03965e1ffac0a28b1459a73e3676bf66b020b',
 'codex_runner.py': 'ebcc149256ef3f54ad5b082b16f54719a30a66e6e2b94dfc2fe5f994f2f9f8fa',
 'completion_policy.py': '664e9f3b2326116fe9aeeb78e7a84aac254ca8a3054cdccdfb5224e112890110',
 'construction_health.py': 'f63c2731c501fa73037ea0205e8bbd73e8cc58f93ab6601d51ba7bd271ae56cf',
 'construction_payload.py': 'fb47f6038cf7e43eb98371fdaaa9ad9e34e8fa06075a94a6653338747878fca1',
 'construction_policy.py': '0d9e36b5034cf9d055aedda85d9bc052745adbfd07a8061d6c46137ca57a29fa',
 'context_policy.py': 'de55626504e39a1ac52b78de57995013761c824165b0f92f108ea09b9cb0a2f1',
 'phased_controller.py': '713917ad4bc5f249323258fa1093d5f9d177b130a1c42fc20d628e0e25c5d605',
 'prebuild_policy.py': 'b157f93ab4c68402f921576b897ea05f2b68454092167731c74fd9ee45b87033',
 'runtime_controller.py': '53f08644296c58b7c6c77f91a484f4852074ae720dec89129559dd698e1aac0e',
 'server.py': 'd401a99fc2b271b886fa8c629e802d107ec8f6f05eb3da99c27dab040abc4c97',
 'studio_pricing.py': 'ad765f9193e973146a8fd9e0761d13006ba939db7926275f628ad21c83350584',
 'terminal_budget.py': '3e8a1654aede456eeeb673bb67f508a56996602239c56127123ba7e71a5a39f0'}
# The installed predecessor is immutable; receipts cannot supply source authority.
EXPECTED_AFTER = {**INSTALLED_V1, 'construction_payload.py': '3b7e5af5192724af4d7eb2943a09230c952fbd44905ec955f2ae2d7a6ec03a84'}
MODIFIED = runtime_patch.MODIFIED
HELPERS = runtime_patch.HELPERS


def final_manifest():
    expected = EXPECTED_AFTER
    if (not isinstance(expected, dict) or set(expected) != health.SOURCES
            or any(not isinstance(value, str) or re.fullmatch('[a-f0-9]{64}', value) is None
                   for value in expected.values())
            or any(expected[name] != EXPECTED[name] for name in EXPECTED.keys() - MODIFIED)
            or any(expected[name] == EXPECTED[name] for name in MODIFIED)):
        raise ValueError('Construction runtime manifest is not frozen.')
    return dict(expected)


def reviewed_sources(original):
    if {name: hashlib.sha256(raw).hexdigest() for name, raw in original.items()} != EXPECTED:
        raise ValueError('Exact installed context-v2 pricing source is required.')
    return True


def reviewed_manifest(value):
    try:
        after = final_manifest()
        return value == EXPECTED or value == after or value == payload_predecessor()
    except ValueError:
        return False


def changes(original, helpers):
    expected = final_manifest()
    reviewed_sources(original)
    changed = runtime_patch.changes(original, helpers)
    if {name: hashlib.sha256(raw).hexdigest() for name, raw in changed.items()} != expected:
        raise ValueError('Construction package differs from frozen runtime manifest.')
    return changed


def payload_predecessor():
    """Only the complete installed-v1 map may enter the helper-only update."""
    after = final_manifest()
    before = INSTALLED_V1
    if (not isinstance(before, dict) or set(before) != health.SOURCES
            or any(not isinstance(value, str) or re.fullmatch('[a-f0-9]{64}', value) is None
                   for value in before.values())
            or {name for name in after if after[name] != before[name]} != {'construction_payload.py'}):
        raise ValueError('Exact payload-only update manifest is not frozen.')
    return dict(before)


def reviewed_installed_sources(original):
    if {name: hashlib.sha256(raw).hexdigest() for name, raw in original.items()} != payload_predecessor():
        raise ValueError('Exact installed construction-v1 source is required.')
    return True


def payload_changes(original, payload):
    reviewed_installed_sources(original)
    if not isinstance(payload, bytes) or not 0 < len(payload) <= 1048576:
        raise ValueError('Invalid bounded runtime helper.')
    compile(payload, 'construction_payload.py', 'exec')
    changed = {**original, 'construction_payload.py': payload}
    if {name: hashlib.sha256(raw).hexdigest() for name, raw in changed.items()} != final_manifest():
        raise ValueError('Payload update differs from frozen runtime manifest.')
    return changed
