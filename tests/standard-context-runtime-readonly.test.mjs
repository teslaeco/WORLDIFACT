import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { contextEvidence, readContextRuntime } from '../scripts/check-standard-context-runtime.mjs'

const healthy = { ready: true, codexReady: true, provider: 'openai', model: 'gpt-6-astra', connectorVersion: 33,
  worldifactStandardContextPolicy: 'worldifact-standard-context-v2', worldifactStandardMaintenance: false }
const env = { ORACLE_ENDPOINT: 'https://fixture-only.trycloudflare.com', ORACLE_API_TOKEN: 'synthetic-readonly-fixture-token-12345' }
const response = value => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } })

test('only live source-attested v2 readiness without maintenance confirms the upgrade', () => {
  assert.equal(contextEvidence(healthy).upgradeVerified, true)
  for (const change of [{ ready: false }, { codexReady: false }, { provider: 'other' }, { model: 'other' },
    { connectorVersion: 32 }, { connectorVersion: 33.5 }, { connectorVersion: 10001 },
    { worldifactStandardContextPolicy: 'worldifact-standard-context-v1' }, { worldifactStandardContextPolicy: 'unknown-private-text' },
    { worldifactStandardContextPolicy: null }, { worldifactStandardMaintenance: true }, { worldifactStandardMaintenance: undefined },
    { worldifactStandardMaintenance: 'false' }]) assert.equal(contextEvidence({ ...healthy, ...change }).upgradeVerified, false)
})
test('public evidence is finite and cannot reveal arbitrary upstream fields', () => {
  assert.deepEqual(contextEvidence({ ...healthy, token: 'secret', prompt: 'private', jobs: ['private'], budget: 'private' }),
    { readOnly: true, revision: 'worldifact-standard-context-v2', maintenance: false, ready: true, upgradeVerified: true })
  for (const value of [null, [], 'private']) assert.throws(() => contextEvidence(value), /CONTEXT_HEALTH_UNAVAILABLE/)
  assert.equal(contextEvidence({ ...healthy, worldifactStandardContextPolicy: 'private' }).revision, 'UNKNOWN')
})
test('transport performs exactly one bounded authenticated health GET and refuses redirects', async () => {
  let calls = 0
  const result = await readContextRuntime(env, async (url, init) => {
    calls++; assert.equal(url, 'https://fixture-only.trycloudflare.com/v1/health')
    assert.equal(init.method, 'GET'); assert.equal(init.redirect, 'error'); assert.equal(init.body, undefined)
    assert.equal(init.headers.Authorization, `Bearer ${env.ORACLE_API_TOKEN}`); assert.ok(init.signal instanceof AbortSignal)
    return response(healthy)
  })
  assert.equal(calls, 1); assert.equal(result.upgradeVerified, true)
})
test('unsafe origins and credentials fail before network access', async () => {
  for (const ORACLE_ENDPOINT of ['http://fixture-only.trycloudflare.com', 'https://example.com',
    'https://user@fixture-only.trycloudflare.com', 'https://fixture-only.trycloudflare.com:444',
    'https://fixture-only.trycloudflare.com/private', 'https://fixture-only.trycloudflare.com/?token=x'])
    await assert.rejects(readContextRuntime({ ...env, ORACLE_ENDPOINT }, () => assert.fail('network')), /CONFIGURATION/)
  for (const ORACLE_API_TOKEN of ['', 'short', 'x'.repeat(257), 'x'.repeat(32) + '\n'])
    await assert.rejects(readContextRuntime({ ...env, ORACLE_API_TOKEN }, () => assert.fail('network')), /CONFIGURATION/)
})
test('failed, malformed and oversized health responses disclose only a fixed error', async () => {
  const values = [new Response('private', { status: 500 }), new Response('private', { headers: { 'content-type': 'text/html' } }),
    new Response('private', { headers: { 'content-type': 'application/json' } }),
    new Response('x'.repeat(16385), { headers: { 'content-type': 'application/json' } }),
    new Response('{}', { headers: { 'content-type': 'application/json', 'content-length': '16385' } })]
  for (const reply of values) await assert.rejects(readContextRuntime(env, async () => reply), /^Error: CONTEXT_HEALTH_UNAVAILABLE$/)
  await assert.rejects(readContextRuntime(env, async () => { throw new Error('secret endpoint') }), /^Error: CONTEXT_HEALTH_UNAVAILABLE$/)
})
test('one-shot workflow is isolated to the approved repair branch and exact commit-message gate', () => {
  const workflow = readFileSync(new URL('../.github/workflows/standard-context-runtime-readonly.yml', import.meta.url), 'utf8')
  assert.match(workflow, /branches: \[fix\/standard-context-v2-20261007\]/)
  assert.match(workflow, /github\.event\.head_commit\.message == 'Read STANDARD context activation status once'/)
  assert.match(workflow, /environment: production/)
  assert.match(workflow, /permissions:\n  contents: read/)
  assert.match(workflow, /persist-credentials: false/)
  assert.match(workflow, /timeout-minutes: 3/)
  assert.doesNotMatch(workflow, /workflow_dispatch|schedule:|pull_request_target|deploy|budget|curl|ssh/)
})
