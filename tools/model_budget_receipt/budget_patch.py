"""Only exact reviewed prebuild ancestry can acquire terminal budget receipts."""
import hashlib

EXPECTED = {
    'server.py': '3cb77049eb3693ea2b2dd018815797aab5c9b6716d1ed7dd06848a91e82bdf1c',
    'codex_runner.py': 'bc8db1e2694cf3144bf19fa0b46fa93475624fa47f07b00daa886d15415d4412',
    'blender_mcp.py': '85c4fe62f76aaa33e87a40ec0db03965e1ffac0a28b1459a73e3676bf66b020b',
    'astra_spend_v2.py': 'd76c2e30fa696713cceaa6178a9ae91b44592c403ad38ab66c50029498be8adc',
    'completion_policy.py': '664e9f3b2326116fe9aeeb78e7a84aac254ca8a3054cdccdfb5224e112890110',
    'prebuild_policy.py': 'b157f93ab4c68402f921576b897ea05f2b68454092167731c74fd9ee45b87033',
}


def once(text, old, new):
    if text.count(old) != 1:
        raise ValueError('Reviewed terminal budget patch differs.')
    return text.replace(old, new, 1)


def patch_spend(text):
    spend = once(text, 'import astra_spend as legacy\n',
                 'import astra_spend as legacy\nimport terminal_budget\n')
    spend = once(spend, "'LEDGER_INVALID','LEDGER_IO','RESERVATION_COLLISION','PREFLIGHT_UNKNOWN'}",
                 "'LEDGER_INVALID','LEDGER_IO','RESERVATION_COLLISION','PREFLIGHT_UNKNOWN','JOB_SEALED'}")
    spend = once(spend, '        with ledger(folder, ledger_root) as (path, state):\n            count = counted_input + 2048',
                 "        with ledger(folder, ledger_root) as (path, state):\n            if terminal_budget.sealed(path): raise SpendError('JOB_SEALED','admission')\n            count = counted_input + 2048")
    return spend


def changes(original, helper):
    if set(original) != set(EXPECTED):
        raise ValueError('Unexpected terminal budget source set.')
    for name, sha in EXPECTED.items():
        if hashlib.sha256(original[name]).hexdigest() != sha:
            raise ValueError('Unreviewed prebuild source: ' + name)
    spend = patch_spend(original['astra_spend_v2.py'].decode())
    server = once(original['server.py'].decode(), 'import urllib.request\n', 'import urllib.request\nimport terminal_budget\n')
    server = once(server, '    state.update(prebuild_health())\n',
        "    state.update(prebuild_health())\n    budget_proof=terminal_budget.verified_health()\n    state.update(budget_proof)\n    maintenance=terminal_budget.maintenance_active()\n    state['worldifactTerminalBudgetMaintenance']=maintenance\n    if not budget_proof or maintenance:state.update(ready=False,detail='Terminal budget runtime maintenance or verification is pending.')\n")
    server = once(server, "            config = json.loads(CONFIG.read_text())\n            if write and self.path == '/v1/pair':",
        "            config = json.loads(CONFIG.read_text())\n            if terminal_budget.maintenance_active(ROOT) and (write or self.path != '/v1/health'):\n                return self.send_json({'error':'Runtime maintenance is in progress.','code':'RUNTIME_MAINTENANCE'},503)\n            if write and self.path == '/v1/pair':")
    server = once(server, "        with LOCK, database() as db:\n            row = db.execute(\"SELECT * FROM jobs WHERE state='queued' ORDER BY created LIMIT 1\").fetchone()",
        "        with LOCK, database() as db:\n            if terminal_budget.maintenance_active(ROOT):continue\n            row = db.execute(\"SELECT * FROM jobs WHERE state='queued' ORDER BY created LIMIT 1\").fetchone()")
    server = once(server,
        "            db.execute(\"UPDATE jobs SET state='failed',detail='Serwer uruchomil sie ponownie. Wyslij opis jeszcze raz.' WHERE state NOT IN ('succeeded','failed','cancelled')\")",
        "            if not terminal_budget.maintenance_active(ROOT):\n                db.execute(\"UPDATE jobs SET state='failed',detail='Serwer uruchomil sie ponownie. Wyslij opis jeszcze raz.' WHERE state NOT IN ('succeeded','failed','cancelled')\")")
    server = once(server, r'(?:/(model|cancel|quality|exports(?:/(?:fbx|obj|stl|blend|scene-json|master|pbr|prepare))?))?',
                  r'(?:/(model|cancel|quality|budget|exports(?:/(?:fbx|obj|stl|blend|scene-json|master|pbr|prepare))?))?')
    server = once(server, "            if action=='quality':\n", """            if action=='budget':
                if row['state'] not in ('succeeded','failed','cancelled'):
                    return self.send_json({'code':'TERMINAL_BUDGET_NOT_FINAL'},409)
                if terminal_budget.verified_health(ROOT).get('worldifactTerminalBudgetPolicy') != terminal_budget.REVISION:
                    return self.send_json({'code':'TERMINAL_BUDGET_UNAVAILABLE'},503)
                try:
                    return self.send_json(terminal_budget.seal_terminal(JOBS/job_id,job_id))
                except terminal_budget.BudgetUnavailable:
                    return self.send_json({'code':'TERMINAL_BUDGET_UNAVAILABLE'},503)
            if action=='quality':
""")
    result = {**original, 'server.py': server.encode(), 'astra_spend_v2.py': spend.encode(), 'terminal_budget.py': helper}
    for name, raw in result.items():
        compile(raw, name, 'exec')
    return result
