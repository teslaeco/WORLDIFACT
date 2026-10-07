"""UNWIRED prospective controller: no provider client, service or ledger writes.

The injected policy is a TRUSTED HOST interface, never model-authored data. Its
check() preserves the original cancellation, deadline and build/request limits;
admit() atomically protects later capacity and reserves through the ORIGINAL
ledger; confirm() checks authenticated completed provider evidence. These calls
must not reset counters, reinterpret held liability as billed cost, or retry an
uncertain request. Blocking callbacks retain the original cancellable deadlines.

Eventual wiring points (not implemented here): codex_runner.run's explicit new
STANDARD route, the existing spend.protect/settle_completed admission lock, and
blender_mcp.JobTools with its unchanged validators/current_candidate/
completed_outcome readers. Existing routes and historical jobs remain untouched.
Callbacks produce typed scene data/verdicts, not executable Code Mode programs.
Optional typed edits still use the EXISTING edit_model/prepare_code sandbox.
The phases are construction, inspection and optional reassessment; finish is a
host operation, not a paid phase. construction_policy.monetary_admission's older
Code Mode phase graph is NOT a ready-made reservation adapter for this graph.
prepare() is pure; admission receives its immutable FINAL wire bytes, full
inputs and render packet, verifies their correspondence, counts those bytes and
reserves under the existing ledger lock. Send callbacks send these bytes
UNCHANGED, including bounded output/reasoning/tier fields. confirm() binds the
actual authenticated stream to that admitted payload; a contextual hash alone
is insufficient. No old direct-provider helper or independent ledger is safe.
Scripted tests establish orchestration only, never real model visual quality.
"""
from __future__ import annotations

from dataclasses import dataclass
import base64
import hashlib
import json
import re
import struct
from typing import Protocol

from construction_policy import enabled


class Refused(RuntimeError):
    pass


class RejectedForServer(Refused):
    """Do not feed a finished rejected draft to legacy worker success handling."""
    code = 'WORLDIFACT_CONSTRUCTION_REJECTED'


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True,
                      separators=(',', ':'), allow_nan=False)


def digest(value):
    return hashlib.sha256(value).hexdigest()


def sha(value):
    return isinstance(value, str) and re.fullmatch('[0-9a-f]{64}', value) is not None


@dataclass(frozen=True)
class Reference:
    """Full original metadata and bytes; tuple position is the original order."""
    metadata_json: str
    mime_type: str
    data: bytes


@dataclass(frozen=True)
class Inputs:
    request_json: str
    references: tuple = ()

    @classmethod
    def freeze(cls, request, references=()):
        # Round-trip copies preserve ALL fields, including unknown metadata.
        value = cls(canonical(request), tuple(references))
        request = value.request
        if (not enabled(request) or not isinstance(request.get('prompt'), str)
                or not isinstance(request.get('execution_id'), str) or not request['execution_id']):
            raise Refused('explicit_new_standard_inputs_required')
        for ref in value.references:
            if (not isinstance(ref, Reference) or not isinstance(json.loads(ref.metadata_json), dict)
                    or ref.mime_type not in ('image/png', 'image/jpeg')
                    or type(ref.data) is not bytes or not ref.data):
                raise Refused('invalid_original_reference')
        return value

    @property
    def request(self):
        return json.loads(self.request_json)

    @property
    def fingerprint(self):
        return digest(canonical({'request': self.request, 'references': [
            {'metadata': json.loads(r.metadata_json), 'mime': r.mime_type, 'sha256': digest(r.data)}
            for r in self.references]}).encode())


@dataclass(frozen=True)
class ScenePlan:
    scene_json: str


@dataclass(frozen=True)
class EditPlan:
    """Only for an existing candidate; existing edit_model validates this code."""
    code: str


@dataclass(frozen=True)
class Candidate:
    execution_id: str
    revision: int
    model_sha256: str
    report_json: str


@dataclass(frozen=True)
class Render:
    view: str
    data: bytes


@dataclass(frozen=True)
class RenderPacket:
    candidate: Candidate
    renders: tuple

    @property
    def fingerprint(self):
        return digest(canonical({'revision': self.candidate.revision,
            'model': self.candidate.model_sha256, 'report': self.candidate.report_json,
            'images': [(r.view, digest(r.data)) for r in self.renders]}).encode())


@dataclass(frozen=True)
class Assessment:
    revision: int
    model_sha256: str
    renders_sha256: str
    accepted: bool
    issues: tuple
    summary: str
    correction: ScenePlan | EditPlan | None = None


@dataclass(frozen=True)
class ProviderReceipt:
    """Gateway evidence; confirm() MUST verify its origin, not trust its fields."""
    response_id: str
    execution_id: str
    context_sha256: str
    payload_sha256: str
    model: str
    status: str
    usage_known: bool


@dataclass(frozen=True)
class Reply:
    value: object
    receipt: ProviderReceipt


@dataclass(frozen=True)
class PreparedRequest:
    payload: bytes
    context_sha256: str

    @property
    def fingerprint(self):
        return digest(self.payload)


@dataclass(frozen=True)
class Admission:
    """Trusted original-ledger reservation binding; not a model assertion."""
    reservation_id: str
    payload_sha256: str
    context_sha256: str


@dataclass(frozen=True)
class Result:
    status: str                 # accepted or rejected; rejected is NOT success.
    candidate: Candidate
    assessment: Assessment
    outcome_json: str

    def as_server_outcome(self):
        """The ONLY return adapter for the legacy any-return-is-success worker.

        A rejected draft remains privately saved by finish_model but raises a
        classified non-success here. No refund, settlement or history rewrite.
        """
        if self.status != 'accepted' or self.assessment.accepted is not True:
            raise RejectedForServer(self.assessment.summary)
        outcome = json.loads(self.outcome_json)
        if (outcome.get('finished') is not True or outcome.get('accepted') is not True
                or outcome.get('execution_id') != self.candidate.execution_id
                or type(outcome.get('revision')) is not int or outcome['revision'] != self.candidate.revision
                or outcome.get('model_sha256') != self.candidate.model_sha256):
            raise Refused('verified_accepted_server_outcome_required')
        return outcome


class TrustedPolicy(Protocol):
    def check(self, action, inputs, candidate): ...
    def admit(self, phase, inputs, packet, prepared, remaining_phases): ...
    def confirm(self, admission, receipt): ...
    def admit_correction(self, inputs, packet, remaining_phases): ...


class JobToolsAdapter:
    """Call existing JobTools, preserving its argument checks and tool records.

    Inject unchanged parse_scene, completion_policy.required_views,
    current_candidate, completed_outcome, check_tool_arguments and TOOLS.
    verify_inputs must compare the original job request AND ordered reference
    metadata/bytes with Inputs; it cannot merely trust a model's claimed hashes.
    No core module is imported or monkeypatched by this adapter.
    """
    def __init__(self, job, *, parse_scene, required_views, current_candidate,
                 completed_outcome, check_arguments, tools, verify_inputs):
        self.job = job
        self.parse_scene = parse_scene
        self.required_views = required_views
        self.read_candidate = current_candidate
        self.read_outcome = completed_outcome
        self.check_arguments = check_arguments
        self.tools = {t['name']: t['inputSchema'] for t in tools}
        self.verify_inputs = verify_inputs

    def start(self, inputs):
        self.binding(inputs)
        if (self.job.revision != 0 or self.job.attempts != 0
                or self.job.current is not None or self.job.finished):
            raise Refused('fresh_verified_execution_required')

    def binding(self, inputs):
        if (self.verify_inputs(inputs, self.job) is not True
                or canonical(self.job.request) != inputs.request_json
                or self.job.execution_id != inputs.request['execution_id']):
            raise Refused('fresh_verified_execution_required')

    def call(self, name, arguments):
        # Mirrors serve(): preflight errors also receive failed tool evidence.
        try:
            self.check_arguments(arguments, self.tools[name])
            self.job.record(name, 'started')
            result = self.job.call(name, arguments)
            self.job.record(name, 'completed')
            return result
        except Exception as error:
            self.job.record(name, 'failed', error)
            raise

    def current(self):
        value = self.read_candidate(self.job.folder, self.job.execution_id)
        if not isinstance(value, dict):
            raise Refused('verified_current_candidate_required')
        info, identity = value.get('info', {}), value.get('identity')
        revision = info.get('revision')
        if (type(revision) is not int or revision < 1 or revision != self.job.revision
                or info.get('execution_id') != self.job.execution_id
                or value.get('path') != self.job.current
                or not isinstance(identity, tuple) or len(identity) != 2
                or type(identity[0]) is not int or identity[0] < 20 or not sha(identity[1])
                or not isinstance(value.get('result'), dict)):
            raise Refused('candidate_identity_mismatch')
        return Candidate(self.job.execution_id, revision, identity[1], canonical(value['result']))

    def validate(self, plan, inputs):
        if not isinstance(plan, ScenePlan) or not isinstance(plan.scene_json, str):
            raise Refused('typed_complete_scene_required')
        scene = self.parse_scene(plan.scene_json, inputs.request['prompt'])
        if not isinstance(scene, dict):
            raise Refused('valid_complete_scene_required')
        return scene

    def finish(self, candidate, verdict):
        if self.current() != candidate:
            raise Refused('candidate_changed_before_finish')
        self.call('finish_model', {'expected_revision': candidate.revision,
            'accepted': verdict.accepted, 'issues': list(verdict.issues), 'summary': verdict.summary})
        outcome = self.read_outcome(self.job.folder)
        if (not isinstance(outcome, dict) or outcome.get('finished') is not True
                or outcome.get('accepted') is not verdict.accepted
                or outcome.get('execution_id') != candidate.execution_id
                or type(outcome.get('revision')) is not int or outcome['revision'] != candidate.revision
                or outcome.get('model_sha256') != candidate.model_sha256):
            raise Refused('verified_terminal_outcome_required')
        return outcome


class Controller:
    """One complete plan, actual inspection, optionally one correction. No retry."""
    def __init__(self, inputs, adapter, policy, plan, assess, prepare):
        # Revalidate even when a caller constructed Inputs directly.
        self.inputs = Inputs.freeze(inputs.request, inputs.references)
        self.adapter, self.policy, self.plan, self.assess = adapter, policy, plan, assess
        self.prepare = prepare
        self.started = False
        self.responses = set()

    def guard(self, action, candidate=None):
        self.adapter.binding(self.inputs)
        if self.policy.check(action, self.inputs, candidate) is not True:
            raise Refused('original_limits_or_cancellation_refused:' + action)

    def provider(self, phase, packet=None, remaining=()):
        candidate = packet.candidate if packet else None
        self.guard('before_' + phase, candidate)
        context = digest(canonical({'inputs': self.inputs.fingerprint, 'phase': phase,
            'renders': packet.fingerprint if packet else None}).encode())
        prepared = self.prepare(phase, self.inputs, packet, context)
        if (not isinstance(prepared, PreparedRequest) or prepared.context_sha256 != context
                or type(prepared.payload) is not bytes or not 0 < len(prepared.payload) <= 32 * 1024**2):
            raise Refused('immutable_final_request_required')
        try:
            def unique(pairs):
                value = {}
                for key, item in pairs:
                    if key in value:
                        raise ValueError('Duplicate payload key')
                    value[key] = item
                return value
            payload = json.loads(prepared.payload.decode('utf-8'), object_pairs_hook=unique)
            if (not isinstance(payload, dict) or payload.get('model') != 'gpt-6-astra'
                    or payload.get('store') is not False or payload.get('service_tier') != 'default'
                    or not isinstance(payload.get('reasoning'), dict)
                    or payload['reasoning'].get('effort') != 'low'
                    or type(payload.get('max_output_tokens')) is not int
                    or not 256 <= payload['max_output_tokens'] <= 16000
                    or any(payload.get(k) is not None for k in ('previous_response_id', 'conversation', 'prompt'))
                    or payload.get('background') or 'input' not in payload):
                raise ValueError()
            canonical(payload)  # Refuse nonfinite values anywhere in the bytes.
        except (UnicodeError, ValueError, TypeError):
            raise Refused('final_payload_policy_invalid') from None
        self.guard('before_admission', candidate)
        admission = self.policy.admit(phase, self.inputs, packet, prepared, remaining)
        if (not isinstance(admission, Admission) or not admission.reservation_id
                or admission.payload_sha256 != prepared.fingerprint or admission.context_sha256 != context):
            raise Refused('required_capacity_not_admitted:' + phase)
        self.guard('before_send', candidate)
        reply = (self.assess(self.inputs, packet, prepared, admission) if packet else
                 self.plan(self.inputs, prepared, admission))
        self.guard('after_' + phase, candidate)
        receipt = reply.receipt if isinstance(reply, Reply) else None
        if (not isinstance(receipt, ProviderReceipt) or receipt.status != 'completed'
                or receipt.model != 'gpt-6-astra' or receipt.usage_known is not True
                or receipt.execution_id != self.inputs.request['execution_id']
                or receipt.context_sha256 != context
                or receipt.payload_sha256 != prepared.fingerprint
                or not isinstance(receipt.response_id, str)
                or re.fullmatch('resp_[A-Za-z0-9_-]{1,190}', receipt.response_id) is None
                or receipt.response_id in self.responses
                or self.policy.confirm(admission, receipt) is not True):
            raise Refused('provider_completion_not_verified')
        self.responses.add(receipt.response_id)
        return reply.value

    def build_and_inspect(self, plan, previous=None, previous_views=None):
        self.guard('before_build', previous)
        if previous is not None and self.adapter.current() != previous:
            raise Refused('candidate_changed_before_correction')
        if isinstance(plan, EditPlan):
            if (previous is None or not isinstance(plan.code, str) or not plan.code.strip()
                    or len(plan.code) > 20000):
                raise Refused('bounded_existing_candidate_edit_required')
            # edit_model rebuilds the same base scene with accumulated,
            # prepare_code-validated edits; its subject/view contract persists.
            views = previous_views
            name, arguments = 'edit_model', {'code': plan.code}
        else:
            scene = self.adapter.validate(plan, self.inputs)
            views = self.adapter.required_views(self.inputs.request, scene)
            name, arguments = 'build_model', {'scene_json': canonical(scene)}
        supported = ('front', 'side', 'back', 'face', 'three-quarter')
        if (not isinstance(views, (set, frozenset)) or not {'front', 'side', 'back'} <= views
                or not views <= set(supported)):
            raise Refused('complete_required_views_missing')
        expected = previous.revision if previous else 0
        self.adapter.call(name, {**arguments, 'expected_revision': expected})
        self.guard('after_build', previous)
        candidate = self.adapter.current()
        if candidate.revision != expected + 1:
            raise Refused('build_did_not_advance_current_revision')
        renders = []
        for view in supported:
            if view not in views:
                continue
            self.guard('before_render', candidate)
            if self.adapter.current() != candidate:
                raise Refused('candidate_changed_during_inspection')
            blocks = self.adapter.call('inspect_render', {'view': view, 'expected_revision': candidate.revision})
            if not isinstance(blocks, list):
                raise Refused('actual_render_bytes_required')
            images = [b for b in blocks if isinstance(b, dict) and b.get('type') == 'image']
            if len(images) != 1 or images[0].get('mimeType') != 'image/png':
                raise Refused('actual_render_bytes_required')
            try:
                if not isinstance(images[0].get('data'), str) or len(images[0]['data']) > 4 * 1024**2:
                    raise ValueError()
                data = base64.b64decode(images[0]['data'], validate=True)
                if not 45 <= len(data) <= 2 * 1024**2 or data[:16] != b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR':
                    raise ValueError()
                width, height = struct.unpack('>II', data[16:24])
                if not 0 < width * height <= 16777216 or data[-8:] != b'IEND\xaeB`\x82':
                    raise ValueError()
            except (KeyError, ValueError, TypeError, struct.error):
                raise Refused('actual_render_bytes_required') from None
            renders.append(Render(view, data))
            self.guard('after_render', candidate)
        if self.adapter.current() != candidate:
            raise Refused('candidate_changed_during_inspection')
        return RenderPacket(candidate, tuple(renders))

    def verdict(self, value, packet):
        if (not isinstance(value, Assessment) or type(value.revision) is not int
                or value.revision != packet.candidate.revision
                or value.model_sha256 != packet.candidate.model_sha256
                or value.renders_sha256 != packet.fingerprint or type(value.accepted) is not bool
                or type(value.issues) is not tuple or len(value.issues) > 12
                or any(not isinstance(v, str) or not v.strip() or len(v) > 400 for v in value.issues)
                or not isinstance(value.summary, str) or not value.summary.strip() or len(value.summary) > 1200
                or (value.accepted and (value.issues or value.correction is not None))
                or (not value.accepted and not value.issues)
                or (value.correction is not None and not isinstance(value.correction, (ScenePlan, EditPlan)))):
            raise Refused('honest_current_render_assessment_required')
        if self.adapter.current() != packet.candidate:
            raise Refused('candidate_changed_during_assessment')
        return value

    def run(self):
        if self.started:
            raise Refused('controller_is_single_use_no_retry')
        self.started = True
        self.guard('start')
        self.adapter.start(self.inputs)
        # Only the mandatory first inspection is protected up front. An
        # optional correction must separately fund its complete reassessment
        # and export deadline before another build can begin.
        plan = self.provider('construction', remaining=('inspection',))
        packet = self.build_and_inspect(plan)
        verdict = self.verdict(self.provider('inspection', packet), packet)
        if verdict.correction is not None:
            self.guard('before_correction', packet.candidate)
            if self.policy.admit_correction(self.inputs, packet, ('reassessment',)) is not True:
                raise Refused('correction_and_reassessment_not_funded')
            packet = self.build_and_inspect(verdict.correction, packet.candidate,
                                            {r.view for r in packet.renders})
            verdict = self.verdict(self.provider('reassessment', packet), packet)
            if verdict.correction is not None:
                raise Refused('one_correction_limit')
        self.guard('before_finish', packet.candidate)
        outcome = self.adapter.finish(packet.candidate, verdict)
        self.guard('after_finish', packet.candidate)
        return Result('accepted' if verdict.accepted else 'rejected', packet.candidate,
                      verdict, canonical(outcome))
