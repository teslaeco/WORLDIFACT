import test from 'node:test'
import assert from 'node:assert/strict'
import { AUDIT_PATHS, PUBLIC_ORIGIN, collectPublicRuntimeEvidence, summarizePublicStatus } from '../scripts/generation-recovery-audit.mjs'

test('audit status never returns arbitrary upstream fields or error text', () => {
  const status = summarizePublicStatus({ ready: true, reason: 'secret-value', token: 'secret-value', account: 'private', nested: { secret: true } })
  assert.deepEqual(status, { jsonShape: 'OBJECT', ready: true, reason: 'UNRECOGNIZED' })
  assert.equal(JSON.stringify(status).includes('secret-value'), false)
})
test('audit rejects non-object status and does not coerce readiness', () => {
  for (const value of [null, [], 'READY']) assert.deepEqual(summarizePublicStatus(value), { jsonShape: 'INVALID' })
  assert.deepEqual(summarizePublicStatus({ ready: 'true', generationReady: 1 }), { jsonShape: 'OBJECT' })
})
test('audit only performs fixed public GETs without cookies, redirects or writes', async () => {
  const calls = []
  const result = await collectPublicRuntimeEvidence(async (url, options) => {
    calls.push({ url, options })
    return new Response(url.includes('/api/') ? JSON.stringify({ ready: true, mode: 'READY' }) : '<html></html>', { headers: { 'content-type': url.includes('/api/') ? 'application/json' : 'text/html' } })
  })
  assert.deepEqual(calls.map(call => call.url), AUDIT_PATHS.map(path => PUBLIC_ORIGIN + path))
  for (const { options } of calls) {
    assert.equal(options.method, 'GET'); assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'error')
    assert.equal(options.body, undefined); assert.equal(options.headers.Authorization, undefined)
  }
  assert.equal(result.generationRequested, false); assert.equal(result.paidGenerationVerified, false)
  assert.equal(result.authenticatedAccountChecked, false)
})
test('network error cannot leak a URL/token or assert that production is down', async () => {
  const result = await collectPublicRuntimeEvidence(async () => { throw new Error('secret endpoint and credential') })
  assert.equal(result.results.length, AUDIT_PATHS.length)
  assert.ok(result.results.every(row => row.read === 'UNAVAILABLE'))
  assert.equal(JSON.stringify(result).includes('secret endpoint'), false)
})
test('oversized/malformed JSON is bounded and never produces a readiness claim', async () => {
  for (const body of ['not JSON', '{"private":"' + 'x'.repeat(70_000) + '"}']) {
    const result = await collectPublicRuntimeEvidence(async () => new Response(body, { headers: { 'content-type': 'application/json' } }))
    assert.ok(result.results.filter(row => row.path.startsWith('/api/')).every(row => row.publicStatus.read === 'INVALID_OR_UNAVAILABLE'))
  }
})
test('HTTP failure is retained even when its body advertises ready', async () => {
  const result = await collectPublicRuntimeEvidence(async () => new Response('{"ready":true}', { status: 503, headers: { 'content-type': 'application/json' } }))
  assert.ok(result.results.every(row => row.status === 503))
  assert.equal(result.paidGenerationVerified, false)
})
