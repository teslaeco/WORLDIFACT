import test from 'node:test'
import assert from 'node:assert/strict'
import { OWNER_MODELS, readOwnerModel } from '../src/lib/ownerShowcase.ts'

test('showcase rejects identity substitutions before a fetch and rejects incomplete files', async () => {
  let calls = 0
  const fetcher = (async () => { calls++; return new Response(new Uint8Array(10)) }) as typeof fetch
  await assert.rejects(() => readOwnerModel({ ...OWNER_MODELS[0], path: '/api/private' } as never, new AbortController().signal, fetcher), /Unknown/)
  assert.equal(calls, 0)
  await assert.rejects(() => readOwnerModel(OWNER_MODELS[0], new AbortController().signal, fetcher), /incomplete/)
  assert.equal(calls, 1)
})

test('showcase ignores compressed transfer length, checks decoded size and fingerprint, and omits credentials', async () => {
  await assert.rejects(() => readOwnerModel(OWNER_MODELS[0], new AbortController().signal, (async (path, options) => {
    assert.equal(path, OWNER_MODELS[0].path)
    assert.equal(options?.method, 'GET')
    assert.equal(options?.credentials, 'omit')
    assert.equal(options?.redirect, 'error')
    return new Response(new Uint8Array(OWNER_MODELS[0].bytes), { headers: { 'content-encoding': 'gzip', 'content-length': '17' } })
  }) as typeof fetch), /fingerprint/)
})

test('a cancelled selection cannot publish a model or start a request', async () => {
  const controller = new AbortController()
  controller.abort()
  let calls = 0
  await assert.rejects(() => readOwnerModel(OWNER_MODELS[1], controller.signal, (async () => { calls++; return new Response() }) as typeof fetch), /abort/i)
  assert.equal(calls, 0)
})
