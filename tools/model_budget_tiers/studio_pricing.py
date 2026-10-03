"""Authenticated, immutable job terms; no model, funding or legacy-ledger reset."""
import fcntl
import hashlib
import os
from pathlib import Path
import stat

import astra_spend as legacy

REVISION = 'studio-pricing-v1'
POLICY_REVISION = 'astra-low-tiered-v1'
RECEIPT = '.worldifact-studio-pricing-runtime.json'
MAINTENANCE = '.worldifact-studio-pricing-maintenance.json'
FENCE_REVISION = 'pidfd-origin-terminal-consent-v2'
TERMS = '.worldifact-studio-pricing.json'
TIERS = ({'tier': 'standard', 'points': 250, 'maxProviderCents': 200},
         {'tier': 'extended', 'points': 500, 'maxProviderCents': 400})
SOURCES = frozenset(('server.py', 'codex_runner.py', 'blender_mcp.py', 'astra_spend_v2.py',
                     'completion_policy.py', 'prebuild_policy.py', 'terminal_budget.py', 'studio_pricing.py'))


def validate(value):
    if (not isinstance(value, dict) or set(value) != {'revision', 'tier', 'points', 'maxProviderCents'}
            or value.get('revision') != REVISION or type(value.get('points')) is not int
            or type(value.get('maxProviderCents')) is not int):
        raise ValueError('Invalid Studio pricing terms.')
    for tier in TIERS:
        if value == {'revision': REVISION, **tier}:
            return dict(value)
    raise ValueError('Invalid Studio pricing tier.')


def admission(data, profile):
    if 'studioPricing' not in data:
        return None  # Historical authenticated clients retain USD 1.75.
    terms = validate(data['studioPricing'])
    if profile != 'standard':
        raise ValueError('Studio pricing is only accepted for standard generation.')
    return terms


def terms_at(root, job_id):
    """Missing legacy terms are distinct from broken/malformed new evidence."""
    path = legacy.safe(Path(root) / TERMS)
    try:
        path.lstat()
    except FileNotFoundError:
        return None
    value = legacy.read_json(path)
    if (not isinstance(value, dict) or set(value) != {'jobId', 'studioPricing'}
            or value['jobId'] != job_id):
        raise ValueError('Studio pricing job binding is invalid.')
    return validate(value['studioPricing'])


def folder_root(folder, ledger_root=None):
    job = legacy.safe(folder)
    if not job.is_dir():
        raise ValueError('Existing job folder required.')
    key = hashlib.sha256(str(job.resolve(strict=True)).encode()).hexdigest()
    return legacy.safe(Path(ledger_root if ledger_root is not None else legacy.LEDGER_ROOT) / key)


def job_terms(folder, ledger_root=None):
    return terms_at(folder_root(folder, ledger_root), Path(folder).name)


def cap_and_revision(terms):
    if terms is None:
        return legacy.CEILING_MICRO_USD, 'astra-low-reconciled-v2'
    terms = validate(terms)
    return terms['maxProviderCents'] * 10000, POLICY_REVISION


def bind(folder, terms, ledger_root=None):
    """Before enqueue/provider work, persist exact terms under reserve's lock.

Existing terms cannot change, and existing ledger/seal evidence cannot be
upgraded. A crash after the terms write but before enqueue retains the binding.
"""
    terms = None if terms is None else validate(terms)
    root = legacy.ledger_folder(folder, ledger_root)
    fd = os.open(legacy.safe(root / '.worldifact-astra-spend.lock'), os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'a') as lock:
        if not stat.S_ISREG(os.fstat(lock.fileno()).st_mode):
            raise ValueError('Invalid Studio pricing lock.')
        fcntl.flock(lock, fcntl.LOCK_EX)
        prior = terms_at(root, Path(folder).name)
        if prior is not None:
            if prior != terms:
                raise ValueError('Studio pricing is immutable for this job.')
            return
        if terms is None:
            return
        for name in (legacy.STATE, '.worldifact-astra-terminal-budget.json'):
            try:
                (root / name).lstat()
            except FileNotFoundError:
                continue
            raise ValueError('Existing provider evidence cannot acquire new terms.')
        legacy.atomic(root / TERMS, {'jobId': Path(folder).name, 'studioPricing': terms})


def same_terms(folder, terms, ledger_root=None):
    try:
        return job_terms(folder, ledger_root) == terms
    except Exception:
        return False


def public_failure_code(folder, state):
    """Only the guarded insufficient-reservation evidence proves exhaustion."""
    if state not in ('failed', 'succeeded'):
        return {}
    try:
        value = legacy.read_json(Path(folder) / 'agent-usage.json')
        guard = value.get('cost_guard')
        if value.get('error_code') != 'WORLDIFACT_ASTRA_COST_GUARD' or not isinstance(guard, dict):
            return {}
        cap, _ = cap_and_revision(job_terms(folder))
        required = guard.get('required_minimum_micro_usd')
        remaining = guard.get('remaining_micro_usd')
        requested, minimum = guard.get('requested_output'), guard.get('minimum_output')
        if (guard.get('reason') == 'INSUFFICIENT_RESERVATION' and guard.get('stage') == 'admission'
                and type(required) is int and 0 < required <= 1826176
                and type(remaining) is int and 0 <= remaining <= cap and remaining < required
                and type(requested) is int and type(minimum) is int and 256 <= minimum <= 16000
                and minimum <= requested <= 96000):
            return {'worldifactFailureCode': 'MODEL_BUDGET_EXCEEDED'}
    except Exception:
        pass
    return {}


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
    try:
        root = legacy.safe(root if root is not None else Path(__file__).resolve().parent)
        proof = legacy.read_json(root / RECEIPT)
        expected = proof.get('sha256')
        if (proof.get('revision') != REVISION or not isinstance(expected, dict) or set(expected) != SOURCES
                or proof.get('maintenance_fence') != FENCE_REVISION
                or type(proof.get('cancelled_cleanup_interruption_approved')) is not bool
                or proof.get('offline_generic_pipeline') is not True
                or proof.get('offline_cabinet_pipeline') is not True):
            return {}
        for name, sha in expected.items():
            path = legacy.safe(root / name)
            if not path.is_file() or not 0 < path.stat().st_size <= 1048576:
                return {}
            if hashlib.sha256(path.read_bytes()).hexdigest() != sha:
                return {}
        from prebuild_policy import verified_health as prebuild_health
        if not prebuild_health(root):
            return {}
        return {'studioPricingRevision': REVISION, 'studioPricingTiers': [dict(tier) for tier in TIERS]}
    except Exception:
        return {}
