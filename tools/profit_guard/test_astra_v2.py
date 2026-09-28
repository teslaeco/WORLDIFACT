import copy
import json
from pathlib import Path
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch
import astra_spend_v2 as g

NOW = 1790600000

def completed(identifier='resp_fixture', incoming=100, outgoing=200):
    return {'id': identifier, 'status': 'completed', 'model': 'gpt-6-astra', 'service_tier': 'default',
            'usage': {'input_tokens': incoming, 'output_tokens': outgoing, 'total_tokens': incoming + outgoing,
                      'output_tokens_details': {'reasoning_tokens': min(50, outgoing)}}}

class ReservationV2Tests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.job = Path(self.temp.name)/'job'; self.job.mkdir()
        self.root = Path(self.temp.name)/'private-budgets'
        self.time_patch = patch.object(g.time, 'time', return_value=NOW); self.time_patch.start(); self.addCleanup(self.time_patch.stop)
        self.root_patch = patch.object(g, 'LEDGER_ROOT', self.root); self.root_patch.start(); self.addCleanup(self.root_patch.stop)
    def state(self): return g.validate_state(g.read_json(g.ledger_folder(self.job)/g.STATE))

    def test_reasoning_is_lowered_before_exact_count_and_more_than_8192_tokens_can_fit(self):
        seen = []
        payload = {'model': 'gpt-6-astra', 'reasoning': {'effort': 'high'}, 'max_output_tokens': 16000, 'input': []}
        handle = g.protect(self.job, payload, {}, counter=lambda p,h: seen.append(copy.deepcopy(p)) or 1000)
        self.assertEqual(seen[0]['reasoning']['effort'], 'low')
        self.assertEqual(payload['max_output_tokens'], 16000)
        self.assertEqual(self.state()['entries'][0]['id'], handle)
        self.assertLessEqual(g.reserved_total(self.state()), 1750000)

    def test_contract_build_review_finish_can_reuse_only_verified_unused_reservations(self):
        for step, output in enumerate((500, 6200, 400, 250)):
            handle, limit = g.reserve(self.job, 3000, 16000)
            self.assertGreaterEqual(limit, output)
            result = completed('resp_step'+str(step), incoming=3000, outgoing=output)
            self.assertTrue(g.reconcile(self.job, handle, result, 'response.completed'))
        self.assertEqual(g.reserved_total(self.state()), 4*3000*14 + (500+6200+400+250)*55)
        self.assertLess(g.reserved_total(self.state()), 1750000)
        self.assertFalse((self.job/g.STATE).exists())

    def test_failed_incomplete_and_disconnected_usage_never_release_money(self):
        handle, _ = g.reserve(self.job, 1000, 16000); before = g.reserved_total(self.state())
        for event in ('response.incomplete', 'response.failed', 'response.created'):
            self.assertFalse(g.reconcile(self.job, handle, completed(), event))
        for response in ({}, {'usage': {}}, {**completed(), 'service_tier': 'priority'}, {**completed(), 'model': 'other'}):
            self.assertFalse(g.reconcile(self.job, handle, response, 'response.completed'))
        self.assertEqual(g.reserved_total(self.state()), before)
        self.job.rmdir(); self.job.mkdir()
        self.assertEqual(g.reserved_total(self.state()), before)

    def test_settlement_is_idempotent_and_cannot_reuse_a_response_for_a_different_request(self):
        handle, _ = g.reserve(self.job, 1000, 8192)
        self.assertTrue(g.reconcile(self.job, handle, completed(), 'response.completed'))
        value = g.reserved_total(self.state())
        with ThreadPoolExecutor(8) as pool:
            results = list(pool.map(lambda _: g.reconcile(self.job, handle, completed(), 'response.completed'), range(20)))
        self.assertTrue(all(results)); self.assertEqual(g.reserved_total(self.state()), value)
        other, _ = g.reserve(self.job, 1000, 8192); after = g.reserved_total(self.state())
        self.assertFalse(g.reconcile(self.job, other, completed(), 'response.completed'))
        self.assertEqual(g.reserved_total(self.state()), after)
        self.assertFalse(g.reconcile(self.job, handle, completed(outgoing=1), 'response.completed'))

    def test_reasoning_is_not_charged_twice_and_overreported_tokens_stop_future_work(self):
        handle, limit = g.reserve(self.job, 1000, 8192)
        self.assertTrue(g.reconcile(self.job, handle, completed(outgoing=200), 'response.completed'))
        self.assertEqual(g.reserved_total(self.state()), 100*14 + 200*55)
        handle2, limit2 = g.reserve(self.job, 1000, 8192)
        self.assertFalse(g.reconcile(self.job, handle2, completed('resp_breach', outgoing=limit2+1), 'response.completed'))
        self.assertTrue(self.state()['breach'])
        with self.assertRaises(g.SpendError): g.reserve(self.job, 1, 256)

    def test_legacy_reservations_are_preserved_during_upgrade(self):
        path = g.ledger_folder(self.job)/g.STATE
        g.atomic(path, {'revision': 'astra-usd175-v1', 'reserved': 1500000, 'requests': 3})
        handle, limit = g.reserve(self.job, 100, 16000)
        self.assertLess(limit, 8192)
        self.assertEqual(self.state()['legacyReserved'], 1500000)
        self.assertTrue(g.reconcile(self.job, handle, completed(), 'response.completed'))
        self.assertGreaterEqual(g.reserved_total(self.state()), 1500000)

    def test_concurrent_attempts_cannot_exceed_the_original_ceiling(self):
        def attempt(_):
            try: return g.reserve(self.job, 1000, 8192)
            except g.SpendError: return None
        with ThreadPoolExecutor(12) as pool: results = list(pool.map(attempt, range(50)))
        self.assertLessEqual(g.reserved_total(self.state()), 1750000)
        self.assertLess(sum(r is not None for r in results), 50)

    def test_expiry_corruption_and_extra_fields_do_not_reset_funds(self):
        with self.assertRaises(g.SpendError): g.reserve(self.job, 1, 256, now=g.VALID_UNTIL)
        path = g.ledger_folder(self.job)/g.STATE
        g.atomic(path, {'revision': 'astra-usd175-v1', 'reserved': 1700000, 'requests': 1, 'extra': 0})
        with self.assertRaises(g.SpendError): g.reserve(self.job, 1, 256)
        self.assertEqual(g.read_json(path)['reserved'], 1700000)

if __name__ == '__main__': unittest.main()
