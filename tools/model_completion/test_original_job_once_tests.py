"""Offline fixtures only: never contact Oracle/OpenAI or run a model worker."""
import base64
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import sqlite3
import struct
import tempfile
import unittest
from unittest.mock import patch
import urllib.error

spec = importlib.util.spec_from_file_location('original_once', Path(__file__).with_name('test_original_job_once.py'))
once = importlib.util.module_from_spec(spec)
spec.loader.exec_module(once)

SECRET = 'PRIVATE_LOCAL_TOKEN_CANARY_' + 'x' * 30
SOURCE_JOB = '11111111-2222-4333-8444-aaaaaaaaaaaa'
TEST_JOB = '66666666-7777-4888-8999-bbbbbbbbbbbb'
OTHER_JOB = '99999999-aaaa-4bbb-8ccc-dddddddddddd'
PROMPT = 'Exact original private user prompt.\n\nOriginal adapter suffix.'
INSTRUCTIONS = once.CABINET + '\nExact original private agent contract.\n'
PHOTO_SOURCE = b'# fixture photo contract; never executed\n'
PHOTO_BLOB = once.hashlib.sha1(b'blob ' + str(len(PHOTO_SOURCE)).encode() + b'\0' + PHOTO_SOURCE).hexdigest()
SERVER = b'''from pathlib import Path
import sqlite3
ROOT = Path(__file__).resolve().parent
STATE = ROOT / 'state'
JOBS = STATE / 'jobs'
CONFIG = STATE / 'config.json'
def database():
    return sqlite3.connect(STATE / 'jobs.sqlite', timeout=15)
'''


def health():
    return {'ready': True, 'codexReady': True, 'provider': 'openai', 'model': 'gpt-6-astra',
            'photoInput': True, 'executionEngine': 'codex-mcp', 'connectorVersion': 33,
            'astraBudgetRevision': 'astra-usd175-v1', 'astraBudgetMaxUsd': 1.75,
            'astraBudgetPreflight': 'input-tokens', 'astraBudgetExpiry': once.EXPIRY,
            'astraOutputPolicy': 'astra-low-reconciled-v2', 'astraReasoningEffort': 'low',
            'astraMaxOutputTokens': 16000, 'astraUsageSettlement': 'authenticated-completed-only',
            'astraCacheAccounting': 'astra-confirmed-cache-v1',
            'worldifactCompletionPolicy': once.POLICY, 'worldifactCompletionMaxContinuations': 1}


def jpeg(index=0):
    return b'\xff\xd8\xff\xc0\x00\x11\x08\x00\x10\x00\x20' + bytes([index + 1]) * 10 + b'\xff\xd9'


def glb():
    raw = json.dumps({'asset': {'version': '2.0'}, 'meshes': [{'primitives': []}]}).encode()
    raw += b' ' * (-len(raw) % 4)
    return struct.pack('<IIIII', 0x46546c67, 2, 20 + len(raw), len(raw), 0x4e4f534a) + raw


def fixture_glb(triangles=10, materials=3, meshes=7, nodes=None, primitives=1):
    """Generated synthetic structural fixtures, with no historical model data."""
    counts = triangles if isinstance(triangles, list) else [triangles] * meshes
    parts = primitives if isinstance(primitives, list) else [primitives] * meshes
    body = json.dumps({'asset': {'version': '2.0'}, 'accessors': [{'count': count * 3} for count in counts],
                       'meshes': [{'primitives': [{'indices': i}] * parts[i]} for i in range(meshes)],
                       'nodes': [{'mesh': i % meshes} for i in range(meshes if nodes is None else nodes)],
                       'materials': [{} for _ in range(materials)]}).encode()
    body += b' ' * (-len(body) % 4)
    return struct.pack('<IIIII', 0x46546c67, 2, 20 + len(body), len(body), 0x4e4f534a) + body


class FakeClient:
    def __init__(self):
        self.calls = []
        self.current = None
        self.health = health()
        self.post_result = 202
        self.post_error = None
        self.next_state = 'failed'
        self.source_status = self.source_quality = self.source_model = None
        self.quality = {'state': 'succeeded', 'hasModel': True, 'modelStatus': 'reviewed',
                        'modelSha256': once.digest(glb()), 'geometry': {'triangles': 30000, 'objects': 12, 'prompt': PROMPT},
                        'acceptanceGate': {'passed': True},
                        'prompt': PROMPT, 'token': SECRET, 'failure': {'error': PROMPT}}

    def request(self, path, payload=None, binary=False, timeout=None):
        self.calls.append((path, payload, binary))
        if path.startswith('/v1/jobs/' + SOURCE_JOB):
            if path.endswith('/quality'):
                return (200, self.source_quality) if self.source_quality is not None else (404, None)
            if path.endswith('/model'):
                return (200, self.source_model) if self.source_model is not None else (404, None)
            return (200, self.source_status) if self.source_status is not None else (404, None)
        if path == '/v1/health':
            return 200, self.health
        if path == '/v1/jobs':
            if self.post_error:
                raise self.post_error
            if self.post_result in (200, 201, 202):
                self.current = self.next_state
                return self.post_result, {'id': TEST_JOB, 'state': 'queued'}
            return self.post_result, {'error': PROMPT + SECRET}
        if path.endswith('/quality'):
            return 200, self.quality
        if path.endswith('/model'):
            return 200, glb()
        if self.current is None:
            return 404, None
        return 200, {'id': TEST_JOB, 'state': self.current, 'prompt': PROMPT, 'detail': SECRET}

    def posts(self):
        return [call for call in self.calls if call[1] is not None]


class OriginalOnceTests(unittest.TestCase):
    def setUp(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.root = Path(folder.name) / 'froge-connector'
        self.folder = self.root / 'state/jobs' / SOURCE_JOB
        self.folder.mkdir(parents=True)
        (self.root / 'tools/codex').mkdir(parents=True)
        self.metadata = [{'name': 'private-reference-%d.jpg' % i, 'view': view, 'subject': 'private same subject',
                          'textureMaxSize': 4096, 'sha256': once.digest(jpeg(i))}
                         for i, view in enumerate(('front', 'side', 'detail'))]
        self.write(self.root / 'state/config.json', {'token': SECRET, 'code': 'PRIVATE_PAIRING_CODE_CANARY'})
        self.write(self.folder / 'agent-instructions.json', {'text': INSTRUCTIONS, 'revision': 1})
        self.write(self.folder / 'agent-request.json', {'prompt': PROMPT, 'instructions': INSTRUCTIONS, 'execution_id': 'fixture'})
        self.write(self.folder / 'reference-photos.json', self.metadata)
        for i in range(3):
            (self.folder / ('reference-%d.jpg' % i)).write_bytes(jpeg(i))
        with sqlite3.connect(self.root / 'state/jobs.sqlite') as db:
            db.execute('CREATE TABLE jobs (id TEXT PRIMARY KEY,prompt TEXT,state TEXT,detail TEXT,created REAL,updated REAL)')
            db.execute('INSERT INTO jobs VALUES (?,?,?,?,?,?)', (SOURCE_JOB, PROMPT, 'failed', 'fixture completion failure', 1, 1))
        self.sources = {'server.py': SERVER, 'codex_runner.py': b'# codex fixture\n',
                        'blender_mcp.py': b'# mcp fixture\n', 'completion_policy.py': b'# completion fixture\n',
                        'astra_spend_v2.py': b'# output fixture\n'}
        for name, raw in {**self.sources, 'fast_preview.py': b'# fast fixture\n', 'astra_spend.py': b'# guard fixture\n',
                          'photo_input.py': PHOTO_SOURCE}.items():
            (self.root / name).write_bytes(raw)
        self.proofs()
        self.client = FakeClient()
        self.patch = patch.object(once, 'PHOTO_SOURCE_BLOB', PHOTO_BLOB)
        self.patch.start()
        self.addCleanup(self.patch.stop)
        self.expected_artifact = None
        self.time = patch.object(once.time, 'time', return_value=1790928000)
        self.time.start()
        self.addCleanup(self.time.stop)

    @staticmethod
    def write(path, data):
        path.write_text(json.dumps(data))

    def proofs(self):
        hashes = {n: once.digest((self.root / n).read_bytes()) for n in self.sources}
        self.write(self.root / '.worldifact-model-completion.json', {'revision': once.POLICY, 'sha256': hashes})
        self.write(self.root / 'tools/codex/verified.json', {'sources': {n: hashes[n] for n in ('codex_runner.py', 'blender_mcp.py')},
                   'cli_mcp_roundtrip': True, 'code_mode_roundtrip': True, 'blender_build_roundtrip': True})
        self.write(self.root / '.worldifact-astra-guard.json', {'revision': 'astra-usd175-v1',
                   'sha256': {n: once.digest((self.root / n).read_bytes()) for n in ('codex_runner.py', 'fast_preview.py', 'astra_spend.py')},
                   'outputPolicy': {'revision': 'astra-low-reconciled-v2', 'sha256': hashes['astra_spend_v2.py']}})

    def descriptor(self):
        return once.descriptor(SOURCE_JOB, TEST_JOB, self.expected_artifact)

    def binding(self):
        return {'promptSha256': once.digest(PROMPT.encode()), 'instructionsSha256': once.digest(INSTRUCTIONS.encode()),
                'photoMetadataSha256': once.digest(json.dumps(self.metadata, sort_keys=True, separators=(',', ':')).encode()),
                'photoSha256': [p['sha256'] for p in self.metadata]}

    def run_once(self, approval=once.APPROVAL, status=False):
        return once.run(self.root, approval, status, lambda token, descriptor: self.client,
                        source_job=SOURCE_JOB, test_job=TEST_JOB,
                        expected_original_artifact_sha256=self.expected_artifact)

    def retained_source(self, raw=None):
        """Synthetic succeeded-but-unfinished fallback."""
        raw = fixture_glb() if raw is None else raw
        self.expected_artifact = once.digest(raw)
        measured = once.retained_geometry(raw)
        with sqlite3.connect(self.root / 'state/jobs.sqlite') as db:
            db.execute('UPDATE jobs SET state=? WHERE id=?', ('succeeded', SOURCE_JOB))
        current = self.folder / 'candidates/1'
        current.mkdir(parents=True)
        self.write(self.folder / 'agent-candidate.json', {'execution_id': 'fixture', 'revision': 1, 'path': 'candidates/1'})
        result = {'triangles': measured['triangles'], 'objects': measured['meshCount'], 'privateFixtureNote': 'not for output'}
        ready = {'revision': 1, 'phase': 'core_export', 'bytes': len(raw), 'sha256': once.digest(raw), 'result': result}
        for folder in (current, self.folder):
            (folder / 'model.glb').write_bytes(raw)
            self.write(folder / 'model-ready.json', ready)
            self.write(folder / 'result.json', result)
        review = {'status': 'not_completed', 'assessment_completed': False, 'accepted': False,
                  'issues': ['synthetic unfinished fixture']}
        self.write(self.folder / 'visual-review.json', review)
        self.client.source_status = {'id': SOURCE_JOB, 'state': 'succeeded', 'modelStatus': 'draft'}
        self.client.source_quality = {'state': 'succeeded', 'modelStatus': 'draft', 'hasModel': True,
                                      'automaticQualityAccepted': False, 'agent': {}, 'visualReview': review,
                                      'geometry': {'triangles': measured['triangles'], 'objects': measured['meshCount']}}
        self.client.source_model = raw
        return current

    def assert_blocked(self):
        with self.assertRaises((once.TestError, OSError)):
            self.run_once()
        self.assertEqual(self.client.posts(), [])
        self.assertFalse(once.claim_path(self.root).exists())

    def test_default_reads_and_connects_nothing(self):
        with patch.object(once, 'local_token') as token, patch.object(once, 'read_regular') as read, \
                patch.object(once.urllib.request, 'build_opener') as network, patch.object(Path, 'home', return_value=self.root.parent), \
                contextlib.redirect_stdout(io.StringIO()) as output:
            result = once.main([])
        self.assertEqual(result['phase'], 'PLAN_ONLY')
        token.assert_not_called()
        read.assert_not_called()
        network.assert_not_called()
        self.assertFalse(once.claim_path(self.root).exists())
        self.assertNotIn(SECRET, output.getvalue())

    def test_cli_accepts_private_parameters_and_never_echoes_them_on_parse_error(self):
        arguments = ['--approve-paid-test', once.APPROVAL, '--source-job', SOURCE_JOB,
                     '--test-job', TEST_JOB, '--expected-original-artifact-sha256', 'a' * 64]
        with patch.object(once, 'run', return_value={'phase': 'fixture'}) as run, \
                contextlib.redirect_stdout(io.StringIO()) as output:
            once.main(arguments)
        self.assertEqual(run.call_args.kwargs, {'source_job': SOURCE_JOB, 'test_job': TEST_JOB,
                                               'expected_original_artifact_sha256': 'a' * 64})
        self.assertNotIn(SOURCE_JOB, output.getvalue())
        for invalid in (['--unexpected', PROMPT], ['--test-job'], ['--source', SOURCE_JOB]):
            with self.subTest(arguments=invalid), contextlib.redirect_stderr(io.StringIO()) as error, \
                    self.assertRaisesRegex(once.TestError, '^CLI_ARGUMENTS_INVALID$'):
                once.main(invalid)
            self.assertEqual(error.getvalue(), '')

    def test_wrong_approval_reads_and_connects_nothing(self):
        with patch.object(once, 'local_token') as token, patch.object(once, 'verify_sources') as verify:
            with self.assertRaises(once.TestError):
                self.run_once('APPROVED_INSTALL_IS_NOT_PAID_APPROVAL')
        token.assert_not_called()
        verify.assert_not_called()

    def test_canonical_distinct_private_parameters_are_required_before_any_paid_read(self):
        valid = {'source_job': SOURCE_JOB, 'test_job': TEST_JOB, 'expected_original_artifact_sha256': None}
        invalid = [('source_job', None), ('source_job', ''), ('source_job', TEST_JOB),
                   ('source_job', SOURCE_JOB.upper()), ('source_job', '../' + SOURCE_JOB),
                   ('test_job', None), ('test_job', SOURCE_JOB), ('test_job', TEST_JOB.upper()),
                   ('test_job', TEST_JOB + '/cancel'), ('expected_original_artifact_sha256', ''),
                   ('expected_original_artifact_sha256', 'A' * 64), ('expected_original_artifact_sha256', 'a' * 63)]
        for key, value in invalid:
            with self.subTest(key=key, value=value), patch.object(once, 'local_token') as token, \
                    patch.object(once, 'read_regular') as read, patch.object(once, 'safe') as paths, \
                    self.assertRaises(once.TestError):
                once.run(self.root, once.APPROVAL, client_factory=lambda *args: self.client, **{**valid, key: value})
            token.assert_not_called()
            read.assert_not_called()
            paths.assert_not_called()
        self.assertEqual(self.client.calls, [])

    def test_exactly_one_post_preserves_all_original_inputs_and_private_binding(self):
        before = (self.root / 'state/jobs.sqlite').read_bytes()
        result = self.run_once()
        self.assertEqual(len(self.client.posts()), 1)
        payload = self.client.posts()[0][1]
        self.assertEqual(set(payload), {'id', 'prompt', 'agentInstructions', 'photos'})
        self.assertEqual(payload['id'], TEST_JOB)
        self.assertEqual(payload['prompt'].encode(), PROMPT.encode())
        self.assertEqual(payload['agentInstructions'].encode(), INSTRUCTIONS.encode())
        for i, photo in enumerate(payload['photos']):
            self.assertEqual(base64.b64decode(photo['dataUrl'].split(',')[1]), jpeg(i))
            self.assertEqual({k: v for k, v in photo.items() if k != 'dataUrl'},
                             {k: v for k, v in self.metadata[i].items() if k != 'sha256'})
        claim = json.loads(once.claim_path(self.root).read_text())
        self.assertEqual(claim['inputBinding']['photoSha256'], [x['sha256'] for x in self.metadata])
        self.assertEqual(claim['inputBinding']['promptSha256'], once.digest(PROMPT.encode()))
        self.assertEqual(once.claim_path(self.root).stat().st_mode & 0o777, 0o600)
        self.assertEqual(once.claim_path(self.root).parent.stat().st_mode & 0o777, 0o700)
        self.assertEqual(before, (self.root / 'state/jobs.sqlite').read_bytes())
        self.assertEqual(result['submittedThisRun'], True)
        self.assertEqual(result['customerPointsDebited'], 0)
        self.assertNotIn(PROMPT, json.dumps(result))
        self.assertNotIn(SECRET, json.dumps(result))
        self.assertNotIn('private-reference', json.dumps(result))
        self.assertNotIn('PRIVATE_PAIRING_CODE', json.dumps(result))
        self.assertNotIn(SOURCE_JOB, json.dumps(result))
        self.assertNotIn('sourceJobId', result)
        self.assertNotIn(PROMPT, once.claim_path(self.root).read_text())

    def test_claim_is_fsynced_before_the_one_post(self):
        original = self.client.request
        def request(path, payload=None, binary=False, timeout=None):
            if payload is not None:
                self.assertTrue(once.check_claim(self.root))
                self.assertGreaterEqual(fsync.call_count, 2)
            return original(path, payload, binary)
        with patch.object(once.os, 'fsync', wraps=os.fsync) as fsync, patch.object(self.client, 'request', side_effect=request):
            self.run_once()

    def test_duplicate_claim_only_observes_same_job_even_if_source_or_health_changed(self):
        self.run_once()
        self.client.calls.clear()
        (self.root / 'completion_policy.py').write_text('changed')
        self.client.health = {}
        self.folder.joinpath('reference-0.jpg').unlink()
        result = self.run_once()
        self.assertFalse(result['submittedThisRun'])
        self.assertEqual([c[0] for c in self.client.calls], ['/v1/jobs/' + TEST_JOB])

    def test_existing_claim_and_404_never_post_again(self):
        once.claim(self.root, self.binding(), self.descriptor())
        result = self.run_once()
        self.assertEqual(result['state'], 'absent')
        self.assertEqual(self.client.posts(), [])

    def test_existing_claim_must_bind_all_parameters(self):
        once.claim(self.root, self.binding(), self.descriptor())
        path = once.claim_path(self.root)
        original = json.loads(path.read_text())
        for key, value in [('sourceJobId', OTHER_JOB), ('jobId', OTHER_JOB),
                           ('expectedOriginalArtifactSha256', 'a' * 64), ('approval', 'different'),
                           ('maxProviderReservationUsd', 2.0), ('inputBinding', {})]:
            self.write(path, {**original, key: value})
            with self.subTest(key=key), self.assertRaises(once.TestError):
                self.run_once()
            self.assertEqual(self.client.calls, [])

    def test_same_claim_changed_runtime_source_test_hash_or_approval_never_connects(self):
        self.run_once()
        self.client.calls.clear()
        valid = {'source_job': SOURCE_JOB, 'test_job': TEST_JOB, 'expected_original_artifact_sha256': None,
                 'approval': once.APPROVAL}
        for key, value in [('source_job', OTHER_JOB), ('test_job', OTHER_JOB),
                           ('expected_original_artifact_sha256', 'a' * 64), ('approval', 'different')]:
            with self.subTest(key=key), patch.object(once, 'local_token') as token, self.assertRaises(once.TestError):
                once.run(self.root, client_factory=lambda *args: self.client, **{**valid, key: value})
            token.assert_not_called()
            self.assertEqual(self.client.calls, [])
        self.assertEqual(list(once.claim_path(self.root).parent.iterdir()), [once.claim_path(self.root)])

    def test_uncertain_post_keeps_claim_and_rerun_is_get_only(self):
        self.client.post_error = once.TestError('LOCAL_REQUEST_UNCONFIRMED_NO_POST_RETRY')
        with self.assertRaises(once.TestError):
            self.run_once()
        self.assertTrue(once.claim_path(self.root).exists())
        self.client.calls.clear()
        self.run_once()
        self.assertEqual(self.client.posts(), [])

    def test_failed_claim_fsync_leaves_consumed_record_without_post(self):
        with patch.object(once.os, 'fsync', side_effect=OSError('private operating-system text')):
            with self.assertRaises(OSError):
                self.run_once()
        self.assertTrue(once.claim_path(self.root).exists())
        self.assertEqual(self.client.posts(), [])
        self.client.calls.clear()
        self.run_once()
        self.assertEqual(self.client.posts(), [])

    def test_claim_exclusive_creation_never_overwrites_first_binding(self):
        binding = self.binding()
        self.assertTrue(once.claim(self.root, binding, self.descriptor()))
        before = once.claim_path(self.root).read_bytes()
        self.assertFalse(once.claim(self.root, binding, self.descriptor()))
        with self.assertRaises(once.TestError):
            once.claim(self.root, {**binding, 'promptSha256': 'a' * 64}, self.descriptor())
        self.assertEqual(once.claim_path(self.root).read_bytes(), before)

    def test_direct_lost_exclusive_claim_rechecks_bound_descriptor(self):
        private_descriptor = self.descriptor()
        binding = self.binding()
        once.claim(self.root, binding, private_descriptor)
        before = once.claim_path(self.root).read_bytes()
        for source, test, expected in [(OTHER_JOB, TEST_JOB, None), (SOURCE_JOB, OTHER_JOB, None),
                                       (SOURCE_JOB, TEST_JOB, 'a' * 64)]:
            with self.subTest(source=source, test=test, expected=expected), self.assertRaises(once.TestError):
                once.claim(self.root, binding, once.descriptor(source, test, expected))
            self.assertEqual(once.claim_path(self.root).read_bytes(), before)
        self.assertEqual(self.client.calls, [])

    def test_existing_spend_ledgers_provider_settings_and_environment_are_untouched(self):
        ledger = self.root / 'state/worldifact-astra-budgets/original-job-ledger'
        ledger.mkdir(parents=True)
        (ledger / '.worldifact-astra-spend.json').write_text('PRIVATE_LEDGER_DO_NOT_READ_OR_RESET')
        (self.folder / '.worldifact-astra-spend.json').write_text('PRIVATE_OLD_LEDGER')
        (self.root / 'state/ai-provider.json').write_text('PRIVATE_EXISTING_API_KEY_SETTINGS')
        paths = [ledger / '.worldifact-astra-spend.json', self.folder / '.worldifact-astra-spend.json', self.root / 'state/ai-provider.json']
        before = {p: p.read_bytes() for p in paths}
        environment = dict(os.environ)
        original = once.read_regular
        def reader(path, limit):
            self.assertNotIn(Path(path), paths)
            return original(path, limit)
        with patch.object(once, 'read_regular', side_effect=reader):
            self.run_once()
        self.assertEqual(before, {p: p.read_bytes() for p in paths})
        self.assertEqual(environment, dict(os.environ))

    def test_rejected_409_and_500_conservatively_consume_claim(self):
        for status in (409, 500):
            with self.subTest(status=status):
                self.client.post_result = status
                with self.assertRaises(once.TestError):
                    self.run_once()
                self.assertTrue(once.check_claim(self.root))
                self.client.calls.clear()
                self.run_once()
                self.assertEqual(self.client.posts(), [])
                # Test-fixture cleanup only; production helper has no delete.
                once.claim_path(self.root).unlink()

    def test_interrupted_post_keeps_claim_no_auto_cancel(self):
        self.client.post_error = KeyboardInterrupt()
        with self.assertRaises(KeyboardInterrupt):
            self.run_once()
        self.assertTrue(once.check_claim(self.root))
        self.assertFalse(any('/cancel' in x[0] for x in self.client.calls))
        self.client.calls.clear()
        self.run_once()
        self.assertEqual(self.client.posts(), [])

    def test_preexisting_job_without_claim_never_posts(self):
        self.client.current = 'failed'
        self.assert_blocked()

    def test_race_lost_same_claim_only_observes(self):
        real_claim = once.claim
        def raced(root, binding, private_descriptor):
            self.assertTrue(real_claim(root, binding, private_descriptor))
            return False
        with patch.object(once, 'claim', side_effect=raced):
            result = self.run_once()
        self.assertEqual(result['state'], 'absent')
        self.assertEqual(self.client.posts(), [])

    def test_race_lost_claim_rechecks_every_descriptor_and_input_binding(self):
        real_claim = once.claim
        for key, changed in [('sourceJobId', OTHER_JOB), ('jobId', OTHER_JOB),
                             ('expectedOriginalArtifactSha256', 'a' * 64), ('approval', 'different'),
                             ('maxProviderReservationUsd', 2.0), ('inputBinding', {**self.binding(), 'promptSha256': 'a' * 64})]:
            def raced(root, binding, private_descriptor):
                self.assertTrue(real_claim(root, binding, private_descriptor))
                path = once.claim_path(root)
                self.write(path, {**json.loads(path.read_text()), key: changed})
                return False
            with self.subTest(key=key), patch.object(once, 'claim', side_effect=raced), self.assertRaises(once.TestError):
                self.run_once()
            self.assertEqual(self.client.posts(), [])
            self.assertEqual(sum(call[0] == '/v1/jobs/' + TEST_JOB for call in self.client.calls), 1)
            self.client.calls.clear()
            once.claim_path(self.root).unlink()  # Synthetic fixture isolation only.

    def test_status_requires_claim_and_connects_to_nothing_without_one(self):
        with patch.object(once, 'local_token') as token, self.assertRaises(once.TestError):
            once.run(self.root, status_only=True, client_factory=lambda *args: self.client)
        token.assert_not_called()
        self.assertEqual(self.client.calls, [])
        self.assertFalse(once.claim_path(self.root).exists())

    def test_status_snapshot_uses_only_existing_claim_and_never_reads_source_or_posts(self):
        once.claim(self.root, self.binding(), self.descriptor())
        self.client.current = 'generating'
        with patch.object(once, 'verify_sources') as verify, patch.object(once, 'original_input') as inputs:
            result = once.run(self.root, status_only=True, client_factory=lambda *args: self.client)
        self.assertEqual(result['state'], 'generating')
        verify.assert_not_called()
        inputs.assert_not_called()
        self.assertEqual(self.client.posts(), [])
        self.assertEqual([call[0] for call in self.client.calls], ['/v1/jobs/' + TEST_JOB])

    def test_finite_poll_deadline_preserves_running_job_without_cancel(self):
        self.client.current = 'generating'
        now = [0]
        def sleep(seconds):
            now[0] += seconds
        result = once.observe(self.client, TEST_JOB, clock=lambda: now[0], sleep=sleep)
        self.assertEqual(now[0], once.POLL_SECONDS)
        self.assertEqual(result['state'], 'generating')
        self.assertTrue(all(call[0] == '/v1/jobs/' + TEST_JOB for call in self.client.calls))

    def test_all_health_fields_are_required_before_claim_or_post(self):
        for key in health():
            with self.subTest(key=key):
                self.client.health = health()
                del self.client.health[key]
                self.assert_blocked()

    def test_health_wrong_types_provider_cap_policy_and_expiry_block(self):
        for key, value in [('ready', 1), ('astraBudgetMaxUsd', 2.0), ('provider', 'other'),
                           ('worldifactCompletionPolicy', 'unknown'), ('worldifactCompletionMaxContinuations', True),
                           ('astraBudgetExpiry', str(once.EXPIRY)), ('astraReasoningEffort', 'high')]:
            with self.subTest(key=key):
                self.client.health = {**health(), key: value}
                self.assert_blocked()
        self.client.health = health()
        with patch.object(once.time, 'time', return_value=once.EXPIRY):
            self.assert_blocked()

    def test_source_receipt_runtime_guard_and_photo_changes_block(self):
        for relative in ['server.py', 'completion_policy.py', 'astra_spend_v2.py', 'astra_spend.py', 'photo_input.py',
                         '.worldifact-model-completion.json', '.worldifact-astra-guard.json', 'tools/codex/verified.json']:
            path = self.root / relative
            before = path.read_bytes()
            with self.subTest(path=relative):
                path.write_bytes(b'{}')
                self.assert_blocked()
                path.write_bytes(before)

    def test_changed_server_state_or_database_path_fails_even_with_self_consistent_receipt(self):
        for old, new in [(b"STATE / 'jobs'", b"STATE / 'elsewhere'"), (b"STATE / 'jobs.sqlite'", b"STATE / 'elsewhere.sqlite'")]:
            with self.subTest(new=new):
                (self.root / 'server.py').write_bytes(SERVER.replace(old, new))
                self.proofs()
                self.assert_blocked()

    def test_photo_count_metadata_hash_and_bytes_must_match_exactly(self):
        mutations = [self.metadata[:2], self.metadata + [self.metadata[0]],
                     [{**self.metadata[0], 'sha256': '0' * 64}, *self.metadata[1:]],
                     [{**self.metadata[0], 'unexpected': 'private'}, *self.metadata[1:]],
                     [{**self.metadata[0], 'name': '  changed  '}, *self.metadata[1:]]]
        for metadata in mutations:
            with self.subTest(metadata_keys=[list(x) for x in metadata]):
                self.write(self.folder / 'reference-photos.json', metadata)
                self.assert_blocked()
        self.write(self.folder / 'reference-photos.json', self.metadata)
        (self.folder / 'reference-1.jpg').write_bytes(jpeg(2))
        self.assert_blocked()

    def test_jpeg_invalid_even_when_manifest_hash_matches(self):
        data = b'not a jpeg with enough bytes'
        (self.folder / 'reference-0.jpg').write_bytes(data)
        self.metadata[0]['sha256'] = once.digest(data)
        self.write(self.folder / 'reference-photos.json', self.metadata)
        self.assert_blocked()

    def test_original_request_mismatch_unknown_state_and_replay_block(self):
        self.write(self.folder / 'agent-request.json', {'prompt': 'changed', 'instructions': INSTRUCTIONS})
        self.assert_blocked()
        self.write(self.folder / 'agent-request.json', {'prompt': PROMPT, 'instructions': INSTRUCTIONS})
        for name in ('source-job.json', 'generation-profile.json', 'render-recovery.json'):
            with self.subTest(name=name):
                self.write(self.folder / name, {})
                self.assert_blocked()
                (self.folder / name).unlink()
        with sqlite3.connect(self.root / 'state/jobs.sqlite') as db:
            db.execute('UPDATE jobs SET state=?', ('succeeded',))
        self.assert_blocked()

    def test_old_timeout_scene_recovery_is_not_silently_used(self):
        self.write(self.folder / 'failure.json', {'kind': 'timeout', 'private': PROMPT})
        self.assert_blocked()

    def test_hash_bound_succeeded_unfinished_deficient_source_is_allowed_once(self):
        self.retained_source()
        original = {str(p.relative_to(self.folder)): p.read_bytes() for p in self.folder.rglob('*') if p.is_file()}
        result = self.run_once()
        self.assertEqual(len(self.client.posts()), 1)
        self.assertEqual(self.client.posts()[0][1]['prompt'], PROMPT)
        self.assertEqual(self.client.posts()[0][1]['agentInstructions'], INSTRUCTIONS)
        self.assertEqual(len(self.client.posts()[0][1]['photos']), 3)
        expected_routes = {'/v1/jobs/' + SOURCE_JOB, '/v1/jobs/' + SOURCE_JOB + '/quality', '/v1/jobs/' + SOURCE_JOB + '/model'}
        source_calls = [c for c in self.client.calls if c[0].startswith('/v1/jobs/' + SOURCE_JOB)]
        self.assertEqual({c[0] for c in source_calls}, expected_routes)
        self.assertTrue(all(c[1] is None for c in source_calls))
        claim = once.read_json(once.claim_path(self.root))
        self.assertEqual(claim['inputBinding']['unfinishedRetainedArtifact']['sha256'], once.digest(fixture_glb()))
        self.assertEqual(original, {str(p.relative_to(self.folder)): p.read_bytes() for p in self.folder.rglob('*') if p.is_file()})
        self.assertNotIn(once.digest(fixture_glb()), json.dumps(result))
        self.assertNotIn(SOURCE_JOB, json.dumps(result))
        self.assertNotIn('synthetic unfinished fixture', json.dumps(result))
        self.client.calls.clear()
        self.run_once()
        self.assertEqual(self.client.posts(), [])
        self.assertFalse(any(c[0].startswith('/v1/jobs/' + SOURCE_JOB) for c in self.client.calls))

    def test_succeeded_unfinished_source_requires_expected_private_artifact_hash(self):
        self.retained_source()
        for expected in (None, 'a' * 64):
            with self.subTest(expected=expected):
                self.expected_artifact = expected
                self.assert_blocked()
        self.assertEqual(self.client.calls, [])

    def test_failed_source_supplied_expected_artifact_hash_is_never_ignored(self):
        raw = fixture_glb()
        (self.folder / 'model.glb').write_bytes(raw)
        self.expected_artifact = 'a' * 64
        self.assert_blocked()
        self.assertEqual(self.client.calls, [])
        self.expected_artifact = once.digest(raw)
        self.client.source_model = raw + b'changed'
        self.assert_blocked()
        self.client.source_model = raw
        self.run_once()
        self.assertEqual(len(self.client.posts()), 1)
        record = once.check_claim(self.root)
        self.assertEqual(record['expectedOriginalArtifactSha256'], once.digest(raw))
        self.assertEqual(record['inputBinding']['failedSourceArtifact'], {'bytes': len(raw), 'sha256': once.digest(raw)})
        self.client.calls.clear()
        self.expected_artifact = None
        with self.assertRaises(once.TestError):
            self.run_once()
        self.assertEqual(self.client.calls, [])

    def test_each_public_completion_floor_deficit_admits_an_explicit_unfinished_draft(self):
        cases = {
            'renderedTriangles': {'meshes': 8, 'triangles': 2499},
            'meshCount': {'meshes': 7, 'nodes': 8, 'triangles': 3000, 'primitives': 2},
            'substantialMeshCount': {'meshes': 8, 'triangles': [5000] * 5 + [1] * 3},
            'primitiveCount': {'meshes': 8, 'triangles': 3000, 'primitives': [1] * 7 + [0]},
            'materialCount': {'meshes': 8, 'triangles': 2500, 'materials': 2},
            'nodeCount': {'meshes': 8, 'nodes': 7, 'triangles': 3000},
        }
        for metric, arguments in cases.items():
            with self.subTest(metric=metric):
                raw = fixture_glb(**arguments)
                measured = once.retained_geometry(raw)
                self.assertEqual([key for key, floor in once.CABINET_FLOORS.items() if measured[key] < floor], [metric])
                fixture = OriginalOnceTests()
                fixture.setUp()
                try:
                    fixture.retained_source(raw)
                    result = fixture.run_once()
                    self.assertTrue(result['submittedThisRun'])
                    self.assertEqual(len(fixture.client.posts()), 1)
                finally:
                    fixture.doCleanups()

    def test_substantial_mesh_floor_is_measured_at_twenty_four_triangles(self):
        below = once.retained_geometry(fixture_glb(meshes=8, triangles=[5000] * 5 + [23] * 3))
        at = once.retained_geometry(fixture_glb(meshes=8, triangles=[5000] * 5 + [24] * 3))
        self.assertEqual(below['substantialMeshCount'], 5)
        self.assertEqual(at['substantialMeshCount'], 8)
        self.assertTrue(any(below[k] < floor for k, floor in once.CABINET_FLOORS.items()))
        self.assertTrue(all(at[k] >= floor for k, floor in once.CABINET_FLOORS.items()))

    def test_succeeded_source_reported_counters_cannot_hide_measured_complete_geometry(self):
        current = self.retained_source(fixture_glb(meshes=8, triangles=2500))
        for folder in (current, self.folder):
            result = json.loads((folder / 'result.json').read_text())
            result['triangles'] = 1
            self.write(folder / 'result.json', result)
            ready = json.loads((folder / 'model-ready.json').read_text())
            ready['result'] = result
            self.write(folder / 'model-ready.json', ready)
        self.client.source_quality['geometry']['triangles'] = 1
        self.assert_blocked()

    def test_status_rejects_supplied_changed_parameters_before_connecting(self):
        self.retained_source()
        self.run_once()
        self.client.calls.clear()
        for source, test, expected in [(OTHER_JOB, TEST_JOB, self.expected_artifact),
                                       (SOURCE_JOB, OTHER_JOB, self.expected_artifact),
                                       (SOURCE_JOB, TEST_JOB, None)]:
            with self.subTest(source=source, test=test, expected=expected), self.assertRaises(once.TestError):
                once.run(self.root, status_only=True, client_factory=lambda *args: self.client,
                         source_job=source, test_job=test, expected_original_artifact_sha256=expected)
            self.assertEqual(self.client.calls, [])
        result = once.run(self.root, status_only=True, client_factory=lambda *args: self.client)
        self.assertEqual(result['jobId'], TEST_JOB)
        self.assertEqual([call[0] for call in self.client.calls], ['/v1/jobs/' + TEST_JOB])

    def test_succeeded_source_missing_candidate_checkpoint_or_review_stops(self):
        current = self.retained_source()
        for path in (self.folder / 'agent-candidate.json', current / 'model-ready.json', self.folder / 'model-ready.json',
                     current / 'model.glb', self.folder / 'model.glb', current / 'result.json', self.folder / 'visual-review.json'):
            with self.subTest(file=path.name):
                raw = path.read_bytes()
                path.unlink()
                self.assert_blocked()
                path.write_bytes(raw)

    def test_succeeded_source_changed_local_candidate_root_or_served_artifact_stops(self):
        current = self.retained_source()
        for path in (current / 'model.glb', self.folder / 'model.glb'):
            with self.subTest(file=str(path.relative_to(self.folder))):
                original = path.read_bytes()
                path.write_bytes(original[:-1] + b'X')
                self.assert_blocked()
                path.write_bytes(original)
        self.client.source_model = fixture_glb()[:-1] + b'X'
        self.assert_blocked()

    def test_succeeded_source_stale_execution_wrong_checkpoint_or_result_stops(self):
        current = self.retained_source()
        changes = [(self.folder / 'agent-candidate.json', 'execution_id', 'different'),
                   (self.folder / 'agent-candidate.json', 'path', '../elsewhere'),
                   (current / 'model-ready.json', 'revision', 2),
                   (current / 'model-ready.json', 'phase', 'unknown'),
                   (current / 'model-ready.json', 'sha256', '0' * 64),
                   (current / 'model-ready.json', 'bytes', 1),
                   (self.folder / 'result.json', 'triangles', 20000)]
        for path, key, changed in changes:
            with self.subTest(file=path.name, key=key):
                original = path.read_bytes()
                value = json.loads(original)
                self.write(path, {**value, key: changed})
                self.assert_blocked()
                path.write_bytes(original)

    def test_finished_accepted_rejected_or_unknown_attestation_is_not_an_unfinished_source(self):
        self.retained_source()
        path = self.folder / 'agent-outcome.json'
        for value in ({'finished': True, 'accepted': True}, {'finished': True, 'accepted': False},
                      {'finished': False, 'accepted': False}, {}):
            with self.subTest(value=value):
                self.write(path, value)
                self.assert_blocked()
                path.unlink()
        path.write_text('malformed unknown outcome')
        self.assert_blocked()

    def test_succeeded_source_ordinary_success_or_unknown_quality_stops(self):
        self.retained_source()
        original = dict(self.client.source_quality)
        for key, value in [('modelStatus', 'reviewed'), ('automaticQualityAccepted', True),
                           ('agent', {'finished': True, 'accepted': True}), ('agent', None),
                           ('visualReview', {'status': 'reviewed', 'assessment_completed': True, 'accepted': True})]:
            with self.subTest(key=key, value=value):
                self.client.source_quality = {**original, key: value}
                self.assert_blocked()
        self.client.source_quality = original
        self.client.source_status['modelStatus'] = 'reviewed'
        self.assert_blocked()

    def test_succeeded_source_passing_public_floors_is_rejected_even_with_matching_checkpoints(self):
        self.retained_source(fixture_glb(triangles=2500, meshes=8))
        self.assert_blocked()

    def test_source_finish_appearing_during_gets_stops_before_claim(self):
        self.retained_source()
        original = self.client.request
        def request(path, payload=None, binary=False, timeout=None):
            if path == '/v1/jobs/' + SOURCE_JOB + '/model':
                self.write(self.folder / 'agent-outcome.json', {'finished': True, 'accepted': True})
            return original(path, payload, binary, timeout)
        with patch.object(self.client, 'request', side_effect=request):
            self.assert_blocked()

    def test_active_job_blocks_before_claim(self):
        with sqlite3.connect(self.root / 'state/jobs.sqlite') as db:
            db.execute('INSERT INTO jobs VALUES (?,?,?,?,?,?)', ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'private other', 'generating', '', 2, 2))
        self.assert_blocked()

    def test_symlink_and_nonregular_credential_photo_database_claim_paths_block(self):
        for path in [self.root / 'state/config.json', self.folder / 'reference-0.jpg', self.root / 'state/jobs.sqlite']:
            with self.subTest(path=path.name):
                original = path.with_suffix('.original')
                path.rename(original)
                path.symlink_to(original)
                self.assert_blocked()
                path.unlink()
                original.rename(path)
        claims = once.claim_path(self.root).parent
        claims.symlink_to(self.folder, target_is_directory=True)
        with self.assertRaises(once.TestError):
            self.run_once()
        self.assertEqual(self.client.posts(), [])

    def test_parent_directory_symlinks_are_rejected(self):
        link = self.root.parent / 'linked'
        link.symlink_to(self.root, target_is_directory=True)
        with self.assertRaises(once.TestError):
            once.run(link, once.APPROVAL, client_factory=lambda *args: self.client, source_job=SOURCE_JOB, test_job=TEST_JOB)
        self.assertEqual(self.client.calls, [])

    def test_credentials_are_bounded_no_api_key_is_read(self):
        for config in [{'token': 'short'}, {'token': 'x' * 32 + '\n'}, {'token': 'x' * 257}, ['bad'],
                       {'token': SECRET, 'padding': 'x' * 17000}]:
            with self.subTest(kind=type(config).__name__):
                self.write(self.root / 'state/config.json', config)
                self.assert_blocked()
        self.write(self.root / 'state/config.json', {'token': SECRET})
        (self.root / 'state/ai-provider.json').write_text('MUST_NOT_READ_API_KEY')
        original = once.read_regular
        def reader(path, limit):
            self.assertNotIn('ai-provider', str(path))
            return original(path, limit)
        with patch.object(once, 'read_regular', side_effect=reader):
            self.run_once()

    def test_fifo_oversized_file_and_corrupt_claim_never_post(self):
        path = self.root / 'state/config.json'
        path.unlink()
        os.mkfifo(path)
        self.assert_blocked()
        path.unlink()
        self.write(path, {'token': SECRET})
        once.claim_path(self.root).parent.mkdir(mode=0o700)
        once.claim_path(self.root).write_text('{')
        with self.assertRaises(once.TestError):
            self.run_once()
        self.assertEqual(self.client.posts(), [])

    def test_success_metadata_is_sanitized_and_never_claims_visual_approval(self):
        self.client.next_state = 'succeeded'
        result = self.run_once()
        self.assertEqual(result['glb'], {'bytes': len(glb()), 'sha256': once.digest(glb())})
        self.assertEqual(result['geometry'], {'triangles': 30000, 'objects': 12})
        self.assertTrue(result['structuralCompletionChecked'])
        self.assertEqual(result['result'], 'VERIFIED_MODEL_READY_FOR_VISUAL_REVIEW')
        self.assertEqual(result['visualQuality'], 'REQUIRES_HUMAN_REVIEW')
        self.assertFalse(result['manufacturingApproval'])
        self.assertIsNone(result['actualInvoiceUsd'])
        self.assertIsNone(result['taxUsd'])
        self.assertNotIn(PROMPT, json.dumps(result))
        self.assertNotIn(SECRET, json.dumps(result))

    def test_success_wrong_model_binding_fails_without_post_retry(self):
        self.client.next_state = 'succeeded'
        self.client.quality['modelSha256'] = '0' * 64
        with self.assertRaises(once.TestError):
            self.run_once()
        self.assertEqual(len(self.client.posts()), 1)
        self.assertTrue(once.check_claim(self.root))

    def test_successful_draft_is_never_labeled_structurally_completed(self):
        self.client.next_state = 'succeeded'
        self.client.quality['modelStatus'] = 'draft'
        del self.client.quality['modelSha256']
        result = self.run_once()
        self.assertFalse(result['structuralCompletionChecked'])
        self.assertEqual(result['result'], 'REJECTED_OR_UNREVIEWED_DRAFT')
        self.assertEqual(result['hostModelStatus'], 'draft')
        self.assertEqual(result['visualQuality'], 'REQUIRES_HUMAN_REVIEW')

    def test_success_without_host_acceptance_gate_is_explicitly_unreviewed(self):
        self.client.next_state = 'succeeded'
        self.client.quality['acceptanceGate'] = {'passed': False}
        result = self.run_once()
        self.assertFalse(result['structuralCompletionChecked'])
        self.assertEqual(result['result'], 'REJECTED_OR_UNREVIEWED_DRAFT')

    def test_wrong_existing_job_identity_stops_without_claim(self):
        original = self.client.request
        def request(path, payload=None, binary=False, timeout=None):
            if path == '/v1/jobs/' + TEST_JOB:
                return 200, {'id': SOURCE_JOB, 'state': 'failed'}
            return original(path, payload, binary, timeout)
        with patch.object(self.client, 'request', side_effect=request):
            self.assert_blocked()


class LocalTransportTests(unittest.TestCase):
    def test_original_source_routes_are_exact_descriptor_bound_get_only(self):
        response = type('Response', (), {'status': 200, 'headers': {'Content-Type': 'application/json'},
                                         'read': lambda *_: b'{}'})()
        with patch.object(once.urllib.request, 'build_opener') as build:
            build.return_value.open.side_effect = lambda *a, **k: contextlib.nullcontext(response)
            client = once.LocalClient(SECRET, once.descriptor(SOURCE_JOB, TEST_JOB))
            for suffix in ('', '/quality', '/model'):
                client.request('/v1/jobs/' + SOURCE_JOB + suffix, binary=suffix == '/model')
            self.assertEqual(build.return_value.open.call_count, 3)
            self.assertTrue(all(c.args[0].get_method() == 'GET' for c in build.return_value.open.call_args_list))
            for path, payload in [('/v1/jobs/' + SOURCE_JOB + '/cancel', None),
                                  ('/v1/jobs/' + SOURCE_JOB, {'id': SOURCE_JOB}),
                                  ('/v1/jobs/aaaaaaaa-2222-4333-8444-555555555555/model', None)]:
                with self.subTest(path=path), self.assertRaises(once.TestError):
                    client.request(path, payload=payload)
            self.assertEqual(build.return_value.open.call_count, 3)

    def test_invalid_descriptor_never_initializes_transport(self):
        valid = once.descriptor(SOURCE_JOB, TEST_JOB)
        for key, changed in [('sourceJobId', TEST_JOB), ('jobId', '../' + TEST_JOB),
                             ('approval', 'different'), ('maxProviderReservationUsd', 2.0),
                             ('expectedOriginalArtifactSha256', 'A' * 64)]:
            with self.subTest(key=key), patch.object(once.urllib.request, 'build_opener') as build, self.assertRaises(once.TestError):
                once.LocalClient(SECRET, {**valid, key: changed})
            build.assert_not_called()

    def test_only_literal_loopback_origin_and_no_proxy_no_redirect(self):
        value = json.dumps({'ok': True}).encode()
        response = type('Response', (), {'status': 200, 'headers': {'Content-Type': 'application/json'}, 'read': lambda self, limit: value})()
        with patch.object(once.urllib.request, 'build_opener') as build:
            build.return_value.open.return_value = contextlib.nullcontext(response)
            client = once.LocalClient(SECRET, once.descriptor(SOURCE_JOB, TEST_JOB))
            self.assertEqual(client.request('/v1/health'), (200, {'ok': True}))
        self.assertEqual(build.call_args.args[0].proxies, {})
        self.assertIsInstance(build.call_args.args[1], once.NoRedirect)
        request = build.return_value.open.call_args.args[0]
        self.assertEqual(request.full_url, 'http://127.0.0.1:8765/v1/health')
        self.assertEqual(request.get_header('Authorization'), 'Bearer ' + SECRET)
        self.assertIsNone(once.NoRedirect().redirect_request(None, None, None, None, None, None))

    def test_paths_cannot_send_token_or_data_elsewhere_or_cancel(self):
        with patch.object(once.urllib.request, 'build_opener') as build:
            client = once.LocalClient(SECRET, once.descriptor(SOURCE_JOB, TEST_JOB))
            for path in ('https://example.com', '//example.com', '/v1/ai', '/v1/jobs/' + TEST_JOB + '/cancel', '/v1/health?secret=anything'):
                with self.subTest(path=path), self.assertRaises(once.TestError):
                    client.request(path)
            with self.assertRaises(once.TestError):
                client.request('/v1/jobs', payload={'id': SOURCE_JOB})
        build.return_value.open.assert_not_called()

    def test_bounded_response_and_generic_transport_failure(self):
        with patch.object(once.urllib.request, 'build_opener') as build:
            client = once.LocalClient(SECRET, once.descriptor(SOURCE_JOB, TEST_JOB))
            build.return_value.open.side_effect = RuntimeError('SECRET' + SECRET)
            with self.assertRaises(once.TestError) as caught:
                client.request('/v1/health')
            self.assertNotIn(SECRET, str(caught.exception))
            response = type('Response', (), {'status': 200, 'headers': {'Content-Type': 'application/json', 'Content-Length': '999999999'},
                                             'read': lambda *_: (_ for _ in ()).throw(AssertionError('Do not read oversized body'))})()
            build.return_value.open.side_effect = None
            build.return_value.open.return_value = contextlib.nullcontext(response)
            with self.assertRaises(once.TestError):
                client.request('/v1/health')

    def test_http_error_body_is_closed_without_reading_or_echoing(self):
        class PrivateErrorBody:
            closed = False
            def read(self, *args):
                raise AssertionError('Never read private upstream error body')
            def close(self):
                self.closed = True
        body = PrivateErrorBody()
        error = urllib.error.HTTPError(once.ORIGIN + '/v1/jobs', 409, 'Private ' + SECRET, {}, body)
        with patch.object(once.urllib.request, 'build_opener') as build:
            client = once.LocalClient(SECRET, once.descriptor(SOURCE_JOB, TEST_JOB))
            build.return_value.open.side_effect = error
            self.assertEqual(client.request('/v1/jobs', payload={'id': TEST_JOB}), (409, None))
        self.assertTrue(body.closed)


@unittest.skipUnless(os.environ.get('MODEL_COMPLETION_SOURCE'), 'Pinned source fixture is required in CI')
class ReviewedServerVariantTests(unittest.TestCase):
    """Bind the helper to both real source transforms; all jobs remain fixtures."""

    @contextlib.contextmanager
    def variant(self, direct_export):
        from source_fixture import installed_sources
        import completion_policy
        import reviewed_direct_export
        import source_patch
        from install_completion import previous

        fixture = OriginalOnceTests()
        fixture.setUp()
        try:
            originals = installed_sources(os.environ['MODEL_COMPLETION_SOURCE'])
            if direct_export:
                originals['server.py'] = reviewed_direct_export.patch_server(originals['server.py'].decode()).encode()
            selected = {name: originals[name] for name in source_patch.EXPECTED}
            self.assertEqual(source_patch.reviewed_sources(selected),
                             'FAST_V33_DIRECT_EXPORT_V2' if direct_export else 'FAST_V33_BASE')
            patched = source_patch.changes(selected, Path(completion_policy.__file__).read_bytes())
            for name, raw in {**originals, **patched}.items():
                path = fixture.root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(raw)
            photo_source = Path(os.environ['MODEL_COMPLETION_SOURCE']) / 'photo_input.py'
            (fixture.root / 'photo_input.py').write_bytes(photo_source.read_bytes())
            fixture.proofs()
            with patch.object(once, 'PHOTO_SOURCE_BLOB', '0c374e83ba5d03eaac9ed8f17837abf45f55da76'):
                marker = completion_policy.verified_health(fixture.root)
                self.assertEqual(marker, {'worldifactCompletionPolicy': once.POLICY,
                                         'worldifactCompletionMaxContinuations': 1})
                guard = previous.policy.verified_health(fixture.root)
                self.assertEqual(guard['astraBudgetMaxUsd'], 1.75)
                fixture.client.health.update(guard)
                fixture.client.health.update(marker)
                yield fixture
        finally:
            fixture.doCleanups()

    def test_original_input_submission_accepts_both_exact_completed_variants(self):
        for direct_export in (False, True):
            with self.subTest(direct_export=direct_export), self.variant(direct_export) as fixture:
                once.verify_sources(fixture.root)
                result = fixture.run_once()
                self.assertEqual(len(fixture.client.posts()), 1)
                self.assertEqual(result['state'], 'failed')  # Deliberate inert outcome.
                self.assertEqual(result['result'], 'JOB_DID_NOT_COMPLETE')
                payload = fixture.client.posts()[0][1]
                self.assertEqual(payload['prompt'], PROMPT)
                self.assertEqual(payload['agentInstructions'], INSTRUCTIONS)
                self.assertEqual([base64.b64decode(p['dataUrl'].split(',')[1]) for p in payload['photos']],
                                 [jpeg(i) for i in range(3)])

    def test_bound_succeeded_unfinished_source_passes_both_exact_server_variants(self):
        for direct_export in (False, True):
            with self.subTest(direct_export=direct_export), self.variant(direct_export) as fixture:
                fixture.retained_source()
                result = fixture.run_once()
                self.assertEqual(len(fixture.client.posts()), 1)
                self.assertEqual(result['submittedThisRun'], True)
                self.assertTrue(once.check_claim(fixture.root))
                self.assertNotIn(SOURCE_JOB, json.dumps(result))

    def test_changed_receipt_source_or_health_blocks_each_variant_before_claim(self):
        for direct_export in (False, True):
            for cause in ('source', 'runtime_receipt', 'health'):
                with self.subTest(direct_export=direct_export, cause=cause), self.variant(direct_export) as fixture:
                    if cause == 'source':
                        path = fixture.root / 'server.py'
                        path.write_bytes(path.read_bytes() + b'\n# unreviewed edit\n')
                    elif cause == 'runtime_receipt':
                        fixture.write(fixture.root / 'tools/codex/verified.json', {'sources': {}})
                    else:
                        fixture.client.health['worldifactCompletionPolicy'] = 'unverified'
                    fixture.assert_blocked()

    def test_actual_download_hash_must_match_quality_for_both_variants(self):
        for direct_export in (False, True):
            with self.subTest(direct_export=direct_export), self.variant(direct_export) as fixture:
                fixture.client.next_state = 'succeeded'
                result = fixture.run_once()
                self.assertEqual(result['result'], 'VERIFIED_MODEL_READY_FOR_VISUAL_REVIEW')
                self.assertEqual(result['glb']['sha256'], once.digest(glb()))
                self.assertEqual(result['visualQuality'], 'REQUIRES_HUMAN_REVIEW')
                fixture.client.calls.clear()
                fixture.client.quality['modelSha256'] = '0' * 64
                with self.assertRaisesRegex(once.TestError, 'QUALITY_MODEL_HASH_MISMATCH'):
                    fixture.run_once()
                self.assertEqual(fixture.client.posts(), [])
                self.assertTrue(once.check_claim(fixture.root))


if __name__ == '__main__':
    unittest.main()
