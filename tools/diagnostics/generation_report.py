"""Read existing generation evidence locally or via the owner's original OCI shell.

No provider requests, credential-file reads, uploads, restarts, refunds or retries.
Only allowlisted counts/statuses are printed; prompts, images and raw errors are not.
"""
import argparse
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
from datetime import datetime, timezone

sys.dont_write_bytecode = True
UUID = re.compile(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}')
CAP = 1_750_000
CODES = {'WORLDIFACT_ASTRA_COST_GUARD', 'FORGE_JOB_BUDGET', 'FORGE_UNCERTAIN_USAGE',
         'FORGE_STREAM_INTERRUPTED', 'FORGE_REPEATED_TOOL_ERROR', 'FORGE_REPEATED_CODE_ERROR',
         'CODEX_TOOLS_MISSING', 'FORGE_JOB_FINISHED', 'insufficient_quota',
         'credit_balance_exhausted', 'organization_spend_limit_exceeded',
         'project_spend_limit_exceeded', 'organization_usage_limit_exceeded'}
TOOLS = {'get_modeling_contract', 'get_current_model', 'build_model', 'edit_model',
         'render_model', 'review_model', 'inspect_render', 'finish_model'}
ARTIFACTS = ('model.glb', 'model.blend', 'model.fbx', 'scene.json', 'model.froge-scene.json')


def number(value, maximum=1_000_000_000):
    return value if type(value) is int and 0 <= value <= maximum else None


def safe(path):
    path = Path(path).absolute()
    if any(p.is_symlink() for p in (path, *path.parents)):
        raise ValueError('UNSAFE_PATH')
    return path


def read_json(path, limit=200_000):
    path = safe(path)
    fd = os.open(str(path), os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, 'rb') as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or not 0 < info.st_size <= limit:
            raise ValueError('INVALID_FILE')
        raw = stream.read(limit + 1)
        if len(raw) > limit:
            raise ValueError('INVALID_FILE')
    return json.loads(raw)


def optional(path, limit=200_000):
    try:
        return read_json(path, limit)
    except Exception:
        return None


def budget_summary(value):
    """Report a persistent conservative hold, never label it a provider invoice."""
    unavailable = {'status': 'UNAVAILABLE', 'capMicroUsd': CAP}
    if not isinstance(value, dict):
        return unavailable
    try:
        requests = number(value.get('requests'), 32)
        if requests is None:
            return unavailable
        if value.get('revision') == 'astra-usd175-v1':
            if set(value) != {'revision', 'reserved', 'requests'}:
                return unavailable
            held, completed = number(value['reserved'], CAP), None
        elif value.get('revision') == 'astra-low-reconciled-v2':
            if set(value) != {'revision', 'legacyHeld', 'requests', 'holds'}:
                return unavailable
            holds = value['holds']
            held = number(value['legacyHeld'], CAP)
            if held is None or not isinstance(holds, dict) or len(holds) > requests:
                return unavailable
            completed, response_ids = 0, set()
            for token, item in holds.items():
                if not re.fullmatch(r'[a-f0-9]{32}', token) or not isinstance(item, dict):
                    return unavailable
                if set(item) not in ({'input', 'output', 'held'}, {'input', 'output', 'held', 'response'}):
                    return unavailable
                inp, out, cost = (number(item.get(k), cap) for k, cap in
                                  [('input', 67584), ('output', 16000), ('held', CAP)])
                if inp is None or inp < 2048 or out is None or out < 256 or cost is None:
                    return unavailable
                upper = inp * 14 + out * 55
                if cost > upper or ('response' not in item and cost != upper):
                    return unavailable
                if 'response' in item:
                    response_id = item['response']
                    if not isinstance(response_id, str) or not re.fullmatch(r'resp_[A-Za-z0-9_-]{1,190}', response_id) or response_id in response_ids:
                        return unavailable
                    response_ids.add(response_id)
                    completed += 1
                held += cost
        else:
            return unavailable
        if held is None or held > CAP:
            return unavailable
        return {'status': 'RECORDED_CONSERVATIVE_HOLD_NOT_INVOICE', 'capMicroUsd': CAP,
                'heldMicroUsd': held, 'remainingMicroUsd': CAP - held,
                'reservedRequests': requests, 'completedSettlements': completed}
    except Exception:
        return unavailable


def artifact_info(path):
    try:
        info = safe(path).stat()
        if not stat.S_ISREG(info.st_mode):
            return {'status': 'UNAVAILABLE'}
        return {'status': 'PRESENT_UNVALIDATED', 'bytes': info.st_size}
    except FileNotFoundError:
        return {'status': 'MISSING'}
    except Exception:
        return {'status': 'UNAVAILABLE'}


# The worker emits started AND completed/failed rows for one tool invocation.
# Count those events separately; never turn two rows into two API/tool calls.
TOOL_STATES = {'started', 'completed', 'failed'}
ERROR_PREFIXES = {
    'ANATOMY_VALIDATION:': 'ANATOMY_VALIDATION',
    'CONFLICT:': 'REVISION_CONFLICT',
    'Nieprawidlowe argumenty MCP; wymagane pola:': 'MCP_ARGUMENT_SCHEMA_ERROR',
    'Nieznane narzedzie MCP.': 'UNKNOWN_MCP_TOOL',
    'ReferenceError:': 'REFERENCE_ERROR',
    'TypeError:': 'TYPE_ERROR',
    'SyntaxError:': 'SYNTAX_ERROR',
    'KeyError:': 'KEY_ERROR',
    'AttributeError:': 'ATTRIBUTE_ERROR',
    'ValueError:': 'VALUE_ERROR',
    'TimeoutError:': 'TIMEOUT_ERROR',
}


def error_category(value):
    """Recognize fixed worker prefixes only. Never echo exception text or paths."""
    if value is None:
        return 'NOT_RECORDED'
    if not isinstance(value, str):
        return 'UNCLASSIFIED_RECORDED_ERROR'
    prefix = value[:200].lstrip()
    for pattern, category in ERROR_PREFIXES.items():
        if prefix.startswith(pattern):
            return category
    return 'UNCLASSIFIED_RECORDED_ERROR'


def tool_summary(value):
    """Describe the retained event window, not completed models or paid calls.

    totals are worker-recorded metadata; no value is inferred from absent rows.
    A failed event without a start may be argument validation or a truncated log.
    """
    if not isinstance(value, dict) or not isinstance(value.get('calls'), list):
        return {'status': 'UNAVAILABLE'}
    source = value['calls']
    counts, events, invalid = {}, [], 0
    for item in source[-500:]:
        if not isinstance(item, dict):
            invalid += 1
            continue
        tool = item.get('tool')
        tool = tool if isinstance(tool, str) and tool in TOOLS else 'OTHER'
        state = item.get('status')
        state = state if isinstance(state, str) and state in TOOL_STATES else 'unknown'
        count = counts.setdefault(tool, {'started': 0, 'completed': 0, 'failed': 0, 'unknown': 0})
        count[state] += 1
        events.append({'tool': tool, 'state': state,
                       'revision': number(item.get('revision'), 1_000_000),
                       'buildAttempts': number(item.get('build_attempts'), 1_000_000),
                       'attempt': number(item.get('attempt'), 1_000_000),
                       'errorCategory': error_category(item.get('error'))})
    return {'status': 'RECORDED_EVENT_WINDOW_NOT_INVOCATION_COUNT',
            'eventsByTool': counts, 'retainedEventRows': len(source),
            'inspectedEventRows': min(len(source), 500), 'invalidInspectedRows': invalid,
            'workerRecordedTerminalCalls': number(value.get('total_calls'), 1_000_000),
            'workerRecordedFailures': number(value.get('failures'), 1_000_000),
            'workerRecordedBuildAttempts': number(value.get('build_attempts'), 1_000_000),
            'workerRecordedRevision': number(value.get('revision'), 1_000_000),
            'recentEvents': events[-12:],
            'limitation': 'Events are not API calls. A start does not prove a successful build. Missing earlier events and absent metadata remain unknown.'}


def inspect_job(root, folder):
    usage = optional(folder / 'agent-usage.json')
    usage = usage if isinstance(usage, dict) else {}
    code = usage.get('error_code')
    if not isinstance(code, str) or (code not in CODES and not re.fullmatch(r'OPENAI_HTTP_[45][0-9]{2}', code)):
        code = 'UNKNOWN'
    key = hashlib.sha256(str(safe(folder).resolve(strict=True)).encode()).hexdigest()
    ledger = optional(root / 'state/worldifact-astra-budgets' / key / '.worldifact-astra-spend.json', 16384)
    trace = optional(folder / 'agent-tools.json')
    tools = tool_summary(trace)
    photos = optional(folder / 'reference-photos.json', 160_000)
    return {'jobId': folder.name, 'errorCode': code,
            'guardSubreason': 'NOT_RECORDED_BY_INSTALLED_GENERIC_GUARD' if code == 'WORLDIFACT_ASTRA_COST_GUARD' else 'NOT_APPLICABLE',
            'gatewayRequests': number(usage.get('requests'), 1000),
            'recordedInputTokens': number(usage.get('input_tokens')),
            'recordedOutputTokens': number(usage.get('output_tokens')),
            'unknownUsage': usage.get('unknown_usage') if type(usage.get('unknown_usage')) is bool else None,
            'finished': usage.get('completed') if type(usage.get('completed')) is bool else None,
            'referenceCount': len(photos) if isinstance(photos, list) and len(photos) <= 6 else None,
            'budget': budget_summary(ledger),
            'toolCalls': ({tool: sum(counts.values()) for tool, counts in tools['eventsByTool'].items()}
                          if 'eventsByTool' in tools else None),
            'toolCallsMeaning': 'LEGACY_EVENT_ROW_COUNTS_NOT_INVOCATIONS', 'toolTrace': tools,
            'artifacts': {name: artifact_info(folder / name) for name in ARTIFACTS}}


def inspect(root):
    root = safe(root)
    jobs = safe(root / 'state/jobs')
    folders = []
    for folder in jobs.iterdir():
        if UUID.fullmatch(folder.name) and not folder.is_symlink() and folder.is_dir():
            folders.append(folder)
            if len(folders) > 10_000:
                raise ValueError('TOO_MANY_JOBS')
    folders.sort(key=lambda path: path.stat().st_mtime, reverse=True)
    return {'diagnostic': 'WORLDIFACT_GENERATION_READ_ONLY_V1', 'readOnly': True,
            'checkedAt': datetime.now(timezone.utc).isoformat(),
            'paidGenerationRequested': False, 'creditLedgerChecked': False,
            'jobs': [inspect_job(root, folder) for folder in folders[:3]]}


def invoke(args, data=None, timeout=45):
    result = subprocess.run(args, input=data, capture_output=True, text=True, timeout=timeout)
    if result.returncode or len(result.stdout) > 1_048_576:
        raise ValueError('COMMAND_FAILED')
    return result.stdout


def one_json(raw):
    value = json.loads(raw)
    if not isinstance(value, list) or len(value) != 1 or not isinstance(value[0], str):
        raise ValueError('EXPECTED_ONE_EXISTING_VM')
    return value[0]


def cloud_shell():
    key = safe(Path.home() / 'ssh-key-2026-09-06.key')
    if not key.is_file() or not os.access(key, os.R_OK):
        raise ValueError('ORIGINAL_CLOUD_SHELL_KEY_REQUIRED')
    oci = ['oci', '--region', 'eu-amsterdam-1']
    instance = one_json(invoke(oci + ['search', 'resource', 'structured-search', '--query-text',
        "query instance resources where displayName = 'froge-blender' && lifeCycleState = 'RUNNING'",
        '--query', 'data.items[].identifier', '--output', 'json']))
    if not re.fullmatch(r'ocid1\.instance\.[A-Za-z0-9._-]+', instance):
        raise ValueError('INVALID_INSTANCE_ID')
    address = one_json(invoke(oci + ['compute', 'instance', 'list-vnics', '--instance-id', instance,
        '--all', '--query', 'data[?"is-primary" == `true`]."public-ip"', '--output', 'json']))
    if not ipaddress.ip_address(address).is_global:
        raise ValueError('EXPECTED_PUBLIC_VM_IP')
    source = safe(Path(__file__)).read_text()
    raw = invoke(['ssh', '-T', '-i', str(key), '-o', 'IdentitiesOnly=yes',
        '-o', 'StrictHostKeyChecking=yes', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20',
        'opc@' + address, 'PYTHONDONTWRITEBYTECODE=1 python3 -B - --vm'], data=source, timeout=60)
    value = json.loads(raw)
    if not isinstance(value, dict) or value.get('diagnostic') != 'WORLDIFACT_GENERATION_READ_ONLY_V1' or value.get('readOnly') is not True:
        raise ValueError('INVALID_DIAGNOSTIC_RESPONSE')
    return value


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--vm', action='store_true', help='Inspect the existing worker, without OCI or SSH.')
    args = parser.parse_args()
    root = Path.home() / 'froge-connector'
    value = inspect(root) if args.vm or (root / 'state/jobs').is_dir() else cloud_shell()
    print('WORLDIFACT_GENERATION_DIAGNOSTIC_BEGIN')
    print(json.dumps(value, indent=2, sort_keys=True))
    print('WORLDIFACT_GENERATION_DIAGNOSTIC_END')


if __name__ == '__main__':
    try:
        # SSH output is JSON only; banners and raw subprocess errors are not echoed.
        if sys.argv[1:] == ['--vm']:
            print(json.dumps(inspect(Path.home() / 'froge-connector'), sort_keys=True))
        else:
            main()
    except Exception:
        print('DIAGNOSTIC_UNAVAILABLE: use the original OCI Cloud Shell with its existing SSH key and known host. No model request or worker change was made.', file=sys.stderr)
        sys.exit(1)
