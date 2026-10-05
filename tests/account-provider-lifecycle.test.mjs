import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { setImmediate as tick } from 'node:timers/promises'
import React from 'react'
import ts from 'typescript'

const file = new URL('../src/lib/account.tsx', import.meta.url)
const localRequire = createRequire(file)
const source = await readFile(file, 'utf8')
const compiled = ts.transpileModule(source, { fileName: file.pathname, compilerOptions: { module: ts.ModuleKind.CommonJS,
  jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText
const A = { id: 'A', email: 'a@example.test', displayName: 'A' }
const B = { id: 'B', email: 'b@example.test', displayName: 'B' }

function harness() {
  const slots = [], effects = [], pending = [], listeners = new Map(), interval = []
  let cursor = 0, tree, dirty = true, writes = 0
  const react = { ...React,
    useState(initial) {
      const i = cursor++; if (!slots[i]) slots[i] = { value: initial }
      return [slots[i].value, next => { slots[i].value = typeof next === 'function' ? next(slots[i].value) : next; dirty = true; writes++ }]
    },
    useRef(initial) { const i = cursor++; if (!slots[i]) slots[i] = { current: initial }; return slots[i] },
    useCallback(fn) { const i = cursor++; if (!slots[i]) slots[i] = { fn }; return slots[i].fn },
    useEffect(callback) { const i = cursor++; if (!slots[i]) { slots[i] = { callback }; effects.push(slots[i]) } },
  }
  const module = { exports: {} }
  runInNewContext(compiled, { module, exports: module.exports, console, AbortSignal, Error,
    document: { visibilityState: 'visible' },
    window: { setInterval(fn) { interval.push(fn); return 1 }, clearInterval() {},
      addEventListener(name, fn) { listeners.set(name, fn) }, removeEventListener(name) { listeners.delete(name) } },
    fetch(path, options) {
      assert.ok(['/api/account/session', '/api/account/logout'].includes(path))
      assert.equal(options.method, path.endsWith('/logout') ? 'POST' : 'GET')
      return new Promise((resolve, reject) => pending.push({ path, resolve, reject, done: false }))
    },
    require(id) {
      if (id === 'react') return react
      if (id === 'react/jsx-runtime') return localRequire(id)
      if (id === './paymentError') return { AccountServiceError: class extends Error {} }
      throw new Error('Unexpected dependency: ' + id)
    },
  }, { filename: file.pathname })
  const take = path => { const item = pending.find(item => !item.done && item.path === path); assert.ok(item); item.done = true; return item }
  const settle = async () => {
    for (let i = 0; i < 8; i++) {
      if (dirty) { dirty = false; cursor = 0; tree = module.exports.AccountProvider({ children: null }) }
      while (effects.length) { const effect = effects.shift(); effect.cleanup = effect.callback() }
      await tick()
    }
  }
  const unmount = () => { for (const slot of slots) if (slot?.cleanup) slot.cleanup() }
  return { settle, pending, take, unmount, state: () => tree.props.value, writes: () => writes,
    focus: () => listeners.get('focus')?.(), timer: () => interval.at(-1)?.(),
    replayEffects() { unmount(); for (const slot of slots) if (slot?.callback) effects.push(slot) },
    async signedIn() { await settle(); take('/api/account/session').resolve(Response.json({ user: A })); await settle() },
  }
}

test('an older session response cannot restore an account after successful logout', async () => {
  const h = harness(); await h.signedIn()
  const stale = h.state().refresh(), staleRequest = h.take('/api/account/session')
  const logout = h.state().signOut(); await h.settle()
  assert.equal(h.state().user, null); assert.equal(h.state().loading, true)
  h.take('/api/account/logout').resolve(Response.json({})); await logout; await h.settle()
  staleRequest.resolve(Response.json({ user: A })); assert.equal(await stale, null); await h.settle()
  assert.equal(h.state().user, null); assert.equal(h.state().loading, false)
  h.unmount()
})

test('newer account B wins over an older response or failure for A', async () => {
  for (const failure of [false, true]) {
    const h = harness(); await h.signedIn()
    const old = h.state().refresh(), oldRequest = h.take('/api/account/session')
    const latest = h.state().refresh(), newRequest = h.take('/api/account/session')
    await h.settle(); assert.equal(h.state().loading, true)
    newRequest.resolve(Response.json({ user: B })); await latest; await h.settle()
    if (failure) oldRequest.reject(new Error('Old session unavailable'))
    else oldRequest.resolve(Response.json({ user: A }))
    assert.equal(await old, null); await h.settle()
    assert.equal(h.state().user.id, 'B'); assert.equal(h.state().error, ''); assert.equal(h.state().loading, false)
    h.unmount()
  }
})

test('logout intent quarantines focus, timer and explicit refresh until the POST finishes', async () => {
  const h = harness(); await h.signedIn()
  const logout = h.state().signOut(); await h.settle()
  const count = h.pending.length
  h.focus(); h.timer(); assert.equal(await h.state().refresh(), null); await h.settle()
  assert.equal(h.pending.length, count); assert.equal(h.state().user, null)
  await h.state().signOut(); assert.equal(h.pending.filter(item => item.path.endsWith('/logout')).length, 1)
  h.take('/api/account/logout').resolve(Response.json({})); await logout; await h.settle()
  const newer = h.state().refresh(); h.take('/api/account/session').resolve(Response.json({ user: B })); await newer; await h.settle()
  assert.equal(h.state().user.id, 'B'); h.unmount()
})

test('failed logout stays hidden and reports failure without accepting an older session lookup', async () => {
  const h = harness(); await h.signedIn()
  const old = h.state().refresh(), request = h.take('/api/account/session')
  const logout = h.state().signOut(), rejected = assert.rejects(logout, /Logout unavailable/)
  h.take('/api/account/logout').resolve(Response.json({ error: 'Logout unavailable' }, { status: 503 }))
  await rejected; request.resolve(Response.json({ user: A })); await old; await h.settle()
  assert.equal(h.state().user, null); assert.equal(h.state().error, 'Logout unavailable'); assert.equal(h.state().loading, false)
  h.unmount()
})

test('unmount invalidates pending session and logout state updates', async () => {
  for (const loggingOut of [false, true]) {
    const h = harness(); await h.signedIn()
    const action = loggingOut ? h.state().signOut() : h.state().refresh()
    const request = h.take(loggingOut ? '/api/account/logout' : '/api/account/session')
    await h.settle(); h.unmount(); const before = h.writes()
    request.resolve(Response.json(loggingOut ? {} : { user: A })); await action; await h.settle()
    assert.equal(h.writes(), before)
  }
})

test('StrictMode effect replay keeps only the newest session response', async () => {
  const h = harness(); await h.settle(); const first = h.take('/api/account/session')
  h.replayEffects(); await h.settle(); const second = h.take('/api/account/session')
  second.resolve(Response.json({ user: B })); await h.settle()
  first.resolve(Response.json({ user: A })); await h.settle()
  assert.equal(h.state().user.id, 'B'); assert.equal(h.state().loading, false); h.unmount()
})
