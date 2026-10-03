"""Immutable upper-liability receipts. Never infer zero cost from missing evidence.

The authenticated server authorizes terminal jobs; this helper seals their
existing durable ledger under the SAME lock used to reserve provider requests.
Outstanding/legacy holds remain fully charged to the upper bound, not refunded.
"""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import stat

import astra_spend as legacy
import studio_pricing

REVISION = 'worldifact-terminal-budget-v1'
POLICY_REVISION = 'astra-low-reconciled-v2'
CAP = 1750000
RECEIPT = '.worldifact-terminal-budget-runtime.json'
MAINTENANCE = '.worldifact-terminal-budget-maintenance.json'
FENCE_REVISION = 'pidfd-origin-terminal-consent-v2'
SEAL = '.worldifact-astra-terminal-budget.json'
SOURCES = frozenset(('server.py', 'codex_runner.py', 'blender_mcp.py', 'astra_spend_v2.py',
                     'completion_policy.py', 'prebuild_policy.py', 'terminal_budget.py', 'studio_pricing.py'))
UUID = re.compile(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}')
HEX = re.compile(r'[a-f0-9]{64}')
FIELDS = frozenset(('revision', 'jobId', 'model', 'policyRevision', 'capMicroUsd',
                    'maximumLiabilityMicroUsd', 'sealed', 'sealId'))


class BudgetUnavailable(RuntimeError):
    pass


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True).encode()


def digest(value):
    return hashlib.sha256(canonical(value)).hexdigest()


def sealed(ledger_path):
    """Presence, unreadability or a broken symlink all deny future reservation."""
    try:
        (legacy.safe(ledger_path).parent / SEAL).lstat()
        return True
    except FileNotFoundError:
        return False
    except Exception:
        return True


def read_seal(path, job_id, cap=CAP, policy_revision=POLICY_REVISION):
    value = legacy.read_json(path)
    if not isinstance(value, dict) or set(value) != {'revision', 'ledgerSha256', 'receipt'} or value['revision'] != 1:
        raise BudgetUnavailable('TERMINAL_BUDGET_UNAVAILABLE')
    ledger_hash, receipt = value['ledgerSha256'], value['receipt']
    if (not isinstance(ledger_hash, str) or not HEX.fullmatch(ledger_hash)
            or not isinstance(receipt, dict) or set(receipt) != FIELDS
            or receipt['revision'] != REVISION or receipt['jobId'] != job_id
            or receipt['model'] != 'gpt-6-astra' or receipt['policyRevision'] != policy_revision
            or type(receipt['capMicroUsd']) is not int or receipt['capMicroUsd'] != cap
            or type(receipt['maximumLiabilityMicroUsd']) is not int
            or not 0 <= receipt['maximumLiabilityMicroUsd'] <= cap or receipt['sealed'] is not True
            or not isinstance(receipt['sealId'], str) or not HEX.fullmatch(receipt['sealId'])):
        raise BudgetUnavailable('TERMINAL_BUDGET_UNAVAILABLE')
    unsigned = {key: val for key, val in receipt.items() if key != 'sealId'}
    if receipt['sealId'] != digest({'ledgerSha256': ledger_hash, 'receipt': unsigned}):
        raise BudgetUnavailable('TERMINAL_BUDGET_UNAVAILABLE')
    return receipt


def seal_terminal(folder, job_id, ledger_root=None):
    """Caller MUST have read this exact job's terminal state from its database.

No job/ledger/lock directory is created. A reserve that won the existing lock
first is included at its full outstanding ceiling; one that loses cannot run.
Late authenticated settlement may lower the live ledger, never this receipt.
"""
    try:
        if not isinstance(job_id, str) or not UUID.fullmatch(job_id):
            raise BudgetUnavailable('TERMINAL_BUDGET_UNAVAILABLE')
        job = legacy.safe(folder)
        if job.name != job_id or not job.is_dir():
            raise BudgetUnavailable('TERMINAL_BUDGET_UNAVAILABLE')
        key = hashlib.sha256(str(job.resolve(strict=True)).encode()).hexdigest()
        root = legacy.safe(ledger_root if ledger_root is not None else legacy.LEDGER_ROOT)
        target = legacy.safe(root / key)
        path = legacy.safe(target / legacy.STATE)
        lock_path = legacy.safe(target / '.worldifact-astra-spend.lock')
        # Opening an existing lock, unlike legacy.ledger(), cannot manufacture
        # missing evidence and call it an empty account.
        fd = os.open(lock_path, os.O_RDWR | os.O_NOFOLLOW)
        with os.fdopen(fd, 'a') as lock:
            if not stat.S_ISREG(os.fstat(lock.fileno()).st_mode):
                raise BudgetUnavailable('TERMINAL_BUDGET_UNAVAILABLE')
            fcntl.flock(lock, fcntl.LOCK_EX)
            cap, policy_revision = studio_pricing.cap_and_revision(studio_pricing.terms_at(target, job_id))
            seal_path = target / SEAL
            if sealed(path):
                return read_seal(seal_path, job_id, cap, policy_revision)
            import astra_spend_v2 as policy
            if policy.REVISION != POLICY_REVISION or policy.CEILING_MICRO_USD != CAP:
                raise BudgetUnavailable('TERMINAL_BUDGET_UNAVAILABLE')
            state = policy.validate_state(legacy.read_json(path), cap, policy_revision)
            # The reviewed writer creates a ledger only after one reservation
            # and never removes a hold. Do not turn semantically missing call
            # evidence into a zero-cost certificate merely because JSON fits.
            if state['requests'] < 1 or (state['legacyHeld'] == 0 and state['requests'] != len(state['holds'])):
                raise BudgetUnavailable('TERMINAL_BUDGET_UNAVAILABLE')
            liability = policy.used(state)
            # Migrated records do not retain the original legacy request count.
            # Missing new holds cannot be distinguished from those old calls;
            # preserve the entire approved cap instead of refunding ambiguity.
            if state['legacyHeld'] > 0:
                liability = cap
            if type(liability) is not int or not 0 <= liability <= cap:
                raise BudgetUnavailable('TERMINAL_BUDGET_UNAVAILABLE')
            receipt = {'revision': REVISION, 'jobId': job_id, 'model': 'gpt-6-astra',
                       'policyRevision': policy_revision, 'capMicroUsd': cap,
                       'maximumLiabilityMicroUsd': liability, 'sealed': True}
            state_hash = digest(state)
            receipt['sealId'] = digest({'ledgerSha256': state_hash, 'receipt': receipt})
            legacy.atomic(seal_path, {'revision': 1, 'ledgerSha256': state_hash, 'receipt': receipt})
            return read_seal(seal_path, job_id, cap, policy_revision)
    except BudgetUnavailable:
        raise
    except Exception:
        raise BudgetUnavailable('TERMINAL_BUDGET_UNAVAILABLE') from None


def maintenance_active(root=None):
    root = Path(root) if root is not None else Path(__file__).resolve().parent
    try:
        legacy.safe(root / MAINTENANCE).lstat()
        return True
    except FileNotFoundError:
        return False
    except Exception:
        return True


def verified_health(root=None):
    """The tier attestation binds this helper and both old/new reserve paths."""
    if studio_pricing.verified_health(root):
        return {'worldifactTerminalBudgetPolicy': REVISION}
    return {}
