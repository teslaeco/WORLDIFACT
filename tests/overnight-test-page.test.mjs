import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { setImmediate as tick } from 'node:timers/promises'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'
import { OVERNIGHT_PANEL_EXPIRES, OVERNIGHT_PANEL_SLOTS } from '../src/lib/overnightTestClient.ts'
import * as testDiagnostics from '../src/lib/overnightTestDiagnostics.ts'
import { inspectGLB } from '../src/lib/glb.ts'
import { formatStudioGenerationDuration } from '../src/lib/studioProtocol.ts'

const pageURL = new URL('../src/pages/OvernightTestsPage.tsx', import.meta.url)
const source = await readFile(pageURL, 'utf8'), localRequire = createRequire(pageURL)
const compiled = ts.transpileModule(source, { fileName: pageURL.pathname, compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText
const startTime = Date.parse('2026-10-06T05:00:00Z')
const ownerA = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', ownerB = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'
const requestID = 'cccccccc-cccc-4ccc-cccc-cccccccccccc'
const emptyRows = () => OVERNIGHT_PANEL_SLOTS.map(slot => ({ slot: slot.id, state: 'empty', detail: 'Not yet started.' }))
const budget = (overrides = {}) => ({ accountContract: 'approved-test-account-v1', commitments: [], available: true, approvalId: 'api-tests-20261006-044444-usd4', expiresAt: OVERNIGHT_PANEL_EXPIRES, totalCents: 400, committedCents: 0, remainingCents: 400, attempts: { 'detailed-astra': 0, 'blueprint-sol': 0, 'blueprint-luna': 0 }, noRecycling: true, ...overrides })
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
const text = node => node == null || typeof node === 'boolean' ? '' : Array.isArray(node) ? node.map(text).join('') : React.isValidElement(node) ? text(node.props.children) : String(node)
const elements = tree => { const list = []; const walk = node => { if (Array.isArray(node)) node.forEach(walk); else if (React.isValidElement(node)) { list.push(node); walk(node.props.children) } }; walk(tree); return list }
function glb() {
  const json = Buffer.from(JSON.stringify({ asset: { version: '2.0' }, meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }], accessors: [{ count: 3 }], nodes: [{ mesh: 0 }] }).padEnd(180, ' '))
  const output = new ArrayBuffer(20 + json.length), view = new DataView(output)
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, output.byteLength, true)
  view.setUint32(12, json.length, true); view.setUint32(16, 0x4e4f534a, true); new Uint8Array(output, 20).set(json)
  return output
}

// Runs actual TSX, hooks, events and cleanup with inert controller/network and
// deterministic time. This is offline lifecycle evidence, not browser evidence.
async function harness(options = {}) {
  let account = { user: { id: ownerA, displayName: 'Owner' }, loading: false, ...options.account }
  let now = options.now ?? startTime, cursor = 0, dirty = true, tree, closed = false, nextTimer = 1
  let statusValue = options.status ?? budget(), rowError = false
  const slots = [], effects = [], calls = [], instances = [], timers = new Map(), downloads = [], createdURLs = [], revokedURLs = []
  const rowsByOwner = new Map([[ownerA, options.rows ?? emptyRows()]])
  const react = { ...React,
    useState(initial) { const i = cursor++; if (!slots[i]) slots[i] = { value: typeof initial === 'function' ? initial() : initial }; return [slots[i].value, update => { const next = typeof update === 'function' ? update(slots[i].value) : update; if (!Object.is(next, slots[i].value)) { slots[i].value = next; dirty = true } }] },
    useRef(initial) { const i = cursor++; if (!slots[i]) slots[i] = { ref: { current: initial } }; return slots[i].ref },
    useEffect(callback, deps) { const i = cursor++, old = slots[i]; if (!old || deps.some((value, index) => !Object.is(value, old.deps?.[index]))) { const next = { deps, cleanup: old?.cleanup }; slots[i] = next; effects.push(() => { next.cleanup?.(); next.cleanup = callback() }) } },
  }
  class Client {
    constructor(store, fetcher, owner, active) { this.owner = owner; this.active = active; this.store = store; this.fetcher = fetcher; instances.push(this); if (!rowsByOwner.has(owner)) rowsByOwner.set(owner, emptyRows()) }
    async status() { calls.push({ kind: 'status', owner: this.owner }); if (options.statusHandler) return options.statusHandler(this, calls); return statusValue }
    rows() { if (rowError) throw new Error('PRIVATE_STORAGE_VALUE'); return rowsByOwner.get(this.owner) }
    async start(slot, prompt) { calls.push({ kind: 'start', owner: this.owner, slot, prompt }); if (options.startHandler) return options.startHandler(this, slot); const rows = this.rows(); rows[rows.findIndex(row => row.slot === slot)] = { slot, id: requestID, state: 'pending', detail: 'Acceptance requires recovery.' }; return this.rows().find(row => row.slot === slot) }
    async recover(slot) { calls.push({ kind: 'recover', owner: this.owner, slot }); if (options.recoverHandler) return options.recoverHandler(this, slot); return this.rows().find(row => row.slot === slot) }
    async download(slot) { calls.push({ kind: 'download', owner: this.owner, slot }); return options.downloadHandler ? options.downloadHandler(this, slot) : new Blob([glb()], { type: 'model/gltf-binary' }) }
  }
  const storage = { getItem() { return null }, setItem() {}, removeItem() {} }
  const window = { get localStorage() { if (options.storageBlocked) throw new Error('PRIVATE_STORAGE'); return storage },
    setInterval(fn, ms) { const id = nextTimer++; timers.set(id, { fn, ms, repeat: true }); return id }, clearInterval(id) { timers.delete(id) },
    setTimeout(fn, ms) { const id = nextTimer++; timers.set(id, { fn, ms, repeat: false }); return id }, clearTimeout(id) { timers.delete(id) } }
  class FakeDate extends Date { static now() { return now } }
  const module = { exports: {} }
  runInNewContext(compiled, { module, exports: module.exports, window, Date: FakeDate, Blob,
    fetch() { throw new Error('Unexpected real fetch') },
    URL: { createObjectURL(blob) { const url = `blob:inert-${createdURLs.length}`; createdURLs.push({ url, blob }); return url }, revokeObjectURL(url) { revokedURLs.push(url) } },
    document: { body: { appendChild() {} }, createElement(name) { assert.equal(name, 'a'); return { click() { downloads.push({ href: this.href, download: this.download }) }, remove() {} } } },
    require(id) {
      if (id === 'react') return react
      if (id === 'react/jsx-runtime') return localRequire(id)
      if (id === 'react-router-dom') return { Link: 'a' }
      if (id === '../lib/account') return { useAccount: () => account }
      if (id === '../lib/overnightTestClient') return { OvernightTestClient: Client, OVERNIGHT_PANEL_EXPIRES, OVERNIGHT_PANEL_SLOTS }
      if (id === '../lib/overnightTestDiagnostics') return testDiagnostics
      if (id === '../lib/blueprintExport') return { async exportBlueprintGlb(blueprint) { calls.push({ kind: 'local-export', title: blueprint.title }); return options.exportHandler ? options.exportHandler(blueprint) : glb() } }
      if (id === '../lib/glb') return { inspectGLB }
      if (id === '../lib/studioProtocol') return { formatStudioGenerationDuration }
      if (id.endsWith('.css')) return {}
      throw new Error('Unexpected dependency ' + id)
    },
  }, { filename: pageURL.pathname, timeout: 1000 })
  const render = () => { dirty = false; cursor = 0; tree = module.exports.default() }
  const settle = async () => { for (let i = 0; i < 12; i++) { if (dirty && !closed) render(); while (effects.length) effects.shift()(); await tick() } }
  const buttons = () => elements(tree).filter(node => node.type === 'button')
  const button = label => { const found = buttons().find(node => text(node).includes(label)); assert.ok(found, 'Missing button ' + label); return found }
  const click = async (label, { force = false } = {}) => { const found = button(label); if (!force) assert.equal(!!found.props.disabled, false, 'Button disabled: ' + label); found.props.onClick(); await settle() }
  await settle()
  return { calls, instances, downloads, createdURLs, revokedURLs, timers, text: () => text(tree), markup: () => renderToStaticMarkup(tree), buttons, button, click, settle,
    async prompt(value) { const textarea = elements(tree).find(node => node.type === 'textarea'); assert.ok(textarea); textarea.props.onChange({ target: { value } }); await settle() },
    async account(value, flushEffects = true) { account = { ...account, ...value }; dirty = true; if (flushEffects) await settle(); else render() },
    async advance(value) { now = value; for (const [id, timer] of [...timers]) { if (!timer.repeat) timers.delete(id); timer.fn() } await settle() },
    async status(value) { statusValue = value; await click('Refresh test budget') },
    rows(owner = ownerA) { return rowsByOwner.get(owner) },
    failRows() { rowError = true },
    close() { closed = true; for (const slot of slots) slot?.cleanup?.() },
  }
}

const completedAstra = () => { const rows = emptyRows(); rows[0] = { slot: 'astra-1', id: requestID, state: 'completed', detail: 'Original model returned.', job: { id: requestID, state: 'succeeded', detail: 'Finished.', downloadAllowed: true, generationTiming: { source: 'oracle-worker', durationSeconds: 74 } } }; return rows }

test('dedicated route renders four fixed slots with explicit caps and point prices; opening and budget refresh never submit', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
  assert.match(app, /path="\/account\/overnight-tests" element=\{<OvernightTestsPage \/>\}/)
  const h = await harness(); try {
    assert.equal(h.buttons().filter(node => text(node).startsWith('Start paid')).length, 4)
    for (const slot of OVERNIGHT_PANEL_SLOTS) assert.match(h.text(), new RegExp(`${(slot.capCents / 100).toFixed(2)} cap · ${slot.points} points`))
    assert.match(h.text(), /USD 3\.95 within the USD 4\.00 ceiling/)
    assert.match(h.text(), /commitments are never recycled/)
    assert.match(h.markup(), /<label for="overnight-prompt">/)
    assert.ok(h.buttons().filter(node => text(node).startsWith('Start paid')).every(node => node.props.disabled))
    await h.click('Refresh test budget'); assert.deepEqual(h.calls.map(call => call.kind), ['status', 'status'])
  } finally { h.close() }
})

test('signed-out, loading and unverified accounts have no paid forms or receipt data', async () => {
  for (const account of [{ user: null, loading: false }, { user: { id: ownerA }, loading: true }]) {
    const h = await harness({ account }); try { assert.equal(h.calls.length, 0); assert.doesNotMatch(h.markup(), /<textarea|Start paid|Request ID:/) } finally { h.close() }
  }
  const h = await harness({ statusHandler: async () => { throw new Error('PRIVATE_SERVER_TOKEN') } }); try {
    assert.doesNotMatch(h.markup(), /<textarea|Start paid|PRIVATE_SERVER_TOKEN/)
    assert.match(h.text(), /owner-only test budget could not be verified/)
  } finally { h.close() }
})

test('status loading and failed refresh hide controls and never reveal raw service errors', async () => {
  const wait = deferred(); let checks = 0
  const h = await harness({ statusHandler: () => ++checks === 1 ? budget() : wait.promise }); try {
    h.button('Refresh test budget').props.onClick(); await h.settle()
    assert.doesNotMatch(h.markup(), /<textarea|Start paid/)
    wait.reject(new Error('RAW_PROVIDER_SECRET')); await h.settle()
    assert.doesNotMatch(h.text(), /RAW_PROVIDER_SECRET|Start paid/)
    assert.match(h.text(), /Diagnostic: TEST_STATUS_RESPONSE_INVALID/)
  } finally { h.close() }
})

test('the page shows fixed server diagnostic codes separately from local receipt-read failures', async () => {
  const config = await harness({ statusHandler: () => { throw new testDiagnostics.OvernightTestStatusError('TEST_SELECTOR_BINDING_TYPE') } })
  try { assert.match(config.text(), /Diagnostic: TEST_SELECTOR_BINDING_TYPE/); assert.doesNotMatch(config.markup(), /<textarea|Start paid/) }
  finally { config.close() }
  const storage = await harness()
  try {
    storage.failRows(); await storage.click('Refresh test budget')
    assert.match(storage.text(), /Diagnostic: TEST_BROWSER_RECEIPT_STORAGE/)
    assert.doesNotMatch(storage.text(), /PRIVATE_STORAGE_VALUE|Start paid/)
    assert.ok(storage.calls.every(call => call.kind === 'status'))
  } finally { storage.close() }
})

test('one explicit valid start is locked synchronously and retained; a pending slot blocks every replacement', async () => {
  const h = await harness(); try {
    await h.prompt('  a small workshop  ')
    const start = h.button('Start paid Detailed Astra · attempt 1')
    start.props.onClick(); start.props.onClick(); await h.settle()
    assert.deepEqual(h.calls.filter(call => call.kind === 'start'), [{ kind: 'start', owner: ownerA, slot: 'astra-1', prompt: 'a small workshop' }])
    assert.match(h.text(), new RegExp(requestID))
    assert.equal(h.buttons().filter(node => text(node).startsWith('Start paid')).length, 3)
    assert.ok(h.buttons().filter(node => text(node).startsWith('Start paid')).every(node => node.props.disabled))
    await h.click('Recover same request'); assert.equal(h.calls.filter(call => call.kind === 'recover').length, 1)
    assert.equal(h.calls.filter(call => call.kind === 'start').length, 1)
  } finally { h.close() }
})

test('prompt limits prevent direct event starts even if a disabled control is invoked', async () => {
  const h = await harness(); try {
    for (const value of ['  ', 'ab', 'x'.repeat(2001)]) {
      await h.prompt(value); await h.click('Start paid Detailed Astra · attempt 1', { force: true })
    }
    assert.equal(h.calls.filter(call => call.kind === 'start').length, 0)
  } finally { h.close() }
})

test('clock expiry disables new paid events, while explicit same-request recovery remains available', async () => {
  const h = await harness({ rows: completedAstra() }); try {
    await h.prompt('a workshop'); const oldStart = h.button('Start paid Detailed Astra · attempt 2')
    await h.advance(Date.parse(OVERNIGHT_PANEL_EXPIRES))
    assert.match(h.text(), /Paid test window expired/); assert.doesNotMatch(h.markup(), /<textarea/)
    assert.ok(h.buttons().filter(node => text(node).startsWith('Start paid')).every(node => node.props.disabled))
    oldStart.props.onClick(); await h.settle(); assert.equal(h.calls.filter(call => call.kind === 'start').length, 0)
    await h.click('Recover same request'); assert.equal(h.calls.filter(call => call.kind === 'recover').length, 1)
  } finally { h.close() }
})

test('workflow quota and unavailable pool block starts even with remaining dollars', async () => {
  const h = await harness({ status: budget({ attempts: { 'detailed-astra': 2, 'blueprint-sol': 0, 'blueprint-luna': 0 }, committedCents: 350, remainingCents: 50 }) }); try {
    await h.prompt('a workshop')
    assert.equal(h.button('Start paid Detailed Astra · attempt 1').props.disabled, true)
    assert.equal(h.button('Start paid GPT-6.1 Sol').props.disabled, false)
    await h.status(budget({ available: false }))
    assert.doesNotMatch(h.markup(), /<textarea/)
    assert.ok(h.buttons().filter(node => text(node).startsWith('Start paid')).every(node => node.props.disabled))
  } finally { h.close() }
})

test('logout/loading invalidates old actions before cleanup and late status cannot authorize another account', async () => {
  const wait = deferred()
  const h = await harness({ statusHandler: client => client.owner === ownerA ? wait.promise : budget() }); try {
    const old = h.instances[0]
    await h.account({ loading: true }, false)
    assert.equal(old.active(), false); assert.doesNotMatch(h.markup(), /Start paid|<textarea/)
    wait.resolve(budget()); await h.settle(); assert.doesNotMatch(h.text(), /Owner test budget verified/)
    await h.account({ user: { id: ownerB }, loading: false })
    assert.match(h.text(), /Owner test budget verified/)
    assert.equal(h.calls.filter(call => call.owner === ownerB && call.kind === 'status').length, 1)
  } finally { h.close() }
})

test('late explicit start cannot refresh, reveal a receipt or download after the account changes', async () => {
  const wait = deferred()
  const h = await harness({ startHandler: () => wait.promise }); try {
    await h.prompt('a workshop'); h.button('Start paid Detailed Astra · attempt 1').props.onClick(); await h.settle()
    await h.account({ user: { id: ownerB }, loading: false })
    wait.resolve({ slot: 'astra-1', id: requestID, state: 'completed', detail: 'PRIVATE_OWNER_A_RESULT' }); await h.settle()
    assert.doesNotMatch(h.text(), /PRIVATE_OWNER_A_RESULT|cccccccc/)
    assert.equal(h.calls.filter(call => call.owner === ownerA && call.kind === 'status').length, 1)
    assert.equal(h.downloads.length, 0)
  } finally { h.close() }
})

test('unmount drops late status and removes the local expiry timer without any recovery request', async () => {
  const wait = deferred(), h = await harness({ statusHandler: () => wait.promise })
  h.close(); wait.resolve(budget()); await h.settle()
  assert.equal(h.instances[0].active(), false); assert.equal(h.timers.size, 0)
  assert.deepEqual(h.calls.map(call => call.kind), ['status'])
})

test('valid detailed GLB downloads only on demand and object URLs are revoked on teardown', async () => {
  const h = await harness({ rows: completedAstra() }); try {
    assert.match(h.text(), /Worker execution: 1m 14s/)
    assert.equal(h.downloads.length, 0); assert.equal(h.calls.filter(call => call.kind === 'download').length, 0)
    await h.click('Download same model')
    assert.equal(h.downloads.length, 1); assert.match(h.downloads[0].download, /astra-1-original\.glb$/)
    assert.equal(h.createdURLs.length, 1)
    h.close(); assert.deepEqual(h.revokedURLs, ['blob:inert-0']); assert.equal(h.timers.size, 0)
  } finally { h.close() }
})

test('invalid or stale detailed bytes never trigger a browser download', async () => {
  const h = await harness({ rows: completedAstra(), downloadHandler: () => new Blob(['PRIVATE_BAD_GLB']) }); try {
    await h.click('Download same model'); assert.equal(h.downloads.length, 0); assert.equal(h.createdURLs.length, 0)
    assert.match(h.text(), /did not pass the local GLB check/); assert.doesNotMatch(h.text(), /PRIVATE_BAD_GLB/)
  } finally { h.close() }
  const wait = deferred(), pending = await harness({ rows: completedAstra(), downloadHandler: () => wait.promise }); try {
    pending.button('Download same model').props.onClick(); await pending.settle(); await pending.account({ user: null, loading: false })
    wait.resolve(new Blob([glb()])); await pending.settle(); assert.equal(pending.downloads.length, 0); assert.equal(pending.createdURLs.length, 0)
  } finally { pending.close() }
})

test('returned blueprint download is explicit local geometry export with no archive or provider operation', async () => {
  const rows = emptyRows(); rows[2] = { slot: 'sol', id: requestID, state: 'completed', detail: 'Provider result confirmed.', result: { model: 'gpt-6.1-sol', blueprint: { title: 'Returned workshop' } } }
  const h = await harness({ rows }); try {
    assert.match(h.text(), /Returned workshop/); assert.equal(h.calls.filter(call => call.kind === 'local-export').length, 0)
    await h.click('Download returned blueprint GLB')
    assert.deepEqual(h.calls.filter(call => call.kind !== 'status'), [{ kind: 'local-export', title: 'Returned workshop' }])
    assert.match(h.downloads[0].download, /sol-procedural-GAME\.glb$/)
  } finally { h.close() }
})

test('failed attempt retains recovery without offering a reset or new start for its slot', async () => {
  const rows = emptyRows(); rows[0] = { slot: 'astra-1', id: requestID, state: 'failed', detail: 'Finished without a model.' }
  const h = await harness({ rows }); try {
    assert.match(h.text(), /Attempt ended · receipt preserved/)
    assert.equal(h.buttons().some(node => text(node).includes('Start paid Detailed Astra · attempt 1')), false)
    assert.ok(h.button('Recover same request')); assert.doesNotMatch(h.text(), /Retry with new|Reset slot/)
  } finally { h.close() }
})

test('unavailable and subsequently damaged storage close paid controls without leaking data or rejecting event promises', async () => {
  const blocked = await harness({ storageBlocked: true }); try {
    assert.doesNotMatch(blocked.markup(), /<textarea|Start paid|PRIVATE_STORAGE/)
    assert.match(blocked.text(), /cannot preserve test receipts/); assert.equal(blocked.calls.length, 0)
  } finally { blocked.close() }
  const h = await harness(); try {
    await h.prompt('a workshop'); h.failRows(); await h.click('Start paid Detailed Astra · attempt 1')
    assert.equal(h.calls.filter(call => call.kind === 'start').length, 0)
    assert.doesNotMatch(h.markup(), /<textarea|Start paid|PRIVATE_STORAGE_VALUE/)
    assert.match(h.text(), /receipts could not be read/)
  } finally { h.close() }
})

test('restored receipts are displayed without automatically recovering or replacing them on page open', async () => {
  const rows = emptyRows(); rows[0] = { slot: 'astra-1', id: requestID, state: 'pending', detail: 'Recovery required.' }
  const h = await harness({ rows }); try {
    assert.match(h.text(), new RegExp(requestID)); assert.deepEqual(h.calls.map(call => call.kind), ['status'])
    assert.ok(h.buttons().filter(node => text(node).startsWith('Start paid')).every(node => node.props.disabled))
  } finally { h.close() }
})

test('storage failure after an awaited operation safely removes controls and preserves a generic explanation', async () => {
  const wait = deferred(), h = await harness({ rows: completedAstra(), recoverHandler: () => wait.promise }); try {
    h.button('Recover same request').props.onClick(); await h.settle(); h.failRows()
    wait.reject(new Error('PRIVATE_TRANSPORT_DIAGNOSTIC')); await h.settle()
    assert.doesNotMatch(h.markup(), /<textarea|Start paid|PRIVATE_TRANSPORT_DIAGNOSTIC|PRIVATE_STORAGE_VALUE/)
    assert.match(h.text(), /receipts could not be read/)
  } finally { h.close() }
})
