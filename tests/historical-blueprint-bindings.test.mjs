import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { setImmediate as tick, setTimeout as pauseFor } from 'node:timers/promises'
import React from 'react'
import ts from 'typescript'
import * as blueprint from '../src/lib/blueprint.ts'
import * as archive from '../src/lib/archive.ts'
import * as models from '../src/lib/modelCatalog.ts'
import * as client from '../src/lib/scopedBlueprintClient.ts'
import { blueprintFingerprint, blueprintRequestId } from '../src/lib/blueprintRequest.ts'

const forms = ['P0GameLab', 'WorldStudio']
const firstOwner = '11111111-1111-4111-8111-111111111111'
const secondOwner = '22222222-2222-4222-8222-222222222222'
const recoveryLabel = 'Recover same request · no extra charge'
const resetLabel = 'Prepare new paid attempt…'
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
const text = n => n == null || typeof n === 'boolean' ? '' : Array.isArray(n) ? n.map(text).join('') : React.isValidElement(n) ? text(n.props.children) : String(n)
function nodes(tree) { const all = []; const visit = n => { if (Array.isArray(n)) n.forEach(visit); else if (React.isValidElement(n)) { all.push(n); visit(n.props.children) } }; visit(tree); return all }
async function result(seed, model) {
  const scene = blueprint.demoBlueprint('Fixture Moon workshop')
  return { mode: 'LIVE', provenance: 'GENERATED', blueprint: scene, assetSpec: blueprint.assetSpecForBlueprint(scene), model,
    requestId: await blueprintRequestId(seed), limitation: 'Inert offline fixture, no provider request.',
    evidence: { providerResponseId: 'resp_fixture', receivedAt: '2026-10-06T00:00:00.000Z', blueprintSha256: await blueprintFingerprint(scene), inputTokens: null, outputTokens: null, totalTokens: null },
    delivery: { kind: 'procedural-blueprint', referenceCount: 0, fallbackUsed: false } }
}
function transport({ lost = false, invalid = false, rejected = false, pause } = {}) {
  const calls = [], records = new Map()
  return { calls, records, posts: () => calls.filter(c => c.method === 'POST'), async fetch(path, init = {}) {
    const method = init.method || 'GET', body = init.body ? JSON.parse(init.body) : null, headers = new Headers(init.headers)
    calls.push({ path, method, body, headers })
    assert.match(path, /^\/api\/blueprint(?:\/requests\/[a-f0-9-]+)?$/)
    if (method === 'POST') {
      const seed = headers.get('X-WORLDIFACT-Request')
      assert.match(seed, /^[a-f0-9-]{36}$/)
      const value = await result(seed, invalid ? 'gpt-6-luna' : models.MODEL_CATALOG[body.model].model)
      records.set(seed, value)
      if (pause) await pause.promise
      if (lost) throw new Error('Fixture response lost after completion')
      return rejected ? Response.json({ noCharge: true, failureCode: 'CREDITS_EXHAUSTED' }, { status: 403 }) : Response.json(value)
    }
    return Response.json({ state: 'completed', result: records.get(path.split('/').at(-1)) })
  } }
}

// Real component handlers, archive validation and BlueprintClient. No DOM,
// browser, provider, paid operation or external network is used by this fixture.
async function harness(name, transport, { data = new Map(), confirm = () => true, storageBlocked = false, initialOwner = firstOwner, accessRequired = false } = {}) {
  const slots = [], effects = [], timers = new Map(), readers = [], health = []
  let cursor = 0, dirty = true, tree, serial = 0, account = initialOwner
  const storage = { getItem: key => data.get(key) ?? null, setItem(key, value) { if (storageBlocked) throw new Error('Fixture storage unavailable'); data.set(key, value) }, removeItem: key => data.delete(key) }
  const react = { ...React,
    useRef(initial) { const i = cursor++; if (!slots[i]) slots[i] = { ref: { current: initial } }; return slots[i].ref },
    useState(initial) { const i = cursor++; if (!slots[i]) slots[i] = { value: typeof initial === 'function' ? initial() : initial }; return [slots[i].value, update => { const next = typeof update === 'function' ? update(slots[i].value) : update; if (!Object.is(next, slots[i].value)) { slots[i].value = next; dirty = true } }] },
    useEffect(fn, deps) { const i = cursor++, old = slots[i]; if (!old || !deps || deps.some((v,j) => !Object.is(v, old.deps?.[j]))) { const next = { deps, cleanup: old?.cleanup }; slots[i] = next; effects.push(() => { next.cleanup?.(); next.cleanup = fn() }) } },
  }
  const timer = (fn, delay) => { const id = ++serial; timers.set(id, { fn, delay }); return id }
  const fetcher = async (path, init = {}) => { if (path === '/api/health') { health.push(path); return Response.json({ generationReady: true, astraBlueprintReady: true, accessRequired }) } return transport.fetch(path, init) }
  const url = new URL(`../src/components/${name}.tsx`, import.meta.url), localRequire = createRequire(url), module = { exports: {} }
  const source = await readFile(url, 'utf8')
  const compiled = ts.transpileModule(source, { fileName: url.pathname, compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText
  runInNewContext(compiled, { module, exports: module.exports, crypto: globalThis.crypto, fetch: fetcher, Headers, AbortController, AbortSignal, Blob, Error, console,
    window: { localStorage: storage, confirm, setTimeout: timer, clearTimeout: id => timers.delete(id), setInterval: timer, clearInterval: id => timers.delete(id) },
    setTimeout: timer, clearTimeout: id => timers.delete(id), setInterval: timer, clearInterval: id => timers.delete(id),
    FileReader: class { constructor() { readers.push(this) } readAsDataURL() {} },
    require(id) {
      if (id === 'react') return react
      if (id === 'react/jsx-runtime') return localRequire(id)
      if (id === 'react-router-dom') return { Link: () => null, useNavigate: () => () => {} }
      if (id === '../lib/blueprint') return blueprint
      if (id === '../lib/archive') return { readArchive: () => archive.readArchive(storage), saveArchive: value => archive.saveArchive(value, storage) }
      if (id === '../lib/modelCatalog') return models
      if (id === '../lib/scopedBlueprintClient') return client
      if (id === '../lib/account') return { useAccount: () => ({ user: account ? { id: account } : null, loading: false }) }
      if (id === '../lib/portalRouting') return { routeForPortal: id => `/portal/${id}` }
      if (id === '../lib/demoExamples') return { DEMO_EXAMPLES: [] }
      if (id === '../config/references') return { REFERENCE_LINKS: {} }
      if (id === '../lib/worldGeometry' || id === '../lib/proceduralGlb' || id === 'three') return {}
      if (id.startsWith('./') || id === '../pages/ShopPage') return { __esModule: true, default: () => null }
      throw new Error('Unexpected dependency ' + id)
    },
  }, { filename: url.pathname, timeout: 1000 })
  const settle = async () => { for (let i = 0; i < 20; i++) { if (dirty) { dirty = false; cursor = 0; tree = module.exports.default({}); if (name === 'P0GameLab') tree = tree.type(tree.props) } while (effects.length) effects.shift()(); await tick() } }
  const node = fn => { const found = nodes(tree).find(fn); assert.ok(found, 'Expected historical form control'); return found }
  const button = label => node(n => n.type === 'button' && text(n) === label)
  const primary = () => node(n => n.type === 'button' && n.props.className === 'primary')
  const preview = () => node(n => n.props.activePortalId === 'ai-game-lab').props.blueprint
  await settle()
  if (name === 'WorldStudio') { node(n => n.type === 'select' && n.props.value === 'demo').props.onChange({ target: { value: 'live' } }); await settle() }
  const finish = async () => { for (let i = 0; i < 200; i++) { await settle(); if (!/working ·|Creating scene/.test(text(primary()))) return; await pauseFor(1) } assert.fail('Fixture request did not finish') }
  const recoveryKey = () => `worldifact:scoped-blueprint:v1:${account}:${name === 'P0GameLab' ? 'historical-blueprint-lab' : 'historical-world-studio'}`
  return { finish, recoveryKey, async setOwner(next) { account = next; dirty = true; await settle() }, data, storage, health, readers, timers, settle, button, primary, preview, node, text: () => text(tree), all: () => nodes(tree), close() { for (const slot of slots) slot?.cleanup?.(); timers.clear() } }
}

for (const name of forms) {
  test(`${name}: exact provider identity and one durable request survive duplicate clicks`, async () => {
    const t = transport(), h = await harness(name, t)
    try {
      const before = h.preview(), click = h.primary().props.onClick
      assert.equal(h.primary().props.disabled, false, 'Modern public account mode needs no preview access code')
      click(); click(); await h.finish()
      assert.equal(t.posts().length, 1)
      assert.equal(t.posts()[0].body.providerModel, name === 'P0GameLab' ? 'gpt-6.1-sol' : 'gpt-6-astra')
      assert.equal(t.posts()[0].body.deliverable, 'procedural-blueprint')
      assert.notDeepEqual(h.preview(), before)
      assert.equal(archive.readArchive(h.storage).length, 1)
      assert.ok(h.button(recoveryLabel)); assert.equal(h.primary().props.disabled, true)
    } finally { h.close() }
  })

  test(`${name}: lost POST preserves preview/archive, reload and explicit recovery never repost`, async () => {
    const t = transport({ lost: true }), h = await harness(name, t); let reload
    try {
      const original = h.preview()
      archive.saveArchive(blueprint.localSceneResult(original), h.storage)
      const originalArchive = archive.readArchive(h.storage)
      h.primary().props.onClick(); await h.finish()
      assert.equal(t.posts().length, 1); assert.deepEqual(h.preview(), original); assert.deepEqual(archive.readArchive(h.storage), originalArchive)
      assert.match(h.text(), /Fixture response lost/); h.close()
      reload = await harness(name, t, { data: h.data })
      assert.equal(t.calls.length, 1, 'Mount makes no generation/recovery call')
      const recover = reload.button(recoveryLabel).props.onClick
      recover(); recover(); await reload.finish()
      assert.equal(t.posts().length, 1); assert.equal(t.calls.length, 2); assert.equal(archive.readArchive(reload.storage).length, 2)
      assert.notDeepEqual(reload.preview(), original)
      reload.button(recoveryLabel).props.onClick(); await reload.finish()
      assert.equal(t.posts().length, 1); assert.equal(archive.readArchive(reload.storage).length, 2, "Repeated recovery does not evict originals with duplicate archive entries")
    } finally { h.close(); reload?.close() }
  })

  test(`${name}: wrong-model response cannot replace original scene or archive`, async () => {
    const t = transport({ invalid: true }), h = await harness(name, t)
    try {
      const original = h.preview()
      h.primary().props.onClick(); await h.finish()
      assert.match(h.text(), /verified model/); assert.deepEqual(h.preview(), original); assert.equal(archive.readArchive(h.storage).length, 0)
      h.button(recoveryLabel).props.onClick(); await h.finish()
      assert.equal(t.posts().length, 1); assert.deepEqual(h.preview(), original); assert.equal(archive.readArchive(h.storage).length, 0)
    } finally { h.close() }
  })

  test(`${name}: terminal refusal requires explicit reset and separate generation gesture`, async () => {
    let approved = false, confirmations = 0
    const t = transport({ rejected: true }), h = await harness(name, t, { confirm: () => { confirmations++; return approved } })
    try {
      h.primary().props.onClick(); await h.finish()
      assert.match(h.text(), /Not enough available points/)
      const receipt = h.data.get(h.recoveryKey())
      h.button(resetLabel).props.onClick(); await h.settle()
      assert.equal(h.data.get(h.recoveryKey()), receipt); assert.equal(t.posts().length, 1)
      approved = true; h.button(resetLabel).props.onClick(); await h.settle()
      assert.equal(confirmations, 2); assert.equal(h.data.has(h.recoveryKey()), false); assert.equal(t.posts().length, 1)
      h.primary().props.onClick(); await h.finish(); assert.equal(t.posts().length, 2)
    } finally { h.close() }
  })

  test(`${name}: reading a reference and unavailable durable storage fail closed before POST`, async () => {
    const t = transport(), h = await harness(name, t), blocked = await harness(name, t, { storageBlocked: true })
    try {
      const click = h.primary().props.onClick
      h.node(n => n.type === 'input' && n.props.accept === 'image/png,image/jpeg,image/webp').props.onChange({ target: { files: [{ type: 'image/png', size: 12 }] } })
      click(); await h.settle(); assert.equal(t.posts().length, 0); assert.equal(h.primary().props.disabled, true)
      blocked.primary().props.onClick(); await blocked.finish()
      assert.equal(t.posts().length, 0); assert.match(blocked.text(), /Fixture storage unavailable/)
    } finally { h.close(); blocked.close() }
  })

  test(`${name}: unmount fences late provider completion without losing receipt`, async () => {
    const pause = deferred(), t = transport({ pause }), h = await harness(name, t)
    h.primary().props.onClick(); await h.settle()
    for (let i = 0; i < 200 && !t.posts().length; i++) { await pauseFor(1); await h.settle() }
    assert.equal(t.posts().length, 1)
    const original = h.preview(); h.close(); pause.resolve(); await h.settle()
    assert.deepEqual(h.preview(), original); assert.equal(archive.readArchive(h.storage).length, 0)
    assert.ok(h.data.has(h.recoveryKey())); assert.equal(t.posts().length, 1)
  })
}

test('WorldStudio: editing during a request preserves the edited scene until explicit recovery', async () => {
  const pause = deferred(), t = transport({ pause }), h = await harness('WorldStudio', t)
  try {
    h.primary().props.onClick(); await h.settle()
    h.button('Photovoltaic explorerrover').props.onClick(); await h.settle()
    h.node(n => n.type === 'input' && n.props.type === 'color').props.onChange({ target: { value: '#ff0000' } })
    await h.settle(); const edited = h.preview()
    pause.resolve(); await h.finish()
    assert.deepEqual(h.preview(), edited); assert.match(h.text(), /scene changed/); assert.equal(archive.readArchive(h.storage).length, 0)
    h.button(recoveryLabel).props.onClick(); await h.finish()
    assert.equal(t.posts().length, 1); assert.equal(archive.readArchive(h.storage).length, 1)
  } finally { h.close() }
})

for (const name of forms) {
  test(`${name}: old account completion cannot replace preview/archive or unlock the new owner's request`, async () => {
    const firstPause = deferred(), secondPause = deferred(), first = transport({ pause: firstPause }), second = transport({ pause: secondPause })
    let post = 0
    const routed = { fetch(path, init) {
      if (init?.method === 'POST') return (++post === 1 ? first : second).fetch(path, init)
      const seed = path.split('/').at(-1)
      return (first.records.has(seed) ? first : second).fetch(path, init)
    } }
    const h = await harness(name, routed)
    try {
      h.primary().props.onClick()
      for (let i = 0; i < 200 && !first.posts().length; i++) { await pauseFor(1); await h.settle() }
      assert.equal(first.posts().length, 1)
      const original = h.preview(), originalKey = h.recoveryKey()
      await h.setOwner(secondOwner)
      if (name === "WorldStudio") { h.node(n => n.type === "select" && n.props.value === "demo").props.onChange({ target: { value: "live" } }); await h.settle() }
      assert.ok(!h.all().some(n => n.type === 'button' && text(n) === recoveryLabel))
      assert.equal(h.primary().props.disabled, false)
      h.primary().props.onClick()
      for (let i = 0; i < 200 && !second.posts().length; i++) { await pauseFor(1); await h.settle() }
      assert.equal(second.posts().length, 1)
      firstPause.resolve(); await pauseFor(10); await h.settle()
      assert.deepEqual(h.preview(), original); assert.equal(archive.readArchive(h.storage).length, 0)
      assert.match(text(h.primary()), /working ·|Creating scene/, 'Old finally must not unlock the new operation')
      assert.equal(JSON.parse(h.data.get(originalKey)).recovery.state, 'pending')
      secondPause.resolve(); await h.finish()
      assert.equal(archive.readArchive(h.storage).length, 1)
      await h.setOwner(firstOwner)
      h.button(recoveryLabel).props.onClick(); await h.finish()
      assert.equal(first.posts().length, 1); assert.equal(second.posts().length, 1)
      assert.equal(JSON.parse(h.data.get(originalKey)).recovery.state, 'completed')
    } finally { firstPause.resolve(); secondPause.resolve(); h.close() }
  })

  test(`${name}: account change before asynchronous allocation prevents any POST`, async () => {
    const t = transport(), h = await harness(name, t)
    try {
      h.primary().props.onClick(); await h.setOwner(secondOwner); await pauseFor(10); await h.settle()
      assert.equal(t.posts().length, 0); assert.equal(h.data.size, 0)
    } finally { h.close() }
  })
}

test('P0GameLab: Luna/Sol reference controls cannot send an unsupported paid request', async () => {
  const t = transport(), h = await harness('P0GameLab', t)
  try {
    h.node(n => n.type === 'input' && n.props.accept === 'image/png,image/jpeg,image/webp').props.onChange({ target: { files: [{ type: 'image/png', size: 12 }] } })
    h.readers[0].result = 'data:image/png;base64,iVBORw0KGgo='; h.readers[0].onload(); await h.settle()
    assert.equal(h.primary().props.disabled, true); assert.match(h.text(), /Luna and Sol world blueprints use text only/)
    h.primary().props.onClick(); await h.finish()
    assert.equal(t.posts().length, 0); assert.equal(h.data.size, 0); assert.match(h.text(), /detailed reference model/)
  } finally { h.close() }
})

for (const name of forms) {
  test(`${name}: changing account clears completed private result and form inputs without deleting archives`, async () => {
    const t = transport(), h = await harness(name, t, { accessRequired: true })
    try {
      h.node(n => n.type === 'textarea').props.onChange({ target: { value: 'Private original lunar workshop instructions' } })
      h.node(n => n.type === 'input' && n.props.type === 'password').props.onChange({ target: { value: 'private-fixture-access-code-1234567890' } })
      await h.settle(); h.primary().props.onClick(); await h.finish()
      assert.equal(t.posts().length, 1); assert.notDeepEqual(h.preview(), blueprint.meadowBlueprint())
      h.node(n => n.type === 'input' && n.props.accept === 'image/png,image/jpeg,image/webp').props.onChange({ target: { files: [{ type: 'image/png', size: 12 }] } })
      h.readers[0].result = 'data:image/png;base64,iVBORw0KGgo='; h.readers[0].onload(); await h.settle()
      assert.ok(h.all().some(n => n.type === 'img' && n.props.src === h.readers[0].result))
      const originalKey = h.recoveryKey(), originalReceipt = h.data.get(originalKey), originalArchive = archive.readArchive(h.storage)
      assert.equal(originalArchive.length, 1)
      await h.setOwner(secondOwner)
      assert.deepEqual(h.preview(), blueprint.meadowBlueprint())
      assert.notEqual(h.node(n => n.type === 'textarea').props.value, 'Private original lunar workshop instructions')
      assert.ok(!h.all().some(n => n.type === 'img' && n.props.className === 'reference-preview'))
      assert.ok(!h.all().some(n => n.type === 'input' && n.props.type === 'password' && n.props.value))
      assert.equal(h.node(n => n.type === 'input' && n.props.accept === 'image/png,image/jpeg,image/webp').key, secondOwner)
      assert.doesNotMatch(h.text(), /LIVE · GENERATED|resp_fixture|Blueprint SHA-256|Generation details|private-fixture-access-code/)
      assert.deepEqual(archive.readArchive(h.storage), originalArchive)
      assert.equal(h.data.get(originalKey), originalReceipt); assert.equal(t.posts().length, 1)
      if (name === 'WorldStudio') assert.equal(text(h.primary()), 'Build demo scene')
      await h.setOwner(firstOwner)
      assert.deepEqual(h.preview(), blueprint.meadowBlueprint()); assert.ok(h.button(recoveryLabel))
      h.button(recoveryLabel).props.onClick(); await h.finish()
      assert.notDeepEqual(h.preview(), blueprint.meadowBlueprint()); assert.equal(t.posts().length, 1)
      assert.deepEqual(archive.readArchive(h.storage), originalArchive)
    } finally { h.close() }
  })
}
