import { test } from 'node:test'
import assert from 'node:assert/strict'
import { studioApi, type StudioEnv } from '../server/studio.ts'

const health = { ready: true, provider: 'openai', model: 'gpt-6-astra', connectorVersion: 33, photoInput: true, promptMaxLength: 5000 }
const revisions = { posthocExportRevision: 2, legacyGlbExportRecoveryRevision: 1 }
const privateCanary = 'PRIVATE_HEALTH_CANARY_DO_NOT_PUBLISH'

async function inspect(value: unknown, options: { unavailable?: boolean; disabled?: boolean; invalidJson?: boolean } = {}) {
  const calls: { path: string; method: string }[] = [], budgetCalls: string[] = []
  const env: StudioEnv = {
    OWNER_ACCESS_TOKEN: 'owner-test-'.repeat(5), ORACLE_ENDPOINT: 'https://export-review.trycloudflare.com', ORACLE_API_TOKEN: 'private-fixture-token',
    ENABLE_STUDIO_JOBS: options.disabled ? 'false' : 'true', PUBLIC_PILOT: 'true', GENERATION_REQUEST_LIMIT: 'unlimited',
    GENERATION_LIMITER: { async limit() { return { success: true } } },
    GENERATION_BUDGET: { idFromName: name => name, get: () => ({ async fetch(request: Request) {
      budgetCalls.push(new URL(request.url).pathname)
      assert.equal(request.method, 'GET')
      assert.equal(new URL(request.url).pathname, '/status', 'Capability observation must never reserve an attempt')
      return Response.json({ used: 99, limit: null, remaining: null, enabled: true, unlimited: true, expiresAt: null })
    } }) },
  }
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(url)).pathname, method = init?.method ?? 'GET'
    calls.push({ path, method })
    assert.equal(path, '/v1/health', 'No model, job, preparation or artifact endpoint may be contacted')
    assert.equal(method, 'GET')
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer private-fixture-token')
    if (options.unavailable) throw new TypeError('PRIVATE_TRANSPORT_CANARY')
    if (options.invalidJson) return new Response(privateCanary, { headers: { 'Content-Type': 'application/json' } })
    return Response.json(value)
  }) as typeof fetch
  const response = await studioApi(new Request('https://worldifact.test/api/studio/status'), env, fetcher)
  assert.equal(response.status, 200)
  const body = await response.json() as Record<string, unknown>
  assert.deepEqual(calls, [{ path: '/v1/health', method: 'GET' }])
  assert.deepEqual(budgetCalls, ['/status'])
  assert.equal(typeof body.exportPreparationReady, 'boolean')
  assert.doesNotMatch(JSON.stringify(body), /posthocExportRevision|legacyGlbExportRecoveryRevision|private-fixture-token|PRIVATE_|export-review/)
  return body
}

test('only the exact reviewed export revisions expose true without changing existing readiness or allowance', async () => {
  const baseline = await inspect(health)
  const observed = await inspect({ ...health, ...revisions, privateMessage: privateCanary, nested: { token: 'private-fixture-token' } })
  assert.equal(baseline.exportPreparationReady, false)
  assert.equal(observed.exportPreparationReady, true)
  const { exportPreparationReady: _before, ...before } = baseline
  const { exportPreparationReady: _after, ...after } = observed
  assert.deepEqual(after, before, 'The only new evidence is a boolean, not activation or a budget change')
})

test('absent, malformed, older and unreviewed future export revisions fail closed', async () => {
  for (const value of [
    {}, { posthocExportRevision: 2 }, { legacyGlbExportRecoveryRevision: 1 },
    { posthocExportRevision: 1, legacyGlbExportRecoveryRevision: 1 },
    { posthocExportRevision: 2, legacyGlbExportRecoveryRevision: 0 },
    { posthocExportRevision: 3, legacyGlbExportRecoveryRevision: 1 },
    { posthocExportRevision: 2, legacyGlbExportRecoveryRevision: 2 },
    { posthocExportRevision: '2', legacyGlbExportRecoveryRevision: 1 },
    { posthocExportRevision: 2, legacyGlbExportRecoveryRevision: '1' },
    { posthocExportRevision: true, legacyGlbExportRecoveryRevision: 1 },
    { posthocExportRevision: [2], legacyGlbExportRecoveryRevision: { revision: 1 } },
    { posthocExportRevision: null, legacyGlbExportRecoveryRevision: 1 },
  ]) assert.equal((await inspect({ ...health, ...value })).exportPreparationReady, false)
})

test('unready, incompatible and unreadable Oracle health cannot verify export preparation', async () => {
  for (const override of [ { ready: false }, { ready: 'true' }, { provider: 'unknown' }, { model: 'different-model' }, { connectorVersion: 32 }, { connectorVersion: '33' } ])
    assert.equal((await inspect({ ...health, ...revisions, ...override })).exportPreparationReady, false)
  assert.equal((await inspect(null)).exportPreparationReady, false)
  assert.equal((await inspect({ ...health, ...revisions }, { invalidJson: true })).exportPreparationReady, false)
  assert.equal((await inspect({ ...health, ...revisions }, { unavailable: true })).exportPreparationReady, false)
})

test('observing local export capability never activates a disabled paid-generation gate', async () => {
  const value = await inspect({ ...health, ...revisions }, { disabled: true })
  assert.equal(value.exportPreparationReady, true)
  assert.equal(value.ready, false)
  assert.equal(value.detailedReady, false)
  assert.equal(value.reason, 'DISABLED_OR_EXPIRED')
})
