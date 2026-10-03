"""Exact prebuild or reviewed PR194 ancestry; historical sources stay untouched."""
import hashlib
from pathlib import Path
import importlib.util

HERE = Path(__file__).resolve().parent
# Flat launch packages include the historical patch as receipt_budget_patch.py.
try:
    import receipt_budget_patch as previous
except ImportError:
    spec = importlib.util.spec_from_file_location('receipt_budget_patch', HERE.parent / 'model_budget_receipt/budget_patch.py')
    previous = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(previous)

PREBUILD_EXPECTED = dict(previous.EXPECTED)
EXPECTED = PREBUILD_EXPECTED
OLD_TERMINAL_SHA256 = 'c22e112bd002c068a369ef4eb12e46a41d8b1b7702b990f3845f56d2db6e60ea'
# The old helper is pinned, never inferred from arbitrary installed files.
RECEIPT_EXPECTED = {'server.py': '30b7cc8b10848cd97fb460299ff60e99aaf6a3ffffc877baf902168d3a4726dc', 'codex_runner.py': 'bc8db1e2694cf3144bf19fa0b46fa93475624fa47f07b00daa886d15415d4412', 'blender_mcp.py': '85c4fe62f76aaa33e87a40ec0db03965e1ffac0a28b1459a73e3676bf66b020b', 'astra_spend_v2.py': '8624a29b7cf5bafdfe270063bf2a6bdd737cee5e50dc4c22a760931486994ad8', 'completion_policy.py': '664e9f3b2326116fe9aeeb78e7a84aac254ca8a3054cdccdfb5224e112890110', 'prebuild_policy.py': 'b157f93ab4c68402f921576b897ea05f2b68454092167731c74fd9ee45b87033', 'terminal_budget.py': 'c22e112bd002c068a369ef4eb12e46a41d8b1b7702b990f3845f56d2db6e60ea'}


def once(text, old, new):
    if text.count(old) != 1:
        raise ValueError('Reviewed tier pricing patch differs.')
    return text.replace(old, new, 1)


def historical_helper():
    flat = HERE / 'receipt_terminal_budget.py'
    path = flat if flat.is_file() else HERE.parent / 'model_budget_receipt/terminal_budget.py'
    raw = path.read_bytes()
    if hashlib.sha256(raw).hexdigest() != OLD_TERMINAL_SHA256:
        raise ValueError('Unreviewed historical terminal helper.')
    return raw


def receipt_expected():
    # Constant hashes below bind actual PR194 output, in addition to proof by
    # reconstruction from its original exact prebuild input.
    return dict(RECEIPT_EXPECTED)


def reviewed_sources(original):
    expected = PREBUILD_EXPECTED if set(original) == set(PREBUILD_EXPECTED) else RECEIPT_EXPECTED
    if set(original) != set(expected):
        raise ValueError('Unexpected tier pricing source set.')
    for name, sha in expected.items():
        if hashlib.sha256(original[name]).hexdigest() != sha:
            raise ValueError('Unreviewed tier pricing ancestor: ' + name)
    return 'PREBUILD' if expected == PREBUILD_EXPECTED else 'TERMINAL_BUDGET'


def patch_spend(text):
    # Input is already the PR194 variant (including permanent sealing).
    text = once(text, 'import terminal_budget\n', 'import terminal_budget\nimport studio_pricing\n')
    text = once(text, "'remaining_micro_usd':1750000", "'remaining_micro_usd':4000000")
    text = once(text, 'def validate_state(value):',
        'def validate_state(value, cap=CEILING_MICRO_USD, policy_revision=REVISION):')
    start, end = text.index('def validate_state('), text.index('\ndef used(')
    block = text[start:end]
    block = block.replace("    if not isinstance(value, dict):", "    if ((cap, policy_revision) not in ((CEILING_MICRO_USD, REVISION), (2000000, studio_pricing.POLICY_REVISION), (4000000, studio_pricing.POLICY_REVISION))):\n        raise legacy.SpendError('Unreviewed job budget terms.')\n    if not isinstance(value, dict):", 1)
    block = block.replace("        if not integer(value['reserved']", "        if cap != CEILING_MICRO_USD or policy_revision != REVISION:\n            raise legacy.SpendError('Legacy holds cannot be upgraded.')\n        if not integer(value['reserved']", 1)
    block = block.replace("value.get('revision') != REVISION", "value.get('revision') != policy_revision")
    block = block.replace("if used(value) > CEILING_MICRO_USD:", "if used(value) > cap:")
    text = text[:start] + block + text[end:]
    text = once(text, "        state = validate_state(legacy.read_json(path)) if path.exists() else {'revision': REVISION, 'legacyHeld': 0, 'requests': 0, 'holds': {}}",
        "        cap, policy_revision = studio_pricing.cap_and_revision(studio_pricing.terms_at(root, Path(folder).name))\n        state = validate_state(legacy.read_json(path), cap, policy_revision) if path.exists() else {'revision': policy_revision, 'legacyHeld': 0, 'requests': 0, 'holds': {}}")
    text = once(text, '            remaining = CEILING_MICRO_USD - used(state)',
        "            cap, _ = studio_pricing.cap_and_revision(studio_pricing.terms_at(path.parent, Path(folder).name))\n            remaining = cap - used(state)")
    return text


def changes(original, helpers):
    ancestry = reviewed_sources(original)
    if set(helpers) != {'studio_pricing.py', 'terminal_budget.py'}:
        raise ValueError('Unexpected tier pricing helper set.')
    base = previous.changes(original, historical_helper()) if ancestry == 'PREBUILD' else dict(original)
    server = once(base['server.py'].decode(), 'import terminal_budget\n', 'import terminal_budget\nimport studio_pricing\n')
    server = once(server, '    state.update(budget_proof)\n',
        "    state.update(budget_proof)\n    pricing_proof=studio_pricing.verified_health()\n    state.update(pricing_proof)\n    state['studioPricingMaintenance']=studio_pricing.maintenance_active()\n    if not pricing_proof or state['studioPricingMaintenance']:state.update(ready=False,detail='Studio pricing verification or maintenance is pending.')\n")
    server = server.replace('terminal_budget.maintenance_active(', 'studio_pricing.maintenance_active(')
    server = once(server, '                profile = requested_profile(data)\n',
        "                profile = requested_profile(data)\n                pricing = studio_pricing.admission(data, profile)\n                if pricing is not None and not studio_pricing.verified_health(ROOT):\n                    return self.send_json({'code':'STUDIO_PRICING_UNAVAILABLE'},503)\n")
    server = once(server, '                    if prior:\n',
        "                    if prior:\n                        if not studio_pricing.same_terms(JOBS/job_id, pricing):\n                            return self.send_json({'error':'Job pricing terms do not match.','code':'STUDIO_PRICING_CONFLICT'},409)\n")
    server = once(server, "                    write_json(destination/'agent-instructions.json',{'text':instructions,'revision':1})",
        "                    studio_pricing.bind(destination, pricing)\n                    write_json(destination/'agent-instructions.json',{'text':instructions,'revision':1})")
    server = once(server, "**public_failure_code(JOBS/job_id,row['state'])})",
        "**public_failure_code(JOBS/job_id,row['state']),**studio_pricing.public_failure_code(JOBS/job_id,row['state'])})")
    result = {**base, **helpers, 'server.py': server.encode(),
              'astra_spend_v2.py': patch_spend(base['astra_spend_v2.py'].decode()).encode()}
    for name, raw in result.items():
        compile(raw, name, 'exec')
    return result
