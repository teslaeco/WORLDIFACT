"""Completed-usage fixtures only. No model calls, cloud writes or credit grants."""
import copy
import json
from pathlib import Path
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch
import astra_spend as legacy
import astra_spend_v2 as guard

NOW = 1790800000


def response(index=1, inp=20000, out=500, cached=18000, writes=2000):
    return {'id': 'resp_cache_fixture_' + str(index), 'status': 'completed',
            'model': 'gpt-6-astra', 'service_tier': 'default',
            'usage': {'input_tokens': inp, 'output_tokens': out, 'total_tokens': inp + out,
                      'input_tokens_details': {'cached_tokens': cached, 'cache_write_tokens': writes}}}


class CacheAccountingTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.job = self.root / 'job'; self.job.mkdir()
        self.addCleanup(patch.stopall)
        patch.object(legacy, 'LEDGER_ROOT', self.root / 'funds').start()
        patch.object(guard.time, 'time', return_value=NOW).start()

    def state(self):
        return guard.validate_state(legacy.read_json(legacy.ledger_folder(self.job) / legacy.STATE))

    def test_preflight_still_reserves_all_input_as_uncached_including_headroom(self):
        token, output = guard.reserve(self.job, 20000, 16000)
        self.assertEqual(output, 16000)
        self.assertEqual(self.state()['holds'][token]['held'], 22048 * 14 + 16000 * 55)

    def test_authenticated_cache_reads_release_only_unneeded_upper_reservation(self):
        token, _ = guard.reserve(self.job, 20000, 16000)
        self.assertTrue(guard.settle_completed(self.job, token, response()))
        self.assertEqual(guard.used(self.state()), 2000 * 14 + 18000 * 2 + 500 * 55)
        self.assertEqual(guard.CEILING_MICRO_USD, 1750000)
        self.assertEqual(guard.VALID_UNTIL, legacy.VALID_UNTIL)

    def test_cache_writes_never_receive_cache_read_discount(self):
        token, _ = guard.reserve(self.job, 20000, 16000)
        self.assertTrue(guard.settle_completed(self.job, token, response(cached=0, writes=20000)))
        self.assertEqual(guard.used(self.state()), 20000 * 14 + 500 * 55)

    def test_mixed_regular_and_write_tokens_both_keep_high_bound(self):
        token, _ = guard.reserve(self.job, 20000, 16000)
        self.assertTrue(guard.settle_completed(self.job, token, response(cached=10000, writes=2000)))
        self.assertEqual(guard.used(self.state()), 10000 * 14 + 10000 * 2 + 500 * 55)

    def test_missing_partial_or_null_details_do_not_infer_hits(self):
        for details in [None, {}, {'cached_tokens': 18000}, {'cache_write_tokens': 2000}]:
            with self.subTest(details=details):
                self.assertEqual(guard.completed_upper_cost({'input_tokens_details': details}, 20000, 500), 307500)
        self.assertEqual(guard.completed_upper_cost({}, 20000, 500), 307500)

    def test_bad_cache_breakdowns_keep_full_original_hold(self):
        token, _ = guard.reserve(self.job, 20000, 16000)
        before = self.state()
        bad = [[], '18000', {'cached_tokens': True, 'cache_write_tokens': 0},
               {'cached_tokens': 18000.0, 'cache_write_tokens': 2000},
               {'cached_tokens': '18000', 'cache_write_tokens': 2000},
               {'cached_tokens': -1, 'cache_write_tokens': 0},
               {'cached_tokens': 20001, 'cache_write_tokens': 0},
               {'cached_tokens': 18000, 'cache_write_tokens': 2001},
               {'cached_tokens': 18000, 'cache_write_tokens': False},
               {'cached_tokens': 1, 'cache_write_tokens': -1}]
        for details in bad:
            with self.subTest(details=details):
                value = response(); value['usage']['input_tokens_details'] = details
                self.assertFalse(guard.settle_completed(self.job, token, value))
                self.assertEqual(self.state(), before)

    def test_incomplete_wrong_model_and_wrong_tier_cannot_release_cache_holds(self):
        token, _ = guard.reserve(self.job, 20000, 16000)
        before = self.state()
        for key, value in [('status', 'incomplete'), ('model', 'gpt-6-sol'), ('service_tier', 'priority')]:
            item = response(); item[key] = value
            self.assertFalse(guard.settle_completed(self.job, token, item))
            self.assertEqual(self.state(), before)

    def test_missing_or_invalid_overall_usage_keeps_full_hold(self):
        token, _ = guard.reserve(self.job, 20000, 16000)
        before = self.state()
        for update in [{'input_tokens': 23000}, {'output_tokens': 16001}, {'total_tokens': True}, {'total_tokens': 0}]:
            item = response(); item['usage'].update(update)
            self.assertFalse(guard.settle_completed(self.job, token, item))
            self.assertEqual(self.state(), before)

    def test_duplicate_replay_does_not_recompute_old_settlement_with_new_cache_claims(self):
        token, _ = guard.reserve(self.job, 20000, 16000)
        original = response(); original['usage'].pop('input_tokens_details')
        self.assertTrue(guard.settle_completed(self.job, token, original))
        before = self.state()
        with ThreadPoolExecutor(8) as pool:
            self.assertTrue(all(pool.map(lambda _: guard.settle_completed(self.job, token, response()), range(16))))
        self.assertEqual(self.state(), before)
        self.assertEqual(guard.used(before), 307500)

    def test_same_response_id_cannot_settle_two_reservations(self):
        token, _ = guard.reserve(self.job, 20000, 16000)
        self.assertTrue(guard.settle_completed(self.job, token, response()))
        second, _ = guard.reserve(self.job, 20000, 16000)
        before = self.state()
        self.assertFalse(guard.settle_completed(self.job, second, response()))
        self.assertEqual(self.state(), before)

    def test_ledger_write_failure_cannot_report_discount_as_committed(self):
        token, _ = guard.reserve(self.job, 20000, 16000)
        before = self.state()
        with patch.object(legacy, 'atomic', side_effect=OSError('fixture')):
            self.assertFalse(guard.settle_completed(self.job, token, response()))
        self.assertEqual(self.state(), before)

    def test_legacy_funds_are_not_repriced_or_released(self):
        root = legacy.ledger_folder(self.job)
        legacy.atomic(root / legacy.STATE, {'revision': legacy.REVISION, 'reserved': 1300000, 'requests': 4})
        token, _ = guard.reserve(self.job, 1000, 1000)
        self.assertTrue(guard.settle_completed(self.job, token, response(inp=1000, out=100, cached=1000, writes=0)))
        self.assertEqual(self.state()['legacyHeld'], 1300000)
        self.assertEqual(guard.used(self.state()), 1307500)

    def test_six_turn_fixture_can_continue_when_confirmed_hits_exist_without_cap_increase(self):
        # With the old bound, 5 * (20k*14 + 500*55) = 1,537,500; a sixth
        # input + minimal output reservation does not fit. This is a synthetic
        # accounting test, NOT a replay or proof about the owner's failed jobs.
        self.assertGreater(5 * 307500 + 22048 * 14 + 256 * 55, 1750000)
        for i in range(6):
            token, _ = guard.reserve(self.job, 20000, 16000)
            value = response(i, cached=0 if i == 0 else 18000, writes=20000 if i == 0 else 2000)
            self.assertTrue(guard.settle_completed(self.job, token, value))
            self.assertLessEqual(guard.used(self.state()), 1750000)
        self.assertEqual(guard.used(self.state()), 765000)
        self.assertEqual(self.state()['requests'], 6)

    def test_no_cache_hits_still_exhaust_budget_without_new_spend(self):
        for i in range(5):
            token, _ = guard.reserve(self.job, 20000, 16000)
            self.assertTrue(guard.settle_completed(self.job, token, response(i, cached=0, writes=20000)))
        before = self.state()
        with self.assertRaises(guard.SpendError): guard.reserve(self.job, 20000, 16000)
        self.assertEqual(self.state(), before)

    def test_reservation_does_not_trust_user_cache_hints_or_mutate_references(self):
        body = {'model': 'gpt-6-astra', 'max_output_tokens': 16000, 'reasoning': {'effort': 'high'},
                'input': [{'role': 'user', 'content': [{'type': 'input_text', 'text': 'Reference brief'},
                          *[{'type': 'input_image', 'image_url': 'data:image/jpeg;base64,fixture'+str(i)} for i in range(4)]]}],
                'metadata': {'cached_tokens': 20000}}
        before = copy.deepcopy(body['input'])
        token = guard.protect(self.job, body, {}, counter=lambda *_: 20000)
        self.assertEqual(body['input'], before)
        self.assertEqual(self.state()['holds'][token]['held'], 22048 * 14 + 16000 * 55)

    def test_accounting_does_not_call_network_or_modify_original_job_artifacts(self):
        path = self.job / 'model.glb'; path.write_bytes(b'PRESERVE_ORIGINAL')
        token, _ = guard.reserve(self.job, 20000, 16000)
        with patch.object(legacy.urllib.request, 'build_opener', side_effect=AssertionError('No external work')):
            self.assertTrue(guard.settle_completed(self.job, token, response()))
        self.assertEqual(path.read_bytes(), b'PRESERVE_ORIGINAL')
        self.assertEqual(list(self.job.iterdir()), [path])

    def test_state_remains_readable_by_previous_v2_schema_without_lost_holds(self):
        token, _ = guard.reserve(self.job, 20000, 16000)
        self.assertTrue(guard.settle_completed(self.job, token, response()))
        data = self.state()
        self.assertEqual(set(data), {'revision', 'legacyHeld', 'requests', 'holds'})
        self.assertEqual(set(data['holds'][token]), {'input', 'output', 'held', 'response'})
        self.assertLessEqual(data['holds'][token]['held'], data['holds'][token]['input'] * 14 + data['holds'][token]['output'] * 55)


if __name__ == '__main__':
    unittest.main()
