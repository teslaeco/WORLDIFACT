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
PAYLOAD_AFTER = {**INSTALLED_V1, 'construction_payload.py': '3b7e5af5192724af4d7eb2943a09230c952fbd44905ec955f2ae2d7a6ec03a84'}
INITIAL_EDIT_BEFORE = dict(PAYLOAD_AFTER)
INITIAL_EDIT_HELPERS = frozenset(('construction_payload.py', 'phased_controller.py', 'runtime_controller.py'))
EXPECTED_AFTER = {**INITIAL_EDIT_BEFORE,
 'construction_payload.py': 'dc65d54672b657e260a1a4a24da6657e95581de479b55e6e8c9b26f93a49e2bb',
 'phased_controller.py': '1825f3cbff6e229799d22001481d8075a8e8b5c567e60b3736a9208126c99d6b',
 'runtime_controller.py': '9188b29c60ac26ab9f63781660db548b1757ee430fc4b33a43930f6868168b0d'}
# Complete initial-edit runtime observed on the owner host. This immutable
# predecessor is not supplied by a receipt, flag, source checkout or caller.
RESPONSE_PHASE_BEFORE = {**INITIAL_EDIT_BEFORE,
 'construction_payload.py': '475e8251a2255775889d00d0611bb8954044cfd7f2dfba27c6735403408c35b8',
 'phased_controller.py': '1825f3cbff6e229799d22001481d8075a8e8b5c567e60b3736a9208126c99d6b',
 'runtime_controller.py': '9188b29c60ac26ab9f63781660db548b1757ee430fc4b33a43930f6868168b0d'}
RESPONSE_PHASE_HELPERS = frozenset(('construction_payload.py',))
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
        return (value == EXPECTED or value == after or value == transport_manifest() or value == payload_predecessor()
                or value == initial_edit_predecessor() or value == response_phase_predecessor())
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
    after = PAYLOAD_AFTER
    before = INSTALLED_V1
    if (not isinstance(after, dict) or set(after) != health.SOURCES
            or any(not isinstance(value, str) or re.fullmatch('[a-f0-9]{64}', value) is None
                   for value in after.values())
            or not isinstance(before, dict) or set(before) != health.SOURCES
            or any(not isinstance(value, str) or re.fullmatch('[a-f0-9]{64}', value) is None
                   for value in before.values())
            or {name for name in after if after[name] != before[name]} != {'construction_payload.py'}):
        raise ValueError('Exact payload-only update manifest is not frozen.')
    return dict(before)


def reviewed_payload_sources(original):
    if {name: hashlib.sha256(raw).hexdigest() for name, raw in original.items()} != payload_predecessor():
        raise ValueError('Exact installed construction-v1 source is required.')
    return True


def payload_changes(original, payload):
    reviewed_payload_sources(original)
    if not isinstance(payload, bytes) or not 0 < len(payload) <= 1048576:
        raise ValueError('Invalid bounded runtime helper.')
    compile(payload, 'construction_payload.py', 'exec')
    changed = {**original, 'construction_payload.py': payload}
    if {name: hashlib.sha256(raw).hexdigest() for name, raw in changed.items()} != PAYLOAD_AFTER:
        raise ValueError('Payload update differs from frozen runtime manifest.')
    return changed


def initial_edit_predecessor():
    """Only the complete parser-fixed runtime may enter this three-helper update."""
    after, before = final_manifest(), INITIAL_EDIT_BEFORE
    if (not isinstance(before, dict) or set(before) != health.SOURCES
            or any(not isinstance(value, str) or re.fullmatch('[a-f0-9]{64}', value) is None
                   for value in before.values())
            or {name for name in after if after[name] != before[name]} != INITIAL_EDIT_HELPERS):
        raise ValueError('Exact initial-edit update manifest is not frozen.')
    return dict(before)


def reviewed_installed_sources(original):
    if {name: hashlib.sha256(raw).hexdigest() for name, raw in original.items()} != initial_edit_predecessor():
        raise ValueError('Exact installed parser-fixed construction-v1 source is required.')
    return True


def initial_edit_changes(original, helpers):
    reviewed_installed_sources(original)
    if not isinstance(helpers, dict) or set(helpers) != INITIAL_EDIT_HELPERS:
        raise ValueError('Only the three reviewed initial-edit helpers may change.')
    for name, raw in helpers.items():
        if not isinstance(raw, bytes) or not 0 < len(raw) <= 1048576:
            raise ValueError('Invalid bounded runtime helper.')
        compile(raw, name, 'exec')
    changed = {**original, **helpers}
    if {name: hashlib.sha256(raw).hexdigest() for name, raw in changed.items()} != final_manifest():
        raise ValueError('Initial-edit update differs from frozen runtime manifest.')
    return changed


def response_phase_predecessor():
    """Require the exact already-installed initial-edit runtime, not older code."""
    before, after = RESPONSE_PHASE_BEFORE, final_manifest()
    if (not isinstance(before, dict) or set(before) != health.SOURCES
            or any(not isinstance(value, str) or re.fullmatch('[a-f0-9]{64}', value) is None
                   for value in before.values())
            or {name for name in after if after[name] != before[name]} != RESPONSE_PHASE_HELPERS):
        raise ValueError('Exact response-phase update manifest is not frozen.')
    return dict(before)


def reviewed_response_phase_sources(original):
    if {name: hashlib.sha256(raw).hexdigest() for name, raw in original.items()} != response_phase_predecessor():
        raise ValueError('Exact installed initial-edit construction source is required.')
    return True


def response_phase_changes(original, helpers):
    reviewed_response_phase_sources(original)
    if not isinstance(helpers, dict) or set(helpers) != RESPONSE_PHASE_HELPERS:
        raise ValueError('Only the reviewed response decoder may change.')
    raw = helpers['construction_payload.py']
    if not isinstance(raw, bytes) or not 0 < len(raw) <= 1048576:
        raise ValueError('Invalid bounded runtime helper.')
    compile(raw, 'construction_payload.py', 'exec')
    changed = {**original, **helpers}
    if {name: hashlib.sha256(value).hexdigest() for name, value in changed.items()} != final_manifest():
        raise ValueError('Response-phase update differs from frozen runtime manifest.')
    return changed


# Explicit transport repair release; historical modes retain their old maps.
TRANSPORT_AFTER = {**EXPECTED_AFTER,
    'blender_mcp.py': '74e2b6f5906eef3568ebc95ee7215578c1ed39cacfc3aa13c97e0a58a53f38a4',
    'codex_runner.py': 'f3c9ce7ebcb629a823af0324c00a97bda35b63a99f15ff0804b6ea641c32c0bb',
}

def transport_manifest():
    before, after = final_manifest(), TRANSPORT_AFTER
    if (set(after) != health.SOURCES
            or any(not isinstance(v, str) or re.fullmatch('[a-f0-9]{64}', v) is None for v in after.values())
            or {n for n in before if before[n] != after[n]} != {'codex_runner.py', 'blender_mcp.py'}):
        raise ValueError('Transport repair manifest is not frozen.')
    return dict(after)

def transport_changes(original):
    if {n: hashlib.sha256(b).hexdigest() for n,b in original.items()} != final_manifest():
        raise ValueError('Exact current construction runtime is required.')
    from pathlib import Path
    import sys
    folder = Path(__file__).resolve().parent.parent / 'mcp_transport_repair'
    if folder.is_dir(): sys.path.append(str(folder))
    import repair
    changed = {**original, **repair.patch_sources({n: original[n] for n in repair.EXPECTED})}
    if {n: hashlib.sha256(b).hexdigest() for n,b in changed.items()} != transport_manifest():
        raise ValueError('Transport repair differs from frozen release.')
    return changed
