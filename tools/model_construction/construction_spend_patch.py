"""Unwired source transform for atomic future-phase capacity protection.

Only the exact installed STANDARD-v2 pricing source is accepted. No import or
call here installs code, opens a ledger, sends a request or changes a balance.
The trusted construction host must pass a complete future capacity plan on
EVERY request, including zero for its final assessment. None preserves the
existing legacy allocation. A separate pre-check is not spending authority.
"""
import hashlib


EXPECTED = 'eafbf9d261b471bb5e10b2e5bf7def25a75909c019a5ec658abb855b11483673'


def once(text, old, new):
    if text.count(old) != 1:
        raise ValueError('Reviewed spend source anchor changed.')
    return text.replace(old, new, 1)


def changes(raw):
    if not isinstance(raw, bytes) or hashlib.sha256(raw).hexdigest() != EXPECTED:
        raise ValueError('Exact installed STANDARD-v2 spend source required.')
    text = raw.decode('utf-8')
    text = once(text, "'PREFLIGHT_UNKNOWN','JOB_SEALED'}",
                "'PREFLIGHT_UNKNOWN','JOB_SEALED','INVALID_PHASE_CAPACITY',"
                "'CONSTRUCTION_CAP_UNREVIEWED'}")
    text = once(text, "'requests':32}",
                "'requests':32,'protected_remaining_micro_usd':1750000,'protected_remaining_requests':31}")
    text = once(text,
        'def reserve(folder, counted_input, requested_output, now=None, ledger_root=None, minimum_output=256):',
        'def reserve(folder, counted_input, requested_output, now=None, ledger_root=None, minimum_output=256, protected_remaining_micro_usd=None, protected_remaining_requests=None):')
    text = once(text,
        "    try:\n        with ledger(folder, ledger_root) as (path, state):\n",
        "    # None retains legacy behavior. An explicit zero is still the new\n"
        "    # construction path and therefore requires its exact cap/output.\n"
        "    if (protected_remaining_micro_usd is None) != (protected_remaining_requests is None):\n"
        "        raise SpendError('INVALID_PHASE_CAPACITY','admission')\n"
        "    if protected_remaining_micro_usd is not None and (\n"
        "            not integer(protected_remaining_micro_usd, 0, CEILING_MICRO_USD)\n"
        "            or not integer(protected_remaining_requests, 0, 31)\n"
        "            or not integer(requested_output, 256, MAX_OUTPUT)\n"
        "            or minimum_output != requested_output):\n"
        "        raise SpendError('INVALID_PHASE_CAPACITY','admission')\n"
        "    try:\n        with ledger(folder, ledger_root) as (path, state):\n")
    text = once(text,
        "            remaining = cap - used(state)\n            affordable = (remaining-count*INPUT_RATE)//OUTPUT_RATE\n",
        "            remaining = cap - used(state)\n"
        "            protected = 0 if protected_remaining_micro_usd is None else protected_remaining_micro_usd\n"
        "            protected_requests = 0 if protected_remaining_requests is None else protected_remaining_requests\n"
        "            if protected_remaining_micro_usd is not None and cap != CEILING_MICRO_USD:\n"
        "                raise SpendError('CONSTRUCTION_CAP_UNREVIEWED','admission')\n"
        "            # This check and the original reservation write share ONE\n"
        "            # flock. Never release prior holds to fund remaining phases.\n"
        "            affordable = (remaining-protected-count*INPUT_RATE)//OUTPUT_RATE\n")
    text = once(text,
        "                'requests':state['requests']}\n            output = min(MAX_OUTPUT, requested_output, affordable)",
        "                'requests':state['requests']}\n"
        "            if protected_remaining_micro_usd is not None:\n"
        "                evidence['protected_remaining_micro_usd'] = protected\n"
        "                evidence['protected_remaining_requests'] = protected_requests\n"
        "            output = min(MAX_OUTPUT, requested_output, affordable)")
    text = once(text,
        "            if state['requests'] >= 32: raise SpendError('REQUEST_LIMIT','admission',**evidence)",
        "            if state['requests'] + 1 + protected_requests > 32: raise SpendError('REQUEST_LIMIT','admission',**evidence)")
    text = once(text,
        'def protect(folder, payload, headers, counter=None, minimum_output=256):',
        'def protect(folder, payload, headers, counter=None, minimum_output=256, protected_remaining_micro_usd=None, protected_remaining_requests=None):')
    text = once(text,
        'token,output = reserve(folder,counted,requested,minimum_output=minimum_output)',
        'token,output = reserve(folder,counted,requested,minimum_output=minimum_output, protected_remaining_micro_usd=protected_remaining_micro_usd, protected_remaining_requests=protected_remaining_requests)')
    compile(text, 'construction-astra-spend-v2.py', 'exec')
    return text.encode('utf-8')
