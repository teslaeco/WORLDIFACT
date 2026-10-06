import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { setImmediate as tick } from 'node:timers/promises'
import React from 'react'
import ts from 'typescript'
import { loadGenerationFunding } from '../src/lib/loadGenerationFunding.ts'

const pageUrl = new URL('../src/pages/GenerationFundingPage.tsx', import.meta.url), localRequire = createRequire(pageUrl)
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText
const pageCode = compile(await readFile(pageUrl, 'utf8'))
const fixture = () => ({ version: 1, readOnly: true, currency: 'USD',
  customerPoints: { status: 'known', balance: 500, held: 0, available: 500 },
  providerBudget: { status: 'known', unreservedCents: 42, legacyDerivedFallbackCents: null },
  ordinaryAstraMinimumCents: { blueprint: 175, unpricedDetailed: 175 },
  jobs: { scanLimit: 256, scanned: 0, partial: false, scanStatus: 'complete',
    states: { reserved: 0, completed: 0, failed: 0, unknown: 0 }, routes: { studio: 0, blueprint: 0, legacyBlueprint: 0, unknown: 0 },
    evidence: { ordinaryTerminalStudioPending: 0, ordinaryCompletedBlueprintPending: 0, legacyReadyWithoutReservation: 0, legacyAllowanceRefusalCandidates: 0, supportGrantRecords: 0, markedReconciled: 0, unknown: 0 },
    fundingEvidence: { unresolvedOrdinaryReservations: { records: 0, cents: 0 }, recordedPreDispatchReleases: { records: 0, cents: 0 }, recordedStudioReconciliations: { records: 0, releasedCents: 0, retainedLiabilityCents: 0 }, unknownAmountRecords: 0 } },
  supportGrantClaims: { originalRecordPresent: false, supplementalRecordPresent: false } })
const text = node => node == null || typeof node === 'boolean' ? '' : Array.isArray(node) ? node.map(text).join('') : React.isValidElement(node) ? text(node.props.children) : String(node)
const elements = tree => { const result = []; const walk = node => { if (Array.isArray(node)) node.forEach(walk); else if (React.isValidElement(node)) { result.push(node); walk(node.props.children) } }; walk(tree); return result }
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }

// Actual page effects + actual bounded GET client; only hooks, clock and HTTP are inert.
async function harness(answer = () => Response.json(fixture())) {
  let cursor = 0, dirty = true, tree, nextTimer = 0
  const slots = [], effects = [], calls = [], timers = new Map()
  const window = new EventTarget(), document = new EventTarget(); document.visibilityState = 'visible'
  window.setTimeout = callback => { timers.set(++nextTimer, callback); return nextTimer }
  window.clearTimeout = id => timers.delete(id)
  const react = { ...React,
    useState(initial) { const i = cursor++; if (!slots[i]) slots[i] = { value: initial }; return [slots[i].value, update => { const next = typeof update === 'function' ? update(slots[i].value) : update; if (!Object.is(next, slots[i].value)) { slots[i].value = next; dirty = true } }] },
    useEffect(callback, deps) { const i = cursor++, prior = slots[i]; if (!prior || deps.some((v,j) => !Object.is(v, prior.deps[j]))) { const slot = { deps, cleanup: prior?.cleanup }; slots[i] = slot; effects.push(() => { slot.cleanup?.(); slot.cleanup = callback() }) } },
  }
  const fetcher = async (path, init) => { calls.push({ path, init }); return answer(calls.length, init) }
  const module = { exports: {} }
  runInNewContext(pageCode, { module, exports: module.exports, window, document, AbortController, console, Intl, Error,
    require(id) { if (id === 'react') return react; if (id === 'react/jsx-runtime') return localRequire(id); if (id === '../lib/loadGenerationFunding') return { loadGenerationFunding: signal => loadGenerationFunding(signal, fetcher) }; if (id.endsWith('.css')) return {}; throw Error('Unexpected page dependency: ' + id) },
  }, { filename: pageUrl.pathname, timeout: 1000 })
  const settle = async () => { for (let i=0;i<10;i++) { if (dirty) { dirty=false;cursor=0;tree=module.exports.default() } while(effects.length)effects.shift()(); await tick() } }
  await settle()
  return { calls, text: () => text(tree), settle,
    async focus() { window.dispatchEvent(new Event('focus')); await settle() },
    async read() { const button = elements(tree).find(node => node.type === 'button'); assert.equal(button.props.disabled, false); button.props.onClick(); await settle() },
    async timeout() { for (const callback of [...timers.values()]) callback(); await settle() },
    close() { for (const slot of slots) slot?.cleanup?.() },
  }
}

test('standalone page entry reads only its GET endpoint and exposes no mutation control', async () => {
  const h = await harness(); try {
    assert.equal(h.calls.length, 1); assert.equal(h.calls[0].path, '/api/account/generation-funding')
    assert.equal(h.calls[0].init.method, 'GET'); assert.equal(h.calls[0].init.credentials, 'same-origin'); assert.equal(h.calls[0].init.body, undefined)
    assert.match(h.text(), /500/); assert.match(h.text(), /\$0\.42/); assert.match(h.text(), /not an OpenAI invoice/)
    await h.focus(); assert.doesNotMatch(h.text(), /\$0\.42/); assert.equal(h.calls.length, 1)
    await h.read(); assert.equal(h.calls.length, 2); assert.ok(h.calls.every(call => call.init.method === 'GET'))
  } finally { h.close() }
})

test('focus invalidates a late previous-account response without automatic recovery or reread', async () => {
  const old = deferred(), latest = fixture(); latest.providerBudget.unreservedCents = 81
  const h = await harness(count => count === 1 ? old.promise : Response.json(latest)); try {
    await h.focus(); assert.equal(h.calls.length, 1); assert.equal(h.calls[0].init.signal.aborted, true)
    await h.read(); assert.match(h.text(), /\$0\.81/)
    old.resolve(Response.json(fixture())); await h.settle()
    assert.match(h.text(), /\$0\.81/); assert.doesNotMatch(h.text(), /\$0\.42/); assert.equal(h.calls.length, 2)
  } finally { h.close() }
})

test('timeout clears uncertainty without polling, and an expanded private response is not rendered', async () => {
  const pending = deferred(), h = await harness(() => pending.promise)
  try { await h.timeout(); assert.match(h.text(), /timed out/); assert.equal(h.calls.length, 1); pending.resolve(Response.json(fixture())); await h.settle(); assert.doesNotMatch(h.text(), /\$0\.42/) } finally { h.close() }
  const bad = await harness(() => Response.json({ ...fixture(), privatePrompt: 'SHOULD_NOT_RENDER' }))
  try { assert.match(bad.text(), /could not be verified/); assert.doesNotMatch(bad.text(), /SHOULD_NOT_RENDER/) } finally { bad.close() }
})

test('GET client refuses authentication errors, redirects and oversized bodies without retry', async () => {
  for (const response of [Response.json({ secret: 'DO_NOT_DISPLAY' }, { status: 401 }), new Response('x'.repeat(32769), { headers: { 'Content-Type': 'application/json' } }), new Response('<html>private</html>', { headers: { 'Content-Type': 'text/html' } })]) {
    let calls = 0
    await assert.rejects(loadGenerationFunding(new AbortController().signal, async (_path, init) => { calls++; assert.equal(init.redirect, 'error'); return response }), /Sign in|could not be verified/)
    assert.equal(calls, 1)
  }
})

test('actual entrypoint isolates the diagnostic route from all ordinary account and app effects', async () => {
  const entryUrl = new URL('../src/main.tsx', import.meta.url), code = compile(await readFile(entryUrl, 'utf8'))
  for (const path of ['/account/generation-funding', '/shop']) {
    const App = () => {}, AccountProvider = () => {}, FundingPage = () => {}; let rendered
    runInNewContext(code, { exports: {}, document: { getElementById: () => ({}) }, window: { location: { pathname: path } }, require(id) {
      if (id === 'react') return React
      if (id === 'react/jsx-runtime') return localRequire(id)
      if (id === 'react-dom/client') return { createRoot: () => ({ render: value => { rendered = value } }) }
      if (id === 'react-router-dom') return { BrowserRouter: 'router' }
      if (id === './App') return { __esModule: true, default: App }
      if (id === './lib/account') return { AccountProvider }
      if (id === './pages/GenerationFundingPage') return { __esModule: true, default: FundingPage }
      if (id.endsWith('.css')) return {}
      throw Error('Unexpected entry dependency: ' + id)
    } }, { filename: entryUrl.pathname, timeout: 1000 })
    const nodes = elements(rendered)
    assert.equal(nodes.some(node => node.type === FundingPage), path === '/account/generation-funding')
    assert.equal(nodes.some(node => node.type === AccountProvider), path !== '/account/generation-funding')
    assert.equal(nodes.some(node => node.type === App), path !== '/account/generation-funding')
  }
})


test('stored-output assessment displays only a potential amount and retains a single read-only action', async () => {
  const value = fixture()
  value.jobs.scanned = 2
  value.jobs.states.completed = 2
  value.jobs.routes.blueprint = 2
  value.jobs.evidence.markedReconciled = 2
  value.jobs.blueprintOutputAdjustment = { scanLimit: 32, checked: 2, candidates: 1, potentialCents: 7, unavailable: 1, partial: false }
  const h = await harness(() => Response.json(value))
  try {
    assert.match(h.text(), /1 verified records may support an additional \$0\.07/)
    assert.match(h.text(), /No funds have been returned by this read/)
    assert.match(h.text(), /1 could not be verified/)
    assert.match(h.text(), /not a provider invoice, an applied refund or approval/)
    assert.equal(h.calls.length, 1)
    assert.equal(h.calls[0].init.method, 'GET')
    assert.equal(h.calls[0].init.body, undefined)
    await h.focus()
    assert.doesNotMatch(h.text(), /\$0\.07/)
  } finally { h.close() }
})

test('stored-output assessment refuses private fields and inconsistent positive amounts', async () => {
  for (const extra of [{ privateJobIds: ['SHOULD_NOT_RENDER'] }, { checked: 33 }, { candidates: 1, potentialCents: 7 }]) {
    const value = fixture()
    value.jobs.blueprintOutputAdjustment = { scanLimit: 32, checked: 0, candidates: 0, potentialCents: 0, unavailable: 0, partial: false, ...extra }
    const h = await harness(() => Response.json(value))
    try {
      assert.match(h.text(), /could not be verified/)
      assert.doesNotMatch(h.text(), /SHOULD_NOT_RENDER|may support an additional/)
      assert.equal(h.calls.length, 1)
    } finally { h.close() }
  }
})
