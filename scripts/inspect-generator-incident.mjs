/** Fixed incident, authenticated GET only; never publishes arbitrary upstream text. */
import { pathToFileURL } from 'node:url'
export const JOB = '4c0378ad-a19d-4141-8632-c84437695892'
const number = value => Number.isSafeInteger(value) && value >= 0 && value <= 100_000_000 ? value : null
const bool = value => typeof value === 'boolean' ? value : null
const pick = (value, choices) => choices.includes(value) ? value : 'UNKNOWN'
export function evidence(health, job, quality) {
  if (job.id !== JOB) throw new Error('INCIDENT_IDENTITY_MISMATCH')
  const usage = quality.agentUsage ?? {}, guard = usage.cost_guard ?? {}
  const numeric = keys => Object.fromEntries(keys.map(key => [key, number(guard[key])]))
  return { readOnly: true, generationRequested: false,
    runtime: { ready: bool(health.ready), connectorVersion: number(health.connectorVersion),
      construction: pick(health.worldifactStandardConstructionPolicy, ['worldifact-standard-construction-v1']),
      context: pick(health.worldifactStandardContextPolicy, ['worldifact-standard-context-v1', 'worldifact-standard-context-v2']),
      tiers: pick(health.studioPricingRevision, ['studio-pricing-v1']),
      legacyCapUsd: health.astraBudgetMaxUsd === 1.75 ? 1.75 : null },
    job: { state: pick(job.state, ['queued', 'running', 'failed', 'succeeded', 'cancelled']),
      failure: pick(job.worldifactFailureCode, ['MODEL_BUDGET_EXCEEDED', 'ASTRA_COST_LIMIT', 'ORACLE_JOB_INCOMPLETE', 'INVALID_MODEL_OUTPUT']),
      modelStatus: pick(job.modelStatus, ['draft', 'complete', 'ready']), hasModel: bool(quality.hasModel), finished: bool(quality.agent?.finished),
      requests: number(usage.requests), inputTokens: number(usage.input_tokens), outputTokens: number(usage.output_tokens),
      unknownUsage: bool(usage.unknown_usage),
      execution: { failedCalls: number(quality.agentExecution?.failed_calls), calls: (Array.isArray(quality.agentExecution?.calls) ? quality.agentExecution.calls.slice(-40) : []).map(call => ({ request: number(call.request), errors: (Array.isArray(call.errors) ? call.errors : []).map(error => ({
        type: pick(String(error).match(/(ReferenceError|TypeError|SyntaxError|RangeError|Error):/)?.[1], ['ReferenceError', 'TypeError', 'SyntaxError', 'RangeError', 'Error']),
        signals: ['is not defined', 'is not a function', 'Cannot read properties', 'Unexpected token', 'Unexpected end', 'already been declared', 'JSON', 'load', 'store', 'contract', 'scene', 'schema', 'properties', 'parts', 'tools', 'undefined', 'null'].filter(word => String(error).includes(word)) })) })) },
      tools: { total: number(quality.agentTools?.total_calls), failures: number(quality.agentTools?.failures), buildAttempts: number(quality.agentTools?.build_attempts), revision: number(quality.agentTools?.revision),
        calls: (Array.isArray(quality.agentTools?.calls) ? quality.agentTools.calls.slice(-40) : []).map(call => ({
          tool: pick(call.tool, ['get_modeling_contract', 'build_model', 'edit_model', 'get_current_model', 'inspect_render', 'finish_model', 'get_reference_photo']),
          status: pick(call.status, ['started', 'succeeded', 'failed', 'ok']),
          signals: ['scene_json', 'schema', 'parts', 'material', 'vertices', 'revision', 'timeout', 'contract', 'expected_revision', 'not found', 'unknown', 'invalid', 'Unexpected', 'required', 'parse', 'Nieprawid', 'code', 'missing'].filter(word => String(call.error ?? '').toLowerCase().includes(word.toLowerCase())) })) },
      guard: { reason: pick(guard.reason, ['INSUFFICIENT_RESERVATION', 'INPUT_LIMIT', 'REQUEST_LIMIT', 'LEDGER_INVALID', 'PRICING_EXPIRED']),
        stage: pick(guard.stage, ['admission', 'count', 'ledger', 'pricing']),
        ...numeric(['counted_input', 'input_ceiling', 'requested_output', 'minimum_output', 'affordable_output', 'remaining_micro_usd', 'required_minimum_micro_usd', 'requests', 'protected_remaining_micro_usd', 'protected_remaining_requests']) } } }
}
export async function inspect(env, fetcher = fetch) {
  let origin
  try { const url = new URL(env.ORACLE_ENDPOINT); if (url.protocol !== 'https:' || !/^[a-z0-9]+(?:-[a-z0-9]+)*\.trycloudflare\.com$/.test(url.hostname) || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash) throw new Error(); origin = url.origin } catch { throw new Error('INCIDENT_CONFIG_UNAVAILABLE') }
  const token = env.ORACLE_API_TOKEN
  if (typeof token !== 'string' || token.length < 32 || token.length > 256 || /\s/.test(token)) throw new Error('INCIDENT_CONFIG_UNAVAILABLE')
  const read = async path => {
    try {
      const response = await fetcher(origin + path, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(20_000), headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } })
      if (!response.ok || !response.headers.get('content-type')?.startsWith('application/json')) { await response.body?.cancel(); throw new Error() }
      const reader = response.body.getReader(), chunks = []; let size = 0
      try { for (;;) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; if (size > 262144) throw new Error(); chunks.push(value) } }
      finally { await reader.cancel().catch(() => {}) }
      return JSON.parse(Buffer.concat(chunks).toString('utf8'))
    } catch { throw new Error('INCIDENT_READ_UNAVAILABLE') }
  }
  const health = await read('/v1/health'), job = await read(`/v1/jobs/${JOB}`)
  if (job.id !== JOB || !['failed', 'succeeded', 'cancelled'].includes(job.state)) throw new Error('INCIDENT_NOT_TERMINAL')
  return evidence(health, job, await read(`/v1/jobs/${JOB}/quality`))
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(JSON.stringify(await inspect(process.env), null, 2)) }
  catch { console.error('INCIDENT_READ_UNAVAILABLE'); process.exitCode = 1 }
}
