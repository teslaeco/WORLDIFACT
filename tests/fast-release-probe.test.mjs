import { test } from 'node:test'
import assert from 'node:assert/strict'
import { inspectWorldifactServices } from '../scripts/check-froge-external.mjs'

test('installed FAST with no allowance is reported without changing readiness or making a paid request', async () => {
  const calls = []
  const result = await inspectWorldifactServices(async (url, options) => {
    calls.push({ url, options })
    return Response.json({ ready: false, fastReady: true, fastBudgetReady: false, photoReady: true, oracle: 'CONNECTOR_READY', reason: 'DISABLED_OR_EXPIRED',
      allowance: { used: 6, limit: 0, remaining: 0, privateToken: 'not-for-logs' },
      token: 'not-for-logs', endpoint: 'https://private.invalid', ticket: 'not-for-logs', prompt: 'not-for-logs' })
  })
  assert.equal(calls.length, 3)
  for (const { url, options } of calls) {
    assert.ok(url.startsWith('https://worldifact.xodobrox.workers.dev/api/'))
    assert.equal(options.method, 'GET')
    assert.equal(options.redirect, 'manual')
    assert.equal(options.credentials, 'omit')
    assert.equal(options.body, undefined)
    assert.equal(options.headers, undefined)
    assert.doesNotMatch(url, /\/jobs|token|ticket/)
  }
  const status = result.find(row => row.path === '/api/studio/status')
  assert.equal(status.fastReady, true)
  assert.equal(status.fastBudgetReady, false)
  assert.equal(status.ready, false)
  assert.equal(status.generation, 'NOT_REQUESTED')
  assert.deepEqual(status.allowance, { used: 6, limit: 0, remaining: 0 })
  assert.doesNotMatch(JSON.stringify(result), /not-for-logs|private\.invalid|privateToken/)
})

test('missing or malformed FAST capability never becomes true and failed public access is not retried', async () => {
  for (const fastReady of [undefined, 'true', 1, null]) {
    const result = await inspectWorldifactServices(async () => Response.json({ fastReady, ready: false }))
    assert.ok(result.every(row => !Object.hasOwn(row, 'fastReady')))
  }
  let calls = 0
  const failed = await inspectWorldifactServices(async () => {
    calls++
    return new Response(null, { status: 302, headers: { Location: 'https://private.invalid/login?token=secret' } })
  })
  assert.equal(calls, 3)
  assert.ok(failed.every(row => row.http === 302 && !Object.hasOwn(row, 'fastReady') && row.generation === 'NOT_REQUESTED'))
  assert.doesNotMatch(JSON.stringify(failed), /secret|private\.invalid/)
})
