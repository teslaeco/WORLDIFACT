"""Inert wire/context/parser regressions; no provider or model-quality evidence."""
import base64
from copy import deepcopy
from dataclasses import replace
import json
import unittest
from unittest.mock import patch

import construction_payload as payload
import construction_policy as policy
import phased_controller as pc

PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=')


def request():
    return {'construction_mode': policy.MODE, 'prompt': 'Exact original subject 🌍\n' + 'ą' * 12000,
            'instructions': policy.STANDARD + '\nPreserve the full original instruction. ' * 1000,
            'execution_id': 'same-execution', 'completion_started': 100.,
            'metadata': {'future_field': ['keep', {'nested': 17}]}}


def contract(inputs):
    # Deliberately includes JSON Schema features outside Structured Outputs'
    # subset. They must survive as task data for the unchanged scene validator.
    schema = {'type': 'object', 'title': 'Complete original scene contract',
        'properties': {'parts': {'type': 'array', 'items': {'anyOf': [
            {'type': 'object', 'properties': {'kind': {'const': 'original-' + str(i)}},
             'dependentRequired': {'detail': ['source']}} for i in range(18)]}}},
        'unevaluatedProperties': False}
    return {'prompt': inputs.request['prompt'], 'instructions': inputs.request['instructions'],
        'scene_schema': schema, 'coordinate_and_geometry_guide': 'Full geometry guide ' + 'complete! ' * 2000,
        'edit_helpers': 'Full existing helper contract, including all anatomy and hair helpers.',
        'references': [{'index': i, 'name': json.loads(ref.metadata_json).get('name'),
                        'view': json.loads(ref.metadata_json).get('view')} for i, ref in enumerate(inputs.references)],
        'revision': 0, 'future_contract_metadata': {'keep_all': True}}


def scene():
    return {'version': 2, 'name': 'Synthetic wire marker', 'subject_type': 'object',
            'materials': [], 'parts': [], 'reference_views': []}


def response(envelope):
    return {'id': 'resp_offline', 'model': payload.MODEL, 'status': 'completed',
        'output': [{'id': 'reasoning_offline', 'type': 'reasoning', 'summary': []},
                   {'id': 'message_offline', 'type': 'message', 'role': 'assistant', 'status': 'completed',
                    'content': [{'type': 'output_text', 'text': pc.canonical(envelope), 'annotations': []}]}],
        'usage': {'input_tokens': 5000, 'output_tokens': 100, 'total_tokens': 5100,
                  'input_tokens_details': {'cached_tokens': 0}, 'output_tokens_details': {'reasoning_tokens': 20}}}


class PayloadTests(unittest.TestCase):
    def setUp(self):
        references = tuple(pc.Reference(pc.canonical({'name': name, 'view': view,
            'subject': 'The same subject', 'future_metadata': {'original_index': index}}), 'image/png', PNG + bytes([index]))
            for index, (name, view) in enumerate((('Back reference', 'back'), ('Front reference', 'front'))))
        self.inputs = pc.Inputs.freeze(request(), references)
        self.contract = contract(self.inputs)
        candidate = pc.Candidate(self.inputs.request['execution_id'], 1, 'a' * 64,
                                 pc.canonical({'objects': ['full actual object list'], 'triangles': 30}))
        self.packet = pc.RenderPacket(candidate, tuple(pc.Render(view, PNG) for view in payload.VIEWS))
        self.state = {'revision': 1, 'model_sha256': candidate.model_sha256, 'scene': scene(),
            'edits': '# Original complete accumulated edits\n' + '# untouched edit history\n' * 4000,
            'report': json.loads(candidate.report_json), 'completion_contract': {'structural_passed': True},
            'inspected_views': list(payload.VIEWS), 'future_state_metadata': {'do_not_omit': ['all']}}

    def prepare(self, phase='construction', *, inputs=None, contract_value=None, state=None, packet=None):
        inputs = inputs or self.inputs
        packet = None if phase == 'construction' else (packet or self.packet)
        context = payload.FrozenContext.freeze(contract_value or self.contract,
                    None if phase == 'construction' else (self.state if state is None else state))
        codec = payload.PayloadCodec(context)
        digest = payload.context_fingerprint(phase, inputs, packet)
        prepared = codec.prepare(phase, inputs, packet, digest)
        return codec, prepared, packet

    def parse(self, envelope, phase='construction', *, change_response=None, raw=None,
              confirm=None, codec_override=None, prepared_override=None, receipt_override=None):
        codec, prepared, packet = self.prepare(phase)
        if codec_override is not None:
            codec = codec_override
        if prepared_override is not None:
            prepared = prepared_override(prepared)
        value = response(envelope)
        if change_response is not None:
            change_response(value)
        if raw is None:
            raw = pc.canonical(value).encode()
        admission = pc.Admission('existing-original-ledger-ticket', prepared.fingerprint, prepared.context_sha256)
        receipt = pc.ProviderReceipt('resp_offline', self.inputs.request['execution_id'],
            prepared.context_sha256, prepared.fingerprint, payload.MODEL, 'completed', True)
        if receipt_override:
            receipt = receipt_override(receipt)
        trusted_hash = pc.digest(raw)
        fixture_origin = lambda a, r, data: a == admission and r == receipt and pc.digest(data) == trusted_hash
        return codec.parse_response(phase, self.inputs, packet, prepared, admission, receipt, raw,
                                    confirm=fixture_origin if confirm is None else confirm)

    def test_full_original_task_schema_guide_helpers_and_metadata_survive_without_repeated_brief(self):
        codec, prepared, _ = self.prepare()
        wire = json.loads(prepared.payload)
        document = json.loads(wire['input'][0]['content'][0]['text'])
        self.assertEqual(document['request'], self.inputs.request)
        self.assertEqual(document['modeling_contract_task_fields_from_request'], ['prompt', 'instructions'])
        reconstructed = {**document['modeling_contract'],
                         **{k: document['request'][k] for k in ('prompt', 'instructions')}}
        self.assertEqual(reconstructed, self.contract)
        self.assertEqual(document['modeling_contract']['scene_schema'], self.contract['scene_schema'])
        self.assertEqual(len(document['modeling_contract']['scene_schema']['properties']['parts']['items']['anyOf']), 18)
        self.assertIsNone(document['current_model'])
        self.assertNotIn('prompt', document['modeling_contract'])
        self.assertNotIn('instructions', document['modeling_contract'])
        self.contract['scene_schema']['properties']['parts'].clear()
        self.assertNotEqual(codec.context.contract['scene_schema'], self.contract['scene_schema'])

    def test_ordered_reference_metadata_and_exact_original_bytes_are_actual_image_blocks(self):
        _, prepared, _ = self.prepare()
        content = json.loads(prepared.payload)['input'][0]['content']
        self.assertEqual(len(content), 1 + 2 * len(self.inputs.references))
        for index, reference in enumerate(self.inputs.references):
            label, image = content[1 + index * 2: 3 + index * 2]
            label = json.loads(label['text'])
            self.assertEqual(label['index'], index)
            self.assertEqual(label['metadata'], json.loads(reference.metadata_json))
            self.assertEqual(label['sha256'], pc.digest(reference.data))
            self.assertEqual(image['type'], 'input_image')
            self.assertEqual(base64.b64decode(image['image_url'].split(',', 1)[1]), reference.data)

    def test_review_has_all_full_current_sections_and_every_labeled_actual_image(self):
        codec, prepared, packet = self.prepare('inspection')
        content = json.loads(prepared.payload)['input'][0]['content']
        document = json.loads(content[0]['text'])
        self.assertEqual(document['current_model'], self.state)
        images = [b for b in content if b['type'] == 'input_image']
        self.assertEqual(len(images), len(self.inputs.references) + len(packet.renders))
        labels = [json.loads(b['text']) for b in content[1:] if b['type'] == 'input_text']
        renders = [b for b in labels if b['kind'] == 'current_render']
        self.assertEqual([r['view'] for r in renders], [r.view for r in packet.renders])
        self.assertEqual([r['revision'] for r in renders], [1] * 5)
        for image in images[len(self.inputs.references):]:
            self.assertEqual(base64.b64decode(image['image_url'].split(',', 1)[1]), PNG)
        self.state['edits'] = 'mutated outside'
        self.assertNotEqual(codec.context.state['edits'], self.state['edits'])

    def test_all_phases_use_fixed_model_and_outputs_without_history_tools_or_truncation(self):
        for phase, tokens in [('construction', 8192), ('inspection', 3072), ('reassessment', 1536)]:
            with self.subTest(phase=phase):
                _, prepared, _ = self.prepare(phase)
                wire = json.loads(prepared.payload)
                self.assertEqual(wire['model'], 'gpt-6-astra')
                self.assertEqual(wire['max_output_tokens'], tokens)
                self.assertEqual(wire['reasoning'], {'effort': 'low'})
                self.assertEqual(wire['service_tier'], 'default')
                self.assertIs(wire['store'], False)
                self.assertIs(wire['stream'], True)
                self.assertEqual(wire['tools'], [])
                self.assertEqual(wire['truncation'], 'disabled')
                self.assertFalse({'conversation', 'previous_response_id', 'prompt'} & set(wire))
                schema = wire['text']['format']
                self.assertEqual(schema['type'], 'json_schema')
                self.assertIs(schema['strict'], True)
                self.assertIs(schema['schema']['additionalProperties'], False)

    def test_mismatched_or_incomplete_contract_and_original_reference_order_are_refused(self):
        mutations = [lambda c: c.pop('scene_schema'), lambda c: c.update(prompt='other'),
            lambda c: c.update(instructions='shortened'), lambda c: c.update(edit_helpers=''),
            lambda c: c.update(revision=True), lambda c: c['references'].reverse()]
        for mutate in mutations:
            with self.subTest(mutate=mutate):
                value = deepcopy(self.contract); mutate(value)
                with self.assertRaises(pc.Refused):
                    self.prepare(contract_value=value)

    def test_stale_partial_or_unbound_review_state_is_refused_before_request_creation(self):
        for update in ({'revision': 2}, {'revision': True}, {'model_sha256': 'b' * 64},
                {'scene': None}, {'edits': None}, {'report': None}, {'report': {'different': True}},
                {'completion_contract': None}, {'inspected_views': ['front']},
                {'inspected_views': list(payload.VIEWS) + ['front']}):
            with self.subTest(update=update):
                with self.assertRaises(pc.Refused):
                    self.prepare('inspection', state={**self.state, **update})
        for renders in (self.packet.renders[:-1], self.packet.renders + (self.packet.renders[0],),
                        (pc.Render('front', b'not a PNG'),) + self.packet.renders[1:]):
            with self.subTest(renders=renders):
                with self.assertRaises(pc.Refused):
                    self.prepare('inspection', packet=replace(self.packet, renders=renders))

    def test_context_digest_and_frozen_full_wire_bytes_are_bound(self):
        codec, prepared, packet = self.prepare()
        with self.assertRaises(pc.Refused):
            codec.prepare('construction', self.inputs, packet, '0' * 64)
        with self.assertRaisesRegex(pc.Refused, 'admitted_complete_payload'):
            self.parse({'scene_json': pc.canonical(scene())},
                       prepared_override=lambda value: replace(value, payload=value.payload + b' '))

    def test_no_input_or_output_is_silently_clipped(self):
        with patch.object(payload, 'MAX_PAYLOAD_BYTES', 1000):
            with self.assertRaises(pc.Refused):
                self.prepare()
        with self.assertRaises(pc.Refused):
            self.parse({'scene_json': pc.canonical({**scene(), 'name': 'x' * payload.MAX_SCENE_BYTES})})
        with self.assertRaises(pc.Refused):
            self.parse({'scene_json': pc.canonical(scene())}, raw=b' ' * (payload.MAX_RESPONSE_BYTES + 1))

    def test_scene_is_typed_and_original_json_is_left_for_the_unchanged_validator(self):
        original = json.dumps(scene(), ensure_ascii=False, indent=2)
        result = self.parse({'scene_json': original})
        self.assertEqual(result, pc.ScenePlan(original))
        # This module does not weaken, reimplement, or claim to have run the
        # unchanged scene validator. Even this inert empty-parts fixture is only
        # typed transport and will still require the existing host validation.
        self.assertEqual(json.loads(result.scene_json), scene())

    def test_authentication_precedes_any_response_json_parsing(self):
        def reject(*_):
            return False
        with self.assertRaisesRegex(pc.Refused, 'authenticated_provider_completion'):
            self.parse({'scene_json': pc.canonical(scene())}, raw=b'not JSON', confirm=reject)
        # A truthy non-boolean marker is not authenticated completion.
        with self.assertRaisesRegex(pc.Refused, 'authenticated_provider_completion'):
            self.parse({'scene_json': pc.canonical(scene())}, confirm=lambda *_: 1)

    def test_well_shaped_forged_completion_or_mutated_raw_bytes_do_not_parse(self):
        trusted = pc.digest(pc.canonical(response({'scene_json': pc.canonical(scene())})).encode())
        with self.assertRaisesRegex(pc.Refused, 'authenticated_provider_completion'):
            self.parse({'scene_json': pc.canonical({**scene(), 'name': 'injected'})},
                       confirm=lambda a, r, raw: pc.digest(raw) == trusted)
        for update in ({'model': 'other'}, {'status': 'incomplete'}, {'usage_known': False},
                       {'response_id': 'forged'}, {'execution_id': 'other'}, {'payload_sha256': 'b' * 64},
                       {'context_sha256': 'c' * 64}):
            with self.subTest(update=update):
                with self.assertRaises(pc.Refused):
                    self.parse({'scene_json': pc.canonical(scene())}, receipt_override=lambda r: replace(r, **update))

    def test_response_status_origin_and_usage_must_be_complete(self):
        updates = [{'status': 'incomplete'}, {'status': 'failed'}, {'id': 'resp_other'}, {'model': 'other'},
            {'error': {'message': 'failed'}}, {'incomplete_details': {'reason': 'max_output_tokens'}},
            {'usage': None}, {'usage': {'input_tokens': True, 'output_tokens': 1, 'total_tokens': 2}},
            {'usage': {'input_tokens': 1, 'output_tokens': 1, 'total_tokens': 1}},
            {'usage': {'input_tokens': 1, 'output_tokens': 1, 'total_tokens': 2,
                       'output_tokens_details': {'reasoning_tokens': 2}}}]
        for update in updates:
            with self.subTest(update=update):
                with self.assertRaises(pc.Refused):
                    self.parse({'scene_json': pc.canonical(scene())}, change_response=lambda r: r.update(update))

    def test_refusal_and_every_unexpected_output_are_rejected(self):
        mutations = [lambda r: r.update(output=[]),
            lambda r: r['output'].append({'type': 'function_call', 'name': 'build_model', 'arguments': '{}'}),
            lambda r: r['output'].append(deepcopy(r['output'][-1])),
            lambda r: r['output'][-1].update(role='user'),
            lambda r: r['output'][-1].update(status='in_progress'),
            lambda r: r['output'][-1].update(content=[{'type': 'refusal', 'refusal': 'Cannot fulfill.'}]),
            lambda r: r['output'][-1]['content'].append({'type': 'output_text', 'text': '{}'}),
            lambda r: r['output'][-1]['content'][0].update(type='output_audio'),
            lambda r: r['output'][0].update(type='computer_call')]
        for mutate in mutations:
            with self.subTest(mutate=mutate):
                with self.assertRaises(pc.Refused):
                    self.parse({'scene_json': pc.canonical(scene())}, change_response=mutate)

    def test_outer_envelope_and_inner_scene_reject_duplicate_keys_nonfinite_and_incomplete_json(self):
        invalid = ['{"parts":[],"parts":[1]}', '{"parts":[NaN]}', '{"parts":[Infinity]}',
                   '{"parts":[1e999]}', '{"parts":', '[]', 'null', '"not a scene"']
        for raw_scene in invalid:
            with self.subTest(raw_scene=raw_scene):
                with self.assertRaises(pc.Refused):
                    self.parse({'scene_json': raw_scene})
        for invalid_text in ('{"scene_json":"{}","scene_json":"{}"}', '{"scene_json":NaN}', '{'):
            with self.subTest(invalid_text=invalid_text):
                with self.assertRaises(pc.Refused):
                    self.parse({}, change_response=lambda r: r['output'][-1]['content'][0].update(text=invalid_text))
        valid = pc.canonical(response({'scene_json': pc.canonical(scene())})).encode()
        for raw in (b'{"status":"completed",' + valid[1:], b'{"n":NaN}', b'\xff', valid[:-2]):
            with self.subTest(raw=raw[:80]):
                with self.assertRaises(pc.Refused):
                    self.parse({}, raw=raw)

    def test_unsupported_scene_stops_honestly_without_creating_a_fallback_model(self):
        with self.assertRaisesRegex(pc.Refused, 'complete_scene_not_supported'):
            self.parse({'scene_json': ''})
        for envelope in ({'scene_json': {}}, {'scene_json': '{}', 'accepted': True}, {'code': 'build_model(...)'}):
            with self.subTest(envelope=envelope):
                with self.assertRaises(pc.Refused):
                    self.parse(envelope)

    def test_assessment_identity_is_bound_to_host_packet_not_model_generated_hashes(self):
        envelope = {'accepted': True, 'issues': [], 'summary': 'Scripted transport test only.', 'correction': None}
        value = self.parse(envelope, 'inspection')
        self.assertEqual(value.revision, self.packet.candidate.revision)
        self.assertEqual(value.model_sha256, self.packet.candidate.model_sha256)
        self.assertEqual(value.renders_sha256, self.packet.fingerprint)
        self.assertEqual(value.issues, ())
        for extra in ({'revision': 999}, {'model_sha256': 'b' * 64}, {'renders_sha256': 'c' * 64}):
            with self.assertRaises(pc.Refused):
                self.parse({**envelope, **extra}, 'inspection')

    def test_rejection_and_existing_sandbox_edit_capability_are_preserved(self):
        code = 'head = bpy.data.objects.get("actual_head")\nhead.scale.x *= 1.01'
        envelope = {'accepted': False, 'issues': ['The inspected shape lacks its reference detail.'],
            'summary': 'A specific correction is proposed; no acceptance claimed.',
            'correction': {'kind': 'edit', 'code': code}}
        value = self.parse(envelope, 'inspection')
        self.assertIs(value.accepted, False)
        self.assertEqual(value.correction, pc.EditPlan(code))
        envelope['correction'] = None
        self.assertIs(self.parse(envelope, 'reassessment').accepted, False)

    def test_invalid_or_false_acceptance_and_second_correction_are_rejected(self):
        base = {'accepted': False, 'issues': ['Specific unresolved problem.'], 'summary': 'Needs revision.', 'correction': None}
        for update in ({'accepted': 1}, {'accepted': True}, {'issues': []}, {'issues': ['']},
                       {'issues': ['x' * 401]}, {'issues': ['problem'] * 13}, {'summary': ''},
                       {'summary': 'x' * 1201}, {'correction': {'kind': 'edit', 'code': ''}},
                       {'correction': {'kind': 'edit', 'code': 'x' * 20001}},
                       {'correction': {'kind': 'shell', 'code': 'anything'}},
                       {'correction': {'kind': 'edit', 'code': 'anything', 'skip_sandbox': True}}):
            with self.subTest(update=update):
                with self.assertRaises(pc.Refused):
                    self.parse({**base, **update}, 'inspection')
        with self.assertRaisesRegex(pc.Refused, 'sandboxed_edit'):
            self.parse({**base, 'correction': {'kind': 'edit', 'code': 'obj.scale.x = 1'}}, 'reassessment')


if __name__ == '__main__':
    unittest.main()
