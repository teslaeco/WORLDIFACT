import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch
import astra_spend as g

class GuardTests(unittest.TestCase):
    def test_concurrent_reservations_never_exceed_job_cap(self):
        with tempfile.TemporaryDirectory() as d:
            job = Path(d)/'job'; job.mkdir(); root = Path(d)/'private-budgets'
            def reserve(_):
                try: return g.reserve(job, 1000, 8192, now=1790600000, ledger_root=root)
                except g.SpendError: return 0
            with ThreadPoolExecutor(8) as pool: outputs = list(pool.map(reserve, range(40)))
            ledger = g.ledger_folder(job, root)
            state = json.loads((ledger / g.STATE).read_text())
            self.assertLessEqual(state['reserved'], g.CEILING_MICRO_USD)
            self.assertGreater(sum(x > 0 for x in outputs), 0)
            self.assertLess(sum(x > 0 for x in outputs), 40)
            self.assertFalse((job/g.STATE).exists())
            spec = importlib.util.spec_from_file_location('restarted_guard', g.__file__)
            restarted = importlib.util.module_from_spec(spec); spec.loader.exec_module(restarted)
            job.rmdir(); job.mkdir()  # Cleaning/recreating generated files must not reset funds.
            with self.assertRaises(restarted.SpendError):
                restarted.reserve(job, 1000, 8192, now=1790600000, ledger_root=root)

    def test_failure_reservations_are_not_refunded(self):
        with tempfile.TemporaryDirectory() as d, patch.object(g.time, 'time', return_value=1790600000):
            job = Path(d)/'job'; job.mkdir(); root = Path(d)/'private-budgets'
            with patch.object(g, 'LEDGER_ROOT', root):
                payload = {'model': 'gpt-6-astra', 'input': 'fixture', 'max_output_tokens': 96000}
                g.protect(job, payload, {}, counter=lambda *_: 1000)
            self.assertLessEqual(payload['max_output_tokens'], 8192)
            self.assertEqual(payload['service_tier'], 'default')
            self.assertEqual(payload['store'], False)
            state = json.loads((g.ledger_folder(job, root)/g.STATE).read_text())
            self.assertGreater(state['reserved'], 0)
            self.assertFalse((job/g.STATE).exists())

    def test_unreviewed_payloads_do_not_call_counter(self):
        variants = [{'model': 'gpt-6-sol'}, {'previous_response_id': 'resp_hidden'},
                    {'background': True}, {'service_tier': 'priority'},
                    {'tools': [{'type': 'web_search'}]}, {'max_output_tokens': True}]
        for variant in variants:
            with tempfile.TemporaryDirectory() as d, patch.object(g.time, 'time', return_value=1790600000):
                called = []
                payload = {'model': 'gpt-6-astra', 'input': 'fixture', 'max_output_tokens': 8192, **variant}
                with self.assertRaises(g.SpendError):
                    g.protect(d, payload, {}, counter=lambda *_: called.append(True))
                self.assertEqual(called, [])
                self.assertEqual(list(Path(d).iterdir()), [])

    def test_corruption_symlinks_expiry_never_reset_funds(self):
        with tempfile.TemporaryDirectory() as d:
            job = Path(d)/'job'; job.mkdir(); root = Path(d)/'private-budgets'
            path = g.ledger_folder(job, root)/g.STATE
            path.write_text('{"revision":"old","reserved":0,"requests":0}')
            with self.assertRaises(g.SpendError): g.reserve(job, 1, 1000, now=1790600000, ledger_root=root)
            path.unlink(); target = Path(d)/'target'; target.write_text('{}'); path.symlink_to(target)
            with self.assertRaises(g.SpendError): g.reserve(job, 1, 1000, now=1790600000, ledger_root=root)
            self.assertEqual(target.read_text(), '{}')
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaises(g.SpendError): g.reserve(d, 1, 1000, now=g.VALID_UNTIL)
            self.assertEqual(list(Path(d).iterdir()), [])

    def test_bad_counter_is_bounded_and_has_no_secret_leak(self):
        with tempfile.TemporaryDirectory() as d, patch.object(g.time, 'time', return_value=1790600000):
            def fail(*_): raise RuntimeError('SECRET_FIXTURE')
            with self.assertRaises(g.SpendError) as error:
                g.protect(d, {'model': 'gpt-6-astra', 'max_output_tokens': 8192}, {}, counter=fail)
            self.assertNotIn('SECRET_FIXTURE', str(error.exception))
            self.assertEqual(list(Path(d).iterdir()), [])
            self.assertEqual(g.verified_health(d), {})

if __name__ == '__main__': unittest.main()
