"""Disposable real-ledger tests; no provider, account or existing job access."""
import ast
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import threading
import types
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(ROOT / 'tools/model_context_upgrade'))
import construction_spend_patch as transform
import test_upgrade_transaction as lineage

JOB = '00000000-0000-4000-8000-000000000042'


def load(raw):
    module = types.ModuleType('construction_spend_fixture')
    exec(compile(raw, 'construction-spend-fixture.py', 'exec'), module.__dict__)
    return module


class AtomicCapacityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.original = lineage.installed_sources()['astra_spend_v2.py']
        cls.changed = transform.changes(cls.original)

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.folder = self.root / 'jobs' / JOB
        self.folder.mkdir(parents=True)
        self.policy = load(self.changed)
        self.addCleanup(patch.stopall)
        patch.object(self.policy.legacy, 'LEDGER_ROOT', self.root / 'ledger').start()
        patch.dict(sys.modules, {'astra_spend_v2': self.policy}).start()
        patch('urllib.request.OpenerDirector.open', side_effect=AssertionError('network forbidden')).start()

    def state_path(self):
        return self.policy.studio_pricing.folder_root(self.folder) / self.policy.legacy.STATE

    def reserve(self, future=500000, output=8192, count=4096, slots=1):
        return self.policy.reserve(self.folder, count, output, now=1,
            minimum_output=output, protected_remaining_micro_usd=future,
            protected_remaining_requests=slots)

    def test_source_and_unchanged_accounting_functions_are_pinned(self):
        self.assertEqual(hashlib.sha256(self.original).hexdigest(), transform.EXPECTED)
        with self.assertRaises(ValueError): transform.changes(self.original + b'\n')
        def functions(raw):
            return {node.name: ast.dump(node) for node in ast.parse(raw).body
                    if isinstance(node, ast.FunctionDef)}
        before, after = functions(self.original), functions(self.changed)
        self.assertEqual(set(before), set(after))
        for name in set(before) - {'reserve', 'protect'}:
            self.assertEqual(before[name], after[name], name)

    def test_full_output_and_future_capacity_share_original_atomic_reservation(self):
        token, output = self.reserve()
        state = json.loads(self.state_path().read_text())
        self.assertEqual(output, 8192)
        self.assertEqual(state['requests'], 1)
        self.assertEqual(state['holds'][token],
            {'input':6144, 'output':8192, 'held':6144 * 14 + 8192 * 55})
        self.assertLessEqual(self.policy.used(state) + 500000, 1750000)
        self.assertEqual(set(state), {'revision', 'requests', 'holds', 'legacyHeld'})

    def test_exact_boundary_and_one_micro_over_preserve_existing_ledger(self):
        self.reserve(future=0, output=256, count=0)
        before = self.state_path().read_bytes()
        prior = self.policy.used(json.loads(before))
        cost = (4096 + 2048) * 14 + 8192 * 55
        future = 1750000 - prior - cost
        with self.assertRaises(self.policy.SpendError): self.reserve(future=future + 1)
        self.assertEqual(self.state_path().read_bytes(), before)
        _, output = self.reserve(future=future)
        self.assertEqual(output, 8192)
        self.assertEqual(self.policy.used(json.loads(self.state_path().read_text())) + future, 1750000)

    def test_concurrent_requests_cannot_each_spend_the_same_remaining_capacity(self):
        barrier = threading.Barrier(2)
        def attempt():
            barrier.wait()
            try:
                return self.reserve(future=600000, output=10000)
            except self.policy.SpendError:
                return None
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda _: attempt(), range(2)))
        self.assertEqual(sum(item is not None for item in results), 1)
        state = json.loads(self.state_path().read_text())
        self.assertEqual(state['requests'], 1)
        self.assertLessEqual(self.policy.used(state) + 600000, 1750000)

    def test_cannot_shrink_output_or_use_invalid_capacity_to_buy_partial_phase(self):
        for future in (-1, True, 1750001, 1.5, '500000'):
            with self.subTest(future=future), self.assertRaises(self.policy.SpendError):
                self.reserve(future=future)
        with self.assertRaises(self.policy.SpendError):
            self.policy.reserve(self.folder,4096,8192,now=1,minimum_output=2048,
                                protected_remaining_micro_usd=0,protected_remaining_requests=0)
        self.assertFalse(self.state_path().exists())

    def test_future_request_slots_are_atomic_and_arguments_must_be_paired(self):
        self.reserve(future=0,output=256,count=0)
        before = self.state_path().read_bytes()
        for future,slots in ((None,0),(0,None),(0,True),(0,32),(0,-1)):
            with self.subTest(future=future,slots=slots), self.assertRaises(self.policy.SpendError):
                self.reserve(future=future,slots=slots,output=256,count=0)
        # One existing request + this request +31 later requests cannot fit.
        with self.assertRaises(self.policy.SpendError) as caught:
            self.reserve(future=0,slots=31,output=256,count=0)
        self.assertEqual(caught.exception.reason,'REQUEST_LIMIT')
        self.assertEqual(self.state_path().read_bytes(),before)
        self.reserve(future=0,slots=30,output=256,count=0)
        self.assertEqual(json.loads(self.state_path().read_text())['requests'],2)

    def test_protect_binds_counted_payload_and_full_output_to_same_reservation(self):
        payload = {'model':'gpt-6-astra','input':'synthetic complete plan',
                   'max_output_tokens':8192,'reasoning':{'effort':'high'}}
        counted = []
        def counter(value, headers):
            counted.append(json.loads(json.dumps(value)))
            self.assertEqual(headers, {})
            return 4096
        with patch.object(self.policy.time,'time',return_value=1):
            token = self.policy.protect(self.folder,payload,{},counter=counter,
                minimum_output=8192,protected_remaining_micro_usd=500000,
                protected_remaining_requests=1)
        self.assertEqual(len(counted),1)
        self.assertEqual(payload,counted[0])
        self.assertEqual(payload['reasoning']['effort'],'low')
        self.assertEqual(payload['max_output_tokens'],8192)
        state = json.loads(self.state_path().read_text())
        self.assertEqual(state['holds'][token]['output'],payload['max_output_tokens'])
        self.assertEqual(state['holds'][token]['input'],4096+2048)
        self.assertLessEqual(self.policy.used(state)+500000,1750000)

    def test_legacy_omission_preserves_existing_allocation(self):
        original = load(self.original)
        for index, policy in enumerate((original, self.policy)):
            folder = self.root / str(index) / JOB
            folder.mkdir(parents=True)
            token, output = policy.reserve(folder,4096,16000,now=1,minimum_output=256)
            path = policy.studio_pricing.folder_root(folder) / policy.legacy.STATE
            state = json.loads(path.read_text())
            self.assertEqual(output,16000)
            self.assertEqual(state['holds'][token]['held'],6144 * 14 + 16000 * 55)

    def test_explicit_zero_still_refuses_unreviewed_larger_terms(self):
        pricing = self.policy.studio_pricing
        pricing.bind(self.folder, {'revision':pricing.REVISION, **pricing.TIERS[0]})
        terms = pricing.folder_root(self.folder) / pricing.TERMS
        before = terms.read_bytes()
        with self.assertRaises(self.policy.SpendError) as result:
            self.reserve(future=0)
        self.assertEqual(result.exception.reason, 'CONSTRUCTION_CAP_UNREVIEWED')
        self.assertEqual(terms.read_bytes(), before)
        self.assertFalse(self.state_path().exists())

    def test_sealed_expired_and_unknown_prior_hold_are_not_reclaimed(self):
        self.reserve(future=0)
        before = self.state_path().read_bytes()
        with patch.object(self.policy.terminal_budget,'sealed',return_value=True):
            with self.assertRaises(self.policy.SpendError) as sealed: self.reserve(future=0)
        self.assertEqual(sealed.exception.reason,'JOB_SEALED')
        with self.assertRaises(self.policy.SpendError):
            self.policy.reserve(self.folder,0,256,now=self.policy.VALID_UNTIL,
                minimum_output=256,protected_remaining_micro_usd=0,protected_remaining_requests=0)
        # A large new phase cannot release the preceding unconfirmed hold.
        with self.assertRaises(self.policy.SpendError): self.reserve(future=1000000)
        self.assertEqual(self.state_path().read_bytes(), before)


if __name__ == '__main__': unittest.main()
