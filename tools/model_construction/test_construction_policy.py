"""Offline regression cases; no provider, Blender, browser or ledger writes.

The original completion-policy bytes are pinned to the reviewed ancestor. The
tests exercise its real can_continue and restore_state, not a rewritten copy.
Candidate fixtures model the output of the existing host artifact verifier;
they do not claim a new GLB renderer/verifier or a successful paid generation.
"""
from copy import deepcopy
from dataclasses import FrozenInstanceError, replace
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import threading
import types
import unittest
from unittest.mock import patch

import construction_policy as policy


ROOT = Path(__file__).resolve().parents[2]
OLD_PATH = ROOT / 'tools/model_completion/completion_policy.py'
OLD_SHA256 = '664e9f3b2326116fe9aeeb78e7a84aac254ca8a3054cdccdfb5224e112890110'


def request():
    return {'construction_mode': policy.MODE, 'instructions': policy.STANDARD,
            'execution_id': 'same-execution', 'completion_started': 100.0}


def gateway(**changes):
    return policy.GatewayEvidence('same-execution', **{'requests': 1, 'output': 400, **changes})


def event(tool='get_modeling_contract', status='completed', revision=0, attempts=0, **extra):
    return {'tool': tool, 'status': status, 'revision': revision,
            'build_attempts': attempts, 'attempt': None, 'elapsed_seconds': 1.0, **extra}


def calls(tool='get_modeling_contract', **kwargs):
    return (event(tool, 'started', **kwargs), event(tool, 'completed', **kwargs))


def mcp(entries=(), **changes):
    values = {'attempts': 0, 'revision': 0, 'calls': entries,
              'total_calls': sum(item['status'] != 'started' for item in entries),
              'failures': sum(item['status'] == 'failed' for item in entries)}
    return policy.McpEvidence('same-execution', **{**values, **changes})


def response(sequence=1, phase='discovery', before=0, after=1, **changes):
    return policy.RequestEvidence(**{'sequence': sequence, 'execution_id': 'same-execution',
        'phase': phase, 'status': 'completed', 'usage_known': True,
        'mcp_calls_before': before, 'mcp_calls_after': after, **changes})


def state(**changes):
    return {'revision': 1, 'execution_id': 'same-execution', 'started': 100.0,
            'attempts': 1, 'model_revision': 1, 'blender_seconds': 20.0,
            'calls': list(calls('build_model', revision=1, attempts=1)),
            'tool_failures': 0, **changes}


def candidate():
    return {'path': Path('/host-verified/job/candidates/1'),
            'info': {'path': 'candidates/1', 'revision': 1, 'execution_id': 'same-execution'},
            'identity': (100, 'a' * 64), 'result': {'triangles': 12}}


class ContinuationTests(unittest.TestCase):
    def setUp(self):
        self.request = request()
        self.state = state()
        self.candidate = candidate()
        self.gateway = gateway()

    def decide(self, **changes):
        values = {'request': self.request, 'gateway': self.gateway, 'state': self.state,
                  'verified_candidate': self.candidate, 'process_code': 0,
                  'reader_alive': False, 'failure': None, 'pass_index': 0,
                  'now': 120.0, 'deadline_seconds': 1800.0}
        return policy.continuation_admission(**{**values, **changes})

    def test_exact_old_policy_admits_empty_state_and_restore_then_new_gate_refuses(self):
        self.assertEqual(hashlib.sha256(OLD_PATH.read_bytes()).hexdigest(), OLD_SHA256)
        spec = importlib.util.spec_from_file_location('original_completion_policy', OLD_PATH)
        original = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(original)
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            empty = state(attempts=0, model_revision=0, blender_seconds=0,
                          calls=list(calls()))
            path = folder / original.STATE
            path.write_text(json.dumps(empty))
            job = types.SimpleNamespace(folder=folder, request=self.request,
                execution_id='same-execution', fast_limits={'fast': False}, build_limit=5,
                started=999.0, attempts=0, revision=0, blender_seconds=0,
                calls=[], tool_failures=0, current=None, seen=set())
            old_gateway = types.SimpleNamespace(folder=folder,
                fast_limits={'fast': False, 'requests': 32, 'output': 96000},
                requests=13, output=6999, error=None, error_code=None,
                unknown_usage=False, active=False, upstream_status=None,
                cancelled=threading.Event())
            with patch.object(original.time, 'monotonic', return_value=374.49):
                self.assertTrue(original.can_continue(self.request, old_gateway, 0, False,
                                                     None, 0, 100.0, 1800.0))
                original.restore_state(job, lambda *_: None)
            self.assertEqual((job.attempts, job.revision, job.current), (0, 0, None))
            before = path.read_bytes()
            result = self.decide(state=empty, verified_candidate=None,
                                 gateway=gateway(requests=13, output=6999), now=374.49)
            self.assertFalse(result.allowed)
            self.assertEqual(result.reason, 'invalid_or_empty_persisted_state')
            self.assertEqual(path.read_bytes(), before)

    def test_verified_existing_candidate_permits_once_with_same_deadline(self):
        self.assertTrue(self.decide().allowed)
        self.assertFalse(self.decide(pass_index=1).allowed)
        self.assertFalse(self.decide(now=1870.0).allowed)
        self.assertTrue(self.decide(now=1869.999).allowed)

    def test_every_original_gateway_condition_remains_required(self):
        changes = [{'fast': True}, {'requests': 0}, {'requests': 32}, {'output': 96000},
                   {'error': 'error'}, {'error_code': 'WORLDIFACT_RESPONSE_INCOMPLETE'},
                   {'upstream_status': 500}, {'unknown_usage': True}, {'active': True},
                   {'cancelled': True}, {'cancellation_file': True}]
        for change in changes:
            with self.subTest(change=change):
                self.assertFalse(self.decide(gateway=replace(self.gateway, **change)).allowed)
        for change in ({'process_code': 1}, {'reader_alive': True}, {'failure': 'CLI failure'},
                       {'pass_index': -1}, {'now': 90}, {'deadline_seconds': float('inf')},
                       {'now': 10 ** 1000}):
            with self.subTest(change=change):
                self.assertFalse(self.decide(**change).allowed)

    def test_state_execution_revision_counter_and_nonfinite_mismatch_refuse(self):
        changes = [{'execution_id': 'other'}, {'started': 101}, {'revision': True},
                   {'attempts': 0}, {'model_revision': 0}, {'attempts': 6},
                   {'model_revision': 2}, {'blender_seconds': float('nan')},
                   {'blender_seconds': float('inf')}, {'tool_failures': -1},
                   {'calls': []}, {'calls': [event('build_model', 'started')]}]
        for change in changes:
            with self.subTest(change=change):
                self.assertFalse(self.decide(state={**self.state, **change}).allowed)
        self.assertFalse(self.decide(gateway=replace(self.gateway, execution_id='other')).allowed)

    def test_mismatched_or_missing_candidate_never_recovers_empty_job(self):
        self.assertFalse(self.decide(verified_candidate=None).allowed)
        for change in ({'execution_id': 'previous-job'}, {'revision': 2}, {'revision': True},
                       {'path': 'candidates/2'}, {'path': '../candidates/1'},
                       {'path': 'candidates/' + '1' * 5000}):
            value = candidate()
            value['info'].update(change)
            with self.subTest(change=change):
                self.assertFalse(self.decide(verified_candidate=value).allowed)
        for change in ({'identity': None}, {'identity': (100, 'bad')},
                       {'result': {'triangles': 0}}):
            self.assertFalse(self.decide(verified_candidate={**candidate(), **change}).allowed)

    def test_unfinished_build_cannot_hide_behind_later_read(self):
        value = state(calls=[event('build_model', 'started'), event('get_current_model')])
        self.assertFalse(self.decide(state=value).allowed)

    def test_finished_accepted_or_draft_outcome_is_terminal(self):
        for accepted in (False, True):
            outcome = {'finished': True, 'accepted': accepted, 'revision': 1,
                       'execution_id': 'same-execution'}
            before = deepcopy(outcome)
            self.assertEqual(self.decide(verified_outcome=outcome).reason, 'already_finished')
            self.assertEqual(outcome, before)
        self.assertFalse(self.decide(gateway=replace(self.gateway, completed=True)).allowed)

    def test_prior_failed_edit_can_keep_a_verified_current_candidate(self):
        value = state(attempts=2, tool_failures=1,
                      calls=[*self.state['calls'], event('edit_model', 'started', 1, 1),
                             event('edit_model', 'failed', 1, 2)])
        self.assertTrue(self.decide(state=value).allowed)

    def test_mode_never_activates_from_natural_language_or_legacy_standard_alone(self):
        for value in ({'instructions': policy.STANDARD},
                      {**request(), 'construction_mode': 'standard'},
                      {**request(), 'instructions': 'Please use ' + policy.MODE}):
            result = self.decide(request=value)
            self.assertFalse(result.allowed)
            self.assertEqual(result.action, 'legacy')

    def test_policy_inputs_are_unchanged(self):
        before = deepcopy((self.request, self.state, self.candidate, self.gateway))
        self.decide()
        self.decide(process_code=1)
        self.assertEqual((self.request, self.state, self.candidate, self.gateway), before)


class PrebuildTests(unittest.TestCase):
    def decide(self, **changes):
        values = {'request': request(), 'gateway': gateway(), 'mcp': mcp(calls()),
                  'history': (response(),), 'next_phase': 'construction'}
        return policy.prebuild_admission(**{**values, **changes})

    def test_initial_discovery_then_contract_and_build_response_are_admitted(self):
        initial = self.decide(gateway=gateway(requests=0, output=0), mcp=mcp(),
                              history=(), next_phase='discovery')
        self.assertTrue(initial.allowed)
        self.assertTrue(self.decide().allowed)
        self.assertTrue(self.decide(mcp=mcp(calls() + calls('get_current_model')),
                                   history=(response(after=2),)).allowed)

    def test_second_discovery_and_empty_or_code_only_first_response_refuse(self):
        self.assertFalse(self.decide(next_phase='discovery').allowed)
        empty = {'mcp': mcp(), 'history': (response(after=0),)}
        self.assertFalse(self.decide(**empty).allowed)
        self.assertFalse(self.decide(**empty, next_phase='discovery').allowed)

    def test_one_construction_response_without_build_never_gets_third_paid_turn(self):
        history = (response(), response(2, 'construction', before=1, after=1))
        result = self.decide(gateway=gateway(requests=2), history=history)
        self.assertEqual(result.reason, 'no_build_progress')
        self.assertFalse(result.allowed)

    def test_repeated_contract_or_empty_model_reads_are_not_progress(self):
        for entries in (calls() + calls(), calls() + calls('get_current_model') * 2):
            result = self.decide(mcp=mcp(entries), history=(response(after=len(entries) // 2),))
            self.assertEqual(result.reason, 'repeated_prebuild_reads')

    def test_preflight_tool_failure_and_changing_errors_stop_without_matching_messages(self):
        for message in ('TypeError: x', 'SyntaxError: y', 'A different runtime error'):
            entries = calls() + (event('build_model', 'failed', error=message),)
            self.assertFalse(self.decide(mcp=mcp(entries), history=(response(after=2),)).allowed)
            self.assertEqual(self.decide(history=(response(code_errors=(message,)),)).reason,
                             'code_mode_failure')

    def test_failed_actual_build_preserves_attempt_and_stops(self):
        entries = calls() + (event('build_model', 'started'),
                             event('build_model', 'failed', attempts=1, attempt=1))
        evidence = mcp(entries, attempts=1)
        result = self.decide(mcp=evidence, history=(response(after=2),))
        self.assertFalse(result.allowed)
        self.assertEqual(evidence.attempts, 1)

    def test_inflight_build_waits_without_second_request_or_killing_the_build(self):
        evidence = mcp(calls() + (event('build_model', 'started'),), attempts=1)
        before = deepcopy(evidence)
        result = self.decide(mcp=evidence)
        self.assertEqual((result.allowed, result.reason, result.action),
                         (False, 'build_in_flight', 'wait'))
        self.assertEqual(evidence, before)

    def test_inflight_read_and_provider_wait_with_no_authorized_spend(self):
        result = self.decide(mcp=mcp(calls() + (event('get_current_model', 'started'),)))
        self.assertEqual(result.action, 'wait')
        self.assertFalse(result.allowed)
        self.assertEqual(self.decide(gateway=gateway(active=True)).action, 'wait')

    def test_completed_build_hands_back_to_existing_candidate_completion(self):
        entries = calls() + (event('build_model', 'started'),
                             event('build_model', 'completed', 1, 1, attempt=1))
        evidence = mcp(entries, attempts=1, revision=1)
        result = self.decide(mcp=evidence, history=(response(after=2),))
        self.assertEqual(result.reason, 'candidate_exists_use_completion_policy')
        self.assertFalse(result.allowed)

    def test_unknown_cancelled_failed_or_incomplete_requests_cannot_retry(self):
        for status in ('incomplete', 'failed', 'cancelled', 'started', 'unknown'):
            self.assertFalse(self.decide(history=(response(status=status),)).allowed)
        self.assertFalse(self.decide(history=(response(usage_known=False),)).allowed)
        for change in ({'cancelled': True}, {'cancellation_file': True}, {'unknown_usage': True},
                       {'error_code': 'WORLDIFACT_RESPONSE_INCOMPLETE'}, {'upstream_status': 503}):
            self.assertFalse(self.decide(gateway=gateway(**change)).allowed)

    def test_missing_truncated_or_other_execution_history_fails_closed(self):
        for value in ((), (response(sequence=2),), (response(sequence=True),),
                      (response(execution_id='previous-job'),),
                      (response(before=2, after=1),), (response(after=99),)):
            self.assertFalse(self.decide(history=value).allowed)
        self.assertFalse(self.decide(mcp=mcp(calls(), total_calls=2)).allowed)
        self.assertFalse(self.decide(mcp=mcp(calls(), failures=1)).allowed)
        self.assertFalse(self.decide(mcp=replace(mcp(calls()), execution_id='previous-job')).allowed)

    def test_counter_regression_and_malformed_calls_are_refused(self):
        invalid = ((event(tool=[]),), (event(status='unknown'),),
                   (event('get_current_model'),),
                   (event('build_model', 'started'), event('get_current_model', 'started')))
        for entries in invalid:
            self.assertFalse(self.decide(mcp=mcp(entries)).allowed)
        self.assertFalse(self.decide(mcp=mcp(calls(), attempts=1)).allowed)

    def test_evidence_and_finite_limits_cannot_reset_or_mutate(self):
        values = (request(), gateway(), mcp(calls()), (response(),))
        before = deepcopy(values)
        policy.prebuild_admission(*values, next_phase='construction')
        self.assertEqual(values, before)
        with self.assertRaises(FrozenInstanceError):
            values[1].requests = 0
        for change in ({'discovery_requests': float('inf')}, {'construction_requests': True},
                       {'construction_requests': 0}, {'build_limit': 6}, {'empty_model_reads': -1}):
            with self.assertRaises(ValueError):
                policy.Limits(**change)

    def test_reviewed_finite_override_still_stops_at_its_allowance(self):
        limits = policy.Limits(construction_requests=2)
        history = (response(), response(2, 'construction', before=1, after=1))
        self.assertTrue(self.decide(gateway=gateway(requests=2), history=history, limits=limits).allowed)
        history += (response(3, 'construction', before=1, after=1),)
        self.assertFalse(self.decide(gateway=gateway(requests=3), history=history, limits=limits).allowed)


class MonetaryTests(unittest.TestCase):
    def setUp(self):
        # Explicit synthetic envelopes, not measured Earth-generation needs.
        self.build = policy.TokenEnvelope(4096, 8192)
        self.inspect = policy.TokenEnvelope(4096, 2048)
        self.final = policy.TokenEnvelope(2048, 1024)
        self.capacity = policy.RequiredCapacity(self.build, (self.inspect,), self.final)
        self.budget = policy.BudgetEvidence('same-execution', 0, 0, True, True)
        self.discovery = policy.TokenEnvelope(2048, 512)

    def decide(self, **changes):
        values = {'request': request(), 'budget': self.budget, 'phase': 'discovery',
                  'proposed': self.discovery, 'capacity': self.capacity}
        return policy.monetary_admission(**{**values, **changes})

    def test_exact_usd175_boundary_passes_and_one_micro_more_refuses(self):
        total = sum(x.micro_usd for x in (self.discovery, self.build, self.inspect, self.final))
        boundary = policy.CEILING_MICRO_USD - total
        self.assertTrue(self.decide(budget=replace(self.budget, liability_micro_usd=boundary)).allowed)
        rejected = self.decide(budget=replace(self.budget, liability_micro_usd=boundary + 1))
        self.assertFalse(rejected.allowed)
        self.assertEqual(rejected.reason, 'required_remaining_capacity_not_funded')

    def test_discovery_cannot_spend_required_complete_build_and_review_capacity(self):
        result = self.decide()
        self.assertEqual(result.remaining_micro_usd,
                         self.build.micro_usd + self.inspect.micro_usd + self.final.micro_usd)
        almost_used = policy.CEILING_MICRO_USD - self.discovery.micro_usd
        self.assertFalse(self.decide(budget=replace(self.budget, liability_micro_usd=almost_used)).allowed)

    def test_each_stage_protects_all_required_later_responses(self):
        result = self.decide(phase='construction', proposed=self.build)
        self.assertTrue(result.allowed)
        self.assertEqual(result.remaining_micro_usd, self.inspect.micro_usd + self.final.micro_usd)
        result = self.decide(phase='inspection', proposed=self.inspect)
        self.assertEqual(result.remaining_micro_usd, self.final.micro_usd)
        self.assertEqual(self.decide(phase='finalization', proposed=self.final).remaining_micro_usd, 0)
        capacity = replace(self.capacity, inspection=(self.inspect,) * 3)
        result = self.decide(phase='inspection', proposed=self.inspect, capacity=capacity,
                             inspection_index=1)
        self.assertEqual(result.remaining_micro_usd, self.inspect.micro_usd + self.final.micro_usd)

    def test_inspection_index_and_remaining_request_count_are_bounded(self):
        for index in (-1, 1, True):
            self.assertFalse(self.decide(phase='inspection', proposed=self.inspect,
                                         inspection_index=index).allowed)
        self.assertTrue(self.decide(budget=replace(self.budget, requests=28)).allowed)
        self.assertFalse(self.decide(budget=replace(self.budget, requests=29)).allowed)

    def test_unknown_usage_expired_price_identity_or_invalid_liability_refuses(self):
        for change in ({'known_usage': False}, {'price_valid': False},
                       {'execution_id': 'another'}, {'liability_micro_usd': -1},
                       {'liability_micro_usd': float('nan')}, {'liability_micro_usd': True},
                       {'liability_micro_usd': 1750001}, {'requests': 33}):
            self.assertFalse(self.decide(budget=replace(self.budget, **change)).allowed)

    def test_no_predicted_cache_discount_or_automatic_output_shrink(self):
        self.assertEqual(self.discovery.micro_usd, (2048 + 2048) * 14 + 512 * 55)
        smaller = policy.TokenEnvelope(self.build.input_tokens, self.build.output_tokens - 1)
        result = self.decide(phase='construction', proposed=smaller)
        self.assertEqual(result.reason, 'required_stage_capacity_would_shrink')
        larger = policy.TokenEnvelope(self.build.input_tokens + 10000, self.build.output_tokens)
        budget = replace(self.budget, liability_micro_usd=policy.CEILING_MICRO_USD
                         - self.build.micro_usd - self.inspect.micro_usd - self.final.micro_usd)
        self.assertTrue(self.decide(budget=budget, phase='construction', proposed=self.build).allowed)
        self.assertFalse(self.decide(budget=budget, phase='construction', proposed=larger).allowed)

    def test_actual_input_can_be_below_or_at_each_reviewed_stage_ceiling(self):
        for phase, envelope, later in (
                ('construction', self.build, self.inspect.micro_usd + self.final.micro_usd),
                ('inspection', self.inspect, self.final.micro_usd),
                ('finalization', self.final, 0)):
            for input_tokens in (0, envelope.input_tokens - 1, envelope.input_tokens):
                with self.subTest(phase=phase, input_tokens=input_tokens):
                    actual = policy.TokenEnvelope(input_tokens, envelope.output_tokens)
                    result = self.decide(phase=phase, proposed=actual)
                    self.assertTrue(result.allowed)
                    self.assertEqual(result.next_micro_usd, actual.micro_usd)
                    self.assertEqual(result.remaining_micro_usd, later)
            excess = policy.TokenEnvelope(envelope.input_tokens + 1, envelope.output_tokens)
            self.assertEqual(self.decide(phase=phase, proposed=excess).reason,
                             'reviewed_stage_input_ceiling_exceeded')

    def test_smaller_input_keeps_output_minimum_and_every_later_reservation(self):
        actual = policy.TokenEnvelope(self.build.input_tokens - 1, self.build.output_tokens)
        later = self.inspect.micro_usd + self.final.micro_usd
        budget = replace(self.budget, liability_micro_usd=policy.CEILING_MICRO_USD
                         - actual.micro_usd - later)
        result = self.decide(budget=budget, phase='construction', proposed=actual)
        self.assertTrue(result.allowed)
        self.assertEqual(result.remaining_micro_usd, later)
        self.assertFalse(self.decide(budget=replace(budget,
            liability_micro_usd=budget.liability_micro_usd + 1),
            phase='construction', proposed=actual).allowed)
        too_short = policy.TokenEnvelope(actual.input_tokens, self.build.output_tokens - 1)
        self.assertEqual(self.decide(phase='construction', proposed=too_short).reason,
                         'required_stage_capacity_would_shrink')

    def test_excess_input_needs_explicitly_enlarged_plan_and_full_remaining_funding(self):
        actual = policy.TokenEnvelope(self.build.input_tokens + 1, self.build.output_tokens)
        self.assertFalse(self.decide(phase='construction', proposed=actual).allowed)
        enlarged = replace(self.capacity, construction=actual)
        later = self.inspect.micro_usd + self.final.micro_usd
        budget = replace(self.budget, liability_micro_usd=policy.CEILING_MICRO_USD
                         - actual.micro_usd - later)
        result = self.decide(budget=budget, phase='construction', proposed=actual,
                             capacity=enlarged)
        self.assertTrue(result.allowed)
        self.assertEqual(result.remaining_micro_usd, later)
        self.assertFalse(self.decide(budget=replace(budget,
            liability_micro_usd=budget.liability_micro_usd + 1), phase='construction',
            proposed=actual, capacity=enlarged).allowed)

    def test_required_envelopes_are_finite_complete_and_never_quality_claims(self):
        for arguments in ((-1, 256), (65537, 256), (0, 16001), (0, True), (0, 255)):
            with self.assertRaises(ValueError):
                policy.TokenEnvelope(*arguments)
        for arguments in ((self.build, (), self.final),
                          (policy.TokenEnvelope(0, 256), (self.inspect,), self.final),
                          (self.build, [self.inspect], self.final)):
            with self.assertRaises(ValueError):
                policy.RequiredCapacity(*arguments)

    def test_existing_ledger_bytes_and_all_inputs_are_preserved_on_allow_and_refuse(self):
        ledger = {'revision': 'astra-low-reconciled-v2', 'legacyHeld': 1000, 'requests': 1,
                  'holds': {'a' * 32: {'input': 2048, 'output': 256, 'held': 42752}}}
        liability = ledger['legacyHeld'] + sum(item['held'] for item in ledger['holds'].values())
        budget = replace(self.budget, liability_micro_usd=liability, requests=ledger['requests'])
        snapshots = deepcopy((ledger, budget, self.capacity, request()))
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'unchanged-original-ledger.json'
            path.write_text(json.dumps(ledger))
            before = path.read_bytes()
            self.assertTrue(self.decide(budget=budget).allowed)
            self.assertFalse(self.decide(budget=replace(budget, known_usage=False)).allowed)
            self.assertEqual(path.read_bytes(), before)
        self.assertEqual((ledger, budget, self.capacity, request()), snapshots)


if __name__ == '__main__':
    unittest.main()
