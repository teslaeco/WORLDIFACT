"""In-memory STANDARD delta for exact prebuild or installed PR195 pricing sources."""
import hashlib
from pathlib import Path

EXPECTED = {
    'server.py': '3cb77049eb3693ea2b2dd018815797aab5c9b6716d1ed7dd06848a91e82bdf1c',
    'codex_runner.py': 'bc8db1e2694cf3144bf19fa0b46fa93475624fa47f07b00daa886d15415d4412',
    'blender_mcp.py': '85c4fe62f76aaa33e87a40ec0db03965e1ffac0a28b1459a73e3676bf66b020b',
    'astra_spend_v2.py': 'd76c2e30fa696713cceaa6178a9ae91b44592c403ad38ab66c50029498be8adc',
    'completion_policy.py': '664e9f3b2326116fe9aeeb78e7a84aac254ca8a3054cdccdfb5224e112890110',
    'prebuild_policy.py': 'b157f93ab4c68402f921576b897ea05f2b68454092167731c74fd9ee45b87033',
}


# Exact observed PR195 output, independently reconstructed from PREBUILD above.
# Financial helpers and spend bytes are identity-only inputs, never patch targets.
PRICING_EXPECTED = {**EXPECTED,
    'server.py': '6892eeb833309b15aa10a6458cc921e8d814fae2ce9e56a6b9f9bc5fcaeb5c32',
    'astra_spend_v2.py': 'eafbf9d261b471bb5e10b2e5bf7def25a75909c019a5ec658abb855b11483673',
    'studio_pricing.py': 'ad765f9193e973146a8fd9e0761d13006ba939db7926275f628ad21c83350584',
    'terminal_budget.py': '3e8a1654aede456eeeb673bb67f508a56996602239c56127123ba7e71a5a39f0',
}
PRICING_RECEIPTS = ('.worldifact-terminal-budget-runtime.json', '.worldifact-studio-pricing-runtime.json')
# Both patched outputs are pinned below after deterministic source assembly.
PATCHED_CORE = {'PREBUILD': {'server.py': '7c4162141e96db7c8b93095d8934f04ba37d8472560f1425e2ac863533f25d0a', 'codex_runner.py': '71066e32e858e7e81a45e597d7472d00c77bb699355e833bf948c3e78c20eed5'}, 'PRICING': {'server.py': 'd401a99fc2b271b886fa8c629e802d107ec8f6f05eb3da99c27dab040abc4c97', 'codex_runner.py': '71066e32e858e7e81a45e597d7472d00c77bb699355e833bf948c3e78c20eed5'}}


def reviewed_sources(original):
    observed = {name: hashlib.sha256(raw).hexdigest() for name, raw in original.items()}
    if observed == EXPECTED:
        return 'PREBUILD'
    if observed == PRICING_EXPECTED:
        return 'PRICING'
    raise ValueError('Unreviewed STANDARD context source variant.')


def reviewed_manifest(expected):
    """Only exact old or exact locally packaged rollback sources may be fenced."""
    helper = hashlib.sha256(Path(__file__).with_name('context_policy.py').read_bytes()).hexdigest()
    for variant, original in (('PREBUILD', EXPECTED), ('PRICING', PRICING_EXPECTED)):
        if expected == original:
            return True
        patched = {**original, **PATCHED_CORE.get(variant, {}), 'context_policy.py': helper}
        if variant in PATCHED_CORE and expected == patched:
            return True
    return False


def once(text, old, new):
    if text.count(old) != 1:
        raise ValueError('Reviewed context patch differs.')
    return text.replace(old, new, 1)


def changes(original, helper):
    variant = reviewed_sources(original)
    runner = once(original['codex_runner.py'].decode(), 'import prebuild_policy\n',
                  'import prebuild_policy\nimport context_policy\n')
    runner = once(runner,
        "    task=(prebuild_policy.initial_task(folder,completion_request) if prebuild_policy.active(completion_request,fast_limits['fast']) else completion_policy.guidance(completion_request)+task if not fast_limits['fast'] else task)",
        "    task=(context_policy.initial_task(folder,completion_request) if context_policy.active(completion_request,fast_limits['fast']) else prebuild_policy.initial_task(folder,completion_request) if prebuild_policy.active(completion_request,fast_limits['fast']) else completion_policy.guidance(completion_request)+task if not fast_limits['fast'] else task)")
    runner = once(runner, '    def execution_guidance(self):\n',
        "    def execution_guidance(self):\n        if context_policy.active(self.completion_request,self.fast_limits['fast']):return context_policy.turn_guidance(self)\n")
    server = once(original['server.py'].decode(), 'import urllib.request\n', 'import urllib.request\nimport context_policy\n')
    server = once(server, '    state.update(prebuild_health())\n',
        "    state.update(prebuild_health())\n    context_proof=context_policy.verified_health()\n    state.update(context_proof)\n    maintenance=context_policy.maintenance_active()\n    state['worldifactStandardMaintenance']=maintenance\n    if not context_proof or maintenance:state.update(ready=False,detail='STANDARD runtime maintenance or verification is pending.')\n")
    if variant == 'PRICING':
        # PR195 already fences these three entry points. Extend each exact
        # condition, preserving its pricing marker, route and startup behavior.
        old = 'studio_pricing.maintenance_active(ROOT)'
        if server.count(old) != 3:
            raise ValueError('Reviewed pricing maintenance gates differ.')
        server = server.replace(old, '(context_policy.maintenance_active(ROOT) or ' + old + ')')
    else:
        server = once(server, "            config = json.loads(CONFIG.read_text())\n            if write and self.path == '/v1/pair':",
            "            config = json.loads(CONFIG.read_text())\n            if context_policy.maintenance_active(ROOT) and (write or self.path != '/v1/health'):\n                return self.send_json({'error':'Runtime maintenance is in progress.','code':'RUNTIME_MAINTENANCE'},503)\n            if write and self.path == '/v1/pair':")
        server = once(server, "        with LOCK, database() as db:\n            row = db.execute(\"SELECT * FROM jobs WHERE state='queued' ORDER BY created LIMIT 1\").fetchone()",
            "        with LOCK, database() as db:\n            if context_policy.maintenance_active(ROOT):continue\n            row = db.execute(\"SELECT * FROM jobs WHERE state='queued' ORDER BY created LIMIT 1\").fetchone()")
        server = once(server,
            "            db.execute(\"UPDATE jobs SET state='failed',detail='Serwer uruchomil sie ponownie. Wyslij opis jeszcze raz.' WHERE state NOT IN ('succeeded','failed','cancelled')\")",
            "            if not context_policy.maintenance_active(ROOT):\n                db.execute(\"UPDATE jobs SET state='failed',detail='Serwer uruchomil sie ponownie. Wyslij opis jeszcze raz.' WHERE state NOT IN ('succeeded','failed','cancelled')\")")
    result = {**original, 'codex_runner.py': runner.encode(), 'server.py': server.encode(), 'context_policy.py': helper}
    for name, raw in result.items():
        compile(raw, name, 'exec')
    return result
