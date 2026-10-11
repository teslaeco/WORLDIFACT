"""Pure transform for the exact observed Oracle runner; never installs or calls AI.

The supervised model must use its registered tools until finish_model produces
the existing terminal outcome. Text alone cannot complete that workflow.
"""
import hashlib

SOURCE_SHA256 = 'f3c9ce7ebcb629a823af0324c00a97bda35b63a99f15ff0804b6ea641c32c0bb'
ANCHOR = "                        payload['store']=False;payload['stream']=True\n"
INSERT = (
    "                        # An unfinished WORLDIFACT task needs execution, not a final text answer.\n"
    "                        # Existing terminal, cancellation and budget fences remain authoritative.\n"
    "                        if completion_policy.profile(outer.completion_request) and not outer.fast_limits['fast']:\n"
    "                            payload['tool_choice']='required'\n"
)


def transform(raw):
    """Refuse unknown or already changed source before proposing any bytes."""
    if not isinstance(raw, bytes) or hashlib.sha256(raw).hexdigest() != SOURCE_SHA256:
        raise ValueError('Unreviewed Oracle runner; no installation authorized.')
    source = raw.decode('utf-8')
    if source.count(ANCHOR) != 1:
        raise ValueError('Unique reviewed payload anchor required.')
    result = source.replace(ANCHOR, ANCHOR + INSERT, 1).encode('utf-8')
    compile(result, 'codex_runner.py', 'exec')
    return result
