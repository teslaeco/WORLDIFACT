import { test } from 'node:test'
import assert from 'node:assert/strict'
import { claimApproval, boundedBytes, CAP_USD, APPROVAL, ASTRA_JOB } from '../scripts/approved-model-test.mjs'

test('approved total stays $2.10 and a durable claim is made exactly once', async () => {
  assert.equal(CAP_USD.total, 2.10)
  let calls = 0
  const env = { GITHUB_REPOSITORY: 'teslaeco/WORLDIFACT', GITHUB_SHA: 'a'.repeat(40), GITHUB_TOKEN: 'fixture' }
  await claimApproval(env, async (url, init) => {
    calls++; assert.equal(url, 'https://api.github.com/repos/teslaeco/WORLDIFACT/git/refs')
    assert.equal(init.method, 'POST'); assert.equal(init.redirect, 'error')
    assert.deepEqual(JSON.parse(init.body), { ref: 'refs/tags/' + APPROVAL, sha: env.GITHUB_SHA })
    return Response.json({ ref: 'refs/tags/' + APPROVAL, object: { sha: env.GITHUB_SHA } }, { status: 201 })
  })
  assert.equal(calls, 1)
  assert.match(ASTRA_JOB, /^[a-f0-9-]{36}$/)
})
test('existing or uncertain authorization never replays', async () => {
  for (const status of [422,500,403]) {
    let calls = 0
    await assert.rejects(claimApproval({ GITHUB_REPOSITORY: 'teslaeco/WORLDIFACT', GITHUB_SHA: 'a'.repeat(40), GITHUB_TOKEN: 'fixture' }, async () => { calls++; return new Response('{}', { status }) }), /NO_RETRY/)
    assert.equal(calls, 1)
  }
})
test('artifact reads are bounded and truncated downloads rejected', async () => {
  await assert.rejects(boundedBytes(new Response('too large'), 3), /TOO_LARGE/)
  await assert.rejects(boundedBytes(new Response('abc', { headers: { 'content-length': '10' } }), 20), /INCOMPLETE/)
  assert.equal((await boundedBytes(new Response('abc'), 3)).length, 3)
})
