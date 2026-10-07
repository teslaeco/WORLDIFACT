"""Prospective STANDARD admission policy; deliberately not installed or wired.

All inputs are snapshots taken by the trusted host, never model assertions.
``verified_candidate`` and ``verified_outcome`` must be results of the existing
current_candidate/completed_outcome readers, after their artifact checks. The
host must retain the original execution, deadline, counters and ledger and take
these snapshots under its admission lock. This module does no I/O, reservation,
settlement, retry, build, cancellation, artifact verification or acceptance.

The finite prebuild allowance is one discovery response followed by one initial
construction response. Successful MCP evidence is required between them. More
Code Mode reasoning, changing errors and read-only loops are not construction
progress. Injected limits may tighten or explicitly bound that allowance; they
are not claims that a particular subject can be built well within those limits.
"""
from dataclasses import dataclass
import math
import re
from typing import Mapping


MODE = 'worldifact-standard-construction-v1'
STANDARD = 'WORLDIFACT STANDARD BUILD AND COMPLETION CONTRACT:'
CEILING_MICRO_USD = 1_750_000
INPUT_RATE = 14
OUTPUT_RATE = 55
INPUT_PADDING = 2048
MAX_INPUT = 65536
MAX_OUTPUT = 16000
MAX_REQUESTS = 32
PHASES = ('discovery', 'construction', 'inspection', 'finalization')
TOOLS = {'get_modeling_contract', 'get_current_model', 'build_model',
         'edit_model', 'inspect_render', 'finish_model'}


@dataclass(frozen=True)
class Decision:
    allowed: bool
    reason: str
    action: str = 'stop'
    next_micro_usd: int = 0
    remaining_micro_usd: int = 0


@dataclass(frozen=True)
class Limits:
    discovery_requests: int = 1
    construction_requests: int = 1
    contract_reads: int = 1
    empty_model_reads: int = 1
    build_limit: int = 5

    def __post_init__(self):
        bounds = ((self.discovery_requests, 1, 4),
                  (self.construction_requests, 1, 4),
                  (self.contract_reads, 1, 4),
                  (self.empty_model_reads, 0, 4),
                  (self.build_limit, 1, 5))
        if not all(_integer(value, low, high) for value, low, high in bounds):
            raise ValueError('Construction limits must be finite reviewed integers.')


@dataclass(frozen=True)
class GatewayEvidence:
    """Original gateway counters/flags, including both cancellation sources."""
    execution_id: str
    requests: int
    output: int
    request_limit: int = 32
    output_limit: int = 96000
    fast: bool = False
    error: object = None
    error_code: object = None
    upstream_status: object = None
    unknown_usage: bool = False
    active: bool = False
    cancelled: bool = False
    cancellation_file: bool = False
    completed: bool = False


@dataclass(frozen=True)
class McpEvidence:
    """Complete execution-local MCP history, not its last-N display window.

    Tool entries use the existing record() schema. total_calls counts terminal
    entries. A missing/truncated history fails closed. No prompt or code text is
    needed to establish progress.
    """
    execution_id: str
    attempts: int
    revision: int
    calls: tuple
    total_calls: int
    failures: int
    finished: bool = False


@dataclass(frozen=True)
class RequestEvidence:
    sequence: int
    execution_id: str
    phase: str
    status: str
    usage_known: bool
    mcp_calls_before: int
    mcp_calls_after: int
    code_errors: tuple = ()


@dataclass(frozen=True)
class TokenEnvelope:
    """Input tokens before the existing 2,048-token padding, plus output bound.

    For a proposed request, input_tokens is the actual complete payload count.
    In RequiredCapacity, it is the reviewed input ceiling; output_tokens is the
    required minimum output allocation for that stage.
    """
    input_tokens: int
    output_tokens: int

    def __post_init__(self):
        if not (_integer(self.input_tokens, 0, MAX_INPUT)
                and _integer(self.output_tokens, 256, MAX_OUTPUT)):
            raise ValueError('Invalid conservative token envelope.')

    @property
    def micro_usd(self):
        # No forecast cache hits, release of holds or average token costs.
        return (self.input_tokens + INPUT_PADDING) * INPUT_RATE + self.output_tokens * OUTPUT_RATE


@dataclass(frozen=True)
class RequiredCapacity:
    """Caller-reviewed envelopes; no unmeasured quality or token estimate.

    Each envelope budgets one provider response. Multiple required inspection
    responses must each be supplied, even if their MCP image reads are batched.
    """
    construction: TokenEnvelope
    inspection: tuple
    finalization: TokenEnvelope

    def __post_init__(self):
        if (not isinstance(self.construction, TokenEnvelope)
                or self.construction.output_tokens < 2048
                or not isinstance(self.finalization, TokenEnvelope)
                or type(self.inspection) is not tuple
                or not 1 <= len(self.inspection) <= MAX_REQUESTS - 2
                or not all(isinstance(item, TokenEnvelope) for item in self.inspection)):
            raise ValueError('Explicit build, inspection and finalization capacity is required.')


@dataclass(frozen=True)
class BudgetEvidence:
    """Read from the unchanged, validated ledger under its original lock.

    liability_micro_usd MUST be original legacyHeld + all holds (or the old
    reserved amount), not the UI's measured cost, a balance, or a new ledger.
    known_usage comes from the original gateway. Price validity comes from the
    existing reviewed price policy. Neither value is inferred by this module.
    """
    execution_id: str
    liability_micro_usd: int
    requests: int
    known_usage: bool
    price_valid: bool


def _integer(value, low, high):
    return type(value) is int and low <= value <= high


def _finite(value, minimum=0):
    try:
        return type(value) in (int, float) and math.isfinite(value) and value >= minimum
    except OverflowError:
        return False


def enabled(request):
    return (isinstance(request, Mapping) and request.get('construction_mode') == MODE
            and isinstance(request.get('instructions'), str)
            and STANDARD in request['instructions'])


def _scope(request, gateway):
    if not enabled(request):
        return Decision(False, 'outside_explicit_standard_mode', 'legacy')
    execution_id = request.get('execution_id')
    if (not isinstance(execution_id, str) or not execution_id
            or not isinstance(gateway, GatewayEvidence) or gateway.execution_id != execution_id):
        return Decision(False, 'execution_identity_mismatch')
    bools = (gateway.fast, gateway.unknown_usage, gateway.active, gateway.cancelled,
             gateway.cancellation_file, gateway.completed)
    if (not all(type(value) is bool for value in bools)
            or not _integer(gateway.request_limit, 1, MAX_REQUESTS)
            or not _integer(gateway.output_limit, 1, 96000)
            or not _integer(gateway.requests, 0, gateway.request_limit)
            or not _integer(gateway.output, 0, gateway.output_limit)):
        return Decision(False, 'invalid_gateway_evidence')
    if gateway.fast:
        return Decision(False, 'fast_mode_excluded')
    if gateway.cancelled or gateway.cancellation_file:
        return Decision(False, 'cancelled')
    if gateway.error or gateway.error_code or gateway.upstream_status is not None:
        return Decision(False, 'provider_or_execution_failure')
    if gateway.unknown_usage:
        return Decision(False, 'unknown_usage')
    if gateway.completed:
        return Decision(False, 'already_finished')
    if gateway.active:
        return Decision(False, 'provider_request_in_flight', 'wait')
    if gateway.requests >= gateway.request_limit or gateway.output >= gateway.output_limit:
        return Decision(False, 'original_limits_exhausted')
    return None


def _mcp_check(evidence, execution_id, limits):
    if (not isinstance(evidence, McpEvidence) or evidence.execution_id != execution_id
            or not _integer(evidence.attempts, 0, limits.build_limit)
            or not _integer(evidence.revision, 0, evidence.attempts)
            or type(evidence.calls) is not tuple or len(evidence.calls) > 1024
            or not _integer(evidence.total_calls, 0, 512)
            or not _integer(evidence.failures, 0, evidence.total_calls)
            or type(evidence.finished) is not bool):
        return Decision(False, 'invalid_mcp_evidence')
    active = None
    terminal = failures = 0
    prior_revision = prior_attempts = 0
    for call in evidence.calls:
        if not isinstance(call, Mapping):
            return Decision(False, 'invalid_mcp_history')
        name, status = call.get('tool'), call.get('status')
        revision, attempts = call.get('revision'), call.get('build_attempts')
        if (not isinstance(name, str) or name not in TOOLS or status not in ('started', 'completed', 'failed')
                or not _integer(revision, prior_revision, evidence.revision)
                or not _integer(attempts, max(prior_attempts, revision), evidence.attempts)):
            return Decision(False, 'invalid_mcp_history')
        prior_revision, prior_attempts = revision, attempts
        if status == 'started':
            if active is not None:
                return Decision(False, 'overlapping_mcp_calls')
            active = name
        else:
            # Schema/preflight errors can occur before record('started').
            if active != name and not (active is None and status == 'failed'):
                return Decision(False, 'incomplete_mcp_history')
            active = None
            terminal += 1
            failures += status == 'failed'
    if terminal != evidence.total_calls or failures != evidence.failures:
        return Decision(False, 'incomplete_mcp_history')
    if active:
        return Decision(False, 'build_in_flight' if active in ('build_model', 'edit_model')
                        else 'mcp_call_in_flight', 'wait')
    if evidence.calls and (prior_revision != evidence.revision or prior_attempts != evidence.attempts):
        return Decision(False, 'mcp_counter_mismatch')
    if not evidence.calls and (evidence.revision or evidence.attempts):
        return Decision(False, 'missing_mcp_history')
    if evidence.finished:
        return Decision(False, 'already_finished')
    return None


def prebuild_admission(request, gateway, mcp, history, next_phase, limits=Limits()):
    """Before another provider reservation: require actual MCP progress.

    Rejecting an active build returns action='wait'; it is not an instruction to
    terminate, retry or start a second build. The host re-evaluates after the
    same build settles. These decisions never replace finish_model acceptance.
    """
    refused = _scope(request, gateway)
    if refused:
        return refused
    refused = _mcp_check(mcp, gateway.execution_id, limits)
    if refused:
        return refused
    if mcp.revision:
        return Decision(False, 'candidate_exists_use_completion_policy')
    if mcp.attempts or mcp.failures:
        return Decision(False, 'initial_build_or_tool_failed')
    if type(history) is not tuple or len(history) != gateway.requests:
        return Decision(False, 'incomplete_request_history')
    previous_after = 0
    phases = []
    for sequence, record in enumerate(history, 1):
        if (not isinstance(record, RequestEvidence) or not _integer(record.sequence, sequence, sequence)
                or record.execution_id != gateway.execution_id
                or record.phase not in ('discovery', 'construction')
                or not _integer(record.mcp_calls_before, previous_after, mcp.total_calls)
                or not _integer(record.mcp_calls_after, record.mcp_calls_before, mcp.total_calls)
                or type(record.code_errors) is not tuple):
            return Decision(False, 'invalid_request_history')
        if record.status != 'completed' or record.usage_known is not True:
            return Decision(False, 'request_not_known_completed')
        if record.code_errors:
            return Decision(False, 'code_mode_failure')
        previous_after = record.mcp_calls_after
        phases.append(record.phase)
    if 'construction' in phases and 'discovery' in phases[phases.index('construction'):]:
        return Decision(False, 'prebuild_phase_regression')
    completed = [call for call in mcp.calls if call['status'] == 'completed']
    if any(call['tool'] not in ('get_modeling_contract', 'get_current_model') for call in completed):
        return Decision(False, 'build_evidence_missing')
    contracts = sum(call['tool'] == 'get_modeling_contract' for call in completed)
    reads = sum(call['tool'] == 'get_current_model' for call in completed)
    if contracts > limits.contract_reads or reads > limits.empty_model_reads:
        return Decision(False, 'repeated_prebuild_reads')
    if next_phase == 'discovery':
        if phases.count('discovery') >= limits.discovery_requests or 'construction' in phases or contracts:
            return Decision(False, 'discovery_allowance_exhausted')
    elif next_phase == 'construction':
        if contracts < 1:
            return Decision(False, 'successful_contract_required')
        if phases.count('construction') >= limits.construction_requests:
            return Decision(False, 'no_build_progress')
    else:
        return Decision(False, 'invalid_prebuild_phase')
    return Decision(True, 'bounded_initial_' + next_phase, 'proceed')


def continuation_admission(request, gateway, state, verified_candidate, *,
                           process_code, reader_alive, failure, pass_index,
                           now, deadline_seconds, verified_outcome=None, limits=Limits()):
    """All old can_continue conditions, plus nonempty same-run build evidence.

    The caller must still run the old restore_state checks for candidate paths,
    unaccounted directories and persisted counters. This pure additional gate
    cannot grant continuation on behalf of those existing filesystem checks.
    """
    refused = _scope(request, gateway)
    if refused:
        return refused
    if verified_outcome is not None:
        return Decision(False, 'already_finished')
    started = request.get('completion_started')
    if (type(process_code) is not int or process_code != 0 or reader_alive is not False
            or failure is not None or type(pass_index) is not int or pass_index != 0
            or gateway.requests <= 0 or not _finite(started, 0.000001)
            or not _finite(now, started) or not _finite(deadline_seconds, 30)
            or now - started >= deadline_seconds - 30):
        return Decision(False, 'original_continuation_conditions_failed')
    if (not isinstance(state, Mapping) or not _integer(state.get('revision'), 1, 1)
            or state.get('execution_id') != gateway.execution_id or state.get('started') != started
            or not _integer(state.get('attempts'), 1, limits.build_limit)
            or not _integer(state.get('model_revision'), 1, state.get('attempts', 0))
            or not _finite(state.get('blender_seconds'))
            or not _integer(state.get('tool_failures'), 0, 100000)
            or not isinstance(state.get('calls'), list) or not 1 <= len(state['calls']) <= 40
            or any(not isinstance(call, Mapping) or call.get('status') not in
                   ('started', 'completed', 'failed') for call in state['calls'])
            or state['calls'][-1]['status'] == 'started'):
        return Decision(False, 'invalid_or_empty_persisted_state')
    active = None
    for call in state['calls']:
        if call['status'] == 'started':
            if active is not None:
                return Decision(False, 'unfinished_persisted_tool')
            active = call.get('tool')
            if not isinstance(active, str) or active not in TOOLS:
                return Decision(False, 'invalid_persisted_tool')
        elif active is not None:
            if call.get('tool') != active:
                return Decision(False, 'unfinished_persisted_tool')
            active = None
    if active is not None:
        return Decision(False, 'unfinished_persisted_tool')
    if not isinstance(verified_candidate, Mapping):
        return Decision(False, 'verified_candidate_required')
    info = verified_candidate.get('info')
    identity = verified_candidate.get('identity')
    result = verified_candidate.get('result')
    if (not isinstance(info, Mapping) or info.get('execution_id') != gateway.execution_id
            or type(info.get('revision')) is not int or info['revision'] != state['model_revision']
            or not isinstance(info.get('path'), str) or len(info['path']) > 32
            or not re.fullmatch(r'candidates/[1-9][0-9]*', info['path'])
            or not state['model_revision'] <= int(info['path'].split('/')[1]) <= state['attempts']
            or not isinstance(identity, tuple) or len(identity) != 2
            or not _integer(identity[0], 20, 50000000)
            or not isinstance(identity[1], str) or not re.fullmatch('[0-9a-f]{64}', identity[1])
            or not isinstance(result, Mapping) or not _integer(result.get('triangles'), 1, 3000000)):
        return Decision(False, 'candidate_identity_or_revision_mismatch')
    return Decision(True, 'continue_verified_existing_candidate', 'proceed')


def monetary_admission(request, budget, phase, proposed, capacity, *, inspection_index=0):
    """Pure liability + next request + required remaining capacity <= USD1.75.

    This is a capacity admission invariant, NOT a reservation or atomic spend
    authorization. The original ledger must reserve the proposed envelope under
    its existing lock after this check, without shrinking required later work.
    Re-evaluate using the actual counted payload before every provider request.
    Lower actual input uses its smaller conservative reservation. Input above
    the current stage's reviewed ceiling requires an explicitly enlarged plan;
    it never borrows the protected later capacity. Output cannot fall below the
    required current-stage minimum.
    """
    if not enabled(request):
        return Decision(False, 'outside_explicit_standard_mode', 'legacy')
    if (not isinstance(budget, BudgetEvidence) or not request.get('execution_id')
            or budget.execution_id != request['execution_id']
            or not _integer(budget.liability_micro_usd, 0, CEILING_MICRO_USD)
            or not _integer(budget.requests, 0, MAX_REQUESTS)
            or budget.known_usage is not True or budget.price_valid is not True
            or not isinstance(proposed, TokenEnvelope) or not isinstance(capacity, RequiredCapacity)
            or phase not in PHASES):
        return Decision(False, 'invalid_or_uncertain_budget_evidence')
    required_now = None
    if phase == 'discovery':
        remaining = (capacity.construction, *capacity.inspection, capacity.finalization)
    elif phase == 'construction':
        required_now = capacity.construction
        remaining = (*capacity.inspection, capacity.finalization)
    elif phase == 'inspection':
        if not _integer(inspection_index, 0, len(capacity.inspection) - 1):
            return Decision(False, 'invalid_inspection_index')
        required_now = capacity.inspection[inspection_index]
        remaining = (*capacity.inspection[inspection_index + 1:], capacity.finalization)
    else:
        required_now = capacity.finalization
        remaining = ()
    if required_now and proposed.input_tokens > required_now.input_tokens:
        return Decision(False, 'reviewed_stage_input_ceiling_exceeded')
    if required_now and proposed.output_tokens < required_now.output_tokens:
        return Decision(False, 'required_stage_capacity_would_shrink')
    next_cost = proposed.micro_usd
    reserve = sum(envelope.micro_usd for envelope in remaining)
    if budget.requests + 1 + len(remaining) > MAX_REQUESTS:
        return Decision(False, 'insufficient_remaining_request_capacity')
    allowed = budget.liability_micro_usd + next_cost + reserve <= CEILING_MICRO_USD
    return Decision(allowed, 'capacity_within_original_ceiling' if allowed else
                    'required_remaining_capacity_not_funded', 'proceed' if allowed else 'stop',
                    next_cost, reserve)
