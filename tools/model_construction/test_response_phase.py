"""Responses phase regressions; scripted wire data, never a paid provider call.

The final assistant answer alone may supply scene/edit or assessment JSON.
Intermediate commentary must neither be parsed as a plan nor invalidate a
separate, authenticated final answer. Refusals and malformed messages still fail.
"""
from copy import deepcopy
import unittest
from unittest.mock import patch

import construction_payload as payload
import phased_controller as pc
import test_construction_payload as fixtures


def message(text, phase='commentary'):
    return {'id': 'msg_synthetic_intermediate', 'type': 'message',
            'role': 'assistant', 'status': 'completed', 'phase': phase,
            'content': [{'type': 'output_text', 'text': text, 'annotations': []}]}


class ResponsePhaseTests(unittest.TestCase):
    def setUp(self):
        self.fixture = fixtures.PayloadTests()
        self.fixture.setUp()
        self.plan = {'scene_json': pc.canonical(fixtures.scene()), 'initial_edit': None}

    def test_intermediate_text_is_not_parsed_and_final_scene_and_edit_are_preserved(self):
        envelope = {**self.plan, 'initial_edit': 'obj.scale.x = 1.05\n'}
        def change(response):
            response['output'][-1]['phase'] = 'final_answer'
            response['output'].insert(0, message('Preparing the scene. This is not JSON.'))
            response['output'].insert(2, message('{"scene_json":"wrong","initial_edit":null}'))
        result = self.fixture.parse(envelope, change_response=change)
        self.assertEqual(result, pc.ScenePlan(envelope['scene_json'], envelope['initial_edit']))

    def test_actual_final_verdict_wins_over_conflicting_intermediate_acceptance(self):
        early = {'accepted': True, 'issues': [], 'summary': 'Not a final review.', 'correction': None}
        final = {'accepted': False, 'issues': ['The reference feature is missing.'],
                 'summary': 'The current candidate must not be accepted.', 'correction': None}
        for phase in ('inspection', 'reassessment'):
            with self.subTest(phase=phase):
                def change(response):
                    response['output'][-1]['phase'] = 'final_answer'
                    response['output'].insert(0, message(pc.canonical(early)))
                result = self.fixture.parse(final, phase, change_response=change)
                self.assertIs(result.accepted, False)
                self.assertEqual(result.issues, tuple(final['issues']))
                self.assertIsNone(result.correction)

    def test_commentary_only_cannot_be_a_plan_or_acceptance_even_when_json_is_valid(self):
        for phase in ('construction', 'inspection', 'reassessment'):
            with self.subTest(phase=phase):
                envelope = self.plan if phase == 'construction' else {
                    'accepted': True, 'issues': [], 'summary': 'Only a preamble.', 'correction': None}
                with self.assertRaises(pc.Refused):
                    self.fixture.parse(envelope, phase,
                        change_response=lambda r: r['output'][-1].update(phase='commentary'))

    def test_single_legacy_and_explicit_final_answers_remain_compatible(self):
        for phase in (None, 'final_answer'):
            with self.subTest(phase=phase):
                result = self.fixture.parse(self.plan,
                    change_response=lambda r: r['output'][-1].update(phase=phase))
                self.assertEqual(result, pc.ScenePlan(self.plan['scene_json']))
        self.assertEqual(self.fixture.parse(self.plan), pc.ScenePlan(self.plan['scene_json']))

    def test_malformed_or_unknown_phase_is_rejected_without_echoing_provider_values(self):
        private = 'PRIVATE_PHASE_VALUE_NOT_FOR_LOGS'
        for phase in (private, '', 0, False, [], {}):
            with self.subTest(phase=type(phase).__name__):
                with self.assertRaises(pc.Refused) as caught:
                    self.fixture.parse(self.plan,
                        change_response=lambda r: r['output'][-1].update(phase=phase))
                self.assertNotIn(private, str(caught.exception))

    def test_ambiguous_final_selection_is_not_resolved_by_picking_the_last_message(self):
        def double_final(r):
            r['output'][-1]['phase'] = 'final_answer'
            r['output'].append(deepcopy(r['output'][-1]))
        def legacy_with_commentary(r):
            r['output'].insert(0, message('Not a final answer.'))
        def legacy_and_final(r):
            extra = deepcopy(r['output'][-1]); extra['phase'] = 'final_answer'
            r['output'].append(extra)
        def commentary_after_final(r):
            r['output'][-1]['phase'] = 'final_answer'
            r['output'].append(message('A conflicting later update.'))
        for change in (double_final, legacy_with_commentary, legacy_and_final, commentary_after_final):
            with self.subTest(case=change.__name__):
                with self.assertRaises(pc.Refused):
                    self.fixture.parse(self.plan, change_response=change)

    def test_intermediate_refusal_or_incomplete_message_cannot_be_hidden_by_final_json(self):
        invalid = [message('bad') for _ in range(7)]
        invalid[0]['content'] = [{'type': 'refusal', 'refusal': 'Synthetic refusal.'}]
        invalid[1]['status'] = 'incomplete'
        invalid[2]['role'] = 'user'
        invalid[3]['content'] = [{'type': 'output_audio', 'text': 'invalid'}]
        invalid[4]['content'] = []
        invalid[5]['content'] = [{'type': 'output_text', 'text': 5}]
        invalid[6]['content'][0]['annotations'] = [{'type': 'url_citation'}]
        for item in invalid:
            with self.subTest(item=item):
                def change(r):
                    r['output'][-1]['phase'] = 'final_answer'
                    r['output'].insert(0, item)
                with self.assertRaises(pc.Refused):
                    self.fixture.parse(self.plan, change_response=change)

    def test_untrusted_whole_response_is_rejected_before_any_phase_selection(self):
        def change(r):
            r['output'][-1]['phase'] = 'final_answer'
            r['output'].insert(0, message('Intermediate update.'))
        with patch.object(payload, 'output_text', side_effect=AssertionError('Parsed before origin check')):
            with self.assertRaisesRegex(pc.Refused, 'authenticated_provider_completion_required'):
                self.fixture.parse(self.plan, change_response=change, confirm=lambda *_: False)


if __name__ == '__main__':
    unittest.main()
