import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { setImmediate as nextTick } from 'node:timers/promises'
import ts from 'typescript'
import React from 'react'
import { safeAccountDestination } from '../src/lib/accountDestination.ts'
import { accountOAuthError } from '../src/lib/accountOAuthError.ts'

// Actual login component + hook, with deterministic HTTP/timers. No browser,
// provider login, token exchange or network request is performed.
async function harness(reply) {
  const slots = [], effects = [], timers = new Map(), reads = [], starts = [], redirects = []
  let cursor = 0, dirty = true, tree, serial = 0, unmounted = false
  const react = { ...React,
    useState(initial) { const index = cursor++; slots[index] ??= { value: typeof initial === 'function' ? initial() : initial }; return [slots[index].value, value => { assert.equal(unmounted, false, 'Unmounted state must not change'); const next = typeof value === 'function' ? value(slots[index].value) : value; if (!Object.is(next, slots[index].value)) { slots[index].value = next; dirty = true } }] },
    useRef(initial) { const index = cursor++; slots[index] ??= { ref: { current: initial } }; return slots[index].ref },
    useCallback(fn, deps) { const index = cursor++, prior = slots[index]; if (!prior || deps.some((value, i) => !Object.is(value, prior.deps[i]))) slots[index] = { value: fn, deps }; return slots[index].value },
    useEffect(fn, deps) { const index = cursor++, prior = slots[index]; if (!prior || deps.some((value, i) => !Object.is(value, prior.deps[i]))) { const slot = { deps, cleanup: prior?.cleanup }; slots[index] = slot; effects.push(() => { slot.cleanup?.(); slot.cleanup = fn() }) } },
  }
  const windowEvents = new EventTarget(), documentEvents = new EventTarget()
  const globals = { URL, URLSearchParams, AbortController, console,
    window: Object.assign(windowEvents, { location: { origin: 'https://worldifact-dots-review.xodobrox.workers.dev', assign: value => redirects.push(value) }, setTimeout(fn, delay) { const id = ++serial; timers.set(id, { fn, delay }); return id }, clearTimeout: id => timers.delete(id) }),
    document: Object.assign(documentEvents, { visibilityState: 'visible' }),
    fetch: async (path, init) => { reads.push({ path, ...init }); assert.equal(path, '/api/account/config'); assert.equal(init.method, 'GET'); assert.equal(init.redirect, 'error'); return reply(reads.length, init.signal) },
  }
  async function load(relative, dependencies) {
    const url = new URL(relative, import.meta.url), module = { exports: {} }, localRequire = createRequire(url)
    const code = ts.transpileModule(await readFile(url, 'utf8'), { fileName: url.pathname, compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText
    runInNewContext(code, { ...globals, module, exports: module.exports, require(id) {
      if (id === 'react') return react
      if (id === 'react/jsx-runtime') return localRequire(id)
      if (id.endsWith('.css')) return {}
      if (id in dependencies) return dependencies[id]
      throw new Error('Unexpected login dependency: ' + id)
    } }, { filename: url.pathname, timeout: 1000 })
    return module.exports
  }
  const hook = await load('../src/lib/useGoogleSignInAvailability.ts', {})
  const account = { user: null, refresh: async () => null }
  const { default: Component } = await load('../src/pages/AccountPage.tsx', {
    'react-router-dom': { Link: 'a', useLocation: () => ({ search: '' }), useNavigate: () => () => {} },
    '../lib/account': { useAccount: () => account, accountRequest: async (path, input) => { starts.push({ path, input }); return { url: 'https://oiezgikconcyjvdeshdh.supabase.co/auth/v1/authorize?provider=google' } } },
    '../lib/useGoogleSignInAvailability': hook, '../lib/accountDestination': { safeAccountDestination }, '../lib/accountOAuthError': { accountOAuthError },
    '../components/BrandShowcase': { __esModule: true, default: () => null },
  })
  async function settle() { for (let i = 0; i < 8; i++) { if (dirty) { dirty = false; cursor = 0; tree = Component() } while (effects.length) effects.shift()(); await nextTick() } }
  function elements(node) { if (Array.isArray(node)) return node.flatMap(elements); return React.isValidElement(node) ? [node, ...elements(node.props.children)] : [] }
  const text = node => Array.isArray(node) ? node.map(text).join('') : React.isValidElement(node) ? text(node.props.children) : node == null || typeof node === 'boolean' ? '' : String(node)
  await settle()
  return { reads, starts, redirects, settle, text: () => text(tree), google: () => elements(tree).find(node => node.props.className === 'account-google'),
    async retry() { const button = elements(tree).find(node => node.type === 'button' && text(node) === 'Check Google availability again'); assert.ok(button); button.props.onClick(); await settle() },
    async focus() { windowEvents.dispatchEvent(new Event('focus')); await settle() },
    async visible(value) { globals.document.visibilityState = value; documentEvents.dispatchEvent(new Event('visibilitychange')); await settle() },
    async restored() { const event = new Event('pageshow'); Object.defineProperty(event, 'persisted', { value: true }); windowEvents.dispatchEvent(event); await settle() },
    async timeout() { const timer = [...timers.values()].find(value => value.delay === 10000); assert.ok(timer, 'Availability must have its own bounded ten-second deadline'); timer.fn(); await settle() },
    close() { for (const slot of slots) slot?.cleanup?.(); unmounted = true },
  }
}

test('a transient availability error remains retryable and never impersonates a disabled provider', async () => {
  const h = await harness(async count => { if (count === 1) throw new TypeError('PRIVATE_NETWORK_DETAIL'); return Response.json({ googleReady: true }) })
  try {
    assert.equal(h.google().props.disabled, true)
    assert.match(h.text(), /Could not check Google sign-in/)
    assert.doesNotMatch(h.text(), /PRIVATE_NETWORK_DETAIL|not enabled|being configured/)
    h.google().props.onClick(); await h.settle(); assert.equal(h.starts.length, 0)
    await h.retry()
    assert.equal(h.google().props.disabled, false)
    assert.equal(h.starts.length, 0, 'Retry only checks capability; it cannot initiate authorization')
    h.google().props.onClick(); await h.settle()
    assert.equal(h.starts.length, 1); assert.equal(h.starts[0].path, '/api/account/oauth/google')
    assert.equal(h.redirects.length, 1)
  } finally { h.close() }
})

test('only a literal server capability enables Google, and configured false remains blocked', async () => {
  for (const value of [false, 'true', 1, null, undefined]) {
    const h = await harness(async () => Response.json({ googleReady: value }))
    try {
      assert.equal(h.google().props.disabled, true)
      assert.match(h.text(), value === false ? /not enabled for this environment/ : /Could not check/)
      await h.retry(); assert.equal(h.google().props.disabled, true)
      h.google().props.onClick(); await h.settle(); assert.equal(h.starts.length, 0)
    } finally { h.close() }
  }
})

test('deadline failure exits checking and an explicit retry can recover without remounting', async () => {
  const h = await harness((count, signal) => count === 1 ? new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason))) : Promise.resolve(Response.json({ googleReady: true })))
  try {
    assert.match(h.text(), /Checking Google sign-in/)
    await h.timeout(); assert.match(h.text(), /Could not check/)
    await h.retry(); assert.equal(h.google().props.disabled, false); assert.equal(h.starts.length, 0)
  } finally { h.close() }
})

test('a response arriving after the deadline cannot reenable Google even if transport ignores abort', async () => {
  let finish
  const h = await harness(() => new Promise(resolve => { finish = resolve }))
  try {
    await h.timeout()
    finish(Response.json({ googleReady: true })); await h.settle()
    assert.equal(h.google().props.disabled, true)
    assert.match(h.text(), /Could not check Google sign-in/)
    assert.equal(h.starts.length, 0)
  } finally { h.close() }
})

test('mobile and restored-page checks invalidate stale readiness and late replies cannot reopen sign-in', async () => {
  let finish
  const h = await harness(async count => count === 1 ? Response.json({ googleReady: true }) : count === 2 ? new Promise(resolve => { finish = resolve }) : Response.json({ googleReady: false }))
  try {
    assert.equal(h.google().props.disabled, false)
    await h.visible('hidden'); assert.equal(h.reads.length, 1)
    await h.visible('visible'); assert.equal(h.google().props.disabled, true)
    await h.restored(); assert.equal(h.google().props.disabled, true)
    finish(Response.json({ googleReady: true })); await h.settle()
    assert.equal(h.google().props.disabled, true); assert.match(h.text(), /not enabled/)
    assert.equal(h.reads[1].signal.aborted, true); assert.equal(h.starts.length, 0)
  } finally { h.close() }
})

test('leaving the login page cancels its request and event listeners', async () => {
  let finish
  const h = await harness(() => new Promise(resolve => { finish = resolve }))
  h.close(); assert.equal(h.reads[0].signal.aborted, true)
  finish(Response.json({ googleReady: true })); await h.settle()
  await h.focus(); await h.visible('visible'); await h.restored()
  assert.equal(h.reads.length, 1); assert.equal(h.starts.length, 0)
})
