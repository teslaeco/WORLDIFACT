import * as studioPricing from '../src/lib/studioPricing.ts'
import * as studioTierSelection from '../src/lib/studioTierSelection.ts'
import * as detailedStudio from '../src/lib/detailedStudio.ts'
import * as studioClient from '../src/lib/studioClient.ts'
import { quoteGeneration } from '../src/lib/generationQuote.ts'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { setImmediate as nextTick } from 'node:timers/promises'
import React from 'react'
import ts from 'typescript'

const sourceUrl = new URL('../src/components/WorldCharacterStudio.tsx', import.meta.url)
const localRequire = createRequire(sourceUrl)
const source = await readFile(sourceUrl, 'utf8')
const compiled = ts.transpileModule(source, { fileName: sourceUrl.pathname,
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText

// Actual component effects and timers, with inert API/asset adapters. This does
// not render WebGL or make a paid call, and does not stand in for model quality.
async function harness(readStatus, { withExistingJob = true, ready = false, quoteOverride = null, realClient = false } = {}) {
  const slots = [], effects = [], timers = new Map(), delays = []
  let tree, dirty = true, cursor = 0, serial = 0, polls = 0, posts = 0, loads = 0, adopted = 0, elapsed = 0, refreshes = 0
  const submitted = [], runtime = { ready, detailedReady: ready, tiersReady: ready, photoReady: true, pricingRevision: studioPricing.STUDIO_PRICING_REVISION }
  const id = '12345678-1234-4234-8234-123456789abc'
  const record = { receipt: { id, ticket: `${id}.${Date.now()}.${'a'.repeat(64)}.${'b'.repeat(64)}`, createdAt: new Date().toISOString() },
    prompt: 'Synthetic adult character', startedAt: new Date().toISOString() }
  const savedKey = `worldifact-character:v2:fixture-owner:fixture-world:${studioClient.STUDIO_RECEIPT_KEY}`
  const storeData = new Map(withExistingJob ? [[savedKey, JSON.stringify(record)]] : [])
  const storage = { getItem: key => storeData.get(key) ?? null, setItem: (key, value) => storeData.set(key, value), removeItem: key => storeData.delete(key) }
  const calls = []
  const fetcher = async (url, init = {}) => {
    const path = String(url), method = init.method || 'GET'
    calls.push({ path, method })
    if (method === 'POST') posts++
    assert.equal(method, 'GET', 'Character recovery cannot perform a write')
    assert.equal(new Headers(init.headers).get('X-WORLDIFACT-Job'), record.receipt.ticket)
    if (path === `/api/studio/jobs/${id}/model`) { loads++; return new Response('Synthetic bytes; geometry is not under test') }
    assert.equal(path, `/api/studio/jobs/${id}`, 'Recovery must use the original receipt and no accounting endpoint')
    polls++
    return Response.json({ job: { id, ...await readStatus(polls, elapsed) } })
  }
  const react = { ...React,
    useRef(initial) { const index = cursor++; if (!slots[index]) slots[index] = { ref: { current: initial } }; return slots[index].ref },
    useState(initial) {
      const index = cursor++; if (!slots[index]) slots[index] = { value: typeof initial === 'function' ? initial() : initial }
      return [slots[index].value, update => { const next = typeof update === 'function' ? update(slots[index].value) : update
        if (!Object.is(next, slots[index].value)) { slots[index].value = next; dirty = true } }]
    },
    useMemo(create, deps) { const index = cursor++, prior = slots[index]; if (!prior || deps.some((v,i) => !Object.is(v,prior.deps?.[i]))) slots[index] = { value: create(), deps }; return slots[index].value },
    useEffect(callback, deps) {
      const index = cursor++, prior = slots[index]
      if (!prior || !deps || deps.some((value, i) => !Object.is(value, prior.deps?.[i]))) {
        const next = { deps, cleanup: prior?.cleanup }; slots[index] = next
        effects.push(() => { next.cleanup?.(); next.cleanup = callback() })
      }
    },
  }
  const module = { exports: {} }
  runInNewContext(compiled, { module, exports: module.exports, console, AbortSignal,
    fetch: async () => Response.json({}),
    setTimeout(callback, delay) { delays.push(delay); const id = ++serial; timers.set(id, { callback, delay }); return id },
    clearTimeout: id => timers.delete(id),
    window: { localStorage: storage },
    require(id) {
      if (id === 'react') return react
      if (id === 'react/jsx-runtime') return localRequire(id)
      if (id === '../lib/studioClient' && realClient) return { ...studioClient, checkStudio: async () => ({ ...runtime }),
        StudioCoordinator: class extends studioClient.StudioCoordinator { constructor(store) { super(store, fetcher) } } }
      if (id === '../lib/studioClient') return { checkStudio: async () => ({ ...runtime }), StudioCoordinator: class {
        restore() { return withExistingJob ? record : null }
        async poll() { polls++; return { id: record.receipt.id, detail: 'Synthetic status', ...await readStatus(polls, elapsed) } }
        async start(input, onPrepared) { posts++; submitted.push(input); onPrepared({ ...record, ...(input.budgetTier ? { pricing: studioPricing.STUDIO_PRICING[input.budgetTier] } : {}) }); return { id: record.receipt.id, state: 'building' } }
        async artifact() { loads++; return new Blob(['Synthetic bytes; geometry is not under test']) }
      } }
      if (id === '../lib/studioProtocol') return { validateStudioInput: value => value, STUDIO_POLL_MS: 25_000 }
      if (id === '../lib/studioArchive') return { saveStudioModel: async () => {} }
      if (id === '../lib/privateWorldAssets') return { listWorldAssets: async () => [], storeWorldAsset: async () => ({ id: 'fixture-asset' }) }
      if (id === '../lib/editorTools') return { characterGenerationPrompt: world => world.character.description || 'Synthetic adult character' }
      if (id === '../lib/studioPricing') return studioPricing
      if (id === '../lib/studioTierSelection') return studioTierSelection
      if (id === '../lib/detailedStudio') return detailedStudio
      if (id === '../lib/useGenerationQuote') return { useGenerationQuote: (model, busy, detailed, tier) => ({ checking: busy, canRefresh: !busy, refresh() { refreshes++ }, quote: quoteOverride || (ready ? quoteGeneration(model, { credits: 3000, availableCredits: 3000, generationCosts: { sol: 50, astra: 250 }, billingReview: false, subscription: { active: true, plan: 'pro' }, studioAdmission: { tiers: Object.fromEntries(Object.entries(studioPricing.STUDIO_PRICING).map(([tier, pricing]) => [tier, { allowed: true, pricing }])) } }, { plans: { pro: { checkoutReady: true } } }, true, detailed, tier) : { state: 'pending' }) }) }
      if (id === '../lib/generationQuote') return { quoteGeneration: () => ({ state: 'pending' }) }
      if (id === './GenerationCostNotice') return { __esModule: true, default: () => null }
      throw new Error(`Unexpected component dependency: ${id}`)
    },
  }, { filename: sourceUrl.pathname, timeout: 1000 })
  const props = { owner: 'fixture-owner', world: { id: 'fixture-world', name: 'Fixture', character: {} }, disabled: false,
    onReady() { adopted++ }, onSetAsset() {}, onFocus() {} }
  const settle = async () => {
    for (let index = 0; index < 12; index++) {
      if (dirty) { dirty = false; cursor = 0; tree = module.exports.default(props) }
      while (effects.length) effects.shift()()
      await nextTick()
    }
  }
  await settle()
  return {
    delays, timers, submitted, runtime, calls, record, storeData, savedKey, refreshes: () => refreshes, async quote(value) { quoteOverride = value; dirty = true; await settle() }, tree: () => tree, async edit(description) { props.world = { ...props.world, character: { ...props.world.character, description } }; dirty = true; await settle() }, counts: () => ({ polls, posts, loads, adopted }), settle,
    async poll() { const next = timers.entries().next().value; assert.ok(next, 'Same-job recovery should be scheduled')
      timers.delete(next[0]); elapsed += next[1].delay; await next[1].callback(); await settle() },
    close() { for (const slot of slots) slot?.cleanup?.(); timers.clear() },
  }
}

test('character status survives repeated GET errors and later imports the same successful model once', async () => {
  const h = await harness(count => { if (count <= 6) throw new Error('Synthetic interrupted GET'); return { state: 'succeeded', downloadAllowed: true } })
  try {
    for (let index = 0; index < 7; index++) await h.poll()
    assert.deepEqual(h.delays, [800, 10_000, 20_000, 40_000, 80_000, 120_000, 120_000])
    assert.deepEqual(h.counts(), { polls: 7, posts: 0, loads: 1, adopted: 1 })
    assert.equal(h.timers.size, 0)
  } finally { h.close() }
})

test('long character jobs keep bounded GET polling past the former twelve-minute ceiling', async () => {
  const h = await harness(() => ({ state: 'building' }))
  try {
    for (let index = 0; index < 170; index++) await h.poll()
    assert.equal(h.timers.size, 1); assert.equal(h.delays.at(-1), 25_000)
    assert.deepEqual(h.counts(), { polls: 170, posts: 0, loads: 0, adopted: 0 })
  } finally { h.close() }
})

test('normal character polling stays within the production three-reads-per-minute limit', async () => {
  const recent = []; let rejected = 0
  const h = await harness((_count, elapsed) => {
    while (recent.length && recent[0] <= elapsed - 60_000) recent.shift()
    recent.push(elapsed)
    if (recent.length > 3) { rejected++; throw new Error('Synthetic production-limit 429') }
    return { state: 'building' }
  })
  try {
    for (let index = 0; index < 40; index++) await h.poll()
    assert.equal(rejected, 0)
    assert.equal(h.counts().polls, 40); assert.equal(h.counts().posts, 0); assert.equal(h.timers.size, 1)
  } finally { h.close() }
})

test('reconciliation keeps slow GET recovery without downloading an unapproved result', async () => {
  const h = await harness(count => count === 1 ? { state: 'succeeded', reconciliationRequired: true, downloadAllowed: false } : { state: 'building' })
  try {
    await h.poll(); assert.equal(h.delays.at(-1), 60_000); assert.equal(h.counts().loads, 0)
    await h.poll(); assert.equal(h.delays.at(-1), 25_000)
    assert.equal(h.timers.size, 1); assert.equal(h.counts().posts, 0)
  } finally { h.close() }
})

for (const state of ['succeeded', 'failed', 'cancelled', 'building']) test(`actual ${state} response keeps character reconciliation on the same receipt`, async () => {
  const h = await harness(count => count <= 2
    ? { state, failureCode: 'ORACLE_JOB_FAILED', reconciliationRequired: true, downloadAllowed: false }
    : { state: 'building', reconciliationRequired: false, downloadAllowed: false }, { realClient: true })
  try {
    const saved = h.storeData.get(h.savedKey)
    await h.poll(); await h.poll()
    assert.deepEqual(h.delays, [800, 60_000, 60_000])
    assert.equal(h.timers.size, 1)
    assert.deepEqual(h.counts(), { polls: 2, posts: 0, loads: 0, adopted: 0 })
    await h.poll()
    assert.equal(h.delays.at(-1), 25_000, 'Clearing reconciliation returns to ordinary GET recovery')
    assert.deepEqual(h.calls, Array.from({ length: 3 }, () => ({ path: `/api/studio/jobs/${h.record.receipt.id}`, method: 'GET' })))
    assert.equal(h.storeData.get(h.savedKey), saved)
    assert.deepEqual(h.counts(), { polls: 3, posts: 0, loads: 0, adopted: 0 })
  } finally { h.close() }
})

for (const state of ['failed', 'cancelled']) test(`a terminal ${state} character keeps its receipt without retrying generation`, async () => {
  const h = await harness(() => ({ state }))
  try { await h.poll(); assert.equal(h.timers.size, 0); assert.deepEqual(h.counts(), { polls: 1, posts: 0, loads: 0, adopted: 0 }) }
  finally { h.close() }
})

test('closing while a status GET is pending prevents stale import and another timer', async () => {
  let resolve
  const waiting = new Promise(done => { resolve = done })
  const h = await harness(() => waiting)
  const poll = h.poll(); h.close(); resolve({ state: 'succeeded', downloadAllowed: true }); await poll
  assert.equal(h.timers.size, 0); assert.deepEqual(h.counts(), { polls: 1, posts: 0, loads: 0, adopted: 0 })
})

test('character extended budget requires explicit consent for the current description and never upgrades itself', async () => {
  const h = await harness(() => ({ state: 'building' }), { withExistingJob: false, ready: true })
  const nodes = () => { const result = []; const walk = n => { if (Array.isArray(n)) n.forEach(walk); else if (React.isValidElement(n)) { result.push(n); walk(n.props.children) } }; walk(h.tree()); return result }
  const byId = id => { const node = nodes().find(n => n.props.id === id); assert.ok(node); return node }
  const generate = () => { const node = nodes().find(n => n.type === 'button' && n.props.className === 'private-primary'); assert.ok(node); return node }
  try {
    byId('character-budget-tier').props.onChange({ target: { value: 'extended' } }); await h.settle()
    assert.equal(generate().props.disabled, true)
    await generate().props.onClick(); await h.settle()
    assert.equal(h.counts().posts, 0)
    byId('character-budget-consent').props.onChange({ target: { checked: true } }); await h.settle()
    assert.equal(generate().props.disabled, false)
    await h.edit('Synthetic character with a blue coat')
    assert.equal(byId('character-budget-consent').props.checked, false)
    assert.equal(generate().props.disabled, true)
    byId('character-budget-consent').props.onChange({ target: { checked: true } }); await h.settle()
    await generate().props.onClick(); await h.settle()
    assert.equal(h.counts().posts, 1)
    assert.equal(h.submitted[0].prompt, 'Synthetic character with a blue coat')
    assert.equal(h.submitted[0].pricingRevision, studioPricing.STUDIO_PRICING_REVISION)
    assert.equal(h.submitted[0].budgetTier, 'extended'); assert.equal(h.submitted[0].acceptedPoints, 500)
    assert.equal(byId('character-budget-consent').props.checked, false)
  } finally { h.close() }
})

test('blocked character primary action reviews funding only and never automatically generates after eligibility returns', async () => {
  const h = await harness(() => ({ state: 'building' }), { withExistingJob: false, ready: true,
    quoteOverride: { state: 'blocked', points: 250, after: null, reason: 'PROVIDER_BUDGET_EXHAUSTED', message: 'Funding is not available.' } })
  const primary = () => { const result = []; const walk = n => { if (Array.isArray(n)) n.forEach(walk); else if (React.isValidElement(n)) { result.push(n); walk(n.props.children) } }; walk(h.tree()); return result.find(n => n.type === 'button' && n.props.className === 'private-primary') }
  try {
    assert.equal(primary().props.type, 'button')
    assert.equal(primary().props.disabled, false)
    assert.match(primary().props.children, /Check generation funding · no charge/)
    const before = h.refreshes()
    primary().props.onClick(); await h.settle()
    assert.equal(h.refreshes(), before + 1)
    assert.equal(h.counts().posts, 0)
    await h.quote({ state: 'credits', points: 250, after: 2750, message: 'Funding verified.' })
    assert.match(primary().props.children, /Generate character/)
    assert.equal(h.counts().posts, 0)
  } finally { h.close() }
})
