"""Fixed authority for one durable-admission release, not historical grants."""
import hashlib
import re
from pathlib import Path

from read_only_probe import EXPECTED

BEFORE = dict(EXPECTED)
REVISION = 'oracle-durable-admission-v1'
RECEIPT = '.worldifact-durable-admission-runtime.json'
MODEL_RECEIPT = '.worldifact-studio-execution-runtime.json'
HELPERS = {
    'durable_inbox.py': 'b2c378c139b8278ce16ec602079136b8ce133fb7e8ba93fc892533c0cee0a6ce',
    'durable_admission.py': '99a775230a01d5d4ec8c3fd98f161c14a56bc5147b84e973f07226c5b909bf21',
}
# Frozen from original-source reconstruction in GitHub run 38339263726.
# A receipt, argument, environment variable or caller cannot supply this value.
AFTER_SERVER_SHA256 = 'c3e6b1e2894515ceabb4ec6570b8e68a5398664743212a36ba16a77be8200150'


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def final_manifest():
    if not isinstance(AFTER_SERVER_SHA256, str) or re.fullmatch('[a-f0-9]{64}', AFTER_SERVER_SHA256) is None:
        raise ValueError('The durable-admission release is not frozen.')
    if AFTER_SERVER_SHA256 == BEFORE['server.py']:
        raise ValueError('The candidate must include its reviewed server correction.')
    return {**BEFORE, 'server.py': AFTER_SERVER_SHA256, **HELPERS}


def reviewed_manifest(value):
    try:
        return value == BEFORE or value == final_manifest()
    except ValueError:
        return False


def build_candidate(original, helpers):
    if {n: digest(b) for n, b in original.items()} != BEFORE:
        raise ValueError('The complete original runtime is required.')
    if {n: digest(b) for n, b in helpers.items()} != HELPERS:
        raise ValueError('The exact reviewed admission helpers are required.')
    import patch_server
    result = {**original, 'server.py': patch_server.transform(original['server.py'], helpers), **helpers}
    for name, raw in result.items():
        compile(raw, name, 'exec')
    return result


def changes(original):
    from install_admission import read_regular
    here = Path(__file__).resolve().parent
    values = build_candidate(original, {n: read_regular(here / n) for n in HELPERS})
    if {n: digest(b) for n, b in values.items()} != final_manifest():
        raise ValueError('The built candidate differs from the reviewed release.')
    return values
