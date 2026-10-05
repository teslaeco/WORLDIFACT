import * as studioPricing from '../src/lib/studioPricing.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { setImmediate as tick } from 'node:timers/promises'
import ts from 'typescript'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import * as blueprint from '../src/lib/blueprint.ts'
import * as request from '../src/lib/blueprintRequest.ts'
import * as scoped from '../src/lib/scopedBlueprintClient.ts'
import * as models from '../src/lib/modelCatalog.ts'
import * as admission from '../src/lib/generationAdmission.ts'
import * as quotes from '../src/lib/generationQuote.ts'
import * as accountReads from '../src/lib/generationAccount.ts'
import * as routing from '../src/lib/portalRouting.ts'

const funded = { credits: 3000, availableCredits: 3000, billingReview: false, generationCosts: { luna: 15, sol: 50, astra: 250 }, subscription: { active: true, plan: 'pro' }, free: { fastRemaining: 1 }, generationAdmission: { luna: { allowed: true }, sol: { allowed: true }, astra: { allowed: true } } }
const blocked = { ...funded, generationAdmission: { luna: { allowed: false, reason: 'PROVIDER_BUDGET_EXHAUSTED' }, sol: { allowed: false, reason: 'PROVIDER_BUDGET_EXHAUSTED' }, astra: { allowed: false, reason: 'PROVIDER_BUDGET_EXHAUSTED' } } }
const ready = { generationReady: true, model: 'gpt-6-sol', draftModels: ['sol', 'luna'], qualityModel: 'gpt-6-astra', astraBlueprintReady: true }
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
const text = n => n == null || typeof n === 'boolean' ? '' : Array.isArray(n) ? n.map(text).join('') : React.isValidElement(n) ? text(n.props.children) : String(n)
const nodes = tree => { const values = []; const walk = n => { if (Array.isArray(n)) n.forEach(walk); else if (React.isValidElement(n)) { values.push(n); walk(n.props.children) } }; walk(tree); return values }
const png = 'data:image/png;base64,' + Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]).toString('base64')
const file = (name = 'reference.png', dataUrl = png) => ({ name, type: 'image/png', size: 12, dataUrl })
const posts = h => h.calls.filter(c => c.method === 'POST')
async function verified(seed, payload) {
  const world = blueprint.demoBlueprint(payload.prompt)
  world.title = `${payload.model.toUpperCase()} fixture result`
  return { mode: 'LIVE', provenance: 'GENERATED', blueprint: world, assetSpec: blueprint.assetSpecForBlueprint(world), model: models.MODEL_CATALOG[payload.model].model,
    requestId: await request.blueprintRequestId(seed), limitation: 'Inert transport fixture; no paid or provider call.',
    evidence: { providerResponseId: 'resp_portal_fixture', receivedAt: '2026-10-02T00:00:00.000Z', blueprintSha256: await request.blueprintFingerprint(world), inputTokens: null, outputTokens: null, totalTokens: null },
    delivery: { kind: payload.deliverable, referenceCount: payload.references.length, fallbackUsed: false } }
}
function transport({ lose = false, reject = false, pending, recoveryPending } = {}) {
  const results = new Map()
  return async (path, init, owner) => {
    if (init.method === 'POST') {
      const seed = new Headers(init.headers).get('X-WORLDIFACT-Request'), payload = JSON.parse(init.body)
      assert.match(seed, /^[a-f0-9-]{36}$/)
      assert.equal(payload.image, undefined)
      request.blueprintReferences(payload)
      const result = await verified(seed, payload)
      results.set(seed, { owner, result })
      if (pending) await pending.promise
      if (lose) throw new TypeError('Response lost after server completion')
      return reject ? Response.json({ noCharge: true, failureCode: 'PROVIDER_BUDGET_EXHAUSTED' }, { status: 503 }) : Response.json(result)
    }
    if (recoveryPending) await recoveryPending.promise
    const found = results.get(path.split('/').at(-1))
    return found?.owner === owner ? Response.json({ state: 'completed', result: found.result }) : Response.json({ error: 'Not found' }, { status: 404 })
  }
}

// Actual component, effects, event handlers, cost hook and durable request
// clients; deterministic HTTP/storage/timer/file adapters. No DOM/WebGL or
// browser/provider calls are exercised by these lifecycle tests.
async function harness({ store = new Map(), io = transport(), accountRead, health = ready, initialOwner = 'owner-a', fileDeferred = false, confirm = () => true, storageWrite, initialWorld = 'chess-cube-512-ai' } = {}) {
  const slots = [], effects = [], calls = [], timers = new Map(), readers = [], events = new EventTarget()
  let cursor = 0, dirty = true, tree, serial = 0, owner = initialOwner, accountLoading = false, worldId = initialWorld, closed = false
  const react = { ...React,
    useState(initial) { const i = cursor++; if (!slots[i]) slots[i] = { value: typeof initial === 'function' ? initial() : initial }; return [slots[i].value, action => { const next = typeof action === 'function' ? action(slots[i].value) : action; if (!Object.is(next, slots[i].value)) { slots[i].value = next; dirty = true } }] },
    useRef(initial) { const i = cursor++; if (!slots[i]) slots[i] = { ref: { current: initial } }; return slots[i].ref },
    useMemo(create, deps) { const i = cursor++, old = slots[i]; if (!old || deps.some((v,j) => !Object.is(v, old.deps?.[j]))) slots[i] = { value: create(), deps }; return slots[i].value },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps) },
    useEffect(fn, deps) { const i = cursor++, old = slots[i]; if (!old || !deps || deps.some((v,j) => !Object.is(v, old.deps?.[j]))) { const next = { deps, cleanup: old?.cleanup }; slots[i] = next; effects.push(() => { next.cleanup?.(); next.cleanup = fn() }) } },
  }
  const fetcher = async (path, init = {}) => {
    calls.push({ path, method: init.method || 'GET', body: init.body, headers: new Headers(init.headers), owner, signal: init.signal })
    if (path === '/api/health') return Response.json(health)
    if (path === '/api/account/entitlements') return accountRead ? accountRead(owner, init) : Response.json(funded)
    assert.ok(!['/api/studio/reconcile-budget', '/api/billing/recovery'].includes(path), 'Availability must never invoke financial recovery')
    if (path === '/api/billing/status') return Response.json({ plans: { pro: { checkoutReady: true }, studio: { checkoutReady: true } } })
    assert.match(path, /^\/api\/blueprint(?:\/requests\/[a-f0-9-]+)?$/)
    return io(path, init, owner)
  }
  const timeout = (fn, delay) => { const id = ++serial; timers.set(id, { fn, delay }); return id }
  const globals = { fetch: fetcher, Headers, AbortController, AbortSignal, Event, Error, console,
    document: Object.assign(new EventTarget(), { visibilityState: 'visible' }),
    window: Object.assign(events, { setTimeout: timeout, clearTimeout: id => timers.delete(id), confirm, localStorage: {
      getItem: key => store.get(key) ?? null, setItem: (key,value) => { if (storageWrite) storageWrite(); store.set(key,value) }, removeItem: key => store.delete(key),
    } }),
    FileReader: class {
      constructor() { readers.push(this) }
      readAsDataURL(value) { this.finish = () => { this.result = value.dataUrl; this.onload?.() }; if (!fileDeferred) queueMicrotask(this.finish) }
      abort() { this.onabort?.() }
    },
  }
  const modules = { '../lib/studioPricing': studioPricing, '../lib/blueprint': blueprint, '../lib/blueprintRequest': request, '../lib/scopedBlueprintClient': scoped, '../lib/generationAdmission': admission, '../lib/modelCatalog': models, '../lib/portalRouting': routing,
    '../lib/account': { useAccount: () => ({ user: owner ? { id: owner } : null, loading: accountLoading }) },
    './account': { useAccount: () => ({ user: owner ? { id: owner } : null, loading: accountLoading }) }, './generationAccount': accountReads, './generationQuote': quotes,
  }
  async function load(path) {
    const url = new URL(path, import.meta.url), module = { exports: {} }, localRequire = createRequire(url)
    const source = await readFile(url, 'utf8'), code = ts.transpileModule(source, { fileName: url.pathname, compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText
    runInNewContext(code, { ...globals, module, exports: module.exports, require(id) {
      if (id in modules) return modules[id]
      if (id === 'react') return react
      if (id === 'react/jsx-runtime') return localRequire(id)
      if (id === 'react-router-dom') return { ...localRequire(id), useNavigate: () => () => {} }
      if (id === './StartingWorld') return { __esModule: true, default: () => null }
      if (id.endsWith('.css')) return {}
      throw new Error('Unexpected portal dependency ' + id)
    } }, { filename: url.pathname, timeout: 1000 })
    return module.exports
  }
  modules['../lib/useGenerationQuote'] = await load('../src/lib/useGenerationQuote.ts')
  modules['./GenerationCostNotice'] = await load('../src/components/GenerationCostNotice.tsx')
  const Component = (await load('../src/components/PortalAstraGenerator.tsx')).default
  const settle = async () => { for (let i = 0; i < 32; i++) { if (dirty && !closed) { dirty = false; cursor = 0; tree = Component({ worldId, title: 'Fixture portal' }) } while (effects.length) effects.shift()(); await tick() } }
  const node = predicate => { const found = nodes(tree).find(predicate); assert.ok(found, 'Expected portal control'); return found }
  const button = label => node(n => n.type === 'button' && text(n).includes(label))
  await settle()
  return { store, calls, readers, timers, settle, node, button, events,
    all: () => nodes(tree), text: () => text(tree), quote: () => node(n => !!n.props.accountQuote).props.accountQuote,
    quoteMarkup: () => renderToStaticMarkup(React.createElement(MemoryRouter, null, node(n => !!n.props.accountQuote))),
    canvas: () => node(n => !!n.props.activePortalId),
    primary: () => node(n => n.props.className === 'primary'),
    model: () => node(n => n.props['aria-label'] === 'Generation model'),
    async select(model) { node(n => n.props['aria-label'] === 'Generation model').props.onChange({ target: { value: model } }); await settle() },
    async files(values, phone = false) { node(n => n.type === 'input' && n.props.type === 'file' && (phone ? n.props.capture === 'environment' : !!n.props.multiple)).props.onChange({ target: { files: values, value: 'selected' } }); await settle() },
    async setOwner(next) { owner = next; dirty = true; await settle() },
    async route(next) { worldId = next; dirty = true; await settle() },
    async loading(value) { accountLoading = value; dirty = true; await settle() },
    async refreshBalance() { events.dispatchEvent(new Event('worldifact:balance-changed')); await settle() },
    async waitPosts(count) {
      const deadline = Date.now() + 10_000
      while (Date.now() < deadline) {
        await settle()
        if (calls.filter(call => call.method === 'POST').length === count) return
      }
      assert.fail('Expected inert POST was not reached; WebCrypto preparation did not finish')
    },
    async waitDone() {
      // WebCrypto can finish after many immediate ticks when the full suite is
      // busy. Bound elapsed time, rather than racing a fixed tick count.
      const deadline = performance.now() + 10_000
      while (performance.now() < deadline) {
        await settle()
        if (!nodes(tree).some(n => n.type === 'button' && text(n) === 'Stop waiting')) return
      }
      assert.fail('Fixture operation did not settle within 10 seconds')
    },
    close() { closed = true; for (const slot of slots) slot?.cleanup?.(); timers.clear() },
  }
}

test('each portal defaults to SOL and quotes the exact explicitly selected model in a single UUID POST', async () => {
  for (const worldId of ['chess-cube-512-ai', 'terra-fix-iss', '8-planets-in-8-days']) {
    for (const model of ['sol', 'luna', 'astra']) {
      const h = await harness({ initialWorld: worldId })
      try {
        assert.equal(h.model().props.value, 'sol'); await h.select(model)
        assert.equal(h.quote().quote.points, models.MODEL_CATALOG[model].creditsPerGeneration)
        assert.match(h.quoteMarkup(), new RegExp(`Next generation: ${models.MODEL_CATALOG[model].creditsPerGeneration} points`))
        assert.equal(h.calls.filter(c => c.path === '/api/account/entitlements').length, 1, 'The notice and button share one snapshot')
        assert.equal(h.primary().props.disabled, false)
        const click = h.primary().props.onClick; click(); click(); await h.waitDone()
        assert.equal(posts(h).length, 1)
        const sent = JSON.parse(posts(h)[0].body)
        assert.equal(sent.model, model); assert.equal(sent.worldId, worldId); assert.equal(sent.deliverable, 'procedural-blueprint'); assert.deepEqual(sent.references, [])
        assert.equal(h.store.size, 1); assert.equal(JSON.parse([...h.store.values()][0]).recovery.id, posts(h)[0].headers.get('X-WORLDIFACT-Request'))
        assert.match(h.text(), new RegExp('LIVE · GENERATED · gpt-6-' + model))
      } finally { h.close() }
    }
  }
})

test('health readiness and signed-in verified funding independently gate forced generation', async () => {
  for (const settings of [ { accountRead: () => Response.json(blocked) }, { accountRead: () => Response.json({ credits: 3000 }) }, { accountRead: () => Response.json({}, { status: 401 }) }, { initialOwner: null }, { health: { ...ready, model: 'gpt-6-astra' } }, { health: {} } ]) {
    const h = await harness(settings)
    try { assert.equal(h.primary().props.disabled, h.quote().quote.reason !== 'PROVIDER_BUDGET_EXHAUSTED'); h.primary().props.onClick(); await h.settle(); assert.equal(posts(h).length, 0) } finally { h.close() }
  }
  for (const health of [{ ...ready, astraBlueprintReady: false }, { ...ready, qualityModel: 'gpt-6-sol' }]) {
    const h = await harness({ health })
    try { await h.select('astra'); assert.equal(h.primary().props.disabled, true); h.primary().props.onClick(); await h.settle(); assert.equal(posts(h).length, 0); assert.equal(h.model().props.value, 'astra') } finally { h.close() }
  }
})

test('late old-account quote and a pending refresh cannot enable a new paid request', async () => {
  const a = deferred(), b = deferred(), h = await harness({ accountRead: owner => owner === 'owner-a' ? a.promise : b.promise })
  try {
    await h.setOwner('owner-b'); assert.equal(h.primary().props.disabled, true)
    b.resolve(Response.json(blocked)); await h.settle(); a.resolve(Response.json(funded)); await h.settle()
    assert.equal(h.quote().quote.state, 'blocked'); h.primary().props.onClick(); await h.settle(); assert.equal(posts(h).length, 0)
  } finally { h.close() }
  let reads = 0; const refresh = deferred(), r = await harness({ accountRead: () => ++reads === 1 ? Response.json(funded) : refresh.promise })
  try { await r.refreshBalance(); assert.equal(r.primary().props.disabled, true); r.primary().props.onClick(); refresh.resolve(Response.json(blocked)); await r.settle(); assert.equal(posts(r).length, 0) } finally { r.close() }
})

test('every Astra file and phone reference is retained; reading and rejected batches block generation', async () => {
  const h = await harness({ fileDeferred: true })
  try {
    assert.ok(h.all().filter(n => n.type === 'input' && n.props.type === 'file').every(n => n.props.disabled))
    await h.select('astra'); await h.files([file('front.png'), file('side.png')])
    assert.equal(h.primary().props.disabled, true); h.primary().props.onClick(); assert.equal(posts(h).length, 0)
    h.readers.forEach(r => r.finish()); await h.settle(); assert.equal(h.all().filter(n => n.type === 'img').length, 2)
    await h.files([file('phone.png')], true); h.readers.at(-1).finish(); await h.settle()
    await h.select('sol'); assert.equal(h.model().props.value, 'astra'); assert.equal(h.primary().props.disabled, true)
    h.button('Keep only accepted references').props.onClick(); await h.settle()
    h.primary().props.onClick(); await h.waitDone()
    assert.equal(posts(h).length, 1); const payload = JSON.parse(posts(h)[0].body)
    assert.equal(payload.model, 'astra'); assert.deepEqual(payload.references, [1,2,3].map(() => ({ dataUrl: png, view: 'other' })))
    assert.equal(payload.image, undefined); assert.equal(payload.deliverable, 'procedural-blueprint')
    assert.doesNotMatch([...h.store.values()].join(''), /data:image|playable|arena/)
  } finally { h.close() }
})

test('invalid, oversized and excess references fail before POST without dropping accepted images', async () => {
  for (const values of [[{ ...file(), size: 6 * 1024 * 1024 + 1 }], [file('fake.png', 'data:image/png;base64,ZmFrZQ==')], Array.from({ length: 6 }, () => file())]) {
    const h = await harness()
    try {
      await h.select('astra'); await h.files([file()]); await h.files(values)
      assert.equal(h.all().filter(n => n.type === 'img').length, 1)
      assert.equal(h.primary().props.disabled, true); h.primary().props.onClick(); await h.settle(); assert.equal(posts(h).length, 0)
    } finally { h.close() }
  }
})

test('combined reference limits reject before allocating file readers and retain accepted images', async () => {
  const h = await harness()
  try {
    await h.select('astra')
    await h.files([{ ...file(), size: 4 * 1024 * 1024 }, { ...file(), size: 4 * 1024 * 1024 }])
    assert.equal(h.readers.length, 0); assert.equal(h.primary().props.disabled, true)
    h.button('Keep only accepted references').props.onClick(); await h.settle()
    await h.files([file()]); assert.equal(h.readers.length, 1)
    await h.files([{ ...file(), size: 6 * 1024 * 1024 }])
    assert.equal(h.readers.length, 1, 'Previously accepted bytes count toward the same limit')
    assert.equal(h.all().filter(n => n.type === 'img').length, 1)
    assert.equal(h.primary().props.disabled, true); assert.equal(posts(h).length, 0)
  } finally { h.close() }
})

test('paid failure keeps the existing preview and never silently generates DEMO', async () => {
  const h = await harness({ io: transport({ reject: true }) })
  try {
    h.button('Generate DEMO').props.onClick(); await h.settle()
    const previous = h.canvas().props.blueprint
    h.primary().props.onClick(); await h.waitDone()
    assert.equal(h.canvas().props.blueprint, previous); assert.match(h.text(), /Previous preview preserved/); assert.match(h.text(), /unreserved API funding/)
    assert.equal(posts(h).length, 1); assert.equal(JSON.parse([...h.store.values()][0]).recovery.state, 'failed')
  } finally { h.close() }
  const empty = await harness({ io: transport({ reject: true }) })
  try { empty.primary().props.onClick(); await empty.waitDone(); assert.equal(empty.all().some(n => n.props['data-testid'] === 'portal-result'), false); assert.match(empty.text(), /LOCAL STARTER PREVIEW/); assert.doesNotMatch(empty.text(), /DEMO · MOCK/) } finally { empty.close() }
})

test('lost POST response survives reload; read-only recovery stays enabled while new funding is blocked', async () => {
  const io = transport({ lose: true }), h = await harness({ io }); let reload
  try {
    h.primary().props.onClick(); await h.waitDone(); assert.equal(posts(h).length, 1)
    const raw = [...h.store.values()][0], saved = JSON.parse(raw).recovery
    assert.equal(saved.state, 'pending'); assert.equal(h.primary().props.disabled, true)
    assert.ok(!h.all().some(n => n.type === 'button' && text(n).includes('Prepare new paid attempt')))
    h.close(); reload = await harness({ store: h.store, io, accountRead: () => Response.json(blocked) })
    assert.equal(reload.calls.filter(c => c.path.startsWith('/api/blueprint')).length, 0)
    assert.equal(reload.primary().props.disabled, false); assert.match(text(reload.primary()), /Check generation funding/); assert.equal(reload.button('Recover same request').props.disabled, false)
    const recover = reload.button('Recover same request').props.onClick; recover(); recover(); await reload.waitDone()
    assert.equal(posts(reload).length, 0); assert.equal(reload.calls.filter(c => c.path.startsWith('/api/blueprint/requests/')).length, 1)
    assert.equal(JSON.parse([...reload.store.values()][0]).recovery.id, saved.id); assert.match(reload.text(), /LIVE · GENERATED · gpt-6-sol/)
    reload.button('Recover same request').props.onClick(); await reload.waitDone(); assert.equal(posts(reload).length, 0)
  } finally { h.close(); reload?.close() }
})

test('terminal reset requires confirmation, preserves the result and never itself pays', async () => {
  let allow = false; const confirmations = [], h = await harness({ confirm: message => { confirmations.push(message); return allow } })
  try {
    h.primary().props.onClick(); await h.waitDone(); const previous = h.canvas().props.blueprint, old = [...h.store.values()][0]
    h.button('Prepare new paid attempt').props.onClick(); await h.settle(); assert.equal([...h.store.values()][0], old)
    allow = true; h.button('Prepare new paid attempt').props.onClick(); await h.settle()
    assert.equal(confirmations.length, 2); assert.equal(h.store.size, 0); assert.equal(posts(h).length, 1); assert.equal(h.canvas().props.blueprint, previous); assert.match(h.text(), /Previous preview preserved/)
    h.primary().props.onClick(); await h.waitDone(); assert.equal(posts(h).length, 2)
    assert.notEqual(posts(h)[0].headers.get('X-WORLDIFACT-Request'), posts(h)[1].headers.get('X-WORLDIFACT-Request'))
  } finally { h.close() }
})

test('old owner, route and unmounted completions cannot replace the new preview or release its operation', async () => {
  for (const change of ['owner', 'route', 'unmount']) {
    const first = deferred(), second = deferred(), one = transport({ pending: first }), two = transport({ pending: second })
    let calls = 0
    const h = await harness({ io: (...args) => (++calls === 1 ? one : two)(...args) })
    try {
      h.primary().props.onClick(); await h.waitPosts(1); const old = [...h.store.values()][0]
      if (change === 'owner') await h.setOwner('owner-b')
      else if (change === 'route') await h.route('terra-fix-iss')
      else h.close()
      if (change !== 'unmount') { h.primary().props.onClick(); await h.waitPosts(2) }
      first.resolve(); await h.settle()
      assert.equal(JSON.parse(h.store.get([...h.store.keys()][0])).recovery.state, 'pending')
      assert.equal(h.all().some(n => n.props['data-testid'] === 'portal-result'), false)
      if (change !== 'unmount') {
        assert.equal(h.primary().props.disabled, true); assert.ok(h.button('Stop waiting'))
        second.resolve(); await h.waitDone(); assert.match(h.text(), /LIVE · GENERATED/)
        assert.equal(posts(h).length, 2); assert.notEqual([...h.store.values()][1], old)
      } else assert.equal(posts(h).length, 1)
    } finally { first.resolve(); second.resolve(); h.close() }
  }
})

test('late file completion and retained old handlers cannot affect another owner or portal', async () => {
  for (const change of ['owner', 'route', 'unmount']) {
    const h = await harness({ fileDeferred: true })
    try {
      await h.select('astra'); await h.files([file()]); const late = h.readers[0]
      if (change === 'owner') await h.setOwner('owner-b')
      else if (change === 'route') await h.route('terra-fix-iss')
      else h.close()
      late.finish(); await h.settle(); assert.equal(h.all().filter(n => n.type === 'img').length, 0); assert.equal(posts(h).length, 0)
      if (change !== 'unmount') assert.equal(h.model().props.value, 'sol')
    } finally { h.close() }
  }
})

test('unavailable durable storage fails closed before generation and keeps the local scene', async () => {
  const h = await harness({ storageWrite: () => { throw new Error('Storage unavailable') } })
  try { const before = h.canvas().props.blueprint; h.primary().props.onClick(); await h.waitDone(); assert.equal(posts(h).length, 0); assert.equal(h.canvas().props.blueprint, before); assert.match(h.text(), /Storage unavailable/) } finally { h.close() }
})

test('portal initial funding denial uses only current GET evidence without historical recovery', async () => {
  const h = await harness({ accountRead: () => Response.json(blocked) })
  try {
    assert.equal(h.quote().quote.reason, 'PROVIDER_BUDGET_EXHAUSTED')
    assert.equal(h.calls.filter(c => c.path === '/api/account/entitlements').length, 1)
    assert.equal(h.calls.filter(c => c.method !== 'GET').length, 0)
  } finally { h.close() }
})

test('blocked portal refresh reads current admission and requires another explicit click to generate', async () => {
  let available = false
  const h = await harness({ accountRead: () => Response.json(available ? funded : blocked) })
  try {
    assert.equal(h.primary().props.disabled, false)
    assert.match(text(h.primary()), /Check generation funding · no charge/)
    h.primary().props.onClick(); await h.settle()
    assert.equal(h.quote().quote.reason, 'PROVIDER_BUDGET_EXHAUSTED')
    available = true
    h.primary().props.onClick(); await h.settle()
    assert.equal(h.quote().quote.state, 'credits')
    assert.match(text(h.primary()), /Generate GPT-6 Sol blueprint/)
    assert.equal(h.calls.filter(c => c.path === '/api/account/entitlements').length, 3)
    assert.equal(h.calls.filter(c => c.method !== 'GET').length, 0)
  } finally { h.close() }
})
