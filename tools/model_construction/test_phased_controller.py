"""Scripted offline orchestration tests; NOT provider or Blender quality proof."""
import base64
from copy import deepcopy
from dataclasses import replace
import json
from pathlib import Path
import unittest

import construction_policy as policy
import phased_controller as pc


PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=')


def request():
    return {'construction_mode': policy.MODE, 'prompt': 'Original Earth brief 🌍',
            'instructions': policy.STANDARD + '\nKeep every defining feature.',
            'execution_id': 'same-job', 'completion_started': 100.,
            'metadata': {'original': ['keep', {'unknown_future_field': 17}]}}


def scene():
    return {'version': 2, 'name': 'Scripted marker, not an Earth quality result',
            'subject_type': 'object', 'materials': [{'name': 'blue', 'rgb': [0., .3, 1.],
            'pattern': 'plain', 'roughness': .7, 'metallic': 0, 'emission': 0}],
            'parts': [{'kind': 'ellipsoid', 'name': 'body', 'material': 'blue',
                       'center': [0, 0, 0], 'radii': [1, 1, 1]}], 'reference_views': []}


def validate_scene(raw, prompt):
    """Deliberately small test double; actual source validation has a separate test."""
    value = json.loads(raw)
    if set(value) != set(scene()) or not value['parts']:
        raise ValueError('Incomplete scene')
    return value


def validate_edit(code):
    """Syntax-only double; unchanged sandbox coverage uses pinned native sources."""
    compile(code, '<scripted-preflight>', 'exec')
    return code, []


class ScriptedPolicy:
    def __init__(self):
        self.actions = []; self.admissions = []; self.confirmed = []
        self.deny_action = None; self.deny_phase = None
        self.allow_correction = True; self.authenticated = True
        self.corrections = 0
        self.allow_initial_edit = True; self.initial_edits = 0

    def check(self, action, inputs, candidate):
        self.actions.append(action)
        return action != self.deny_action

    def admit(self, phase, inputs, packet, prepared, remaining):
        context = prepared.context_sha256
        self.admissions.append((phase, context, remaining))
        return None if phase == self.deny_phase else pc.Admission('original-ledger-ticket', prepared.fingerprint, context)

    def confirm(self, admission, receipt):
        self.confirmed.append((admission, receipt))
        return self.authenticated and admission.context_sha256 == receipt.context_sha256 and admission.payload_sha256 == receipt.payload_sha256

    def admit_correction(self, inputs, packet, remaining):
        self.corrections += 1
        assert remaining == ('reassessment',)
        return self.allow_correction

    def admit_initial_edit(self, inputs, remaining):
        self.initial_edits += 1
        assert remaining == ('inspection',)
        return self.allow_initial_edit


class ScriptedJob:
    def __init__(self, original):
        self.request = deepcopy(original); self.execution_id = original['execution_id']
        self.folder = Path('/inert-scripted-job'); self.current = None
        self.revision = self.attempts = 0; self.finished = False; self.records = []
        self.seen = set(); self.outcome = None; self.hash = 'a' * 64
        self.image = base64.b64encode(PNG).decode(); self.report = {'triangles': 20}
        self.calls = []

    def record(self, name, status, error=None):
        self.records.append((name, status))

    def call(self, name, arguments):
        self.calls.append((name, deepcopy(arguments)))
        if arguments['expected_revision'] != self.revision:
            raise ValueError('Stale revision')
        if name in ('build_model', 'edit_model'):
            self.attempts += 1; self.revision += 1
            self.hash = ('a' if self.revision == 1 else 'b') * 64
            self.current = self.folder / 'candidates' / str(self.attempts)
            self.seen.clear()
            return {'revision': self.revision}
        if name == 'inspect_render':
            self.seen.add(arguments['view'])
            return [{'type': 'image', 'mimeType': 'image/png', 'data': self.image}]
        if name == 'finish_model':
            if not {'front', 'side', 'back'} <= self.seen:
                raise ValueError('Missing current views')
            self.finished = True
            self.outcome = {'finished': True, 'accepted': arguments['accepted'],
                'execution_id': self.execution_id, 'revision': self.revision, 'model_sha256': self.hash}
            return {'accepted': arguments['accepted']}
        raise AssertionError('Unexpected host tool')

    def candidate(self, *_):
        if self.current is None:
            return None
        return {'path': self.current, 'identity': (100, self.hash), 'result': self.report,
                'info': {'revision': self.revision, 'execution_id': self.execution_id}}


class ControllerTests(unittest.TestCase):
    def setUp(self):
        self.original = request(); self.inputs = pc.Inputs.freeze(self.original)
        self.job = ScriptedJob(self.original); self.policy = ScriptedPolicy()
        self.adapter = pc.JobToolsAdapter(self.job, parse_scene=validate_scene,
            required_views=lambda *_: {'front', 'side', 'back'},
            current_candidate=self.job.candidate, completed_outcome=lambda *_: self.job.outcome,
            check_arguments=lambda *_: None, verify_inputs=lambda *_: True,
            prepare_code=validate_edit,
            tools=[{'name': name, 'inputSchema': {}} for name in
                   ('build_model', 'edit_model', 'inspect_render', 'finish_model')])
        self.reply_transform = lambda value: value
        self.assessment_transform = lambda value: value
        self.plan_value = pc.ScenePlan(pc.canonical(scene()))
        self.packets = []; self.callback_inputs = []; self.response_number = 0
        self.controller = pc.Controller(self.inputs, self.adapter, self.policy,
                                        self.plan, self.assess, self.prepare)

    def prepare(self, phase, inputs, packet, context):
        payload = {'model': 'gpt-6-astra', 'store': False, 'service_tier': 'default',
                   'reasoning': {'effort': 'low'}, 'max_output_tokens': 4096,
                   'input': {'request': inputs.request, 'references': [
                       {'metadata': json.loads(r.metadata_json), 'data': base64.b64encode(r.data).decode()}
                       for r in inputs.references], 'renders': [
                       {'view': r.view, 'data': base64.b64encode(r.data).decode()}
                       for r in packet.renders] if packet else []}}
        return pc.PreparedRequest(pc.canonical(payload).encode(), context)

    def reply(self, value, inputs, prepared):
        self.response_number += 1
        receipt = pc.ProviderReceipt('resp_scripted_' + str(self.response_number),
            inputs.request['execution_id'], prepared.context_sha256, prepared.fingerprint, 'gpt-6-astra', 'completed', True)
        return self.reply_transform(pc.Reply(value, receipt))

    def plan(self, inputs, prepared, admission):
        self.callback_inputs.append(inputs)
        return self.reply(self.plan_value, inputs, prepared)

    def assess(self, inputs, packet, prepared, admission):
        self.callback_inputs.append(inputs); self.packets.append(packet)
        value = pc.Assessment(packet.candidate.revision, packet.candidate.model_sha256,
            packet.fingerprint, True, (), 'SCRIPTED transport verdict; no model quality judgment.')
        return self.reply(self.assessment_transform(value), inputs, prepared)

    def finished_calls(self, name):
        return self.job.records.count((name, 'completed'))

    def assert_no_finish(self):
        self.assertFalse(self.job.finished)
        self.assertEqual(self.finished_calls('finish_model'), 0)

    def test_first_pass_requires_actual_images_and_two_provider_completions(self):
        result = self.controller.run()
        self.assertEqual(result.status, 'accepted')
        self.assertEqual([a[0] for a in self.policy.admissions], ['construction', 'inspection'])
        self.assertEqual([a[2] for a in self.policy.admissions], [('inspection',), ()])
        self.assertEqual(self.finished_calls('build_model'), 1)
        self.assertEqual(self.finished_calls('inspect_render'), 3)
        self.assertEqual(self.finished_calls('finish_model'), 1)
        self.assertEqual(tuple(r.data for r in self.packets[0].renders), (PNG, PNG, PNG))
        self.assertEqual([r.view for r in self.packets[0].renders], ['front', 'side', 'back'])
        self.assertEqual(len(self.policy.confirmed), 2)
        self.assertEqual(self.policy.initial_edits, 0)

    def test_initial_edit_precedes_all_five_final_revision_views_without_extra_response(self):
        code = "detail = ellipsoid('detail', (0, 0, 0), (1, 1, 1), material)"
        self.plan_value = pc.ScenePlan(pc.canonical(scene()), code)
        self.adapter.required_views = lambda *_: {'front', 'side', 'back', 'face', 'three-quarter'}
        preflight = []
        def validate(code):
            self.assertEqual(self.job.attempts, 0)
            self.assertEqual(self.job.calls, [])
            preflight.append(code)
            return code, []
        self.adapter.prepare_code = validate
        result = self.controller.run()
        self.assertEqual(preflight, [code, '\n' + code])
        self.assertEqual([name for name, _ in self.job.calls],
            ['build_model', 'edit_model'] + ['inspect_render'] * 5 + ['finish_model'])
        self.assertEqual([args['expected_revision'] for _, args in self.job.calls], [0, 1] + [2] * 6)
        self.assertEqual(self.job.calls[1][1]['code'], code)
        self.assertEqual([r.view for r in self.packets[0].renders],
                         ['front', 'side', 'back', 'face', 'three-quarter'])
        self.assertEqual(result.candidate, self.packets[0].candidate)
        self.assertEqual(result.candidate.revision, 2)
        self.assertEqual(result.candidate.model_sha256, self.job.hash)
        self.assertEqual(self.policy.initial_edits, 1)
        self.assertEqual(self.response_number, 2)
        self.assertEqual(len(self.policy.admissions), 2)
        self.assertEqual(len(self.policy.confirmed), 2)
        self.assertEqual(result.as_server_outcome()['revision'], 2)

    def test_initial_edit_preserves_original_references_and_fingerprint(self):
        refs = (pc.Reference(pc.canonical({'name': 'Back', 'view': 'back', 'custom': 17}), 'image/png', PNG),
                pc.Reference(pc.canonical({'name': 'Front', 'view': 'front'}), 'image/png', PNG + b'original'))
        inputs = pc.Inputs.freeze(self.original, refs)
        self.plan_value = pc.ScenePlan(pc.canonical(scene()), 'obj.scale.x = 1.01')
        controller = pc.Controller(inputs, self.adapter, self.policy, self.plan, self.assess, self.prepare)
        controller.run()
        self.assertEqual(len(self.callback_inputs), 2)
        self.assertTrue(all(value.fingerprint == inputs.fingerprint and value.references == refs
                            for value in self.callback_inputs))
        self.assertEqual(self.packets[0].candidate.execution_id, inputs.request['execution_id'])

    def test_initial_edit_bounds_and_original_validator_fail_before_any_build(self):
        for code in ('', '  ', 1, False, {}, 'x' * 20001, 'return 1', 'if invalid syntax:'):
            with self.subTest(code=str(code)[:40]):
                self.setUp(); self.plan_value = pc.ScenePlan(pc.canonical(scene()), code)
                with self.assertRaises((pc.Refused, SyntaxError)):
                    self.controller.run()
                self.assertEqual(self.job.calls, [])
                self.assertEqual(self.job.attempts, 0)
                self.assertEqual(self.policy.initial_edits, 0)
                self.assertEqual(self.response_number, 1)
        self.setUp(); self.plan_value = pc.ScenePlan(pc.canonical(scene()), 'obj.scale.x = 1')
        def forbidden(_):
            raise ValueError('original sandbox refused')
        self.adapter.prepare_code = forbidden
        with self.assertRaisesRegex(ValueError, 'original sandbox refused'):
            self.controller.run()
        self.assertEqual(self.job.calls, [])
        self.setUp(); self.plan_value = pc.ScenePlan(pc.canonical(scene()), 'obj.scale.x = 1')
        self.adapter.prepare_code = None
        with self.assertRaisesRegex(pc.Refused, 'original_validator_required'):
            self.controller.run()
        self.assertEqual(self.job.calls, [])

    def test_invalid_base_scene_is_not_replaced_by_initial_edit(self):
        self.plan_value = pc.ScenePlan('{}', 'obj.scale.x = 1')
        self.adapter.prepare_code = lambda _: self.fail('Invalid scene reached edit validation')
        with self.assertRaises(ValueError):
            self.controller.run()
        self.assertEqual(self.job.calls, [])

    def test_normalized_accumulated_initial_edit_is_preflighted_before_base_build(self):
        self.plan_value = pc.ScenePlan(pc.canonical(scene()), 'original_code = 1')
        codes = []
        def validate(code):
            codes.append(code)
            if code.startswith('\n'):
                raise ValueError('original accumulated-code bound')
            return 'normalized_code = 1', []
        self.adapter.prepare_code = validate
        with self.assertRaisesRegex(ValueError, 'accumulated-code bound'):
            self.controller.run()
        self.assertEqual(codes, ['original_code = 1', '\nnormalized_code = 1'])
        self.assertEqual(self.job.calls, [])

    def test_initial_sequence_admission_and_cancellation_prevent_first_build(self):
        for cancel in (False, True):
            with self.subTest(cancel=cancel):
                self.setUp(); self.plan_value = pc.ScenePlan(pc.canonical(scene()), 'obj.scale.x = 1')
                if cancel:
                    def admit(*_):
                        self.policy.deny_action = 'before_build'
                        return True
                    self.policy.admit_initial_edit = admit
                else:
                    self.policy.allow_initial_edit = False
                with self.assertRaises(pc.Refused):
                    self.controller.run()
                self.assertEqual(self.job.calls, [])
                self.assertEqual(self.response_number, 1)
                self.assert_no_finish()

    def test_cancel_or_failure_between_initial_builds_cannot_inspect_intermediate(self):
        for failure in ('build_failure', 'cancel', 'edit_failure', 'stale_candidate'):
            with self.subTest(failure=failure):
                self.setUp(); self.plan_value = pc.ScenePlan(pc.canonical(scene()), 'obj.scale.x = 1')
                call = self.job.call
                def interrupted(name, arguments):
                    if name == 'build_model' and failure == 'build_failure':
                        raise RuntimeError('Scripted base build failed')
                    if name == 'edit_model' and failure == 'edit_failure':
                        raise RuntimeError('Scripted edit build failed')
                    result = call(name, arguments)
                    if name == 'build_model':
                        if failure == 'cancel':
                            self.policy.deny_action = 'before_build'
                        elif failure == 'stale_candidate':
                            check = self.policy.check
                            def mutate(action, inputs, candidate):
                                if action == 'before_build':
                                    self.job.hash = 'f' * 64
                                return check(action, inputs, candidate)
                            self.policy.check = mutate
                    return result
                self.job.call = interrupted
                with self.assertRaises((pc.Refused, RuntimeError)):
                    self.controller.run()
                self.assertEqual(self.finished_calls('inspect_render'), 0)
                self.assertEqual(self.response_number, 1)
                self.assertEqual(self.job.revision, 0 if failure == 'build_failure' else 1)
                self.assert_no_finish()
                prior = deepcopy(self.job.calls)
                with self.assertRaisesRegex(pc.Refused, 'single_use_no_retry'):
                    self.controller.run()
                self.assertEqual(self.job.calls, prior)

    def test_initial_edit_can_have_one_independent_inspection_correction(self):
        self.plan_value = pc.ScenePlan(pc.canonical(scene()), 'obj.scale.x = 1')
        self.assessment_transform = lambda v: (replace(v, accepted=False, issues=('Needs adjustment.',),
            correction=pc.EditPlan('obj.scale.x = 1.1')) if v.revision == 2 else v)
        result = self.controller.run()
        self.assertEqual(result.candidate.revision, 3)
        self.assertEqual([packet.candidate.revision for packet in self.packets], [2, 3])
        self.assertEqual(self.policy.initial_edits, 1)
        self.assertEqual(self.policy.corrections, 1)
        self.assertEqual(self.response_number, 3)
        self.assertEqual(self.finished_calls('edit_model'), 2)

    def test_initial_edit_on_scene_correction_is_refused_before_correction_admission(self):
        self.assessment_transform = lambda v: replace(v, accepted=False, issues=('Needs correction.',),
            correction=pc.ScenePlan(pc.canonical(scene()), 'obj.scale.x = 1'))
        with self.assertRaisesRegex(pc.Refused, 'assessment_required'):
            self.controller.run()
        self.assertEqual(self.job.attempts, 1)
        self.assertEqual(self.policy.corrections, 0)
        self.assertEqual(self.policy.initial_edits, 0)
        self.assert_no_finish()

    def test_original_prompt_metadata_and_reference_order_survive_all_callbacks(self):
        refs = (pc.Reference(pc.canonical({'name': 'Back', 'view': 'back', 'extra': 9}), 'image/png', PNG),
                pc.Reference(pc.canonical({'name': 'Front', 'view': 'front'}), 'image/png', PNG + b'original'))
        inputs = pc.Inputs.freeze(self.original, refs)
        fingerprint = inputs.fingerprint
        controller = pc.Controller(inputs, self.adapter, self.policy, self.plan, self.assess, self.prepare)
        self.original['metadata']['original'].append('changed outside')
        controller.run()
        for value in self.callback_inputs:
            self.assertEqual(value.fingerprint, fingerprint)
            self.assertEqual(value.references, refs)
            self.assertNotIn('changed outside', value.request['metadata']['original'])
        changed = inputs.request; changed['prompt'] = 'mutating a copy'
        self.assertEqual(inputs.fingerprint, fingerprint)

    def test_rejection_finishes_only_as_rejected(self):
        self.assessment_transform = lambda v: replace(v, accepted=False, issues=('Missing defining detail.',))
        result = self.controller.run()
        self.assertEqual(result.status, 'rejected')
        self.assertIs(result.assessment.accepted, False)
        self.assertIs(self.job.outcome['accepted'], False)
        # Exact legacy worker behavior would mark any ordinary return success;
        # the required conversion must instead raise after preserving the draft.
        with self.assertRaises(pc.RejectedForServer) as failure:
            result.as_server_outcome()
        self.assertEqual(failure.exception.code, 'WORLDIFACT_CONSTRUCTION_REJECTED')
        self.assertTrue(self.job.finished)

    def test_only_verified_accepted_result_converts_to_legacy_success(self):
        result = self.controller.run()
        outcome = result.as_server_outcome()
        self.assertIs(outcome['accepted'], True)
        self.assertEqual(outcome['model_sha256'], self.job.hash)
        with self.assertRaises(pc.Refused):
            replace(result, outcome_json=pc.canonical({**outcome, 'accepted': False})).as_server_outcome()

    def test_exact_prepared_bytes_are_admitted_before_any_send(self):
        prepared = []; sent = []
        old_prepare, old_plan, old_admit = self.prepare, self.plan, self.policy.admit
        def prepare(*args):
            value = old_prepare(*args); prepared.append(value); return value
        def admit(phase, inputs, packet, value, remaining):
            self.assertIs(value, prepared[-1])
            self.assertEqual(sent, []) if phase == 'construction' else None
            return old_admit(phase, inputs, packet, value, remaining)
        def send(inputs, value, admission):
            self.assertIs(value, prepared[-1]); sent.append(value.payload)
            self.assertEqual(admission.payload_sha256, pc.digest(value.payload))
            return old_plan(inputs, value, admission)
        self.controller.prepare = prepare; self.controller.plan = send; self.policy.admit = admit
        self.controller.run()
        self.assertEqual(sent[0], prepared[0].payload)

    def test_payload_mismatch_in_admission_or_authenticated_receipt_refuses(self):
        self.reply_transform = lambda r: replace(r, receipt=replace(r.receipt, payload_sha256='0' * 64))
        with self.assertRaisesRegex(pc.Refused, 'completion_not_verified'):
            self.controller.run()
        self.assertEqual(self.job.attempts, 0)
        self.setUp()
        self.policy.admit = lambda *args: pc.Admission('ticket', '0' * 64, args[3].context_sha256)
        with self.assertRaisesRegex(pc.Refused, 'not_admitted'):
            self.controller.run()
        self.assertEqual(self.response_number, 0)

    def test_invalid_or_mutable_prepared_payload_never_gets_admission(self):
        for transform in (lambda p: replace(p, payload=bytearray(p.payload)),
                          lambda p: replace(p, context_sha256='0' * 64),
                          lambda p: replace(p, payload=b'{"model":"gpt-6-astra","model":"other"}'),
                          lambda p: replace(p, payload=p.payload.replace(b'"store":false', b'"store":true')),
                          lambda p: replace(p, payload=p.payload.replace(b'4096', b'false'))):
            with self.subTest(transform=transform):
                self.setUp(); original = self.prepare
                self.controller.prepare = lambda *args: transform(original(*args))
                with self.assertRaises(pc.Refused):
                    self.controller.run()
                self.assertEqual(self.policy.admissions, []); self.assertEqual(self.response_number, 0)

    def test_cancellation_during_admission_stops_before_send_without_releasing_hold(self):
        original = self.policy.admit
        def admission(*args):
            result = original(*args); self.policy.deny_action = 'before_send'; return result
        self.policy.admit = admission
        with self.assertRaises(pc.Refused):
            self.controller.run()
        self.assertEqual(len(self.policy.admissions), 1)
        self.assertEqual(self.response_number, 0)

    def test_changed_original_inputs_during_provider_call_stop_before_build(self):
        original = self.plan
        def plan(*args):
            result = original(*args); self.job.request['prompt'] = 'changed'; return result
        self.controller.plan = plan
        with self.assertRaisesRegex(pc.Refused, 'verified_execution'):
            self.controller.run()
        self.assertEqual(self.job.attempts, 0)

    def test_one_replacement_or_sandboxed_edit_then_fresh_assessment(self):
        for correction, tool in ((pc.ScenePlan(pc.canonical(scene())), 'build_model'),
                                  (pc.EditPlan('obj.scale.x = 1.01'), 'edit_model')):
            with self.subTest(tool=tool):
                self.setUp()
                self.assessment_transform = lambda v: (replace(v, accepted=False,
                    issues=('Needs correction.',), correction=correction) if v.revision == 1 else v)
                result = self.controller.run()
                self.assertEqual(result.candidate.revision, 2)
                self.assertEqual(len(self.packets), 2)
                self.assertNotEqual(self.packets[0].fingerprint, self.packets[1].fingerprint)
                self.assertEqual(self.finished_calls('inspect_render'), 6)
                self.assertEqual(self.finished_calls(tool), 2 if tool == 'build_model' else 1)
                self.assertEqual([a[0] for a in self.policy.admissions],
                                 ['construction', 'inspection', 'reassessment'])
                self.assertEqual(self.policy.corrections, 1)

    def test_second_correction_is_refused_without_third_build(self):
        self.assessment_transform = lambda v: replace(v, accepted=False, issues=('Still wrong.',),
                                                     correction=pc.ScenePlan(pc.canonical(scene())))
        with self.assertRaisesRegex(pc.Refused, 'one_correction_limit'):
            self.controller.run()
        self.assertEqual(self.job.attempts, 2); self.assert_no_finish()

    def test_correction_requires_explicit_capacity_before_build(self):
        self.assessment_transform = lambda v: replace(v, accepted=False, issues=('Wrong.',),
                                                     correction=pc.EditPlan('obj.scale.x = 1.01'))
        self.policy.allow_correction = False
        with self.assertRaisesRegex(pc.Refused, 'not_funded'):
            self.controller.run()
        self.assertEqual(self.job.attempts, 1); self.assert_no_finish()

    def test_optional_reassessment_is_not_reserved_until_a_correction_is_proposed(self):
        # A job with enough capacity for construction and its mandatory review
        # can succeed without reserving an optional paid third response.
        original = self.policy.admit
        def mandatory_only(phase, inputs, packet, prepared, remaining):
            if 'reassessment' in remaining:
                return None
            return original(phase, inputs, packet, prepared, remaining)
        self.policy.admit = mandatory_only
        self.policy.allow_correction = False
        self.assertEqual(self.controller.run().status, 'accepted')
        self.assertEqual(self.policy.corrections, 0)
        self.assertEqual(self.response_number, 2)

    def test_correction_admission_cancellation_stops_before_rebuild(self):
        self.assessment_transform = lambda v: replace(v, accepted=False,
            issues=('Real detail needs correction.',), correction=pc.EditPlan('obj.scale.x = 1.01'))
        def admission(*args):
            self.policy.deny_action = 'before_build'
            return True
        self.policy.admit_correction = admission
        with self.assertRaisesRegex(pc.Refused, 'original_limits_or_cancellation'):
            self.controller.run()
        self.assertEqual(self.job.attempts, 1)
        self.assertEqual(self.response_number, 2)
        self.assert_no_finish()

    def test_missing_phase_capacity_prevents_provider_callback(self):
        for phase, expected_calls in [('construction', 0), ('inspection', 1)]:
            with self.subTest(phase=phase):
                self.setUp(); self.policy.deny_phase = phase
                with self.assertRaisesRegex(pc.Refused, 'not_admitted'):
                    self.controller.run()
                self.assertEqual(self.response_number, expected_calls); self.assert_no_finish()

    def test_unknown_incomplete_wrong_model_or_unbound_provider_evidence_refuses(self):
        for fields in ({'status': 'incomplete'}, {'status': 'failed'}, {'status': 'cancelled'},
                       {'usage_known': False}, {'usage_known': 1}, {'model': 'another-model'},
                       {'execution_id': 'other-job'}, {'context_sha256': '0' * 64},
                       {'response_id': 'not-a-provider-response'}):
            with self.subTest(fields=fields):
                self.setUp()
                self.reply_transform = lambda r: replace(r, receipt=replace(r.receipt, **fields))
                with self.assertRaisesRegex(pc.Refused, 'completion_not_verified'):
                    self.controller.run()
                self.assertEqual(self.job.attempts, 0); self.assert_no_finish()

    def test_structurally_correct_receipt_requires_trusted_authentication(self):
        self.policy.authenticated = False
        with self.assertRaisesRegex(pc.Refused, 'completion_not_verified'):
            self.controller.run()
        self.assertEqual(self.job.attempts, 0)

    def test_duplicate_response_cannot_be_reused_as_review(self):
        self.reply_transform = lambda r: replace(r, receipt=replace(r.receipt, response_id='resp_same'))
        with self.assertRaisesRegex(pc.Refused, 'completion_not_verified'):
            self.controller.run()
        self.assert_no_finish()

    def test_policy_cancellation_deadline_and_limit_checks_guard_every_boundary(self):
        actions = ('start', 'before_construction', 'after_construction', 'before_build',
                   'after_build', 'before_render', 'after_render', 'before_inspection',
                   'after_inspection', 'before_finish')
        for action in actions:
            with self.subTest(action=action):
                self.setUp(); self.policy.deny_action = action
                with self.assertRaisesRegex(pc.Refused, 'original_limits_or_cancellation'):
                    self.controller.run()
                self.assert_no_finish()

    def test_empty_malformed_or_untyped_plan_never_starts_blender(self):
        for value in (None, {}, pc.EditPlan('not a first build'), pc.ScenePlan('{}'), pc.ScenePlan('bad json')):
            with self.subTest(value=value):
                self.setUp(); self.plan_value = value
                with self.assertRaises((pc.Refused, ValueError)):
                    self.controller.run()
                self.assertEqual(self.job.attempts, 0)

    def test_stale_or_untruthful_assessment_never_finishes(self):
        for fields in ({'revision': 0}, {'revision': True}, {'model_sha256': '0' * 64},
                       {'renders_sha256': '0' * 64}, {'accepted': 1},
                       {'accepted': False}, {'issues': ('Unresolved.',)}, {'summary': ''},
                       {'correction': pc.EditPlan('code')}, {'issues': []}):
            with self.subTest(fields=fields):
                self.setUp(); self.assessment_transform = lambda v: replace(v, **fields)
                with self.assertRaisesRegex(pc.Refused, 'assessment_required'):
                    self.controller.run()
                self.assert_no_finish()

    def test_mutated_candidate_during_assessment_is_not_accepted(self):
        def mutate(v):
            self.job.hash = 'f' * 64
            return v
        self.assessment_transform = mutate
        with self.assertRaisesRegex(pc.Refused, 'candidate_changed'):
            self.controller.run()
        self.assert_no_finish()

    def test_missing_or_malformed_actual_png_never_reaches_assessment(self):
        for raw in ('not base64', base64.b64encode(b'not an image').decode(), ''):
            with self.subTest(raw=raw):
                self.setUp(); self.job.image = raw
                with self.assertRaisesRegex(pc.Refused, 'render_bytes_required'):
                    self.controller.run()
                self.assertEqual(len(self.packets), 0); self.assert_no_finish()

    def test_missing_required_views_and_changed_inputs_fail_closed(self):
        self.adapter.required_views = lambda *_: {'front'}
        with self.assertRaisesRegex(pc.Refused, 'required_views_missing'):
            self.controller.run()
        self.assertEqual(self.job.attempts, 0)
        self.setUp(); self.job.request['prompt'] = 'changed'
        with self.assertRaisesRegex(pc.Refused, 'fresh_verified_execution'):
            self.controller.run()
        self.assertEqual(self.response_number, 0)

    def test_unverified_reference_bytes_refuse_before_provider(self):
        self.adapter.verify_inputs = lambda *_: False
        with self.assertRaises(pc.Refused):
            self.controller.run()
        self.assertEqual(self.response_number, 0)

    def test_existing_candidate_never_becomes_a_fresh_controller_run(self):
        self.job.attempts = self.job.revision = 1
        self.job.current = self.job.folder / 'candidates' / '1'
        with self.assertRaisesRegex(pc.Refused, 'fresh_verified_execution'):
            self.controller.run()
        self.assertEqual(self.response_number, 0)

    def test_terminal_outcome_verifier_required_and_no_retry_after_failure(self):
        self.adapter.read_outcome = lambda *_: None
        with self.assertRaisesRegex(pc.Refused, 'terminal_outcome_required'):
            self.controller.run()
        calls = list(self.job.records)
        with self.assertRaisesRegex(pc.Refused, 'single_use_no_retry'):
            self.controller.run()
        self.assertEqual(self.job.records, calls)

    def test_tool_argument_check_and_failed_record_are_not_bypassed(self):
        def refuse(*_):
            raise ValueError('existing argument validator refused')
        self.adapter.check_arguments = refuse
        with self.assertRaisesRegex(ValueError, 'argument validator'):
            self.controller.run()
        self.assertEqual(self.job.records, [('build_model', 'failed')])
        self.assertEqual(self.job.attempts, 0)


if __name__ == '__main__':
    unittest.main()
