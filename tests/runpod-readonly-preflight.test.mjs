import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runReadOnlyPreflight, SAFE_READS, RUNPOD_ORIGIN } from '../scripts/runpod-readonly-preflight.mjs'

const secret = 'fixture-READ-ONLY-runpod-not-real'
const json = v => Response.json(v)
function fakeFor(data, audit) {
  return async (url, options) => {
    audit.push({ url, method: options?.method, redirect: options?.redirect })
    assert.equal(options.method, 'GET')
    assert.equal(options.redirect, 'error')
    assert.ok(!('body' in options))
    assert.equal(options.headers.Authorization, 'Bearer ' + secret)
    assert.ok(String(url).startsWith(RUNPOD_ORIGIN + '/v1/'))
    return json(data[String(url).slice(RUNPOD_ORIGIN.length)])
  }
}
test('no RunPod secret refuses without a request', async () => {
  let count = 0
  const result = await runReadOnlyPreflight('', async () => { count++; throw Error('NO_NETWORK') })
  assert.equal(count, 0)
  assert.equal(result.reason, 'MISSING_OR_INVALID_STAGING_SECRET')
  assert.equal(result.paidRequests, 0)
})
test('three GET-only official URLs, zero paid operations, sanitized aggregate results', async () => {
  const audit = []
  const content = {
    '/v1/endpoints': [
      { id: 'SECRET_ENDPOINT_1', env: { SECRET: 'must-not-appear' }, workersMin: 0, workersMax: 1 },
      { id: 'SECRET_ENDPOINT_2', workersMin: 2, workersMax: 4 },
    ],
    '/v1/networkvolumes': [
      { id: 'SECRET_VOLUME', name: 'private workspace', size: 50, dataCenterId: 'EU-NL-1' },
    ],
    '/v1/pods': [{ id: 'SECRET_POD_1', desiredStatus: 'RUNNING' }, { id: 'SECRET_POD_2', desiredStatus: 'EXITED' }],
  }
  const output = await runReadOnlyPreflight(secret, fakeFor(content, audit))
  assert.equal(output.verified, true)
  assert.equal(output.gpuWorkersStarted, 0)
  assert.equal(output.createdResources, 0)
  assert.equal(output.paidRequests, 0)
  assert.deepEqual(audit.map(x => x.url), SAFE_READS.map(x => RUNPOD_ORIGIN + x))
  assert.equal(output.checks['/v1/endpoints'].configuredScaleToZero, 1)
  assert.equal(output.checks['/v1/endpoints'].currentlyAlwaysOn, 1)
  assert.equal(output.checks['/v1/networkvolumes'].totalProvisionedGB, 50)
  assert.equal(output.checks['/v1/pods'].running, 1)
  const serialized = JSON.stringify(output)
  for (const leak of ['SECRET_ENDPOINT', 'SECRET_VOLUME', 'SECRET_POD', 'must-not-appear', 'private workspace', secret])
    assert.equal(serialized.includes(leak), false)
})
test('insufficient read scopes yield explicit sanitized denial, no retries or mutations', async () => {
  let calls = 0
  const r = await runReadOnlyPreflight(secret, async () => { calls++; return new Response('sensitive failure body', { status: 403 }) })
  assert.equal(calls, 3)
  assert.equal(r.verified, false)
  assert.equal(r.checks['/v1/endpoints'].status, 'INSUFFICIENT_READ_SCOPE')
  assert.equal(JSON.stringify(r).includes('sensitive'), false)
})
test('malformed content cannot pass as a connection test', async () => {
  const r = await runReadOnlyPreflight(secret, async () => json({ name: 'not-an-array' }))
  assert.equal(r.verified, false)
  assert.ok(SAFE_READS.every(x => r.checks[x].status === 'UNEXPECTED_PROVIDER_FORMAT'))
})
test('timeouts and network errors return a safe result rather than disclosing headers', async () => {
  const result = await runReadOnlyPreflight(secret, async () => { throw Error('Authorization: ' + secret) })
  assert.equal(result.verified, false)
  assert.equal(result.checks['/v1/endpoints'].status, 'NETWORK_OR_TIMEOUT_ERROR')
  assert.equal(JSON.stringify(result).includes(secret), false)
})
test('huge JSON bodies cannot cause uncontrolled parsing or leak environment variables', async () => {
  const huge = 'x'.repeat(2_100_000)
  const result = await runReadOnlyPreflight(secret, async () => Response.json([{ env: { sensitive: huge } }]))
  assert.equal(result.verified, false)
  assert.ok(SAFE_READS.every(x => result.checks[x].status === 'UNEXPECTED_PROVIDER_FORMAT'))
  assert.equal(JSON.stringify(result).includes('sensitive'), false)
})
