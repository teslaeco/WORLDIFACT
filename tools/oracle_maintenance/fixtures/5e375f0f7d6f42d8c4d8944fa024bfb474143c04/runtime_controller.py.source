"""STANDARD host adapter, awaiting integrated runtime/installer verification.

The existing Gateway remains the sole authenticated provider and spend boundary.
Permits below are not a second reservation: its original Handler atomically
reserves once, immediately before forwarding the exact reviewed request.
"""
import hashlib
import json
import os
from pathlib import Path
import secrets
import time
import urllib.request

from phased_controller import (Admission, Controller, Inputs, JobToolsAdapter,
    ProviderReceipt, Reference, Refused, Reply, canonical)
from construction_policy import MODE, STANDARD

REVISION = MODE
OUTPUTS = {'construction': 8192, 'inspection': 3072, 'reassessment': 1536}
INPUTS = {'construction': 65536, 'inspection': 32768, 'reassessment': 32768}
BUILD_SECONDS = 420
ASSESS_SECONDS = 300
EXPORT_SECONDS = 300
RENDER_SECONDS = 30
MAX_STREAM_BYTES = 8 * 1024**2


def phase_cost(phase):
    return (INPUTS[phase] + 2048) * 14 + OUTPUTS[phase] * 55


def blender_callbacks(folder, cancelled, deadline, server, *, clock=time.monotonic,
                      pending_builds=lambda: 0):
    """Keep the original container lifecycle and original cancellation event."""
    def build(candidate):
        remaining = (deadline - clock() - ASSESS_SECONDS - EXPORT_SECONDS - RENDER_SECONDS
                     - pending_builds() * BUILD_SECONDS)
        if cancelled.is_set() or remaining <= 0:
            raise Refused('construction_build_cancelled_or_expired')
        server.run_blender(folder.name, candidate, cancelled, timeout=min(BUILD_SECONDS, remaining))

    def finalize(candidate):
        remaining = deadline - clock()
        if cancelled.is_set() or remaining <= 0:
            raise Refused('construction_export_cancelled_or_expired')
        server.run_blender_finalize(folder.name, candidate, cancelled, timeout=min(EXPORT_SECONDS, remaining))
    return build, finalize


def reference_values(photos, folder):
    from construction_payload import strict_json
    path = Path(folder) / 'reference-photos.json'
    raw_entries = strict_json(path.read_bytes(), 160000) if path.exists() else []
    if (not isinstance(raw_entries, list) or len(raw_entries) != len(photos)
            or any(not isinstance(entry, dict) for entry in raw_entries)):
        raise Refused('original_reference_manifest_mismatch')
    values = []
    for photo, original in zip(photos, raw_entries):
        validated = {k: v for k, v in photo.items() if k not in ('dataUrl', 'bytes')}
        if any(key in original and original[key] != value for key, value in validated.items()):
            raise Refused('original_reference_metadata_changed')
        values.append(Reference(canonical({**original, **validated}), 'image/jpeg', photo['bytes']))
    return tuple(values)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs): return None


class RuntimePolicy:
    def __init__(self, gateway, job, inputs, spend, *, clock=time.monotonic):
        self.gateway, self.job, self.inputs, self.spend = gateway, job, inputs, spend
        self.clock = clock
        self.deadline = job.started + min(job.fast_limits['seconds'], gateway.fast_limits['seconds'])
        self.permits = {}
        self.confirmed = {}
        self.next_phase = 'construction'
        self.correction_fenced = False
        self.initial_edit_fenced = False
        self.initial_edit_until = 0

    def pending_initial_builds(self):
        return max(0, self.initial_edit_until - self.job.attempts)

    def check(self, action, inputs, candidate):
        if (inputs.fingerprint != self.inputs.fingerprint or self.gateway.cancelled.is_set()
                or (self.job.folder / 'agent-cancelled').exists()
                or self.gateway.error or self.gateway.unknown_usage
                or self.clock() >= self.deadline
                or self.job.attempts > self.job.build_limit):
            return False
        remaining = self.deadline - self.clock()
        if action == 'before_build':
            builds = max(1, self.pending_initial_builds())
            return (self.job.attempts + builds <= self.job.build_limit
                    and remaining > builds * BUILD_SECONDS + ASSESS_SECONDS + EXPORT_SECONDS + RENDER_SECONDS)
        if action == 'before_finish':
            return remaining > EXPORT_SECONDS
        return True

    def admit(self, phase, inputs, packet, prepared, remaining_phases):
        expected_future = ('inspection',) if phase == 'construction' else ()
        if (phase != self.next_phase or tuple(remaining_phases) != expected_future
                or not self.check('before_' + phase, inputs, packet.candidate if packet else None)
                or (phase == 'reassessment' and not self.correction_fenced)):
            raise Refused('invalid_construction_phase_admission')
        payload = json.loads(prepared.payload)
        if payload.get('max_output_tokens') != OUTPUTS[phase]:
            raise Refused('reviewed_output_allowance_required')
        # Construction may include one sandboxed initial edit in the SAME
        # response. Protect its second CPU build before sending that response.
        future_time = (2 * BUILD_SECONDS + ASSESS_SECONDS + EXPORT_SECONDS + RENDER_SECONDS
                       if phase == 'construction' else EXPORT_SECONDS + RENDER_SECONDS)
        expires = min(self.clock() + ASSESS_SECONDS, self.deadline - future_time)
        if expires <= self.clock():
            raise Refused('remaining_phase_time_not_funded')
        binding = canonical({'phase': phase, 'execution_id': self.job.execution_id,
            'context': prepared.context_sha256, 'payload': prepared.fingerprint,
            'remaining': list(remaining_phases), 'deadline': self.deadline})
        admission_hash = hashlib.sha256(binding.encode()).hexdigest()
        permit = self.gateway.prepare_construction(prepared.payload,
            execution_id=self.job.execution_id, phase=phase,
            context_sha256=prepared.context_sha256, admission_sha256=admission_hash,
            max_input_tokens=INPUTS[phase],
            protected_remaining_micro_usd=sum(phase_cost(p) for p in remaining_phases),
            protected_remaining_requests=len(remaining_phases), expires_at=expires)
        if (not isinstance(permit, dict) or not isinstance(permit.get('permit_id'), str)
                or permit.get('payload_sha256') != prepared.fingerprint):
            raise Refused('gateway_permit_not_bound')
        identity = permit['permit_id']
        if identity in self.permits:
            raise Refused('gateway_permit_reused')
        self.permits[identity] = {'phase': phase, 'prepared': prepared,
            'admission_sha256': admission_hash, 'expires_at': expires, 'sent': False}
        return Admission(identity, prepared.fingerprint, prepared.context_sha256)

    def confirm(self, admission, receipt, raw_response=None):
        value = self.confirmed.get(admission.reservation_id)
        if not value or receipt != value['receipt']:
            return False
        if raw_response is not None and hashlib.sha256(raw_response).hexdigest() != value['response_sha256']:
            return False
        return (admission.payload_sha256 == receipt.payload_sha256
                and admission.context_sha256 == receipt.context_sha256)

    def admit_initial_edit(self, inputs, remaining_phases):
        if (tuple(remaining_phases) != ('inspection',) or self.next_phase != 'inspection'
                or self.initial_edit_fenced or self.job.attempts != 0 or self.job.revision != 0
                or self.job.current is not None or self.job.build_limit < 2
                or not self.check('before_initial_edit', inputs, None)
                or self.gateway.active or self.gateway.unknown_usage
                or self.deadline - self.clock() <=
                    2 * BUILD_SECONDS + ASSESS_SECONDS + EXPORT_SECONDS + RENDER_SECONDS
                or self.gateway.requests + 1 > self.gateway.fast_limits['requests']
                or self.gateway.output + OUTPUTS['inspection'] > self.gateway.fast_limits['output']):
            return False
        # Recheck the construction permit's protected inspection against the
        # ORIGINAL ledger. This is a read-only fence, never another reservation,
        # settlement, request, or reinterpretation of held liability as cost.
        with self.spend.ledger(self.job.folder) as (path, state):
            cap, _ = self.spend.studio_pricing.cap_and_revision(
                self.spend.studio_pricing.terms_at(path.parent, self.job.folder.name))
            if (cap != 1750000 or self.spend.terminal_budget.sealed(path)
                    or state['requests'] + 1 > 32
                    or self.spend.used(state) + phase_cost('inspection') > cap):
                return False
        self.initial_edit_fenced = True
        self.initial_edit_until = 2
        return True

    def admit_correction(self, inputs, packet, remaining_phases):
        if (tuple(remaining_phases) != ('reassessment',) or self.next_phase != 'inspection_done'
                or self.correction_fenced or not self.check('before_build', inputs, packet.candidate)
                or self.gateway.active or self.gateway.unknown_usage):
            return False
        # No second reservation or credit release. The sole host controller
        # performs no intervening provider call, and Gateway rechecks atomically
        # before sending the reassessment after the real correction build.
        with self.spend.ledger(self.job.folder) as (path, state):
            cap, _ = self.spend.studio_pricing.cap_and_revision(
                self.spend.studio_pricing.terms_at(path.parent, self.job.folder.name))
            if (cap != 1750000 or self.spend.terminal_budget.sealed(path)
                    or state['requests'] + 1 > 32
                    or self.spend.used(state) + phase_cost('reassessment') > cap):
                return False
        self.correction_fenced = True
        self.next_phase = 'reassessment'
        return True

    def send(self, prepared, admission):
        from construction_payload import strict_json
        permit = self.permits.get(admission.reservation_id)
        if (not permit or permit['sent'] or permit['prepared'] != prepared
                or prepared.fingerprint != admission.payload_sha256
                or prepared.context_sha256 != admission.context_sha256):
            raise Refused('single_matching_provider_permit_required')
        permit['sent'] = True
        remaining = permit['expires_at'] - self.clock()
        if remaining <= 0:
            raise Refused('provider_permit_expired')
        port = self.gateway.server.server_address[1]
        request = urllib.request.Request('http://127.0.0.1:%d/v1/responses' % port,
            data=prepared.payload, headers={'Authorization': 'Bearer ' + self.gateway.token,
                'Content-Type': 'application/json',
                'X-Worldifact-Construction-Permit': admission.reservation_id}, method='POST')
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
        try:
            with opener.open(request, timeout=remaining + 5) as response:
                if response.status != 200:
                    raise Refused('construction_transport_failed')
                stream = response.read(MAX_STREAM_BYTES + 1)
            if len(stream) > MAX_STREAM_BYTES:
                raise Refused('construction_response_too_large')
            terminal = []
            for line in stream.splitlines():
                if not line.startswith(b'data:'):
                    continue
                data = line[5:].strip()
                if data == b'[DONE]':
                    continue
                event = strict_json(data, MAX_STREAM_BYTES)
                if not isinstance(event, dict):
                    raise Refused('invalid_construction_event')
                if event.get('type') in ('response.completed', 'response.incomplete', 'response.failed'):
                    terminal.append(event)
            if len(terminal) != 1 or terminal[0]['type'] != 'response.completed':
                raise Refused('single_completed_response_required')
            raw = canonical(terminal[0]['response']).encode()
        except Exception:
            # Gateway owns liability and its uncertain-stream classification.
            # This client never retries, refunds or creates a replacement job.
            raise Refused('construction_response_unconfirmed') from None
        proof = self.gateway.construction_receipt(admission.reservation_id)
        digest = hashlib.sha256(raw).hexdigest()
        if (not isinstance(proof, dict) or proof.get('response_sha256') != digest
                or proof.get('payload_sha256') != prepared.fingerprint
                or proof.get('context_sha256') != prepared.context_sha256
                or proof.get('admission_sha256') != permit['admission_sha256']
                or proof.get('execution_id') != self.job.execution_id
                or proof.get('phase') != permit['phase']
                or proof.get('model') != 'gpt-6-astra' or proof.get('status') != 'completed'
                or proof.get('usage_known') is not True):
            raise Refused('authenticated_gateway_receipt_required')
        receipt = ProviderReceipt(proof['response_id'], self.job.execution_id,
            prepared.context_sha256, prepared.fingerprint, 'gpt-6-astra', 'completed', True)
        self.confirmed[admission.reservation_id] = {'receipt': receipt, 'response_sha256': digest}
        self.next_phase = 'inspection' if permit['phase'] == 'construction' else 'inspection_done'
        return raw, receipt


def full_state(adapter, packet):
    """Read complete original sections using their existing revision/hash pages."""
    if adapter.current() != packet.candidate:
        raise Refused('candidate_changed_before_payload')
    revision = packet.candidate.revision
    state = adapter.call('get_current_model', {'expected_revision': revision})
    limits = {'scene': 256000, 'edits': 60000, 'report': 2 * 1024**2}
    for name, maximum in limits.items():
        descriptor = state.get('sections', {}).get(name, {})
        expected = descriptor.get('sha256')
        if not isinstance(expected, str) or len(expected) != 64:
            raise Refused('complete_section_descriptor_required')
        offset, parts = 0, []
        while True:
            page = adapter.call('get_current_model', {'section': name, 'offset': offset,
                'limit': 16000, 'expected_revision': revision, 'expected_sha256': expected})
            text = page.get('text')
            if (page.get('revision') != revision or page.get('sha256') != expected
                    or page.get('offset') != offset or not isinstance(text, str)):
                raise Refused('current_section_page_mismatch')
            parts.append(text)
            if sum(len(part.encode()) for part in parts) > maximum:
                raise Refused('complete_section_exceeds_original_bound')
            next_offset = page.get('next_offset')
            if next_offset is None:
                if page.get('complete') is not True:
                    raise Refused('incomplete_current_section')
                break
            if type(next_offset) is not int or next_offset != offset + len(text) or next_offset <= offset:
                raise Refused('invalid_current_section_progress')
            offset = next_offset
        raw = ''.join(parts)
        if hashlib.sha256(raw.encode()).hexdigest() != expected:
            raise Refused('complete_section_hash_mismatch')
        state[name] = raw if name == 'edits' else json.loads(raw)
    if adapter.current() != packet.candidate:
        raise Refused('candidate_changed_during_payload')
    state['model_sha256'] = packet.candidate.model_sha256
    return state


def eligible(folder, instructions):
    """Route selection only; invalid new-mode proof must never cause fallback."""
    import completion_policy
    import studio_pricing
    from fast_preview import policy as fast_policy
    if (not isinstance(instructions, str) or STANDARD not in instructions
            or completion_policy.profile({'instructions': instructions}) != 'standard'
            or fast_policy(Path(folder), standard_seconds=1800)['fast']):
        return False
    root = studio_pricing.folder_root(Path(folder))
    cap, _ = studio_pricing.cap_and_revision(studio_pricing.terms_at(root, Path(folder).name))
    return cap == 1750000


def run(folder, prompt, instructions, key, cancelled, progress, *, gateway_factory):
    """Fresh eligible jobs only. No retry, resume, historical settlement or key write."""
    import astra_spend_v2 as spend
    import blender_mcp as mcp
    import completion_policy
    import construction_health
    import photo_input
    import server
    from agent_limits import BUILD_DEADLINE
    from construction_payload import FrozenContext, PayloadCodec
    folder = Path(folder)
    if (not eligible(folder, instructions)
            or construction_health.verified_health().get('worldifactStandardConstructionPolicy') != REVISION):
        raise Refused('verified_construction_runtime_required')
    if cancelled.is_set() or (folder / 'agent-cancelled').exists():
        raise Refused('construction_cancelled_before_start')
    prior = ('agent-request.json', 'agent-completion-state.json', 'agent-candidate.json',
             'agent-outcome.json', 'candidates', 'model.glb', 'agent-construction-usage.json')
    if any((folder / name).exists() or (folder / name).is_symlink() for name in prior):
        raise Refused('fresh_construction_job_required')
    with spend.ledger(folder) as (path, state):
        if spend.terminal_budget.sealed(path) or state['requests'] or spend.used(state) or state['holds']:
            raise Refused('fresh_original_ledger_required')
    request = {'prompt': prompt, 'instructions': instructions, 'execution_id': secrets.token_hex(16),
               'completion_started': time.monotonic(), 'construction_mode': MODE}
    fd = os.open(folder / 'agent-request.json', os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as stream:
        stream.write(canonical(request)); stream.flush(); os.fsync(stream.fileno())
    original_deadline = request['completion_started'] + BUILD_DEADLINE
    # JobTools increments attempts before its build callback. During the first
    # build this leaves one pending initial edit whose CPU time stays protected.
    # The closure is called only after the policy below has been initialized.
    build, finalize = blender_callbacks(folder, cancelled, original_deadline, server,
        pending_builds=lambda: policy.pending_initial_builds())

    # The old CLI parent supervised subprocess cancellation. Direct JobTools
    # uses supported callbacks to pass the ORIGINAL cancellation event to the
    # unchanged Blender/container lifecycle instead of creating fresh events.
    job = mcp.JobTools(folder, build=build, finalize=finalize)
    photos = photo_input.read_photos(folder)
    inputs = Inputs.freeze(request, reference_values(photos, folder))

    def verify_inputs(value, current):
        persisted = completion_policy.read(folder / 'agent-request.json', 2 * 1024**2)
        actual = Inputs.freeze(persisted, reference_values(photo_input.read_photos(folder), folder))
        return actual.fingerprint == value.fingerprint and current.request == persisted

    adapter = JobToolsAdapter(job, parse_scene=mcp.parse_scene,
        required_views=completion_policy.required_views, current_candidate=mcp.current_candidate,
        completed_outcome=mcp.completed_outcome, check_arguments=mcp.check_tool_arguments,
        tools=mcp.TOOLS, verify_inputs=verify_inputs, prepare_code=mcp.prepare_code)
    adapter.start(inputs)
    contract = adapter.call('get_modeling_contract', {})
    if photos:
        contract = {**contract, 'original_photo_instructions': photo_input.PHOTO_INSTRUCTIONS}
    with gateway_factory(key, folder, cancelled, construction=True) as gateway:
        policy = RuntimePolicy(gateway, job, inputs, spend)
        codecs, usage_records = {}, []

        def prepare(phase, original, packet, context):
            state = full_state(adapter, packet) if packet else None
            codec = PayloadCodec(FrozenContext.freeze(contract, state))
            prepared = codec.prepare(phase, original, packet, context)
            codecs[prepared.fingerprint] = (codec, phase, packet)
            return prepared

        def send(original, packet, prepared, admission):
            codec, phase, bound = codecs[prepared.fingerprint]
            if bound != packet:
                raise Refused('prepared_current_view_binding_changed')
            raw, receipt = policy.send(prepared, admission)
            proof = gateway.construction_receipt(admission.reservation_id)
            usage_records.append({key: proof[key] for key in ('response_id', 'phase',
                'sequence', 'payload_sha256', 'context_sha256', 'usage')})
            mcp.write(folder / 'agent-construction-usage.json', {'revision': REVISION,
                'source': 'authenticated-completed-responses', 'is_invoice': False,
                'execution_id': job.execution_id, 'responses': usage_records})
            value = codec.parse_response(phase, original, packet, prepared, admission,
                receipt, raw, confirm=policy.confirm)
            return Reply(value, receipt)

        def plan(original, prepared, admission):
            return send(original, None, prepared, admission)

        def assess(original, packet, prepared, admission):
            return send(original, packet, prepared, admission)

        progress('Preparing the complete model plan; Blender and current-image review remain required.')
        try:
            result = Controller(inputs, adapter, policy, plan, assess, prepare).run()
            outcome = result.as_server_outcome()
            gateway.completed = True
            gateway.save()
            progress('The current model passed its completed assessment and export checks.')
            return outcome
        except Exception as error:
            code = getattr(error, 'code', 'WORLDIFACT_CONSTRUCTION_INCOMPLETE')
            gateway.stop(gateway.error_code or code,
                gateway.error or 'Construction did not produce an accepted, reviewed final model. Existing output is retained; no automatic paid retry.')
            raise
