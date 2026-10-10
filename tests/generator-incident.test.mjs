import test from 'node:test'
import assert from 'node:assert/strict'
import { JOB, evidence, inspect } from '../scripts/inspect-generator-incident.mjs'
test('incident report never returns upstream secrets, prompts or arbitrary diagnostic strings', () => {
  const secret = 'private-token-email-prompt'
  const result = evidence({ ready: true, worldifactConstructionPolicy: secret, token: secret }, { id: JOB, state: 'failed', detail: secret }, { agentUsage: { cost_guard: { reason: secret, counted_input: 1200, remaining_micro_usd: secret } }, agent: { finished: false, text: secret } })
  assert.equal(JSON.stringify(result).includes(secret), false)
  assert.equal(result.job.guard.counted_input, 1200)
  assert.equal(result.job.guard.remaining_micro_usd, null)
  assert.throws(() => evidence({}, { id: 'another-job' }, {}))
})
test('only three fixed authenticated reads, no generation or budget sealing', async () => {
  const calls = [], env = { ORACLE_ENDPOINT: 'https://fixture-only.trycloudflare.com', ORACLE_API_TOKEN: 'x'.repeat(48) }
  await inspect(env, async (url, init) => {
    calls.push(url); assert.equal(init.method, 'GET'); assert.equal(init.redirect, 'error'); assert.equal(init.headers.Authorization, `Bearer ${env.ORACLE_API_TOKEN}`)
    return Response.json(url.endsWith('/quality') ? { agentUsage: {} } : url.endsWith(JOB) ? { id: JOB, state: 'failed' } : { ready: true })
  })
  assert.deepEqual(calls.map(x => new URL(x).pathname), ['/v1/health', `/v1/jobs/${JOB}`, `/v1/jobs/${JOB}/quality`])
})
test('failed authentication is not retried and raw errors are not disclosed', async () => {
  let calls = 0
  await assert.rejects(inspect({ ORACLE_ENDPOINT: 'https://fixture-only.trycloudflare.com', ORACLE_API_TOKEN: 'x'.repeat(48) }, async () => { calls++; return new Response('secret', { status: 401 }) }), /INCIDENT_READ_UNAVAILABLE/)
  assert.equal(calls, 1)
})
