import { test } from 'node:test'
import assert from 'node:assert/strict'
import { inspectExternalGenerator } from '../scripts/check-froge-external.mjs'

const target = 'https://froge-mpc-2-studio.terraformingplanet.chatgpt.site/'

test('Studio probe is a credential-free HEAD and reports access/embedding separately', async () => {
  const calls = []
  const result = await inspectExternalGenerator(async (url, options) => {
    calls.push({ url, options })
    return new Response(null, { status: 200, headers: { 'X-Frame-Options': 'SAMEORIGIN' } })
  })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, target)
  assert.equal(calls[0].options.method, 'HEAD')
  assert.equal(calls[0].options.redirect, 'manual')
  assert.equal(calls[0].options.credentials, 'omit')
  assert.equal(calls[0].options.body, undefined)
  assert.equal(calls[0].options.headers, undefined)
  assert.equal(result.http, 'REACHABLE_NOT_GENERATION_PROOF')
  assert.equal(result.browserEmbedding, 'BLOCKED_BY_RESPONSE_POLICY')
  assert.equal(result.generation, 'NOT_TESTED')
})

test('Studio probe never follows or exposes authentication redirects', async () => {
  let calls = 0
  const result = await inspectExternalGenerator(async () => {
    calls++
    return new Response(null, { status: 302, headers: { Location: 'https://example.test/login?private=secret' } })
  })
  assert.equal(calls, 1)
  assert.equal(result.http, 'REDIRECT_NOT_FOLLOWED')
  assert.equal(result.browserEmbedding, 'UNKNOWN')
  assert.doesNotMatch(JSON.stringify(result), /private=|secret|example\.test/)
})

test('Studio probe only falls back to GET for unsupported HEAD and never implies working AI', async () => {
  const methods = []
  const result = await inspectExternalGenerator(async (_url, options) => {
    methods.push(options.method)
    return new Response(null, { status: methods.length === 1 ? 405 : 401 })
  })
  assert.deepEqual(methods, ['HEAD', 'GET'])
  assert.equal(result.http, 'ACCESS_RESTRICTED')
  assert.equal(result.generation, 'NOT_TESTED')
  const unavailable = await inspectExternalGenerator(async () => { throw new Error('private diagnostic') })
  assert.equal(unavailable.http, 'UNKNOWN_NETWORK_UNAVAILABLE')
  assert.doesNotMatch(JSON.stringify(unavailable), /private diagnostic/)
})
