import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { setImmediate as nextTick } from 'node:timers/promises'
import React from 'react'
import ts from 'typescript'
import * as sessionDraft from '../src/lib/shopSessionDraft.ts'
import * as paymentError from '../src/lib/paymentError.ts'

const draft = { prompt: 'Private next Earth model', profile: 'standard', cheapModel: 'sol', deliverable: 'detailed-mesh', purpose: 'figurine', textureLimit: 4096, budgetTier: 'standard', referenceCount: 1 }
async function accountHarness() {
  const data = new Map(), storage = { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: k => data.delete(k) }
  sessionDraft.saveShopSessionDraft(storage, 'owner-a', draft)
  const slots = [], effects = [], requests = []
  let cursor = 0, dirty = true, tree
  const react = { ...React,
    useState(initial) { const i = cursor++; if (!slots[i]) slots[i] = { value: typeof initial === 'function' ? initial() : initial }; return [slots[i].value, next => { slots[i].value = typeof next === 'function' ? next(slots[i].value) : next; dirty = true }] },
    useRef(initial) { const i = cursor++; if (!slots[i]) slots[i] = { ref: { current: initial } }; return slots[i].ref },
    useCallback(callback) { cursor++; return callback },
    useEffect(callback, deps) { const i = cursor++, prior = slots[i]; if (!prior || deps.some((value, index) => !Object.is(value, prior.deps[index]))) { const slot = { deps, cleanup: prior?.cleanup }; slots[i] = slot; effects.push(() => { slot.cleanup?.(); slot.cleanup = callback() }) } },
  }
  // Preserve the stable useCallback identity used by the actual provider.
  react.useCallback = (callback, deps) => { const i = cursor++, prior = slots[i]; if (!prior || deps.some((value, index) => !Object.is(value, prior.deps[index]))) slots[i] = { value: callback, deps }; return slots[i].value }
  const url = new URL('../src/lib/account.tsx', import.meta.url), source = await readFile(url, 'utf8'), module = { exports: {} }, require = createRequire(url)
  const code = ts.transpileModule(source, { fileName: url.pathname, compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText
  runInNewContext(code, { module, exports: module.exports, AbortSignal, document: { visibilityState: 'visible' }, window: { sessionStorage: storage, setInterval: () => 1, clearInterval() {}, addEventListener() {}, removeEventListener() {} },
    fetch: (path, init) => new Promise((resolve, reject) => requests.push({ path, init, resolve, reject })),
    require(id) { if (id === 'react') return react; if (id === 'react/jsx-runtime') return require(id); if (id === './paymentError') return paymentError; if (id === './shopSessionDraft') return { ...sessionDraft, shopSessionStorage: () => storage }; throw new Error(id) },
  }, { filename: url.pathname, timeout: 1000 })
  const settle = async () => { for (let i = 0; i < 12; i++) { if (dirty) { dirty = false; cursor = 0; tree = module.exports.AccountProvider({ children: null }) } while (effects.length) effects.shift()(); await nextTick() } }
  await settle()
  return { data, storage, requests, settle, value: () => tree.props.value, close() { for (const slot of slots) slot?.cleanup?.() } }
}
const session = owner => Response.json({ user: owner ? { id: owner, email: `${owner}@example.test`, displayName: owner } : null })

test('logout outside Shop clears its draft and late session response cannot revive the old account', async () => {
  const h = await accountHarness()
  try {
    const pending = h.requests[0], signOut = h.value().signOut()
    assert.equal(h.requests[1].path, '/api/account/logout')
    h.requests[1].resolve(Response.json({ ok: true })); await signOut; await h.settle()
    assert.equal(h.data.size, 0); assert.equal(h.value().user, null)
    pending.resolve(session('owner-a')); await h.settle()
    assert.equal(h.value().user, null); assert.equal(h.data.size, 0)
  } finally { h.close() }
})

test('transient session failure preserves draft until successful verification confirms account change or logout', async () => {
  const h = await accountHarness()
  try {
    h.requests[0].reject(new TypeError('Offline')); await h.settle()
    assert.equal(h.value().user, null); assert.equal(h.data.size, 1)
    const same = h.value().refresh(); h.requests[1].resolve(session('owner-a')); await same; await h.settle()
    assert.equal(h.value().user.id, 'owner-a'); assert.equal(h.data.size, 1)
    const change = h.value().refresh(); h.requests[2].resolve(session('owner-b')); await change; await h.settle()
    assert.equal(h.value().user.id, 'owner-b'); assert.equal(h.data.size, 0)
    sessionDraft.saveShopSessionDraft(h.storage, 'owner-b', draft)
    const logout = h.value().refresh(); h.requests[3].resolve(session(null)); await logout; await h.settle()
    assert.equal(h.value().user, null); assert.equal(h.data.size, 0)
  } finally { h.close() }
})

test('out-of-order refresh and unmounted provider responses cannot invalidate the current verified account draft', async () => {
  const h = await accountHarness()
  const current = h.value().refresh(); h.requests[1].resolve(session('owner-b')); await current; await h.settle()
  sessionDraft.saveShopSessionDraft(h.storage, 'owner-b', { ...draft, prompt: 'Account B draft' })
  h.requests[0].resolve(session('owner-a')); await h.settle()
  assert.equal(h.value().user.id, 'owner-b')
  assert.equal(sessionDraft.readShopSessionDraft(h.storage, 'owner-b').draft.prompt, 'Account B draft')
  const stale = h.value().refresh(); h.close(); h.requests[2].resolve(session(null)); await stale
  assert.equal(sessionDraft.readShopSessionDraft(h.storage, 'owner-b').draft.prompt, 'Account B draft')
})

test('failed explicit logout retains the draft for the still-signed-in account', async () => {
  const h = await accountHarness()
  try {
    h.requests[0].resolve(session('owner-a')); await h.settle()
    const result = h.value().signOut(); h.requests[1].resolve(Response.json({ error: 'Unavailable' }, { status: 503 }))
    await assert.rejects(result, /Unavailable/); await h.settle()
    assert.equal(h.value().user.id, 'owner-a'); assert.equal(h.data.size, 1)
  } finally { h.close() }
})
