import { STUDIO_PRICING, STUDIO_PRICING_REVISION } from '../src/lib/studioPricing.ts'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setImmediate as nextTick } from 'node:timers/promises'
import React from 'react'
import { loadShopComponent } from './shop-render-helper.mjs'
import * as clientModule from '../src/lib/studioClient.ts'
import { blueprintRequestId } from '../src/lib/blueprintRequest.ts'
import { FAST_DRAFT_PROFILE } from '../src/lib/studioProtocol.ts'
import { ADMISSION_FAILURE_CODES } from '../src/lib/generationAdmission.ts'

const oldId = '12345678-1234-4234-8234-123456789abc'
const newId = '87654321-1234-4234-8234-123456789abc'
const admission = (allowed = true, reason) => ({ allowed, ...(reason ? { reason } : {}), tiers: Object.fromEntries(Object.entries(STUDIO_PRICING).map(([tier, pricing]) => [tier, { allowed, ...(reason ? { reason } : {}), pricing }])) })
const fundedAccount = { credits: 3000, generationCosts: { luna: 15, sol: 50, astra: 250 }, subscription: { active: true, plan: 'pro' }, free: { fastRemaining: 2 }, billingReview: false, generationAdmission: { luna: { allowed: true }, sol: { allowed: true }, astra: { allowed: true } }, studioAdmission: admission() }
const blockedAccount = { ...fundedAccount, generationAdmission: { luna: { allowed: false, reason: 'PROVIDER_BUDGET_EXHAUSTED' }, sol: { allowed: false, reason: 'PROVIDER_BUDGET_EXHAUSTED' }, astra: { allowed: false, reason: 'PROVIDER_BUDGET_EXHAUSTED' } }, studioAdmission: admission(false, 'PROVIDER_BUDGET_EXHAUSTED') }
const syncedMembership = () => Response.json({ state: 'active', activePlan: 'pro', canManage: true, canRetry: false })
const makeReceipt = id => ({ id, createdAt: new Date().toISOString(), ticket: `${id}.${Date.now()}.${'a'.repeat(64)}.${'b'.repeat(64)}` })
const fastGeneration = {
  mode: 'LIVE', provenance: 'GENERATED', requestId: 'req_fast_fixture', model: 'gpt-6-sol',
  limitation: 'Sol generated a validated specification; visible geometry is a procedural draft.',
  blueprint: { version: 1, title: 'Fast rook draft', biome: 'valley', objects: [
    { id: 'fast-rook', name: 'Fast rook', kind: 'sculpture', x: 0, z: 0, scale: 1, rotation: 0, color: '#557799' },
  ] },
  assetSpec: { version: 1, name: 'Fast rook', summary: 'Compact procedural FAST draft.', game: {
    geometry: 'procedural-spec', materialPlan: 'Use a matte blue material.', animationPlan: 'Static draft.', gameplayRole: 'Preview object.',
  }, make: { validationStatus: 'validation-required', dimensionsMm: { x: 100, y: 100, z: 100 }, materialCandidate: 'Unknown until review',
    processCandidate: 'unknown', constraints: ['Validate geometry'] } },
}
function modelBlob() {
  const spec = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }], materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.6, 0.3, 0.1, 1] } }],
    buffers: [{ byteLength: 36 }], bufferViews: [{ buffer: 0, byteLength: 36 }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] }] }
  const json = new TextEncoder().encode(JSON.stringify(spec)), padded = Math.ceil(json.length / 4) * 4
  const bytes = new Uint8Array(28 + padded + 36), v = new DataView(bytes.buffer)
  v.setUint32(0, 0x46546c67, true); v.setUint32(4, 2, true); v.setUint32(8, bytes.length, true)
  v.setUint32(12, padded, true); v.setUint32(16, 0x4e4f534a, true)
  bytes.fill(32, 20, 20 + padded); bytes.set(json, 20)
  v.setUint32(20 + padded, 36, true); v.setUint32(24 + padded, 0x004e4942, true)
  ;[0,0,0,1,0,0,0,1,0].forEach((n, i) => v.setFloat32(28 + padded + i * 4, n, true))
  return new Blob([bytes], { type: 'model/gltf-binary' })
}
function elements(tree) {
  const result = []
  const walk = node => {
    if (Array.isArray(node)) { node.forEach(walk); return }
    if (React.isValidElement(node)) { result.push(node); walk(node.props.children) }
  }
  walk(tree); return result
}
function text(node) {
  if (node == null || typeof node === 'boolean') return ''
  if (Array.isArray(node)) return node.map(text).join('')
  return React.isValidElement(node) ? text(node.props.children) : String(node)
}

// Runs the actual checked-in Shop function, its effects, event handlers and real
// StudioCoordinator. Hook, timer, HTTP and IndexedDB adapters are deterministic.
// This is a Node lifecycle test, not a DOM/WebGL/physical Android test.
async function harness({ ready = false, state = 'succeeded', failureCode, submissionRejection, submissionRejectionStatus = 409, artifactFailure = false, solReady = ready, downloadAllowed, reconciliationRequired = false, withExistingJob = true, cloudCurrent = false, characterPrompt = '', detailedReady = false, pricingReady = detailedReady, newJobPolicy, existingPricing, cloudLookup, accountLookup, billingLookup, fundingLookup, membershipLookup, initialAccount = { user: { id: 'owner-a' }, loading: false }, blueprintRecovery } = {}) {
  const selected = { ...(existingPricing ? { pricing: existingPricing } : {}), receipt: makeReceipt(oldId), prompt: 'Original brown chess knight', startedAt: new Date().toISOString() }
  const storeData = new Map(withExistingJob ? [[clientModule.STUDIO_RECEIPT_KEY, JSON.stringify(selected)]] : [])
  if (blueprintRecovery) storeData.set('worldifact:blueprint-recovery:v1', JSON.stringify(blueprintRecovery))
  const storage = { getItem: k => storeData.get(k) ?? null, setItem: (k,v) => { storeData.set(k,v) }, removeItem: k => { storeData.delete(k) } }
  const calls = [], blob = modelBlob(), archive = new Map([[oldId, { id: oldId, prompt: selected.prompt, byteLength: blob.size, savedAt: selected.startedAt, sha256: 'original', review: 'UNREVIEWED' }]])
  const status = { newJobPolicy, pricingRevision: STUDIO_PRICING_REVISION, tiersReady: pricingReady, detailedReady, ready, fastReady: true, fastBudgetReady: false, photoReady: true, oracle: 'CONNECTOR_READY', publicPilot: true,
    reason: ready ? 'READY' : 'DISABLED_OR_EXPIRED', allowance: { used: 6, limit: ready ? 7 : 0, remaining: ready ? 1 : 0, enabled: ready, expiresAt: null }, promptMaxLength: 4000, detailedReferenceLimit: 4 }
  const fetcher = async (url, init = {}) => {
    const path = String(url), method = init.method || 'GET'
    calls.push({ path, method, body: init.body })
    if (path === '/api/account/entitlements') return accountLookup ? accountLookup(accountState.user?.id, init) : Response.json(fundedAccount)
    if (path === '/api/studio/reconcile-budget') return fundingLookup ? fundingLookup(JSON.parse(init.body), init) : Response.json({ error: 'Unavailable in fixture' }, { status: 503 })
    if (path === '/api/billing/recovery') {
      assert.equal(method, 'POST'); assert.deepEqual(JSON.parse(init.body), { action: 'status' })
      return membershipLookup ? membershipLookup(accountState.user?.id, init) : Response.json({ error: 'Unavailable in fixture' }, { status: 503 })
    }
    if (path === '/api/billing/status' && billingLookup) return billingLookup(init)
    if (path === '/api/billing/status') return Response.json({ plans: { pro: { checkoutReady: true }, studio: { checkoutReady: true } } })
    if (path === '/api/studio/status') return Response.json(status)
    if (path === '/api/studio/current' && cloudLookup) return cloudLookup()
    if (path === '/api/studio/current') return Response.json(cloudCurrent ? { current: { receipt: makeReceipt(oldId), prompt: selected.prompt, startedAt: selected.startedAt, financialState: 'reserved', reservedPoints: 250 } } : { current: null })
    if (path === '/api/health') return Response.json({ generationReady: solReady || ready, model: solReady ? 'gpt-6-sol' : null, qualityModel: ready ? 'gpt-6-astra' : null, astraBlueprintReady: ready })
    if (path === '/api/blueprint' && method === 'POST') return Response.json({ ...fastGeneration,
      model: 'gpt-6-' + JSON.parse(init.body).model,
      requestId: await blueprintRequestId(new Headers(init.headers).get('X-WORLDIFACT-Request')),
      evidence: { providerResponseId: 'resp_ui_fixture', receivedAt: new Date().toISOString(), blueprintSha256: 'f'.repeat(64), inputTokens: null, outputTokens: null, totalTokens: null },
      delivery: { kind: 'procedural-blueprint', referenceCount: JSON.parse(init.body).references.length, fallbackUsed: false },
    })
    if (path === '/api/studio/prepare') { const body = JSON.parse(init.body); return Response.json({ ...makeReceipt(newId), ...(body.pricingRevision ? { pricing: STUDIO_PRICING[body.budgetTier] } : {}) }) }
    if (method === 'POST' && submissionRejection) return Response.json({ error: 'PRIVATE_UPSTREAM_MESSAGE', failureCode: submissionRejection }, { status: submissionRejectionStatus })
    if (method === 'POST') return Response.json({ job: { id: newId, state: 'building' } })
    if (path.endsWith('/model') && artifactFailure) throw new TypeError('Interrupted artifact download')
    if (path.endsWith('/model')) return new Response(blob, { headers: { 'Content-Type': 'model/gltf-binary', 'Content-Length': String(blob.size) } })
    return Response.json({ job: { id: path.endsWith(oldId) ? oldId : newId, state, failureCode, reconciliationRequired, ...(downloadAllowed === undefined ? {} : { downloadAllowed, previewOnly: !downloadAllowed, previewAvailable: downloadAllowed }) } })
  }
  const slots = [], effects = [], timers = new Map(), timerDelays = new Map(), delays = []
  let cursor = 0, dirty = true, tree, serial = 0, accountState = initialAccount
  const hookReact = { ...React,
    useState(initial) {
      const index = cursor++
      if (!slots[index]) slots[index] = { value: typeof initial === 'function' ? initial() : initial }
      return [slots[index].value, action => { const next = typeof action === 'function' ? action(slots[index].value) : action; if (!Object.is(next, slots[index].value)) { slots[index].value = next; dirty = true } }]
    },
    useRef(initial) { const index = cursor++; if (!slots[index]) slots[index] = { ref: { current: initial } }; return slots[index].ref },
    useCallback(callback, deps) { const index = cursor++, prior = slots[index]; if (!prior || deps.some((v, i) => !Object.is(v, prior.deps?.[i]))) slots[index] = { value: callback, deps }; return slots[index].value },
    useMemo(create, deps) { const index = cursor++, prior = slots[index]; if (!prior || deps.some((v, i) => !Object.is(v, prior.deps?.[i]))) slots[index] = { value: create(), deps }; return slots[index].value },
    useEffect(callback, deps) {
      const index = cursor++, prior = slots[index]
      if (!prior || !deps || deps.some((v,i) => !Object.is(v, prior.deps?.[i]))) {
        const next = { deps, cleanup: prior?.cleanup }; slots[index] = next
        effects.push(() => { next.cleanup?.(); next.cleanup = callback() })
      }
    },
  }
  const timeout = (callback, delay) => { delays.push(delay); const id = ++serial; timers.set(id, callback); timerDelays.set(id, delay); return id }
  const interval = () => ++serial
  const events = new EventTarget(), pageEvents = new EventTarget(), downloads = [], anchors = new Set()
  const globals = { fetch: fetcher, URL, Blob, AbortSignal, AbortController, Event, console, setTimeout: timeout, clearTimeout: id => timers.delete(id),
    document: { visibilityState: 'visible', addEventListener: pageEvents.addEventListener.bind(pageEvents), removeEventListener: pageEvents.removeEventListener.bind(pageEvents), body: { appendChild: node => anchors.add(node) }, createElement: () => { const node = { click: () => downloads.push({ name: node.download, attached: anchors.has(node) }), remove: () => anchors.delete(node) }; return node } },
    window: { localStorage: storage, confirm: () => true, setTimeout: timeout, clearTimeout: id => timers.delete(id), setInterval: interval, clearInterval: () => {}, addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events), dispatchEvent: events.dispatchEvent.bind(events) } }
  const Component = await loadShopComponent({ react: hookReact, globals, adapters: {
    'react-router-dom': { useLocation: () => ({ pathname: '/shop', state: characterPrompt ? { worldPrompt: characterPrompt } : null }) },
    '../lib/account': { useAccount: () => accountState },
    '../lib/studioClient': { ...clientModule, StudioCoordinator: class extends clientModule.StudioCoordinator { constructor(store) { super(store, fetcher) } }, checkStudio: () => clientModule.checkStudio(fetcher) },
    '../lib/studioArchive': {
      listStudioModels: async () => [...archive.values()], readStudioModel: async () => blob,
      saveStudioModel: async saved => { if (!archive.has(saved.receipt.id)) archive.set(saved.receipt.id, { id: saved.receipt.id, prompt: saved.prompt, savedAt: saved.startedAt, byteLength: blob.size, sha256: 'new-fixture', review: 'UNREVIEWED' }); return archive.get(saved.receipt.id) },
    },
    '../lib/studioPhotos': { prepareStudioPhoto: async (file, size, view) => ({ name: file.name, view, dataUrl: 'data:image/jpeg;base64,' + Buffer.from([255,216,255,192,0,17,8,0,16,0,16,3,1,17,0,2,17,0,3,17,0,255,217]).toString('base64'), textureMaxSize: size }) },
  } })
  const settle = async () => {
    for (let i = 0; i < 24; i++) {
      if (dirty) { dirty = false; cursor = 0; tree = Component() }
      while (effects.length) effects.shift()()
      await nextTick()
    }
  }
  const node = predicate => { const found = elements(tree).find(predicate); assert.ok(found, 'Expected actual component control was not rendered'); return found }
  await settle()
  return { settle, calls, selected, storeData, archive, delays, downloads, status,
    async account(next) { accountState = next; dirty = true; await settle() },
    async balanceChanged() { events.dispatchEvent(new Event('worldifact:balance-changed')); await settle() },
    async visibility(value) { globals.document.visibilityState = value; pageEvents.dispatchEvent(new Event('visibilitychange')); await settle() },
    async pageShow(persisted) { const event = new Event('pageshow'); Object.defineProperty(event, 'persisted', { value: persisted }); events.dispatchEvent(event); await settle() },
    byId: id => node(n => n.props.id === id),
    button: label => node(n => n.type === 'button' && text(n).includes(label)),
    all: () => elements(tree),
    description: () => text(node(n => n.props['data-testid'] === 'result-description')),
    fastDescription: () => text(node(n => n.props['data-testid'] === 'fast-result-description')),
    form: () => node(n => n.type === 'form'),
    quote: () => node(n => !!n.props.accountQuote).props.accountQuote,
    async deadline(delay) { const id = [...timers.keys()].find(id => timerDelays.get(id) === delay); assert.ok(id); const callback = timers.get(id); timers.delete(id); callback(); await settle() },
    async poll() { const first = timers.entries().next().value; assert.ok(first, 'Recovery should have scheduled a GET'); timers.delete(first[0]); await first[1](); await settle() },
    close() { for (const slot of slots) slot?.cleanup?.(); timers.clear() },
  }
}

test('restored completed knight stays editable and unavailable FAST cannot bypass the live Sol gate', async () => {
  const h = await harness()
  try {
    await h.poll()
    for (const id of ['studio-prompt','studio-mode','studio-purpose','studio-texture','studio-photos']) assert.equal(h.byId(id).props.disabled, false, id)
    const before = h.storeData.get(clientModule.STUDIO_RECEIPT_KEY), originalDescription = h.description(), beforeCalls = h.calls.length
    h.byId('studio-prompt').props.onChange({ target: { value: 'Create a blue rook now' } })
    h.byId('studio-mode').props.onChange({ target: { value: FAST_DRAFT_PROFILE } })
    await h.settle()
    assert.equal(h.byId('studio-prompt').props.value, 'Create a blue rook now')
    assert.equal(h.byId('studio-mode').props.value, 'standard')
    assert.equal(h.byId('studio-texture').props.value, 4096)
    assert.equal(h.description(), originalDescription)
    assert.equal(h.storeData.get(clientModule.STUDIO_RECEIPT_KEY), before)
    assert.equal(h.archive.get(oldId).sha256, 'original')
    assert.equal(h.calls.length, beforeCalls, 'editing and a rejected FAST selection must not perform network work')
  } finally { h.close() }
})

test('an active job can have a next draft, but cannot be replaced or resubmitted by its form', async () => {
  const h = await harness({ ready: true, state: 'building' })
  try {
    await h.poll()
    assert.equal(h.byId('studio-prompt').props.disabled, false)
    h.byId('studio-prompt').props.onChange({ target: { value: 'Next model draft' } }); await h.settle()
    assert.equal(h.all().find(node => node.type === 'button' && node.props.type === 'submit').props.disabled, true)
    await h.form().props.onSubmit({ preventDefault() {} }); await h.settle()
    h.button('Clear next-model draft').props.onClick(); await h.settle()
    assert.equal(h.byId('studio-prompt').props.value, '')
    assert.equal(JSON.parse(h.storeData.get(clientModule.STUDIO_RECEIPT_KEY)).receipt.id, oldId)
    assert.equal(h.calls.filter(c => c.method === 'POST' && !['/api/studio/reconcile-budget', '/api/billing/recovery'].includes(c.path)).length, 0)
  } finally { h.close() }
})

test('explicit FAST after completion sends one Sol blueprint POST and never submits an Oracle Studio job', async () => {
  const h = await harness({ ready: true })
  try {
    await h.poll()
    const storedBefore = h.storeData.get(clientModule.STUDIO_RECEIPT_KEY)
    h.byId('studio-prompt').props.onChange({ target: { value: 'A blue rook in FAST' } })
    h.byId('studio-mode').props.onChange({ target: { value: FAST_DRAFT_PROFILE } }); await h.settle()
    assert.equal(h.button('Generate GPT-6 Sol').props.disabled, false)
    const first = h.form().props.onSubmit({ preventDefault() {} })
    const duplicate = h.form().props.onSubmit({ preventDefault() {} })
    await Promise.all([first, duplicate]); await h.settle()
    const solPosts = h.calls.filter(c => c.path === '/api/blueprint' && c.method === 'POST')
    const studioPosts = h.calls.filter(c => c.path === '/api/studio/jobs' && c.method === 'POST')
    assert.equal(solPosts.length, 1)
    assert.equal(studioPosts.length, 0)
    assert.deepEqual(JSON.parse(solPosts[0].body), { worldId: 'enchanted-ai-shop', prompt: 'A blue rook in FAST', mode: 'live', model: 'sol', deliverable: 'procedural-blueprint', references: [] })
    assert.match(h.fastDescription(), /Compact procedural FAST draft/)
    assert.equal(h.storeData.get(clientModule.STUDIO_RECEIPT_KEY), storedBefore)
    assert.equal(h.archive.get(oldId).sha256, 'original')
    assert.equal(h.archive.size, 1)
  } finally { h.close() }
})

test('new reference selection and draft clearing preserve the displayed old model without submitting anything', async () => {
  const h = await harness({ ready: true })
  try {
    await h.poll()
    const before = h.description()
    h.byId('studio-photos').props.onChange({ target: { files: [{ name: 'new-reference.png' }], value: 'new-reference.png' } })
    await h.settle()
    assert.ok(h.all().some(n => n.type === 'img' && /Your reference 1/.test(n.props.alt || '')))
    const fastOption = h.all().find(n => n.type === 'option' && n.props.value === FAST_DRAFT_PROFILE)
    assert.equal(fastOption.props.disabled, true, 'FAST must not silently discard selected photos')
    h.button('Clear next-model draft').props.onClick(); await h.settle()
    assert.equal(h.byId('studio-prompt').props.value, '')
    assert.equal(h.description(), before)
    assert.equal(h.calls.filter(c => c.method === 'POST' && !['/api/studio/reconcile-budget', '/api/billing/recovery'].includes(c.path)).length, 0)
    assert.equal(h.archive.size, 1)
  } finally { h.close() }
})

test('completed free SLOW displays its subscription lock and never fetches the downloadable GLB for a preview', async () => {
  const h = await harness({ ready: true, downloadAllowed: false })
  try {
    await h.poll()
    assert.equal(h.calls.filter(call => call.path.endsWith('/model')).length, 0)
    assert.ok(h.all().some(node => node.type === 'h2' && text(node) === 'Your SLOW model is ready'))
    assert.ok(h.all().some(node => node.props.to === '/account/credits' && text(node).includes('View subscription')))
    assert.equal(h.all().some(node => node.type === 'button' && text(node).includes('Download model')), false)
    assert.ok(h.all().some(node => text(node).includes('protected image preview is not available')))
  } finally { h.close() }
})

test('failed cloud job stays visible with its failure state instead of resetting to the sample preview', async () => {
  const h = await harness({ ready: true, state: 'failed' })
  try {
    await h.poll()
    assert.ok(h.all().some(node => node.type === 'h2' && text(node) === 'Previous model did not finish'))
    assert.equal(h.all().some(node => node.type === 'img' && node.props.alt === 'Example 3D product preview'), false)
    assert.ok(h.storeData.get(clientModule.STUDIO_RECEIPT_KEY), 'terminal receipt remains selected until explicit dismissal')
    assert.equal(h.calls.filter(call => call.method === 'POST' && call.path !== '/api/billing/recovery').length, 0)
  } finally { h.close() }
})

test('missing local receipt recovers the current cloud job before the sample preview is allowed', async () => {
  const h = await harness({ ready: true, withExistingJob: false, cloudCurrent: true, state: 'building' })
  try {
    await h.settle()
    assert.ok(h.storeData.get(clientModule.STUDIO_RECEIPT_KEY), 'fresh cloud receipt is restored into local recovery storage')
    assert.ok(h.all().some(node => node.type === 'h2' && text(node) === 'Checking whether your request was accepted…'))
    assert.equal(h.all().some(node => node.type === 'img' && node.props.alt === 'Example 3D product preview'), false)
    assert.equal(h.calls.filter(call => call.path === '/api/studio/jobs' && call.method === 'POST').length, 0)
    assert.ok(h.calls.some(call => call.path === '/api/studio/current' && call.method === 'GET'))
  } finally { h.close() }
})

test('unconfirmed old jobs display review state instead of an endless generation spinner', async () => {
  const h = await harness({ ready: true, state: 'pending', reconciliationRequired: true })
  try {
    await h.poll()
    assert.ok(h.all().some(node => node.type === 'h2' && text(node) === 'Model needs a status review'))
    assert.equal(h.all().some(node => node.type === 'p' && text(node).startsWith('Elapsed:')), false)
    assert.equal(h.all().find(node => node.type === 'button' && node.props.type === 'submit').props.disabled, true, 'Uncertain jobs must not be silently duplicated')
    assert.equal(h.calls.filter(call => call.method === 'POST' && call.path !== '/api/billing/recovery').length, 0)
  } finally { h.close() }
})

for (const state of ['succeeded', 'failed']) test(`${state} response needing reconciliation keeps the original Shop receipt and GET recovery`, async () => {
  const h = await harness({ ready: true, state, failureCode: 'ORACLE_JOB_FAILED', reconciliationRequired: true, downloadAllowed: false })
  try {
    const beforeCalls = h.calls.length, saved = h.storeData.get(clientModule.STUDIO_RECEIPT_KEY), archived = h.archive.get(oldId)
    await h.poll()
    assert.ok(h.all().some(node => node.type === 'h2' && text(node) === 'Model needs a status review'))
    assert.equal(h.all().some(node => node.type === 'p' && text(node).startsWith('Elapsed:')), false)
    assert.equal(h.delays.at(-1), 60_000)
    assert.ok(h.all().some(node => node.type === 'p' && /recover the same job/i.test(text(node))))
    assert.equal(h.all().some(node => node.type === 'p' && /points were released|credits remain reserved/i.test(text(node))), false)
    await h.deadline(60_000)
    assert.equal(h.delays.at(-1), 60_000)
    assert.deepEqual(h.calls.slice(beforeCalls).map(({ path, method }) => ({ path, method })), [
      { path: `/api/studio/jobs/${oldId}`, method: 'GET' },
      { path: `/api/studio/jobs/${oldId}`, method: 'GET' },
    ], 'Recovery cannot request artifacts, new IDs, generation or accounting changes')
    assert.equal(h.storeData.get(clientModule.STUDIO_RECEIPT_KEY), saved)
    assert.equal(h.archive.get(oldId), archived)
  } finally { h.close() }
})


test('private character brief fills an empty Shop draft without a generation, and never overwrites a recovered job', async () => {
  const characterPrompt = 'A silver-haired explorer with a teal jacket'
  const fresh = await harness({ withExistingJob: false, characterPrompt })
  try {
    assert.equal(fresh.byId('studio-prompt').props.value, characterPrompt)
    assert.equal(fresh.calls.filter(call => call.method === 'POST' && call.path !== '/api/billing/recovery').length, 0)
  } finally { fresh.close() }
  const recovered = await harness({ characterPrompt })
  try {
    assert.equal(recovered.byId('studio-prompt').props.value, 'Original brown chess knight')
    assert.equal(recovered.calls.filter(call => call.method === 'POST' && call.path !== '/api/billing/recovery').length, 0)
  } finally { recovered.close() }
})


test('Shop retains 3,500 characters and four views when the detailed worker is unavailable without a paid POST', async () => {
  const h = await harness({ ready: true, withExistingJob: false })
  try {
    const brief = ('Create a realistic adult heroine with silver hair. ' + 'outfit '.repeat(550)).slice(0,3500)
    h.byId('studio-prompt').props.onChange({ target: { value: brief } })
    h.byId('studio-photos').props.onChange({ target: { files: Array.from({length:4},(_,i)=>({name:`view-${i}.jpg`})), value:'views' } })
    await h.settle()
    assert.equal(h.byId('studio-prompt').props.value, brief)
    assert.equal(h.byId('studio-prompt').props.maxLength, undefined, 'No silent text truncation')
    assert.equal(h.all().filter(n=>n.type==='img' && /Your reference/.test(n.props.alt||'')).length,4)
    assert.equal(h.byId('studio-photos').props.disabled,true,'Four detailed views are retained; extra images are not silently omitted')
    assert.equal(h.button('Generate Astra/Blender model').props.disabled,true)
    await h.form().props.onSubmit({preventDefault(){}});await h.settle()
    assert.equal(h.calls.filter(c=>c.method==='POST'&&c.path!=='/api/billing/recovery').length,0)
  } finally { h.close() }
})

test('Shop transmits all four explicitly accepted procedural reference views in order', async () => {
  const h=await harness({ready:true,withExistingJob:false})
  try {
    h.byId('studio-prompt').props.onChange({target:{value:'MCC cabinet procedural study'}})
    h.byId('studio-photos').props.onChange({target:{files:Array.from({length:4},(_,i)=>({name:`cabinet-${i}.jpg`})),value:'views'}})
    await h.settle()
    h.byId('studio-deliverable').props.onChange({target:{value:'procedural-blueprint'}});await h.settle()
    assert.equal(h.button('Generate GPT-6 Astra blueprint').props.disabled,false)
    await h.form().props.onSubmit({preventDefault(){}});await h.settle()
    const posts=h.calls.filter(c=>c.path==='/api/blueprint' && c.method==='POST')
    assert.equal(posts.length,1)
    assert.deepEqual(JSON.parse(posts[0].body).references.map(p=>p.view),['front','left','right','back'])
    assert.match(h.fastDescription(),/Compact procedural FAST draft/)
  } finally {h.close()}
})


test('a real character request selects the signed Studio route, keeps all views and never calls blueprint', async () => {
  const h = await harness({ ready: true, detailedReady: true, withExistingJob: false, state: 'building' })
  try {
    const prompt = ('Recreate this adult silver-haired woman, no orb. ' + 'outfit '.repeat(550)).slice(0,3499) + '.'
    h.byId('studio-prompt').props.onChange({ target: { value: prompt } })
    h.byId('studio-photos').props.onChange({ target: { files: Array.from({length:4},(_,i)=>({name:`view-${i}.jpg`})), value:'views' } })
    await h.settle()
    assert.equal(h.button('Generate Astra/Blender model').props.disabled,false)
    const first=h.form().props.onSubmit({preventDefault(){}}), duplicate=h.form().props.onSubmit({preventDefault(){}})
    await Promise.all([first,duplicate]);await h.settle()
    const posts=h.calls.filter(c=>c.path==='/api/studio/jobs' && c.method==='POST')
    assert.equal(posts.length,1)
    const submitted=JSON.parse(posts[0].body)
    assert.equal(submitted.prompt,prompt)
    assert.deepEqual(submitted.photos.map(p=>p.view),['front','left','right','back'])
    assert.equal(submitted.generationProfile,undefined)
    assert.equal(h.calls.filter(c=>c.path==='/api/blueprint').length,0)
    assert.equal(JSON.parse(h.storeData.get(clientModule.STUDIO_RECEIPT_KEY)).receipt.id,newId)
    assert.equal(h.button('Generate Astra/Blender model').props.disabled,true)
  } finally {h.close()}
})


test('reconciled succeeded Studio job loads the same GLB and never starts another paid job', async () => {
  const h = await harness({ ready: true, state: 'succeeded', reconciliationRequired: true, downloadAllowed: true })
  try {
    await h.poll()
    await h.settle()
    assert.ok(h.calls.some(call => call.path.endsWith('/model') && call.method === 'GET'))
    assert.equal(h.calls.filter(call => call.path === '/api/studio/jobs' && call.method === 'POST').length, 0)
    assert.equal(h.calls.filter(call => call.method === 'POST' && call.path !== '/api/billing/recovery').length, 0)
    assert.ok(h.all().some(node => node.props['data-testid'] === 'result-description'))
    assert.equal(h.all().some(node => node.type === 'p' && text(node).startsWith('Elapsed:')), false)
  } finally { h.close() }
})


test('confirmed empty cloud recovery shows labelled front preview and all example view controls work without generation', async () => {
  const h = await harness({ withExistingJob: false })
  const origin = 'https://forge-studio-public.terraformingplanet.chatgpt.site'
  const sample = () => h.all().find(node => node.type === 'img' && node.props.alt === 'Example 3D product preview')
  try {
    assert.ok(h.calls.some(call => call.path === '/api/studio/current' && call.method === 'GET'))
    assert.equal(sample()?.props.src, `${origin}/assets/model-front.webp`)
    assert.ok(h.all().some(node => node.type === 'small' && text(node).includes('Example only.')))
    for (const [label, view] of [['Left side', 'left'], ['Back', 'back'], ['Face', 'face'], ['Front', 'front']]) {
      h.button(label).props.onClick(); await h.settle()
      assert.equal(sample()?.props.src, `${origin}/assets/model-${view}.webp`)
      assert.equal(h.button(label).props['aria-pressed'], true)
    }
    sample().props.onError(); await h.settle()
    assert.equal(sample(), undefined)
    assert.ok(h.all().some(node => node.type === 'p' && text(node).includes('example preview is temporarily unavailable')))
    h.button('Front').props.onClick(); await h.settle()
    assert.equal(sample()?.props.src, `${origin}/assets/model-front.webp`)
    assert.equal(h.calls.filter(call => call.method === 'POST' && call.path !== '/api/billing/recovery').length, 0)
  } finally { h.close() }
})

test('a pending cloud lookup blocks both blueprint and detailed submissions until the existing job is known', async () => {
  for (const detailed of [false, true]) {
    let finishLookup
    const lookup = new Promise(resolve => { finishLookup = resolve })
    const h = await harness({ ready: true, detailedReady: true, withExistingJob: false, cloudLookup: () => lookup })
    try {
      h.byId('studio-prompt').props.onChange({ target: { value: detailed ? 'Recreate this detailed adult character model' : 'A blue rook concept' } })
      if (detailed) h.byId('studio-deliverable').props.onChange({ target: { value: 'detailed-mesh' } })
      await h.settle()
      assert.ok(h.all().some(node => node.type === 'h2' && text(node) === 'Checking your cloud job…'))
      assert.equal(h.all().some(node => node.type === 'img' && node.props.alt === 'Example 3D product preview'), false)
      assert.equal(h.button(detailed ? 'Generate Astra/Blender model' : 'Generate GPT-6 Astra blueprint').props.disabled, true)
      await h.form().props.onSubmit({ preventDefault() {} }); await h.settle()
      assert.equal(h.calls.filter(call => call.method === 'POST' && call.path !== '/api/billing/recovery').length, 0)
      finishLookup(Response.json({ current: { receipt: makeReceipt(oldId), prompt: h.selected.prompt, startedAt: h.selected.startedAt, financialState: 'reserved' } }))
      await h.settle()
      assert.equal(JSON.parse(h.storeData.get(clientModule.STUDIO_RECEIPT_KEY)).receipt.id, oldId)
      assert.equal(h.calls.filter(call => call.method === 'POST' && call.path !== '/api/billing/recovery').length, 0)
    } finally { h.close() }
  }
})

test('repeated cloud lookup failures retain the recovery gate and retry GET until the original job returns', async () => {
  let attempts = 0
  const h = await harness({ ready: true, withExistingJob: false, cloudLookup: () => {
    attempts++
    return attempts <= 5 ? Response.json({ error: 'Temporary recovery outage' }, { status: 503 }) : Response.json({ current: {
      receipt: makeReceipt(oldId), prompt: 'Original brown chess knight', startedAt: new Date().toISOString(), financialState: 'reserved',
    } })
  } })
  try {
    h.byId('studio-prompt').props.onChange({ target: { value: 'A new rook concept' } }); await h.settle()
    for (let i = 0; i < 5; i++) {
      assert.equal(h.all().some(node => node.type === 'img' && node.props.alt === 'Example 3D product preview'), false)
      assert.equal(h.all().find(node => node.type === 'button' && node.props.type === 'submit').props.disabled, true)
      await h.form().props.onSubmit({ preventDefault() {} })
      await h.poll()
    }
    assert.equal(attempts, 6)
    assert.equal(JSON.parse(h.storeData.get(clientModule.STUDIO_RECEIPT_KEY)).receipt.id, oldId)
    assert.equal(h.calls.filter(call => call.method === 'POST' && call.path !== '/api/billing/recovery').length, 0)
    assert.ok(h.delays.slice(0, 5).every(delay => delay >= 5000 && delay <= 120000))
    assert.ok(h.all().some(node => node.type === 'h2' && text(node) === 'Checking whether your request was accepted…'))
  } finally { h.close() }
})

test('leaving Shop cancels scheduled cloud discovery retries and late failures cannot restart them', async () => {
  const h = await harness({ withExistingJob: false, cloudLookup: () => Response.json({ error: 'Temporary outage' }, { status: 503 }) })
  h.close()
  await assert.rejects(h.poll(), /Recovery should have scheduled a GET/)
  assert.equal(h.calls.filter(call => call.path === '/api/studio/current').length, 1)

  let finishLookup
  const pending = new Promise(resolve => { finishLookup = resolve })
  const late = await harness({ withExistingJob: false, cloudLookup: () => pending })
  late.close()
  finishLookup(Response.json({ error: 'Late outage' }, { status: 503 }))
  await late.settle()
  await assert.rejects(late.poll(), /Recovery should have scheduled a GET/)
  assert.equal(late.calls.filter(call => call.path === '/api/studio/current').length, 1)
})


test('a late successful cloud lookup after leaving Shop cannot overwrite a newer local selection', async () => {
  let finishLookup
  const pending = new Promise(resolve => { finishLookup = resolve })
  const h = await harness({ withExistingJob: false, cloudLookup: () => pending })
  h.close()
  const newer = { receipt: makeReceipt(newId), prompt: 'Newly selected model', startedAt: new Date().toISOString() }
  h.storeData.set(clientModule.STUDIO_RECEIPT_KEY, JSON.stringify(newer))
  finishLookup(Response.json({ current: { receipt: makeReceipt(oldId), prompt: h.selected.prompt, startedAt: h.selected.startedAt, financialState: 'reserved' } }))
  await h.settle()
  assert.deepEqual(JSON.parse(h.storeData.get(clientModule.STUDIO_RECEIPT_KEY)), newer)
  assert.equal(h.calls.filter(call => call.method === 'POST' && call.path !== '/api/billing/recovery').length, 0)
  await assert.rejects(h.poll(), /Recovery should have scheduled a GET/)
})


test('failed model shows its safe diagnostic and copyable job ID without rendering the signed receipt', async () => {
  const h = await harness({ ready: true, state: 'failed', failureCode: 'ASTRA_COST_LIMIT' })
  try {
    await h.poll()
    const visible = text(h.all())
    assert.match(visible, new RegExp('Job ID: ' + oldId))
    assert.match(visible, /Reason: ASTRA_COST_LIMIT/)
    assert.match(visible, /Astra’s cost protection stopped this job/)
    assert.doesNotMatch(visible, /model (?:is )?too (?:large|complex)|\$1\.75|500 points/i)
    assert.equal(visible.includes(h.selected.receipt.ticket), false)
    assert.equal(h.calls.filter(c => c.method === 'POST' && !['/api/studio/reconcile-budget', '/api/billing/recovery'].includes(c.path)).length, 0)
  } finally { h.close() }
})


test('a completed model whose preview download is interrupted never receives failure-reason wording', async () => {
  const h = await harness({ ready: true, state: 'succeeded', artifactFailure: true })
  try {
    await h.poll()
    const visible = text(h.all())
    assert.match(visible, /Your model is complete/)
    assert.doesNotMatch(visible, /original failure reason was not saved/)
    assert.equal(h.calls.filter(c => c.method === 'POST' && !['/api/studio/reconcile-budget', '/api/billing/recovery'].includes(c.path)).length, 0)
  } finally { h.close() }
})


test('reloading a detailed receipt preserves the detailed route and missing submission is not presented as a model crash', async () => {
  const h = await harness({ ready: true, state: 'failed', failureCode: 'MISSING_SUBMISSION' })
  try {
    await h.poll()
    assert.equal(h.byId('studio-deliverable').props.value, 'detailed-mesh')
    const visible = text(h.all())
    assert.match(visible, /The upload was not confirmed/)
    assert.match(visible, /Model submission was not confirmed/)
    assert.doesNotMatch(visible, /Previous model did not finish|original failure reason was not saved/)
    assert.equal(h.calls.filter(c => c.method === 'POST' && !['/api/studio/reconcile-budget', '/api/billing/recovery'].includes(c.path)).length, 0)
  } finally { h.close() }
})


test('an immediately rejected submission shows its saved capacity reason instead of claiming it was lost', async () => {
  const h = await harness({ ready: true, detailedReady: true, withExistingJob: false, submissionRejection: 'JOB_CAPACITY' })
  try {
    h.byId('studio-prompt').props.onChange({ target: { value: 'A detailed blue chess knight' } })
    h.byId('studio-deliverable').props.onChange({ target: { value: 'detailed-mesh' } })
    await h.settle()
    await h.form().props.onSubmit({ preventDefault() {} }); await h.settle()
    const visible = text(h.all())
    assert.match(visible, /stored-job capacity/)
    assert.match(visible, /Reason: JOB_CAPACITY/)
    assert.doesNotMatch(visible, /original failure reason was not saved|PRIVATE_UPSTREAM_MESSAGE/)
    assert.equal(h.calls.filter(c => c.path === '/api/studio/jobs' && c.method === 'POST').length, 1)
  } finally { h.close() }
})

test('account refusal is shown as generation not started, without a model failure or refund claim', async () => {
  for (const failureCode of ADMISSION_FAILURE_CODES) {
    const h = await harness({ ready: true, state: 'failed', failureCode })
    try {
      await h.poll()
      const visible = text(h.all())
      assert.ok(h.all().some(node => node.type === 'h2' && text(node) === 'Generation was not started'))
      assert.match(visible, failureCode === 'ACCOUNT_REQUEST_CONFLICT'
        ? /No new Oracle submission or points reservation was made/
        : /No Oracle generation was submitted and no points were reserved for this request/)
      assert.doesNotMatch(visible, /Previous model did not finish|original failure reason was not saved|points were released/)
      assert.equal(h.calls.filter(c => c.method === 'POST' && !['/api/studio/reconcile-budget', '/api/billing/recovery'].includes(c.path)).length, 0)
    } finally { h.close() }
  }
})

test('immediate HTTP429 funding refusal keeps the detailed request terminal with its accurate headline', async () => {
  const h = await harness({ ready: true, detailedReady: true, withExistingJob: false,
    submissionRejection: 'PROVIDER_BUDGET_EXHAUSTED', submissionRejectionStatus: 429 })
  try {
    h.byId('studio-prompt').props.onChange({ target: { value: 'A detailed blue chess knight' } })
    h.byId('studio-deliverable').props.onChange({ target: { value: 'detailed-mesh' } })
    await h.settle()
    await h.form().props.onSubmit({ preventDefault() {} }); await h.settle()
    const visible = text(h.all())
    assert.match(visible, /Generation was not started/)
    assert.match(visible, /unreserved API funding/)
    assert.match(visible, /Reason: PROVIDER_BUDGET_EXHAUSTED/)
    assert.doesNotMatch(visible, /Previous model did not finish|PRIVATE_UPSTREAM_MESSAGE|Not enough available points|points were released/)
    assert.equal(h.calls.filter(c => c.path === '/api/studio/jobs' && c.method === 'POST').length, 1)
    assert.equal(JSON.parse(h.storeData.get(clientModule.STUDIO_RECEIPT_KEY)).rejectionCode, 'PROVIDER_BUDGET_EXHAUSTED')
  } finally { h.close() }
})

test('one account snapshot blocks both ready Shop routes and forced form submission when provider funds are unavailable', async () => {
  const h = await harness({ ready: true, detailedReady: true, withExistingJob: false, accountLookup: () => Response.json(blockedAccount) })
  try {
    h.byId('studio-prompt').props.onChange({ target: { value: 'A blue rook' } }); await h.settle()
    for (const delivery of ['procedural-blueprint', 'detailed-mesh']) {
      h.byId('studio-deliverable').props.onChange({ target: { value: delivery } }); await h.settle()
      assert.equal(h.quote().quote.state, 'blocked')
      assert.equal(h.all().find(n => n.props.className === 'native-shop-generate').props.type, 'button')
    assert.equal(h.all().find(n => n.props.className === 'native-shop-generate').props.disabled, false)
    assert.match(text(h.all().find(n => n.props.className === 'native-shop-generate')), /Check generation funding/ )
      const status = h.all().find(n => n.props.className === 'shop-customer-status')
      assert.match(text(status), /Generation is unavailable for this account/)
      assert.match(text(status), /unreserved API funding/)
      assert.doesNotMatch(text(status), /generation available/)
      await h.form().props.onSubmit({ preventDefault() {} }); await h.settle()
    }
    assert.equal(h.calls.filter(c => c.path === '/api/account/entitlements').length, 1)
    assert.equal(h.calls.filter(c => c.path === '/api/billing/status').length, 1)
    assert.equal(h.calls.filter(c => c.method === 'POST' && !['/api/studio/reconcile-budget', '/api/billing/recovery'].includes(c.path)).length, 0)
    assert.equal(h.byId('studio-prompt').props.disabled, false)
    assert.equal(h.byId('studio-photos').props.disabled, false)
  } finally { h.close() }
})

test('switching models recomputes costs from the same snapshot and distinguishes detailed admission', async () => {
  const h = await harness({ ready: true, detailedReady: true, withExistingJob: false, accountLookup: () => Response.json({ ...fundedAccount, studioAdmission: admission(false, 'PROVIDER_BUDGET_EXHAUSTED') }) })
  try {
    h.byId('studio-prompt').props.onChange({ target: { value: 'A blue rook' } }); await h.settle()
    assert.equal(h.quote().quote.state, 'credits')
    h.byId('studio-deliverable').props.onChange({ target: { value: 'detailed-mesh' } }); await h.settle()
    assert.equal(h.quote().quote.state, 'blocked')
    h.byId('studio-mode').props.onChange({ target: { value: 'luna' } }); await h.settle()
    assert.equal(h.quote().quote.points, 15)
    assert.equal(h.quote().quote.state, 'credits')
    assert.equal(h.calls.filter(c => c.path === '/api/account/entitlements').length, 1)
    assert.equal(h.calls.filter(c => c.path === '/api/billing/status').length, 1)
  } finally { h.close() }
})

test('account startup waits for session resolution before discovery and signed-out drafts stay editable', async () => {
  const h = await harness({ ready: true, withExistingJob: false, initialAccount: { user: null, loading: true } })
  try {
    assert.equal(h.calls.some(c => ['/api/account/entitlements', '/api/billing/status', '/api/studio/current'].includes(c.path)), false)
    h.byId('studio-prompt').props.onChange({ target: { value: 'Keep this draft through sign-in' } }); await h.settle()
    await h.account({ user: null, loading: false })
    assert.equal(h.quote().quote.state, 'signin')
    assert.equal(h.byId('studio-prompt').props.disabled, false)
    await h.form().props.onSubmit({ preventDefault() {} }); await h.settle()
    assert.equal(h.calls.filter(c => c.method === 'POST' && !['/api/studio/reconcile-budget', '/api/billing/recovery'].includes(c.path)).length, 0)
    await h.account({ user: { id: 'owner-a' }, loading: false })
    assert.equal(h.quote().quote.state, 'credits')
    assert.equal(h.byId('studio-prompt').props.value, 'Keep this draft through sign-in')
    assert.equal(h.calls.filter(c => c.path === '/api/studio/current').length, 1)
    assert.equal(h.calls.filter(c => c.path === '/api/account/entitlements').length, 1)
  } finally { h.close() }
})

test('healthy service refresh cannot erase cloud authentication failure or enable a paid request', async () => {
  const h = await harness({ ready: true, withExistingJob: false, cloudLookup: () => Response.json({ error: 'PRIVATE_AUTH_DETAIL' }, { status: 401 }) })
  try {
    h.byId('studio-prompt').props.onChange({ target: { value: 'A blue rook' } }); await h.settle()
    assert.match(text(h.all()), /Sign in again to recover your account models/)
    assert.doesNotMatch(text(h.all()), /PRIVATE_AUTH_DETAIL/)
    await h.button('Refresh availability').props.onClick(); await h.settle()
    assert.match(text(h.all()), /Sign in again to recover your account models/)
    assert.equal(h.all().find(n => n.props.className === 'native-shop-generate').props.disabled, true)
    await h.form().props.onSubmit({ preventDefault() {} }); await h.settle()
    assert.equal(h.calls.filter(c => c.method === 'POST' && !['/api/studio/reconcile-budget', '/api/billing/recovery'].includes(c.path)).length, 0)
  } finally { h.close() }
})

test('late account A responses cannot enable generation after signout or account B selection', async () => {
  let finishA, finishB
  const h = await harness({ ready: true, withExistingJob: false, accountLookup: owner => new Promise(resolve => { if (owner === 'owner-a') finishA = resolve; else finishB = resolve }) })
  try {
    h.byId('studio-prompt').props.onChange({ target: { value: 'A blue rook' } }); await h.settle()
    await h.account({ user: null, loading: false })
    assert.equal(h.quote().quote.state, 'signin')
    await h.account({ user: { id: 'owner-b' }, loading: false })
    assert.equal(h.quote().quote.state, 'pending')
    finishB(Response.json(blockedAccount)); await h.settle()
    assert.equal(h.quote().quote.state, 'blocked')
    finishA(Response.json(fundedAccount)); await h.settle()
    assert.equal(h.quote().quote.state, 'blocked')
    assert.equal(h.all().find(n => n.props.className === 'native-shop-generate').props.type, 'button')
    assert.equal(h.all().find(n => n.props.className === 'native-shop-generate').props.disabled, false)
    assert.match(text(h.all().find(n => n.props.className === 'native-shop-generate')), /Check generation funding/ )
    assert.equal(h.calls.filter(c => c.path === '/api/account/entitlements').length, 2)
    assert.equal(h.calls.filter(c => c.method === 'POST' && !['/api/studio/reconcile-budget', '/api/billing/recovery'].includes(c.path)).length, 0)
  } finally { h.close() }
})

test('balance refresh invalidates the allowed quote while pending and ignores an older response', async () => {
  const responses = []
  let count = 0
  const h = await harness({ ready: true, withExistingJob: false, accountLookup: () => ++count === 1 ? Response.json(fundedAccount) : new Promise(resolve => responses.push(resolve)) })
  try {
    h.byId('studio-prompt').props.onChange({ target: { value: 'A blue rook' } }); await h.settle()
    assert.equal(h.all().find(n => n.props.className === 'native-shop-generate').props.disabled, false)
    await h.balanceChanged()
    assert.equal(h.quote().checking, true)
    assert.equal(h.all().find(n => n.props.className === 'native-shop-generate').props.disabled, true)
    await h.balanceChanged()
    responses[1](Response.json(blockedAccount)); await h.settle()
    responses[0](Response.json(fundedAccount)); await h.settle()
    assert.equal(h.quote().quote.state, 'blocked')
    assert.equal(h.calls.filter(c => c.path === '/api/account/entitlements').length, 3)
    assert.equal(h.calls.filter(c => c.path === '/api/billing/status').length, 3)
  } finally { h.close() }
})

test('mobile resume and back-forward restoration recheck admission before enabling another generation', async () => {
  for (const restore of ['visible', 'pageshow']) {
    let count = 0, finish
    const h = await harness({ ready: true, withExistingJob: false, accountLookup: () => ++count === 1 ? Response.json(fundedAccount) : new Promise(resolve => { finish = resolve }) })
    try {
      h.byId('studio-prompt').props.onChange({ target: { value: 'My retained mobile model draft' } }); await h.settle()
      assert.equal(h.all().find(n => n.props.className === 'native-shop-generate').props.disabled, false)
      await h.visibility('hidden')
      await h.pageShow(false)
      assert.equal(count, 1, 'hiding the page or an ordinary initial pageshow must not duplicate account reads')
      if (restore === 'visible') await h.visibility('visible')
      else await h.pageShow(true)
      assert.equal(count, 2, `${restore} must perform a new read-only account check without relying on focus`)
      assert.equal(h.quote().checking, true)
      assert.equal(h.all().find(n => n.props.className === 'native-shop-generate').props.disabled, true)
      finish(Response.json(blockedAccount)); await h.settle()
      assert.equal(h.quote().quote.state, 'blocked')
      assert.match(h.quote().quote.message, /unreserved API funding/)
      assert.equal(h.all().find(n => n.props.className === 'native-shop-generate').props.type, 'button')
    assert.equal(h.all().find(n => n.props.className === 'native-shop-generate').props.disabled, false)
    assert.match(text(h.all().find(n => n.props.className === 'native-shop-generate')), /Check generation funding/ )
      assert.equal(h.byId('studio-prompt').props.value, 'My retained mobile model draft')
      assert.equal(h.calls.filter(c => c.method === 'POST' && !['/api/studio/reconcile-budget', '/api/billing/recovery'].includes(c.path)).length, 0, 'resuming must not submit or retry a paid request')
    } finally { h.close() }
  }
})

test('unknown account data and expired authentication fail closed without an endless cost spinner', async () => {
  for (const response of [Response.json({ credits: 3000 }), Response.json({ error: 'PRIVATE_AUTH_DETAIL' }, { status: 401 }), new Response('<html>not JSON</html>', { headers: { 'content-type': 'text/html' } })]) {
    const h = await harness({ ready: true, withExistingJob: false, accountLookup: () => response })
    try {
      h.byId('studio-prompt').props.onChange({ target: { value: 'A blue rook' } }); await h.settle()
      assert.ok(['pending', 'signin'].includes(h.quote().quote.state))
      assert.equal(h.quote().checking, false)
      assert.equal(h.quote().canRefresh, true)
      assert.equal(h.all().find(n => n.props.className === 'native-shop-generate').props.disabled, true)
      assert.doesNotMatch(text(h.all()), /PRIVATE_AUTH_DETAIL/)
    } finally { h.close() }
  }
  const timeout = await harness({ ready: true, withExistingJob: false, accountLookup: (_owner, init) => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true })) })
  try {
    assert.equal(timeout.quote().checking, true)
    await timeout.poll()
    assert.equal(timeout.quote().quote.state, 'pending')
    assert.equal(timeout.quote().checking, false)
    assert.equal(timeout.quote().canRefresh, true)
  } finally { timeout.close() }
})

test('a saved rejected blueprint displays its reason instead of the example and remains recoverable while funding is blocked', async () => {
  const blueprintRecovery = { id: newId, fingerprint: 'b'.repeat(64), model: 'astra', state: 'failed', createdAt: Date.now(), failureCode: 'PROVIDER_BUDGET_EXHAUSTED' }
  for (const withExistingJob of [false, true]) {
    const h = await harness({ ready: true, withExistingJob, blueprintRecovery, accountLookup: () => Response.json(blockedAccount) })
    try {
      if (withExistingJob) {
        await h.poll()
        assert.match(text(h.all()), /Previous preview preserved/)
        assert.match(h.description(), /Original brown chess knight/)
      } else assert.ok(h.all().some(n => n.type === 'h2' && text(n) === 'Generation was not started'))
      assert.equal(h.all().some(n => n.type === 'img' && n.props.alt === 'Example 3D product preview'), false)
      assert.equal(h.button('Recover same request').props.disabled, false)
      await h.button('Recover same request').props.onClick(); await h.settle()
      assert.equal(h.calls.some(c => c.path.startsWith('/api/blueprint')), false)
      assert.match(text(h.all()), /unreserved API funding/)
      assert.equal(h.calls.filter(c => c.method === 'POST' && !['/api/studio/reconcile-budget', '/api/billing/recovery'].includes(c.path)).length, 0)
    } finally { h.close() }
  }
})

test('signout and account switching pause automatic selected-job requests without losing the receipt', async () => {
  const h = await harness({ ready: true, state: 'building' })
  try {
    const receipt = h.storeData.get(clientModule.STUDIO_RECEIPT_KEY)
    await h.account({ user: null, loading: false })
    assert.equal(h.storeData.get(clientModule.STUDIO_RECEIPT_KEY), receipt)
    await assert.rejects(h.poll(), /Recovery should have scheduled a GET/)
    await h.account({ user: { id: 'owner-b' }, loading: false })
    assert.match(text(h.all()), /Sign in to the original account to recover this model/)
    assert.equal(h.calls.filter(c => c.path.startsWith('/api/studio/jobs/')).length, 0)
    assert.equal(h.storeData.get(clientModule.STUDIO_RECEIPT_KEY), receipt)
    assert.equal(h.button('Recover this job').props.disabled, false)
  } finally { h.close() }
})

test('downloading the verified current GLB uses its existing bytes and a document-attached link', async () => {
  const h = await harness({ ready: true })
  try {
    await h.poll()
    const before = h.calls.filter(c => c.path.endsWith('/model')).length
    await h.button('Download model · GLB').props.onClick(); await h.settle()
    assert.equal(h.calls.filter(c => c.path.endsWith('/model')).length, before)
    assert.deepEqual(h.downloads, [{ name: `WORLDIFACT-${oldId}.glb`, attached: true }])
    assert.equal(h.calls.filter(c => c.method === 'POST' && !['/api/studio/reconcile-budget', '/api/billing/recovery'].includes(c.path)).length, 0)
  } finally { h.close() }
})

test('extended detailed budget needs current draft consent and sends one bound 500-point job', async () => {
  const h = await harness({ ready: true, detailedReady: true, withExistingJob: false, state: 'building' })
  try {
    h.byId('studio-prompt').props.onChange({ target: { value: 'Detailed silver chess knight' } })
    h.byId('studio-deliverable').props.onChange({ target: { value: 'detailed-mesh' } }); await h.settle()
    h.byId('studio-budget-tier').props.onChange({ target: { value: 'extended' } }); await h.settle()
    assert.equal(h.quote().quote.points, 500); assert.equal(h.quote().quote.after, 2500)
    assert.equal(h.button('Generate Astra/Blender model').props.disabled, true)
    await h.form().props.onSubmit({ preventDefault() {} }); await h.settle()
    assert.equal(h.calls.filter(c => c.method === 'POST' && !['/api/studio/reconcile-budget', '/api/billing/recovery'].includes(c.path)).length, 0)
    h.byId('studio-budget-consent').props.onChange({ target: { checked: true } }); await h.settle()
    assert.equal(h.button('Generate Astra/Blender model').props.disabled, false)
    h.byId('studio-prompt').props.onChange({ target: { value: 'Detailed silver chess knight with armor' } }); await h.settle()
    assert.equal(h.byId('studio-budget-consent').props.checked, false)
    assert.equal(h.button('Generate Astra/Blender model').props.disabled, true)
    h.byId('studio-budget-consent').props.onChange({ target: { checked: true } }); await h.settle()
    const first = h.form().props.onSubmit({ preventDefault() {} }), duplicate = h.form().props.onSubmit({ preventDefault() {} })
    await Promise.all([first, duplicate]); await h.settle()
    const posts = h.calls.filter(c => c.path === '/api/studio/jobs' && c.method === 'POST')
    assert.equal(posts.length, 1)
    const body = JSON.parse(posts[0].body)
    assert.equal(body.pricingRevision, STUDIO_PRICING_REVISION); assert.equal(body.budgetTier, 'extended'); assert.equal(body.acceptedPoints, 500)
    assert.deepEqual(JSON.parse(h.storeData.get(clientModule.STUDIO_RECEIPT_KEY)).pricing, STUDIO_PRICING.extended)
    assert.match(text(h.all()), /Original job: 500 points/)
    assert.equal(h.byId('studio-budget-consent').props.checked, false)
  } finally { h.close() }
})

test('input changes clear extended consent, and unavailable tier recovery requires explicit standard choice', async () => {
  const h = await harness({ ready: true, detailedReady: true, withExistingJob: false })
  try {
    h.byId('studio-prompt').props.onChange({ target: { value: 'Detailed model with reference' } })
    h.byId('studio-deliverable').props.onChange({ target: { value: 'detailed-mesh' } }); await h.settle()
    h.byId('studio-budget-tier').props.onChange({ target: { value: 'extended' } }); await h.settle()
    const accept = async () => { h.byId('studio-budget-consent').props.onChange({ target: { checked: true } }); await h.settle() }
    for (const [id, value] of [['studio-purpose', 'game'], ['studio-texture', 8192]]) {
      await accept(); h.byId(id).props.onChange({ target: { value } }); await h.settle()
      assert.equal(h.byId('studio-budget-consent').props.checked, false, id)
    }
    await accept()
    h.byId('studio-photos').props.onChange({ target: { files: [{ name: 'front.jpg' }], value: 'front' } }); await h.settle()
    assert.equal(h.byId('studio-budget-consent').props.checked, false)
    await accept(); h.status.tiersReady = false
    await h.button('Refresh availability').props.onClick(); await h.settle()
    assert.equal(h.all().some(n => n.props.id === 'studio-budget-tier'), false)
    assert.equal(h.button('Review model budget availability').props.disabled, true)
    assert.match(text(h.all()), /selected 500-point budget is no longer available/)
    h.button('Use standard model budget').props.onClick(); await h.settle()
    assert.equal(h.button('Generate Astra/Blender model · 250 points').props.disabled, false)
    assert.equal(h.calls.filter(c => c.method === 'POST' && !['/api/studio/reconcile-budget', '/api/billing/recovery'].includes(c.path)).length, 0)
    assert.equal(h.byId('studio-prompt').props.value, 'Detailed model with reference')
    assert.equal(h.all().filter(n => n.type === 'img' && n.props.alt?.startsWith('Your reference')).length, 1)
  } finally { h.close() }
})

test('legacy ready server offers no new budget tiers and keeps legacy standard submission', async () => {
  const h = await harness({ ready: true, detailedReady: true, pricingReady: false, withExistingJob: false })
  try {
    h.byId('studio-prompt').props.onChange({ target: { value: 'Detailed brown knight' } })
    h.byId('studio-deliverable').props.onChange({ target: { value: 'detailed-mesh' } }); await h.settle()
    assert.equal(h.all().some(n => n.props.id === 'studio-budget-tier'), false)
    await h.form().props.onSubmit({ preventDefault() {} }); await h.settle()
    const body = JSON.parse(h.calls.find(c => c.path === '/api/studio/jobs' && c.method === 'POST').body)
    assert.equal(body.budgetTier, undefined); assert.equal(body.pricingRevision, undefined); assert.equal(body.acceptedPoints, undefined)
  } finally { h.close() }
})

test('historical new-job policy keeps the single 250-point form even when stale status advertises tiers', async () => {
  const h = await harness({ ready: true, detailedReady: true, withExistingJob: false, newJobPolicy: 'legacy-usd175-v1' })
  try {
    h.byId('studio-prompt').props.onChange({ target: { value: 'Detailed brown knight' } })
    h.byId('studio-deliverable').props.onChange({ target: { value: 'detailed-mesh' } }); await h.settle()
    assert.equal(h.all().some(n => n.props.id === 'studio-budget-tier'), false)
    assert.match(text(h.all()), /original USD 1\.75 API budget/)
    assert.equal(h.quote().quote.points, 250)
    await h.form().props.onSubmit({ preventDefault() {} }); await h.settle()
    const posts = h.calls.filter(c => c.path === '/api/studio/jobs' && c.method === 'POST')
    assert.equal(posts.length, 1)
    const body = JSON.parse(posts[0].body)
    assert.equal(body.budgetTier, undefined); assert.equal(body.pricingRevision, undefined); assert.equal(body.acceptedPoints, undefined)
  } finally { h.close() }
})

test('historical new-job policy still presents and recovers an existing 500-point model at its saved price', async () => {
  const h = await harness({ ready: true, detailedReady: true, existingPricing: STUDIO_PRICING.extended, newJobPolicy: 'legacy-usd175-v1' })
  try {
    await h.poll()
    assert.equal(h.all().some(n => n.props.id === 'studio-budget-tier'), false)
    assert.match(text(h.all()), /Original job: 500 points · extended model budget/)
    assert.deepEqual(JSON.parse(h.storeData.get(clientModule.STUDIO_RECEIPT_KEY)).pricing, STUDIO_PRICING.extended)
    assert.equal(h.calls.filter(c => c.path === '/api/studio/jobs' && c.method === 'POST').length, 0)
  } finally { h.close() }
})


test('editing next draft budget never relabels original recovered job pricing', async () => {
  const h = await harness({ ready: true, detailedReady: true, existingPricing: STUDIO_PRICING.standard })
  try {
    await h.poll()
    h.byId('studio-budget-tier').props.onChange({ target: { value: 'extended' } }); await h.settle()
    assert.equal(h.quote().quote.points, 500)
    assert.match(text(h.all()), /Original job: 250 points · standard model budget/)
    assert.doesNotMatch(text(h.all()), /Original job: 500 points/)
    assert.deepEqual(JSON.parse(h.storeData.get(clientModule.STUDIO_RECEIPT_KEY)).pricing, STUDIO_PRICING.standard)
    assert.equal(h.byId('studio-budget-consent').props.checked, false)
    assert.equal(h.calls.filter(c => c.method === 'POST' && !['/api/studio/reconcile-budget', '/api/billing/recovery'].includes(c.path)).length, 0)
  } finally { h.close() }
})

test('a blocked Shop automatically checks one historical funding page then uses fresh entitlement evidence', async () => {
  let released = false
  const h = await harness({ ready: true, detailedReady: true, withExistingJob: false,
    accountLookup: () => Response.json(released ? fundedAccount : blockedAccount),
    fundingLookup: () => { released = true; return Response.json({ checked: 1, reconciled: 1, unresolved: 0, nextCursor: null, hasMore: false, paidGenerationRequested: false }) },
  })
  try {
    h.byId('studio-prompt').props.onChange({ target: { value: 'My retained funding recovery draft' } }); await h.settle()
    assert.equal(h.quote().quote.state, 'credits')
    assert.equal(h.all().find(n => n.props.className === 'native-shop-generate').props.disabled, false)
    assert.equal(h.calls.filter(c => c.path === '/api/studio/reconcile-budget').length, 1)
    assert.equal(h.calls.filter(c => c.path === '/api/account/entitlements').length, 2)
    assert.equal(h.calls.filter(c => c.method === 'POST' && !['/api/studio/reconcile-budget', '/api/billing/recovery'].includes(c.path)).length, 0)
    assert.equal(h.byId('studio-prompt').props.value, 'My retained funding recovery draft')
  } finally { h.close() }
})

test('one-page funding review keeps a known denial visible, then manual refresh resumes at the returned cursor', async () => {
  let finish, released = false
  const pages = []
  const h = await harness({ ready: true, withExistingJob: false,
    accountLookup: () => Response.json(released ? fundedAccount : blockedAccount),
    fundingLookup: input => { pages.push(input); return pages.length === 1 ? new Promise(resolve => { finish = resolve }) : (released = true, Response.json({ checked: 1, reconciled: 1, unresolved: 0, nextCursor: null, hasMore: false, paidGenerationRequested: false })) },
  })
  try {
    assert.equal(h.quote().reconciling, true)
    assert.equal(h.quote().quote.reason, 'PROVIDER_BUDGET_EXHAUSTED')
    assert.equal(h.quote().quote.points, 250)
    assert.equal(h.quote().canRefresh, false)
    assert.equal(h.all().find(n => n.props.className === 'native-shop-generate').props.disabled, true)
    finish(Response.json({ checked: 8, reconciled: 0, unresolved: 8, nextCursor: oldId, hasMore: true, paidGenerationRequested: false })); await h.settle()
    assert.equal(pages.length, 1, 'No automatic second page or paid retry')
    assert.equal(h.quote().checking, false)
    assert.match(h.quote().fundingReview, /next batch/)
    h.quote().refresh(); await h.settle()
    assert.deepEqual(pages, [{ cursor: null }, { cursor: oldId }])
    assert.equal(h.quote().quote.state, 'credits')
    assert.equal(h.calls.filter(c => c.method === 'POST' && !['/api/studio/reconcile-budget', '/api/billing/recovery'].includes(c.path)).length, 0)
  } finally { h.close() }
})

test('hanging billing cannot hide funding refusal or prevent bounded historical reconciliation even if abort is ignored', async () => {
  const h = await harness({ ready: true, withExistingJob: false,
    accountLookup: () => Response.json(blockedAccount), billingLookup: () => new Promise(() => {}),
  })
  try {
    assert.equal(h.quote().quote.reason, 'PROVIDER_BUDGET_EXHAUSTED')
    assert.equal(h.quote().quote.points, 250)
    assert.equal(h.quote().checking, true)
    await h.deadline(10000)
    assert.equal(h.calls.filter(c => c.path === '/api/studio/reconcile-budget').length, 1, 'The auxiliary billing timeout must allow the funding check to proceed')
    assert.equal(h.quote().quote.reason, 'PROVIDER_BUDGET_EXHAUSTED')
    assert.equal(h.quote().checking, false)
    assert.equal(h.quote().canRefresh, true)
    assert.equal(h.all().find(n => n.props.className === 'native-shop-generate').props.type, 'button')
    assert.equal(h.all().find(n => n.props.className === 'native-shop-generate').props.disabled, false)
    assert.match(text(h.all().find(n => n.props.className === 'native-shop-generate')), /Check generation funding/ )
    assert.ok(h.delays.includes(40000), 'The auth deadline covers the upstream 25-second verification budget')
    assert.ok(h.delays.includes(90000), 'The complete review has a hard total deadline')
  } finally { h.close() }
})

test('timed-out funding review retains the original denial and ignores a late apparent release', async () => {
  let finish, accountReads = 0
  const h = await harness({ ready: true, withExistingJob: false,
    accountLookup: () => { accountReads++; return Response.json(blockedAccount) },
    fundingLookup: () => new Promise(resolve => { finish = resolve }),
  })
  try {
    assert.equal(h.quote().reconciling, true)
    await h.poll()
    assert.equal(h.quote().checking, false)
    assert.equal(h.quote().quote.reason, 'PROVIDER_BUDGET_EXHAUSTED')
    finish(Response.json({ checked: 1, reconciled: 1, unresolved: 0, nextCursor: null, hasMore: false, paidGenerationRequested: false })); await h.settle()
    assert.equal(h.quote().quote.reason, 'PROVIDER_BUDGET_EXHAUSTED')
    assert.equal(accountReads, 1, 'A late reply cannot continue a timed-out review')
  } finally { h.close() }
})

test('blocked Shop primary action checks funding without submitting, even when the check restores eligibility', async () => {
  let reviews = 0, released = false
  const h = await harness({ ready: true, withExistingJob: false, accountLookup: () => Response.json(released ? fundedAccount : blockedAccount),
    fundingLookup: () => { reviews++; if (reviews > 1) released = true; return Response.json({ checked: reviews > 1 ? 1 : 0, reconciled: reviews > 1 ? 1 : 0, unresolved: 0, nextCursor: null, hasMore: false, paidGenerationRequested: false }) },
  })
  try {
    const primary = () => h.all().find(n => n.props.className === 'native-shop-generate')
    assert.equal(primary().props.type, 'button')
    assert.equal(primary().props.disabled, false)
    assert.match(text(primary()), /Check generation funding · no charge/)
    assert.match(h.quote().fundingReview, /No eligible earlier model reservations were found/)
    assert.doesNotMatch(h.quote().fundingReview, /Earlier models were checked/)
    h.byId('studio-prompt').props.onChange({ target: { value: 'My preserved violin draft' } }); await h.settle()
    primary().props.onClick(); await h.settle()
    assert.equal(reviews, 2)
    assert.equal(h.quote().quote.state, 'credits')
    assert.equal(primary().props.type, 'submit')
    assert.equal(primary().props.disabled, false)
    assert.equal(h.byId('studio-prompt').props.value, 'My preserved violin draft')
    assert.equal(h.calls.filter(c => c.method === 'POST' && !['/api/studio/reconcile-budget', '/api/billing/recovery'].includes(c.path)).length, 0, 'Funding check never becomes a generation after eligibility changes')
  } finally { h.close() }
})

test('existing paid upgrade synchronizes Creator to Pro before the quote settles, without changing points or starting a model', async () => {
  let upgraded = false, accountReads = 0
  const h = await harness({ ready: true, detailedReady: true, withExistingJob: false,
    accountLookup: () => {
      accountReads++
      return Response.json({ ...fundedAccount, paidGenerationPolicy: 'paid-membership-no-quota-v1',
        subscription: { active: true, plan: upgraded ? 'pro' : 'creator' },
        generationAdmission: upgraded ? fundedAccount.generationAdmission : { astra: { allowed: false, reason: 'CREATOR_ASTRA_PERIOD_LIMIT' } },
        studioAdmission: upgraded ? admission() : admission(false, 'CREATOR_ASTRA_PERIOD_LIMIT') })
    },
    membershipLookup: () => { upgraded = true; return syncedMembership() },
    billingLookup: () => Response.json({ plans: { pro: { checkoutReady: false } } }),
  })
  try {
    assert.equal(accountReads, 2)
    assert.equal(h.calls.filter(c => c.path === '/api/billing/recovery').length, 1)
    assert.equal(h.quote().checking, false)
    assert.equal(h.quote().quote.state, 'credits'); assert.equal(h.quote().quote.after, 2750)
    h.byId('studio-deliverable').props.onChange({ target: { value: 'detailed-mesh' } }); await h.settle()
    assert.equal(h.byId('studio-budget-tier').props.value, 'standard')
    assert.equal(h.calls.filter(c => c.method === 'POST' && c.path !== '/api/billing/recovery').length, 0)
  } finally { h.close() }
})

test('membership recovery authentication expiry removes the previously readable generation quote', async () => {
  const h = await harness({ ready: true, withExistingJob: false,
    membershipLookup: () => Response.json({ error: 'Sign in' }, { status: 401 }),
  })
  try {
    assert.equal(h.quote().quote.state, 'signin'); assert.equal(h.quote().quote.points, null)
    assert.equal(h.calls.filter(c => c.method === 'POST' && c.path !== '/api/billing/recovery').length, 0)
  } finally { h.close() }
})

test('a pending membership lookup cannot revive account A after switching to account B', async () => {
  let resolveA
  const pendingA = new Promise(resolve => { resolveA = resolve })
  const h = await harness({ ready: true, withExistingJob: false,
    membershipLookup: owner => owner === 'owner-a' ? pendingA : Response.json({ state: 'none', canManage: false, canRetry: false }),
    accountLookup: owner => Response.json(owner === 'owner-a' ? fundedAccount : { ...fundedAccount, credits: 0, subscription: { active: false }, generationAdmission: { astra: { allowed: false, reason: 'ASTRA_PLAN_REQUIRED' } }, studioAdmission: admission(false, 'ASTRA_PLAN_REQUIRED') }),
  })
  try {
    await h.account({ user: { id: 'owner-b' }, loading: false })
    assert.equal(h.quote().quote.reason, 'ASTRA_PLAN_REQUIRED')
    resolveA(syncedMembership()); await h.settle()
    assert.equal(h.quote().quote.reason, 'ASTRA_PLAN_REQUIRED')
    assert.equal(h.quote().quote.after, null)
    assert.equal(h.calls.filter(c => c.path === '/api/billing/recovery').length, 2)
    assert.equal(h.calls.filter(c => c.method === 'POST' && c.path !== '/api/billing/recovery').length, 0)
  } finally { h.close() }
})

test('logging out and back into the same account performs fresh membership recovery', async () => {
  let recoveries = 0
  const h = await harness({ ready: true, withExistingJob: false, membershipLookup: () => { recoveries++; return syncedMembership() } })
  try {
    assert.equal(recoveries, 1)
    await h.account({ user: null, loading: false })
    assert.equal(h.quote().quote.state, 'signin')
    await h.account({ user: { id: 'owner-a' }, loading: false })
    assert.equal(recoveries, 2); assert.equal(h.quote().quote.state, 'credits')
    assert.equal(h.calls.filter(c => c.method === 'POST' && c.path !== '/api/billing/recovery').length, 0)
  } finally { h.close() }
})
