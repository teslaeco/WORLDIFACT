"""Separate one-command Cloud Shell wrapper for one explicitly approved test.

Default PLAN ONLY: no reads, downloads, OCI lookup, SSH, installation or AI.
Private source/test UUIDs and expected original artifact hash are command
parameters, never public constants. The unchanged helper's single durable
claim controls every submission and repeat. This wrapper cannot install,
restart, cancel a job, change credentials, reset a ledger or create a retry.

Provider usage may be billed even when generation fails. The existing USD1.75
reservation does not establish invoice/tax totals or a no-failure-charge policy.
Do not run approved mode without the owner's separate paid-risk consent.
"""
import argparse
import ast
import base64
import hashlib
import json
import re
import subprocess
import sys
import urllib.request

APPROVAL = 'ORIGINAL_INPUT_ASTRA175_ONCE'
PUBLIC_ROOT = 'https://raw.githubusercontent.com/teslaeco/WORLDIFACT/'
LAUNCHER_PATH = 'tools/model_completion/oracle_launch.py'
LAUNCHER_BLOB = 'ba7bb96db4fe1dd0b32f3cfb8c858bd1fd62230c'
HELPER_BLOB = '9a1d836363f2b2746954208d3fe50c4f757bae29'
HELPER_NAME = 'test_original_job_once.py'
LIMIT = 262_144
OUTPUT_LIMIT = 32_768
SSH_TIMEOUT = 2700


class LaunchError(RuntimeError):
    """Fixed public diagnostics only; never include private subprocess output."""


class PrivateArgumentParser(argparse.ArgumentParser):
    def error(self, message):
        self.exit(2, 'STOP: invalid wrapper arguments; no connection made.\n')


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def blob(raw):
    return hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()


def parameters(commit, approval, source_job, test_job, expected_hash):
    if approval != APPROVAL:
        raise LaunchError('Explicit paid-risk approval is required; no connection made.')
    if not isinstance(commit, str) or not re.fullmatch(r'[0-9a-f]{40}', commit):
        raise LaunchError('An exact reviewed lowercase 40-hex source commit is required; no connection made.')
    pattern = r'[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}'
    if (not isinstance(source_job, str) or not re.fullmatch(pattern, source_job)
            or not isinstance(test_job, str) or not re.fullmatch(pattern, test_job) or source_job == test_job):
        raise LaunchError('Distinct canonical private source and test UUIDs are required; no connection made.')
    if not isinstance(expected_hash, str) or not re.fullmatch(r'[0-9a-f]{64}', expected_hash):
        raise LaunchError('The private expected original artifact SHA256 is required; no connection made.')
    return {'approval': approval, 'source_job': source_job, 'test_job': test_job,
            'expected_original_artifact_sha256': expected_hash}


def read_launcher(commit):
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    try:
        with opener.open(PUBLIC_ROOT + commit + '/' + LAUNCHER_PATH, timeout=30) as response:
            if response.status != 200:
                raise LaunchError('Reviewed package loader unavailable; no VM connection made.')
            raw = response.read(LIMIT + 1)
        if not 0 < len(raw) <= LIMIT or blob(raw) != LAUNCHER_BLOB:
            raise LaunchError('Reviewed package loader checksum failed; no VM connection made.')
        return raw
    except LaunchError:
        raise
    except Exception:
        raise LaunchError('Reviewed package loader download failed; no VM connection made.') from None


def reviewed_package(commit):
    """Only immutable, hash-verified public Python is executed locally."""
    raw = read_launcher(commit)
    if not isinstance(raw, bytes) or not 0 < len(raw) <= LIMIT or blob(raw) != LAUNCHER_BLOB:
        raise LaunchError('Reviewed package loader checksum failed; no VM connection made.')
    namespace = {'__name__': 'reviewed_package_loader', '__file__': LAUNCHER_PATH}
    exec(compile(raw, LAUNCHER_PATH, 'exec'), namespace)
    files = namespace.get('FILES')
    if (not isinstance(files, dict) or len(files) != 16
            or files.get(HELPER_NAME) != ('tools/model_completion/' + HELPER_NAME, HELPER_BLOB)):
        raise LaunchError('Reviewed package manifest differs; no VM connection made.')
    payload = namespace['package'](commit)
    expected = {name: value[1] for name, value in files.items()}
    validate_package(payload, expected)
    return namespace, payload, expected


def validate_package(payload, expected):
    if not isinstance(payload, str) or len(payload) > 8 * 1024 * 1024:
        raise LaunchError('Invalid reviewed package envelope; no helper execution.')
    try:
        entries = json.loads(base64.b64decode(payload, validate=True))
        if not isinstance(entries, dict) or set(entries) != set(expected) or len(entries) != 16:
            raise ValueError()
        result = {}
        for name, digest in expected.items():
            if not isinstance(name, str) or not re.fullmatch(r'[a-z0-9_]+\.py', name):
                raise ValueError()
            raw = base64.b64decode(entries[name], validate=True)
            if not 0 < len(raw) <= LIMIT or blob(raw) != digest:
                raise ValueError()
            compile(raw, name, 'exec')
            result[name] = raw
        if expected.get(HELPER_NAME) != HELPER_BLOB:
            raise ValueError()
        tree = ast.parse(result[HELPER_NAME])
        approvals = [ast.literal_eval(node.value) for node in tree.body if isinstance(node, ast.Assign)
                     and any(isinstance(target, ast.Name) and target.id == 'APPROVAL' for target in node.targets)]
        if approvals != [APPROVAL]:
            raise ValueError()
        return result
    except Exception:
        raise LaunchError('Reviewed package verification failed; no helper execution.') from None


# Identical result filter runs on the VM and before anything is printed locally.
# Unexpected/private fields never pass through, even on the helper error path.
SAFE_RESULT_CODE = r'''
def safe_result(value, test_job):
    def reject():
        raise ValueError('Unsafe helper result')
    if not isinstance(value, dict): reject()
    if value.get('phase') == 'ONE_SHOT_NOT_CONFIRMED':
        expected = {'phase': 'ONE_SHOT_NOT_CONFIRMED', 'jobId': test_job, 'automaticPostRetries': 0}
        if value != expected or type(value.get('automaticPostRetries')) is not int: reject()
        return dict(expected)
    base = {'jobId', 'state', 'result', 'submittedThisRun', 'automaticPostRetries',
        'maximumProviderReservationUsd', 'actualInvoiceUsd', 'taxUsd', 'customerCharges',
        'customerPointsDebited', 'visualQuality', 'manufacturingApproval'}
    extra = {'glb', 'geometry', 'hostModelStatus', 'structuralCompletionChecked'}
    states = {'queued', 'generating', 'retrying', 'building', 'succeeded', 'failed', 'cancelled', 'absent'}
    if value.get('jobId') != test_job or value.get('state') not in states: reject()
    succeeded = value['state'] == 'succeeded'
    if set(value) != (base | extra if succeeded else base): reject()
    fixed = {'automaticPostRetries': 0, 'maximumProviderReservationUsd': 1.75,
        'actualInvoiceUsd': None, 'taxUsd': None, 'customerCharges': 0, 'customerPointsDebited': 0,
        'visualQuality': 'REQUIRES_HUMAN_REVIEW', 'manufacturingApproval': False}
    if any(type(value.get(key)) is not type(item) or value[key] != item for key, item in fixed.items()): reject()
    if type(value.get('submittedThisRun')) is not bool: reject()
    if succeeded:
        glb = value['glb']; geometry = value['geometry']
        if (not isinstance(glb, dict) or set(glb) != {'bytes', 'sha256'}
                or type(glb.get('bytes')) is not int or not 20 <= glb['bytes'] <= 50_000_000
                or not isinstance(glb.get('sha256'), str) or not re.fullmatch('[0-9a-f]{64}', glb['sha256'])): reject()
        if (not isinstance(geometry, dict) or not set(geometry) <= {'vertices', 'triangles', 'objects'}
                or any(type(item) is not int or not 0 <= item <= 20_000_000 for item in geometry.values())): reject()
        if value['hostModelStatus'] not in ('draft', 'reviewed', 'unknown') or type(value['structuralCompletionChecked']) is not bool: reject()
        expected_result = ('VERIFIED_MODEL_READY_FOR_VISUAL_REVIEW' if value['structuralCompletionChecked']
                           else 'REJECTED_OR_UNREVIEWED_DRAFT')
        if value['structuralCompletionChecked'] and value['hostModelStatus'] != 'reviewed': reject()
    else:
        expected_result = ('FIXED_JOB_ABSENT_NO_RETRY' if value['state'] == 'absent' else
                           'JOB_DID_NOT_COMPLETE' if value['state'] in ('failed', 'cancelled') else 'JOB_STILL_RUNNING')
    if value.get('result') != expected_result: reject()
    return dict(value)
'''


def safe_result(value, test_job):
    namespace = {'re': re}
    exec(SAFE_RESULT_CODE, namespace)
    try:
        return namespace['safe_result'](value, test_job)
    except Exception:
        raise LaunchError('Unverified helper output suppressed. Keep the original command and claim; no automatic retry.') from None


REMOTE = r'''
import ast, base64, contextlib, hashlib, json, pathlib, re, sys
class Quiet:
    def write(self, value): return len(value)
    def flush(self): pass
result = {'phase': 'ONE_SHOT_NOT_CONFIRMED', 'jobId': PRIVATE['test_job'], 'automaticPostRetries': 0}
try:
    if PRIVATE['approval'] != APPROVAL: raise ValueError()
    pattern = r'[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}'
    if (not re.fullmatch(pattern, PRIVATE['source_job']) or not re.fullmatch(pattern, PRIVATE['test_job'])
            or PRIVATE['source_job'] == PRIVATE['test_job']
            or not re.fullmatch(r'[0-9a-f]{64}', PRIVATE['expected_original_artifact_sha256'])): raise ValueError()
    entries = json.loads(base64.b64decode(PAYLOAD, validate=True))
    if not isinstance(entries, dict) or len(entries) != 16 or set(entries) != set(EXPECTED): raise ValueError()
    files = {}
    for name, wanted in EXPECTED.items():
        if not re.fullmatch(r'[a-z0-9_]+\.py', name): raise ValueError()
        raw = base64.b64decode(entries[name], validate=True)
        actual = hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()
        if not 0 < len(raw) <= 262144 or actual != wanted: raise ValueError()
        compile(raw, name, 'exec')
        files[name] = raw
    if EXPECTED.get('test_original_job_once.py') != HELPER_BLOB: raise ValueError()
    helper = {'__name__': 'reviewed_original_input_helper', '__file__': 'test_original_job_once.py'}
    # Execute only this hash-verified helper. Never import any installer, write
    # its package to the worker, or run a service/credential/maintenance command.
    with contextlib.redirect_stdout(Quiet()), contextlib.redirect_stderr(Quiet()):
        exec(compile(files['test_original_job_once.py'], 'test_original_job_once.py', 'exec'), helper)
        if helper.get('APPROVAL') != APPROVAL: raise ValueError()
        observed = helper['run'](pathlib.Path.home() / 'froge-connector', **PRIVATE)
        result = safe_result(observed, PRIVATE['test_job'])
except BaseException:
    pass
print(json.dumps(result, sort_keys=True), flush=True)
raise SystemExit(1 if result.get('phase') == 'ONE_SHOT_NOT_CONFIRMED' else 0)
'''


def script(payload, expected, private):
    validate_package(payload, expected)
    # Validate independently at script construction, before SSH can be invoked.
    parameters('0' * 40, private.get('approval'), private.get('source_job'), private.get('test_job'),
               private.get('expected_original_artifact_sha256'))
    if set(private) != {'approval', 'source_job', 'test_job', 'expected_original_artifact_sha256'}:
        raise LaunchError('Private parameter scope differs; no VM connection made.')
    return ('EXPECTED = ' + repr(expected) + '\nPAYLOAD = ' + repr(payload)
            + '\nPRIVATE = ' + repr(private) + '\nAPPROVAL = ' + repr(APPROVAL)
            + '\nHELPER_BLOB = ' + repr(HELPER_BLOB) + '\nimport re\n' + SAFE_RESULT_CODE + '\n' + REMOTE)


def invoke(ssh, program, test_job):
    try:
        process = subprocess.run(ssh, input=program, text=True, stdout=subprocess.PIPE,
                                 stderr=subprocess.DEVNULL, timeout=SSH_TIMEOUT)
        if not isinstance(process.stdout, str) or len(process.stdout.encode()) > OUTPUT_LIMIT:
            raise ValueError()
        result = safe_result(json.loads(process.stdout), test_job)
        expected_code = 1 if result.get('phase') == 'ONE_SHOT_NOT_CONFIRMED' else 0
        if process.returncode != expected_code:
            raise ValueError()
        return result
    except (Exception, KeyboardInterrupt):
        raise LaunchError('Test result unconfirmed. Keep the same private parameters and durable claim; no automatic retry or cancellation.') from None


def main(argv=None):
    parser = PrivateArgumentParser(description=__doc__, allow_abbrev=False)
    parser.add_argument('--source-commit')
    parser.add_argument('--approve-paid-test')
    parser.add_argument('--source-job')
    parser.add_argument('--test-job')
    parser.add_argument('--expected-original-artifact-sha256')
    args = parser.parse_args(argv)
    if args.approve_paid_test is None:
        result = {'phase': 'PLAN_ONLY', 'paidGenerationRequested': False}
        print(json.dumps(result, sort_keys=True))
        return result
    private = parameters(args.source_commit, args.approve_paid_test, args.source_job, args.test_job,
                         args.expected_original_artifact_sha256)
    namespace, payload, expected = reviewed_package(args.source_commit)
    program = script(payload, expected, private)
    # The verified maintenance loader contributes only its original strict SSH
    # lookup/connection routine. Its main, script and installer are never used.
    result = invoke(namespace['connection'](), program, private['test_job'])
    print(json.dumps(result, sort_keys=True), flush=True)
    return result


if __name__ == '__main__':
    try:
        value = main()
        if value.get('phase') == 'ONE_SHOT_NOT_CONFIRMED':
            sys.exit(1)
    except LaunchError as error:
        print('STOP: ' + str(error), file=sys.stderr)
        sys.exit(1)
    except (Exception, KeyboardInterrupt):
        print('STOP: test result unconfirmed. Preserve the same private parameters and claim. No automatic retry.', file=sys.stderr)
        sys.exit(1)
