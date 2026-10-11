import test from 'node:test'
import assert from 'node:assert/strict'
import { evidence, inspect, JOBS } from '../scripts/inspect-generation-failures.mjs'
test('incident diagnostic outputs allowlisted signals, never raw private contents', () => {
  const e = evidence({ state: 'failed', detail: 'PRIVATE PROMPT sk-secret https://private.invalid SyntaxError', agentUsage: { requests: 1, input_tokens: 30, output_tokens: 50 } })
  assert.ok(e.signals.includes('SyntaxError')); assert.equal(e.requests, 1)
  assert.doesNotMatch(JSON.stringify(e), /PRIVATE|sk-secret|private.invalid/)
})
test('incident inspection uses only five fixed GETs and rejects untrusted origins', async () => {
  const calls = [], env = { ORACLE_ENDPOINT: 'https://inert-oracle.trycloudflare.com', ORACLE_API_TOKEN: 'x'.repeat(40) }
  const fetcher = async (url, init) => { calls.push([url, init]); const id = JOBS.find(id => url.endsWith(id)); return Response.json(id ? { id, state: 'failed' } : { ready: true }) }
  const r = await inspect(env, fetcher); assert.equal(r.jobs.length, 2); assert.equal(calls.length, 5)
  assert.ok(calls.every(([, i]) => i.method === 'GET' && i.redirect === 'error'))
  await assert.rejects(inspect({ ...env, ORACLE_ENDPOINT: 'https://evil.example' }, fetcher), /CONFIGURATION_UNAVAILABLE/)
  assert.equal(calls.length, 5)
})
