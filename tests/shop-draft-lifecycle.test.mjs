import { STUDIO_PRICING, STUDIO_PRICING_REVISION } from '../src/lib/studioPricing.ts'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setImmediate as nextTick } from 'node:timers/promises'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { loadShopComponent } from './shop-render-helper.mjs'
import * as clientModule from '../src/lib/studioClient.ts'
import { blueprintRequestId } from '../src/lib/blueprintRequest.ts'
import { FAST_DRAFT_PROFILE } from '../src/lib/studioProtocol.ts'
import { ADMISSION_FAILURE_CODES } from '../src/lib/generationAdmission.ts'
import { PAID_POINTS_POLICY, PAID_POINTS_FUNDING } from '../src/lib/paidPointsFunding.ts'

const oldId = '12345678-1234-4234-8234-123456789abc'
const newId = '87654321-1234-4234-8234-123456789abc'
const admission = (allowed = true, reason) => ({ allowed, ...(reason ? { reason } : {}), tiers: Object.fromEntries(Object.entries(STUDIO_PRICING).map(([tier, pricing]) => [tier, { allowed, ...(reason ? { reason } : {}), pricing }])) })
const fundedAccount = { credits: 3000, generationCosts: { luna: 15, sol: 50, astra: 250 }, subscription: { active: true, plan: 'pro' }, free: { fastRemaining: 2 }, billingReview: false, generationAdmission: { luna: { allowed: true }, sol: { allowed: true }, astra: { allowed: true } }, studioAdmission: admission() }
const blockedAccount = { ...fundedAccount, generationAdmission: { luna: { allowed: false, reason: 'PROVIDER_BUDGET_EXHAUSTED' }, sol: { allowed: false, reason: 'PROVIDER_BUDGET_EXHAUSTED' }, astra: { allowed: false, reason: 'PROVIDER_BUDGET_EXHAUSTED' } }, studioAdmission: admission(false, 'PROVIDER_BUDGET_EXHAUSTED') }
const makeReceipt = id => ({ id, createdAt: new Date().toISOString(), ticket: `${id}.${Date.now()}.${'a'.repeat(64)}.${'b'.repeat(64)}` })
const fastGeneration = {
  mode: 'LIVE', provenance: 'GENERATED', requestId: 'req_fast_fixture', model: 'gpt-6.1-sol',
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
async function harness({ ready = false, state = 'succeeded', failureCode, submissionRejection, submissionRejectionStatus = 409, submissionResponse, jobLookup, receiptCreatedAt, submittedAt, artifactFailure = false, artifactMalformed = false, archiveSaveFailure = false, withArchivedModel = true, solReady = ready, lunaReady = solReady, downloadAllowed, reconciliationRequired = false, withExistingJob = true, cloudCurrent = false, characterPrompt = '', detailedReady = false, pricingReady = detailedReady, newJobPolicy, existingPricing, cloudLookup, accountLookup, billingLookup, healthLookup, testPool, initialStore, initialAccount = { user: { id: 'owner-a' }, loading: false }, blueprintRecovery } = {}) {
  const selected = { ...(existingPricing ? { pricing: existingPricing } : {}), receipt: makeReceipt(oldId), prompt: 'Original brown chess knight', startedAt: new Date().toISOString() }
  if (receiptCreatedAt) selected.receipt.createdAt = receiptCreatedAt
  if (submittedAt) selected.startedAt = submittedAt
  const storeData = new Map(initialStore ?? (withExistingJob ? [[clientModule.STUDIO_RECEIPT_KEY, JSON.stringify(selected)]] : []))
  if (blueprintRecovery) storeData.set('worldifact:blueprint-recovery:v1', JSON.stringify(blueprintRecovery))
  const storage = { getItem: k => storeData.get(k) ?? null, setItem: (k,v) => { storeData.set(k,v) }, removeItem: k => { storeData.delete(k) } }
  const calls = [], blob = artifactMalformed ? new Blob(['not a GLB']) : modelBlob(), archive = new Map(withArchivedModel ? [[oldId, { id: oldId, prompt: selected.prompt, byteLength: blob.size, savedAt: selected.startedAt, sha256: 'original', review: 'UNREVIEWED' }]] : [])
  const status = { newJobPolicy, pricingRevision: STUDIO_PRICING_REVISION, tiersReady: pricingReady, detailedReady, ready, fastReady: true, fastBudgetReady: false, photoReady: true, oracle: 'CONNECTOR_READY', publicPilot: true,
    reason: ready ? 'READY' : 'DISABLED_OR_EXPIRED', allowance: { used: 6, limit: ready ? 7 : 0, remaining: ready ? 1 : 0, enabled: ready, expiresAt: null }, promptMaxLength: 4000, detailedReferenceLimit: 4 }
  const poolStatus = { commitments: [], accountContract: 'approved-test-account-v1', available: true, approvalId: 'api-tests-20261006-044444-usd4', expiresAt: '2026-10-06T12:00:00.000Z', totalCents: 400, committedCents: 0, remainingCents: 400, attempts: { 'detailed-astra': 0, 'blueprint-sol': 0, 'blueprint-luna': 0 }, noRecycling: true }
  const fetcher = async (url, init = {}) => {
    const path = String(url), method = init.method || 'GET'
    calls.push({ path, method, body: init.body, credentials: init.credentials, cache: init.cache, redirect: init.redirect })
    if (testPool && path === '/api/overnight-tests/status') return Response.json(testPool.status ?? poolStatus)
    if (testPool && path.startsWith('/api/overnight-tests/') && method === 'POST') {
      const wrapped = JSON.parse(init.body)
      assert.equal(wrapped.testContract, 'approved-test-account-v1'); assert.equal(wrapped.expectedAccountId, accountState.user.id)
      if (testPool.onPost) await testPool.onPost(path, wrapped.input)
      if (path.endsWith('/prepare')) return Response.json(makeReceipt(newId))
      if (path.endsWith('/studio/jobs')) { poolStatus.committedCents += 175; poolStatus.remainingCents -= 175; poolStatus.attempts['detailed-astra']++; poolStatus.commitments.push({ jobId: newId, workflow: 'detailed-astra', capCents: 175 }); return Response.json({ job: { id: newId, state: 'building' } }) }
      if (path.endsWith('/blueprint')) {
        const body = wrapped.input
        const model = body.model === 'sol' ? 'gpt-6.1-sol' : 'gpt-6-luna'
        const cents = body.model === 'sol' ? 35 : 10, workflow = `blueprint-${body.model}`
        poolStatus.committedCents += cents; poolStatus.remainingCents -= cents; poolStatus.attempts[workflow]++; poolStatus.commitments.push({ jobId: await blueprintRequestId(new Headers(init.headers).get('X-WORLDIFACT-Request')), workflow, capCents: cents })
        return Response.json({ ...fastGeneration, model, requestId: await blueprintRequestId(new Headers(init.headers).get('X-WORLDIFACT-Request')), delivery: { kind: 'procedural-blueprint', referenceCount: 0, fallbackUsed: false }, evidence: { providerResponseId: 'resp_test_pool_fixture', receivedAt: new Date().toISOString(), blueprintSha256: 'f'.repeat(64), inputTokens: 100, outputTokens: 10, totalTokens: 110 } })
      }
      throw new Error('Unexpected dedicated test POST')
    }
    if (testPool && path === '/api/account/entitlements' && new Headers(init.headers).has('X-WORLDIFACT-Expected-Account')) return Response.json({ ...(testPool.account ?? blockedAccount), accountContract: 'approved-test-account-v1' })
    if (testPool?.currentHandler && path === '/api/studio/current') return testPool.currentHandler(init)
    if (testPool?.blueprintRecovery && path.startsWith('/api/blueprint/requests/')) return Response.json({ state: 'completed', result: testPool.blueprintRecovery })
    if (testPool && path === '/api/studio/current' && new Headers(init.headers).has('X-WORLDIFACT-Expected-Account')) return Response.json({ accountContract: 'approved-test-account-v1', current: testPool.current ?? null })
    if (path === '/api/account/entitlements') return accountLookup ? accountLookup(accountState.user?.id, init) : Response.json(fundedAccount)
    assert.ok(!['/api/studio/reconcile-budget', '/api/billing/recovery'].includes(path), 'Availability must never invoke financial recovery')
    if (path === '/api/billing/status' && billingLookup) return billingLookup(init)
    if (path === '/api/billing/status') return Response.json({ plans: { pro: { checkoutReady: true }, studio: { checkoutReady: true } } })
    if (path === '/api/studio/status') return Response.json(status)
    if (path === '/api/studio/current' && cloudLookup) { const response = await cloudLookup(); if (!response.ok) return response; try { const value = await response.clone().json(); return Response.json({ ...value, accountContract: 'approved-test-account-v1', ...(value.current ? { current: { ...value.current, fundingSource: 'ordinary' } } : {}) }) } catch { return response } }
    if (path === '/api/studio/current') return Response.json(cloudCurrent ? { accountContract: 'approved-test-account-v1', current: { fundingSource: 'ordinary', receipt: makeReceipt(oldId), prompt: selected.prompt, startedAt: selected.startedAt, financialState: 'reserved', reservedPoints: 250 } } : { accountContract: 'approved-test-account-v1', current: null })
    if (path === '/api/health' && healthLookup) return healthLookup()
    if (path === '/api/health') return Response.json({ generationReady: solReady || lunaReady || ready, model: solReady ? 'gpt-6.1-sol' : null, lunaBlueprintReady: lunaReady, draftModels: [...(solReady ? ['sol'] : []), ...(lunaReady ? ['luna'] : [])], qualityModel: ready ? 'gpt-6-astra' : null, astraBlueprintReady: ready })
    if (path === '/api/blueprint' && method === 'POST') return Response.json({ ...fastGeneration,
      model: JSON.parse(init.body).model === 'sol' ? 'gpt-6.1-sol' : 'gpt-6-' + JSON.parse(init.body).model,
      requestId: await blueprintRequestId(new Headers(init.headers).get('X-WORLDIFACT-Request')),
      evidence: { providerResponseId: 'resp_ui_fixture', receivedAt: new Date().toISOString(), blueprintSha256: 'f'.repeat(64), inputTokens: null, outputTokens: null, totalTokens: null },
      delivery: { kind: 'procedural-blueprint', referenceCount: JSON.parse(init.body).references.length, fallbackUsed: false },
    })
    if (path === '/api/studio/prepare') { const body = JSON.parse(init.body); return Response.json({ ...makeReceipt(newId), ...(body.pricingRevision ? { pricing: STUDIO_PRICING[body.budgetTier] } : {}) }) }
    if (method === 'POST' && submissionRejection) return Response.json({ error: 'PRIVATE_UPSTREAM_MESSAGE', failureCode: submissionRejection }, { status: submissionRejectionStatus })
    if (method === 'POST' && submissionResponse) return submissionResponse()
    if (method === 'POST') return Response.json({ job: { id: newId, state: 'building' } })
    if (path.endsWith('/model') && artifactFailure) throw new TypeError('Interrupted artifact download')
    if (path.endsWith('/model')) return new Response(blob, { headers: { 'Content-Type': 'model/gltf-binary', 'Content-Length': String(blob.size) } })
    if (jobLookup) return jobLookup(path)
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
  const intervals = new Map()
  const interval = callback => { const id = ++serial; intervals.set(id, callback); return id }
  const events = new EventTarget(), pageEvents = new EventTarget(), downloads = [], anchors = new Set()
  const globals = { fetch: fetcher, URL, Blob, AbortSignal, AbortController, Event, console, setTimeout: timeout, clearTimeout: id => timers.delete(id),
    document: { visibilityState: 'visible', addEventListener: pageEvents.addEventListener.bind(pageEvents), removeEventListener: pageEvents.removeEventListener.bind(pageEvents), body: { appendChild: node => anchors.add(node) }, createElement: () => { const node = { click: () => downloads.push({ name: node.download, attached: anchors.has(node) }), remove: () => anchors.delete(node) }; return node } },
    window: { localStorage: storage, confirm: () => true, setTimeout: timeout, clearTimeout: id => timers.delete(id), setInterval: interval, clearInterval: id => intervals.delete(id), addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events), dispatchEvent: events.dispatchEvent.bind(events) } }
  const Component = await loadShopComponent({ react: hookReact, globals, adapters: {
    'react-router-dom': { useLocation: () => ({ pathname: '/shop', state: characterPrompt ? { worldPrompt: characterPrompt } : null }) },
    '../lib/account': { useAccount: () => accountState },
    '../lib/studioClient': { ...clientModule, StudioCoordinator: class extends clientModule.StudioCoordinator { constructor(store, provided) { super(store, provided ?? fetcher) } }, checkStudio: () => clientModule.checkStudio(fetcher) },
    '../lib/studioArchive': {
      listStudioModels: async () => [...archive.values()], readStudioModel: async () => blob,
      saveStudioModel: async saved => { if (archiveSaveFailure) throw new Error('Local recovery storage unavailable'); if (!archive.has(saved.receipt.id)) archive.set(saved.receipt.id, { id: saved.receipt.id, prompt: saved.prompt, savedAt: saved.startedAt, byteLength: blob.size, sha256: 'new-fixture', review: 'UNREVIEWED' }); return archive.get(saved.receipt.id) },
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
    async focus() { events.dispatchEvent(new Event('focus')); await settle() },
    async balanceChanged() { events.dispatchEvent(new Event('worldifact:balance-changed')); await settle() },
    async visibility(value) { globals.document.visibilityState = value; pageEvents.dispatchEvent(new Event('visibilitychange')); await settle() },
    async pageShow(persisted) { const event = new Event('pageshow'); Object.defineProperty(event, 'persisted', { value: persisted }); events.dispatchEvent(event); await settle() },
    byId: id => node(n => n.props.id === id),
    button: label => node(n => n.type === 'button' && text(n).includes(label)),
    all: () => elements(tree),
    async clockTick() { for (const callback of intervals.values()) callback(); await settle() },
    activeIntervals: () => intervals.size,
    description: () => text(node(n => n.props['data-testid'] === 'result-description')),
    fastDescription: () => text(node(n => n.props['data-testid'] === 'fast-result-description')),
    form: () => node(n => n.type === 'form'),
    quote: () => node(n => !!n.props.accountQuote).props.accountQuote,
    quoteMarkup: () => renderToStaticMarkup(React.createElement(MemoryRouter, null, node(n => !!n.props.accountQuote))),
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
    h.all().find(node => node.props['aria-label']?.startsWith('Select GPT-6.1 Sol')).props.onClick()
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
    assert.equal(h.calls.filter(c => c.method !== 'GET').length, 0)
  } finally { h.close() }
})

test('explicit FAST after completion sends one Sol blueprint POST and never submits an Oracle Studio job', async () => {
  const h = await harness({ ready: true })
  try {
    await h.poll()
    const storedBefore = h.storeData.get(clientModule.STUDIO_RECEIPT_KEY)
    h.byId('studio-prompt').props.onChange({ target: { value: 'A blue rook in FAST' } })
    h.byId('studio-mode').props.onChange({ target: { value: FAST_DRAFT_PROFILE } }); await h.settle()
    assert.equal(h.button('Generate GPT-6.1 Sol').props.disabled, false)
    const first = h.form().props.onSubmit({ preventDefault() {} })
    const duplicate = h.form().props.onSubmit({ preventDefault() {} })
    await Promise.all([first, duplicate]); await h.settle()
    const solPosts = h.calls.filter(c => c.path === '/api/blueprint' && c.method === 'POST')
    const studioPosts = h.calls.filter(c => c.path === '/api/studio/jobs' && c.method === 'POST')
    assert.equal(solPosts.length, 1)
    assert.equal(studioPosts.length, 0)
    assert.deepEqual(JSON.parse(solPosts[0].body), { worldId: 'enchanted-ai-shop', prompt: 'A blue rook in FAST', mode: 'live', model: 'sol', deliverable: 'procedural-blueprint', references: [], providerModel: 'gpt-6.1-sol' })
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
    assert.equal(h.calls.filter(c => c.method !== 'GET').length, 0)
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
    assert.ok(h.all().some(node => node.type === 'h2' && text(node) === 'Saved request did not finish'))
    assert.equal(h.all().some(node => node.type === 'img' && node.props.alt === 'Example 3D product preview'), false)
    assert.ok(h.storeData.get(clientModule.STUDIO_RECEIPT_KEY), 'terminal receipt remains selected until explicit dismissal')
    assert.equal(h.calls.filter(call => call.method === 'POST' && call.path !== '/api/billing/recovery').length, 0)
  } finally { h.close() }
})

test('an older failed device receipt is identified separately from a newer account model without replacing either', async () => {
  const olderReceiptTime = '2026-09-01T12:00:00.000Z'
  const newerAccountModel = { receipt: makeReceipt(newId), prompt: 'New silver spacecraft', startedAt: '2026-10-01T12:00:00.000Z', financialState: 'completed' }
  const h = await harness({ ready: true, detailedReady: true, state: 'failed', failureCode: 'ASTRA_COST_LIMIT', receiptCreatedAt: olderReceiptTime,
    cloudLookup: () => Response.json({ current: newerAccountModel }), accountLookup: () => Response.json(blockedAccount) })
  try {
    const receipt = h.storeData.get(clientModule.STUDIO_RECEIPT_KEY), archived = h.archive.get(oldId)
    await h.poll()
    h.byId('studio-prompt').props.onChange({ target: { value: 'Another editable model idea' } }); await h.settle()
    const identity = h.all().find(n => n.props['aria-label'] === 'Saved Shop request')
    assert.match(text(identity), /Saved Shop request selected on this device/)
    assert.match(text(identity), /may differ from your newest account model/)
    assert.match(text(identity), /Last known status: failed/)
    assert.match(text(identity), new RegExp('Job ID: ' + oldId))
    assert.match(text(identity), /Original brown chess knight/)
    assert.doesNotMatch(text(identity), /Another editable model idea|New silver spacecraft/)
    assert.ok(elements(identity).some(n => n.props.to === '/account/models' && text(n).includes('Open account model library')))
    assert.equal(elements(identity).find(n => n.type === 'time').props.dateTime, olderReceiptTime)
    assert.match(text(h.all()), /Reason: ASTRA_COST_LIMIT/)
    assert.match(text(identity), /Astra’s cost protection stopped this job/)
    const formColumn = h.all().find(n => n.props.className === 'native-shop-form')
    const previewColumn = h.all().find(n => n.props.className === 'native-shop-preview')
    assert.ok(elements(formColumn).includes(identity), 'Saved failure and exact identity remain together in the form column on mobile')
    assert.equal(elements(previewColumn).includes(identity), false)
    assert.equal(formColumn.props.children.filter(n => React.isValidElement(n) && n.type === 'p').some(n => /Astra’s cost protection/.test(text(n))), false, 'No detached old failure may remain below the next quote')
    assert.match(text(h.all().find(n => n.props.className === 'shop-customer-status shop-availability-details')), /Next generation is unavailable for this account/)
    assert.doesNotMatch(text(h.all().find(n => n.props.className === 'shop-customer-status shop-availability-details')), /ASTRA_COST_LIMIT|Astra’s cost protection/)
    assert.match(h.quoteMarkup(), /Reason: PROVIDER_BUDGET_EXHAUSTED/)
    assert.doesNotMatch(h.quoteMarkup(), /No Oracle generation was submitted|no points were reserved/)
    await h.focus(); await h.pageShow(true)
    h.button('Recover this job').props.onClick(); await h.settle(); await h.poll()
    assert.equal(h.storeData.get(clientModule.STUDIO_RECEIPT_KEY), receipt)
    assert.equal(h.archive.get(oldId), archived)
    assert.equal(h.calls.some(c => c.path === '/api/studio/current'), false, 'A label must not silently discover or replace the selected receipt')
    assert.equal(h.calls.filter(c => c.method !== 'GET').length, 0)
  } finally { h.close() }
})

for (const state of ['queued', 'building', 'succeeded']) test(`an accepted ${state} job stays distinct from the blocked next quote after its one-use funding is consumed`, async () => {
  let consumed = false
  const h = await harness({ ready: true, detailedReady: true, withExistingJob: false, state,
    accountLookup: () => Response.json(consumed ? blockedAccount : fundedAccount),
    submissionResponse: () => { consumed = true; return Response.json({ job: { id: newId, state } }) },
  })
  try {
    h.byId('studio-prompt').props.onChange({ target: { value: 'Detailed synthetic model' } })
    h.byId('studio-deliverable').props.onChange({ target: { value: 'detailed-mesh' } }); await h.settle()
    await h.form().props.onSubmit({ preventDefault() {} }); await h.settle(); await h.poll()
    assert.equal(h.quote().quote.reason, 'PROVIDER_BUDGET_EXHAUSTED')
    const identity = h.all().find(n => n.props['aria-label'] === 'Saved Shop request')
    assert.match(text(identity), new RegExp('Job ID: ' + newId))
    assert.match(text(identity), new RegExp('Last known status: ' + state))
    assert.match(h.quoteMarkup(), /Next generation: 250 points/)
    assert.doesNotMatch(text(h.all()) + h.quoteMarkup(), /No Oracle generation was submitted|no points were reserved|model generation has not started/i)
    const receipt = h.storeData.get(clientModule.STUDIO_RECEIPT_KEY)
    await h.focus(); await h.form().props.onSubmit({ preventDefault() {} }); await h.settle()
    assert.equal(h.calls.filter(c => c.path === '/api/studio/prepare').length, 1)
    assert.equal(h.calls.filter(c => c.path === '/api/studio/jobs' && c.method === 'POST').length, 1)
    assert.deepEqual(h.calls.filter(c => c.method !== 'GET').map(c => c.path), ['/api/studio/prepare', '/api/studio/jobs'])
    assert.equal(h.storeData.get(clientModule.STUDIO_RECEIPT_KEY), receipt)
  } finally { h.close() }
})

test('a lost submission response keeps acceptance unknown and recovers the same job while next funding is blocked', async () => {
  let consumed = false
  const h = await harness({ ready: true, detailedReady: true, withExistingJob: false, state: 'building',
    accountLookup: () => Response.json(consumed ? blockedAccount : fundedAccount),
    submissionResponse: () => { consumed = true; throw new TypeError('Synthetic lost submission response') },
  })
  try {
    h.byId('studio-prompt').props.onChange({ target: { value: 'Detailed synthetic model with lost response' } })
    h.byId('studio-deliverable').props.onChange({ target: { value: 'detailed-mesh' } }); await h.settle()
    await h.form().props.onSubmit({ preventDefault() {} }); await h.settle()
    assert.match(text(h.all()), /Last known status: awaiting acceptance confirmation/)
    assert.match(text(h.all()), /Checking whether your request was accepted/)
    assert.doesNotMatch(text(h.all()) + h.quoteMarkup(), /No Oracle generation was submitted|no points were reserved|current model is being completed/i)
    const receipt = h.storeData.get(clientModule.STUDIO_RECEIPT_KEY)
    h.button('Recover this job').props.onClick(); await h.settle(); await h.poll()
    assert.match(text(h.all()), /Last known status: building/)
    assert.equal(h.storeData.get(clientModule.STUDIO_RECEIPT_KEY), receipt)
    assert.equal(h.calls.filter(c => c.path === '/api/studio/jobs' && c.method === 'POST').length, 1)
    assert.deepEqual(h.calls.filter(c => c.method !== 'GET').map(c => c.path), ['/api/studio/prepare', '/api/studio/jobs'])
  } finally { h.close() }
})

test('an expired recovery receipt does not label the unknown model as failed', async () => {
  const h = await harness({ ready: true, detailedReady: true, accountLookup: () => Response.json(blockedAccount),
    jobLookup: () => Response.json({ error: 'This job receipt expired. Keep your saved model.' }, { status: 401 }),
  })
  try {
    const receipt = h.storeData.get(clientModule.STUDIO_RECEIPT_KEY)
    await h.poll()
    assert.match(text(h.all()), /Saved request needs a recovery check/)
    assert.match(text(h.all()), /Last known status: unknown/)
    assert.match(text(h.all()), /The old model status is unknown/)
    assert.doesNotMatch(text(h.all()) + h.quoteMarkup(), /Saved request did not finish|Last known status: failed|No Oracle generation was submitted/)
    assert.equal(h.storeData.get(clientModule.STUDIO_RECEIPT_KEY), receipt)
    assert.deepEqual(JSON.parse(h.storeData.get(clientModule.STUDIO_RECEIPT_HISTORY_PREFIX + oldId)), JSON.parse(receipt))
    assert.equal(h.calls.filter(c => c.method !== 'GET').length, 0)
  } finally { h.close() }
})

test('other next-request admission refusals preserve the accepted job and exact refusal reason', async () => {
  for (const reason of ['CREDITS_EXHAUSTED', 'ASTRA_RUNTIME_DISABLED', 'ACCOUNT_ADMISSION_UNAVAILABLE']) {
    const h = await harness({ ready: true, detailedReady: true, state: 'building',
      accountLookup: () => Response.json({ ...fundedAccount, studioAdmission: admission(false, reason) }),
    })
    try {
      await h.poll()
      assert.match(text(h.all()), /Last known status: building/)
      assert.match(h.quoteMarkup(), new RegExp('Reason: ' + reason))
      assert.doesNotMatch(text(h.all()) + h.quoteMarkup(), /No Oracle generation was submitted|no points were reserved|generation has not started/i)
      assert.equal(h.calls.filter(c => c.method !== 'GET').length, 0)
    } finally { h.close() }
  }
})

test('a worker refusal is scoped to the next generation while the saved accepted job keeps its status', async () => {
  const h = await harness({ state: 'building', accountLookup: () => Response.json(blockedAccount) })
  try {
    await h.poll()
    assert.match(text(h.all()), /Last known status: building/)
    assert.match(text(h.all()), /Next generation: Astra\/Blender model generation is awaiting server activation/)
    assert.match(text(h.all()), /Next generation: Astra\/Blender model generation is awaiting server activation\.[\s\S]*Existing requests keep their own status and price/)
    assert.doesNotMatch(text(h.all()) + h.quoteMarkup(), /No points reserved — model generation has not started|No Oracle generation was submitted/)
    assert.equal(h.calls.filter(c => c.method !== 'GET').length, 0)
  } finally { h.close() }
})

test('an invalid legacy receipt date remains preserved without rendering an invented date or submitting', async () => {
  const h = await harness({ receiptCreatedAt: 'unknown-date' })
  try {
    assert.equal(JSON.parse(h.storeData.get(clientModule.STUDIO_RECEIPT_KEY)).receipt.createdAt, 'unknown-date')
    assert.equal(h.all().some(n => n.type === 'time'), false)
    assert.doesNotMatch(text(h.all()), /Invalid Date/)
    assert.equal(h.calls.filter(c => c.method !== 'GET').length, 0)
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


test('confirmed empty cloud recovery shows original vector empty state, never a fabricated generated model', async () => {
  const h = await harness({ withExistingJob: false })
  try {
    assert.ok(h.calls.some(call => call.path === '/api/studio/current' && call.method === 'GET'))
    assert.ok(h.all().some(node => node.props.className === 'shop-creation-art' && node.props['aria-hidden'] === 'true'))
    assert.match(text(h.all()), /WAITING FOR YOUR FIRST CREATION/)
    assert.equal(h.all().some(node => node.type === 'img'), false)
    assert.equal(h.calls.filter(call => call.method === 'POST').length, 0)
  } finally { h.close() }
})

test('a pending cloud lookup blocks both blueprint and detailed submissions until the existing job is known', async () => {
  for (const detailed of [false, true]) {
    let finishLookup
    const lookup = new Promise(resolve => { finishLookup = resolve })
    const h = await harness({ ready: true, detailedReady: true, withExistingJob: false, cloudLookup: () => lookup })
    try {
      h.byId('studio-prompt').props.onChange({ target: { value: detailed ? 'Recreate this detailed adult character model' : 'A blue rook concept' } })
      h.byId('studio-deliverable').props.onChange({ target: { value: detailed ? 'detailed-mesh' : 'procedural-blueprint' } })
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
    assert.equal(h.calls.filter(c => c.method !== 'GET').length, 0)
  } finally { h.close() }
})


test('a completed model whose preview download is interrupted never receives failure-reason wording', async () => {
  const h = await harness({ ready: true, state: 'succeeded', artifactFailure: true })
  try {
    await h.poll()
    const visible = text(h.all())
    assert.match(visible, /Your model is complete/)
    assert.doesNotMatch(visible, /original failure reason was not saved/)
    assert.equal(h.calls.filter(c => c.method !== 'GET').length, 0)
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
    assert.doesNotMatch(visible, /Saved request did not finish|original failure reason was not saved/)
    assert.equal(h.calls.filter(c => c.method !== 'GET').length, 0)
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
      assert.doesNotMatch(visible, /Saved request did not finish|original failure reason was not saved|points were released/)
      assert.equal(h.calls.filter(c => c.method !== 'GET').length, 0)
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
    assert.doesNotMatch(visible, /Saved request did not finish|PRIVATE_UPSTREAM_MESSAGE|Not enough available points|points were released/)
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
      const status = h.all().find(n => n.props.className === 'shop-customer-status shop-availability-details')
      assert.match(text(status), /Next generation is unavailable for this account/)
      assert.match(text(status), /unreserved API funding/i)
      assert.doesNotMatch(text(status), /generation available/)
      await h.form().props.onSubmit({ preventDefault() {} }); await h.settle()
    }
    assert.equal(h.calls.filter(c => c.path === '/api/account/entitlements').length, 1)
    assert.equal(h.calls.filter(c => c.path === '/api/billing/status').length, 1)
    assert.equal(h.calls.filter(c => c.method !== 'GET').length, 0)
    assert.equal(h.byId('studio-prompt').props.disabled, false)
    assert.equal(h.byId('studio-photos').props.disabled, false)
  } finally { h.close() }
})

test('explicit paid-points admission enables both ready Shop routes from one quote without recovery or automatic generation', async () => {
  for (const plan of ['creator', 'pro', 'studio']) {
    const current = { ...fundedAccount, paidGenerationPolicy: PAID_POINTS_POLICY, credits: 1190, availableCredits: 1190, reservedCredits: 0,
      subscription: { active: true, plan }, creatorAstra: { active: false, remaining: 0 } }
    const h = await harness({ ready: true, detailedReady: true, withExistingJob: false,
      accountLookup: () => Response.json(current), billingLookup: () => Response.json({ plans: { [plan]: { checkoutReady: false } } }) })
    try {
      h.byId('studio-prompt').props.onChange({ target: { value: 'A detailed blue rook' } }); await h.settle()
      for (const delivery of ['procedural-blueprint', 'detailed-mesh']) {
        h.byId('studio-deliverable').props.onChange({ target: { value: delivery } }); await h.settle()
        assert.equal(h.quote().quote.state, 'credits'); assert.equal(h.quote().quote.after, 940)
        assert.equal(h.quote().quote.fundingSource, PAID_POINTS_FUNDING)
        const primary = h.all().find(node => node.props.className === 'native-shop-generate')
        assert.equal(primary.props.type, 'submit'); assert.equal(primary.props.disabled, false)
        assert.doesNotMatch(text(primary), /Check generation funding/)
        assert.match(h.quoteMarkup(), /without a separate account API reserve/)
      }
      assert.equal(h.calls.filter(call => call.path === '/api/account/entitlements').length, 1)
      assert.equal(h.calls.filter(call => call.method !== 'GET').length, 0)
      assert.equal(h.storeData.has(clientModule.STUDIO_RECEIPT_KEY), false)
    } finally { h.close() }
  }
})

test('failed paid-points model shows manual financial review, stops automatic reads and keeps enough remaining points usable', async () => {
  const current = { ...fundedAccount, paidGenerationPolicy: PAID_POINTS_POLICY, credits: 1190, availableCredits: 940, reservedCredits: 250 }
  const h = await harness({ ready: true, detailedReady: true,
    accountLookup: () => Response.json(current),
    jobLookup: () => Response.json({ job: { id: oldId, state: 'failed', failureCode: 'ASTRA_COST_LIMIT', pointSettlement: { version: 1, state: 'pending-cost', heldPoints: 250, chargedPoints: 0 } } }) })
  try {
    await h.poll()
    const visible = text(h.all())
    assert.match(visible, /Generation failed · points held for cost review/)
    assert.match(visible, /250 points remain held for cost review/)
    assert.match(visible, /manual review is needed/)
    assert.doesNotMatch(visible, /Reserved customer points were released/)
    assert.equal(h.quote().quote.after, 690)
    h.byId('studio-prompt').props.onChange({ target: { value: 'A separately requested new blue rook' } }); await h.settle()
    assert.equal(h.button('Generate Astra/Blender model').props.disabled, false)
    await assert.rejects(h.poll(), /Recovery should have scheduled a GET/)
    assert.equal(h.calls.filter(call => call.method === 'POST').length, 0)
    assert.equal(JSON.parse(h.storeData.get(clientModule.STUDIO_RECEIPT_KEY)).receipt.id, oldId)
  } finally { h.close() }
})

test('budget-stopped Shop result explains absent completed preview/gallery while preserving held points and original request', async () => {
  const current = { ...fundedAccount, paidGenerationPolicy: PAID_POINTS_POLICY, credits: 1190, availableCredits: 940, reservedCredits: 250 }
  const h = await harness({ ready: true, detailedReady: true,
    accountLookup: () => Response.json(current),
    jobLookup: () => Response.json({ job: { id: oldId, state: 'failed', failureCode: 'MODEL_BUDGET_EXCEEDED', pointSettlement: { version: 1, state: 'pending-cost', heldPoints: 250, chargedPoints: 0 } } }) })
  try {
    await h.poll()
    const visible = text(h.all())
    assert.match(visible, /next API request did not fit the remaining model budget/)
    assert.match(visible, /no completed, verified model for the preview or completed-model gallery/)
    assert.match(visible, /250 points remain held for cost review/)
    assert.match(visible, /manual review is needed/)
    assert.doesNotMatch(visible, /Simplify this draft|Reserved customer points were released|Your model is complete/)
    assert.equal(h.calls.filter(call => call.method !== 'GET').length, 0)
    assert.equal(h.calls.some(call => call.path.endsWith('/model')), false)
    assert.equal(JSON.parse(h.storeData.get(clientModule.STUDIO_RECEIPT_KEY)).receipt.id, oldId)
    await assert.rejects(h.poll(), /Recovery should have scheduled a GET/)
  } finally { h.close() }
})

test('switching models recomputes costs from the same snapshot and distinguishes detailed admission', async () => {
  const h = await harness({ ready: true, detailedReady: true, withExistingJob: false, accountLookup: () => Response.json({ ...fundedAccount, studioAdmission: admission(false, 'PROVIDER_BUDGET_EXHAUSTED') }) })
  try {
    h.byId('studio-deliverable').props.onChange({ target: { value: 'procedural-blueprint' } }); await h.settle()
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
    assert.equal(h.calls.filter(c => c.method !== 'GET').length, 0)
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
    assert.equal(h.calls.filter(c => c.method !== 'GET').length, 0)
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
    assert.equal(h.calls.filter(c => c.method !== 'GET').length, 0)
  } finally { h.close() }
})

test('balance refresh invalidates the allowed quote while pending and ignores an older response', async () => {
  const responses = []
  let count = 0
  const h = await harness({ ready: true, withExistingJob: false, accountLookup: () => ++count === 1 ? Response.json(fundedAccount) : new Promise(resolve => responses.push(resolve)) })
  try {
    h.byId('studio-deliverable').props.onChange({ target: { value: 'procedural-blueprint' } }); await h.settle()
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
    h.byId('studio-deliverable').props.onChange({ target: { value: 'procedural-blueprint' } }); await h.settle()
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
      assert.equal(h.calls.filter(c => c.method !== 'GET').length, 0, 'resuming must not submit or retry a paid request')
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
      assert.equal(h.calls.filter(c => c.method !== 'GET').length, 0)
    } finally { h.close() }
  }
})

test('signout and account switching pause automatic selected-job requests without losing the receipt', async () => {
  const h = await harness({ ready: true, state: 'building' })
  try {
    const receipt = h.storeData.get(clientModule.STUDIO_RECEIPT_KEY)
    await h.account({ user: null, loading: false })
    assert.equal(h.storeData.get(clientModule.STUDIO_RECEIPT_KEY), receipt)
    assert.doesNotMatch(text(h.all().find(n => n.props['aria-label'] === 'Saved Shop request')), /Saved request description|Original brown chess knight/)
    await assert.rejects(h.poll(), /Recovery should have scheduled a GET/)
    await h.account({ user: { id: 'owner-b' }, loading: false })
    assert.match(text(h.all()), /Sign in to the original account to recover this model/)
    const identity = h.all().find(n => n.props['aria-label'] === 'Saved Shop request')
    assert.doesNotMatch(text(identity), /Saved request description|Original brown chess knight/)
    assert.ok(elements(identity).some(n => n.props.to === '/account/models'))
    assert.equal(h.calls.filter(c => c.path.startsWith('/api/studio/jobs/')).length, 0)
    assert.equal(h.storeData.get(clientModule.STUDIO_RECEIPT_KEY), receipt)
    assert.equal(h.button('Recover this job').props.disabled, false)
    assert.equal(h.calls.filter(c => c.method !== 'GET').length, 0)
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
    assert.equal(h.calls.filter(c => c.method !== 'GET').length, 0)
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
    assert.equal(h.calls.filter(c => c.method !== 'GET').length, 0)
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
    assert.equal(h.calls.filter(c => c.method !== 'GET').length, 0)
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
    assert.equal(h.calls.filter(c => c.method !== 'GET').length, 0)
  } finally { h.close() }
})

test('initial load, focus, mobile resume, pageshow and balance signals only read current availability', async () => {
  for (const account of [fundedAccount, blockedAccount]) {
    const h = await harness({ ready: true, detailedReady: true, withExistingJob: false, accountLookup: () => Response.json(account) })
    try {
      let reads = 1
      for (const refresh of [() => h.focus(), () => h.visibility('visible'), () => h.pageShow(true), () => h.balanceChanged(), async () => { h.quote().refresh(); await h.settle() }]) {
        assert.equal(h.calls.filter(c => c.path === '/api/account/entitlements').length, reads)
        assert.equal(h.calls.filter(c => c.method !== 'GET').length, 0)
        assert.equal(h.quote().quote.state, account === fundedAccount ? 'credits' : 'blocked')
        await refresh(); reads++
      }
      assert.equal(h.calls.filter(c => c.path === '/api/account/entitlements').length, reads)
      assert.equal(h.calls.filter(c => c.path === '/api/billing/status').length, reads)
      assert.equal(h.calls.filter(c => c.method !== 'GET').length, 0)
      const quoteCalls = h.calls.filter(c => ['/api/account/entitlements', '/api/billing/status'].includes(c.path))
      for (const call of quoteCalls) {
        assert.equal(call.credentials, 'same-origin'); assert.equal(call.cache, 'no-store'); assert.equal(call.redirect, 'error')
      }
    } finally { h.close() }
  }
})

test('model, delivery, budget and prompt edits reuse the authenticated GET snapshot without financial recovery', async () => {
  const h = await harness({ ready: true, detailedReady: true, withExistingJob: false })
  try {
    const before = h.calls.length
    for (const [model, points] of [['luna', 15], [FAST_DRAFT_PROFILE, 50], ['standard', 250]]) {
      h.byId('studio-mode').props.onChange({ target: { value: model } }); await h.settle()
      h.byId('studio-prompt').props.onChange({ target: { value: 'Keep my ' + model + ' draft' } }); await h.settle()
      assert.equal(h.quote().quote.points, points)
      assert.equal(h.quote().quote.after, 3000 - points)
    }
    h.byId('studio-deliverable').props.onChange({ target: { value: 'detailed-mesh' } }); await h.settle()
    h.byId('studio-budget-tier').props.onChange({ target: { value: 'extended' } }); await h.settle()
    assert.equal(h.quote().quote.points, 500); assert.equal(h.quote().quote.after, 2500)
    assert.equal(h.calls.length, before, 'Editing the selected quote does not perform a network operation')
    assert.equal(h.calls.filter(c => c.method !== 'GET').length, 0)
  } finally { h.close() }
})

test('hanging billing preserves the authenticated refusal and settles without financial recovery', async () => {
  const h = await harness({ ready: true, withExistingJob: false,
    accountLookup: () => Response.json(blockedAccount), billingLookup: () => new Promise(() => {}),
  })
  try {
    assert.equal(h.quote().quote.reason, 'PROVIDER_BUDGET_EXHAUSTED')
    assert.equal(h.quote().quote.points, 250)
    assert.equal(h.quote().checking, true)
    await h.deadline(10000)
    assert.equal(h.quote().quote.reason, 'PROVIDER_BUDGET_EXHAUSTED')
    assert.equal(h.quote().checking, false); assert.equal(h.quote().canRefresh, true)
    assert.equal(h.calls.filter(c => c.method !== 'GET').length, 0)
    assert.equal(h.calls.filter(c => c.path === '/api/account/entitlements').length, 1)
    assert.ok(h.delays.includes(40000), 'The auth deadline covers the upstream 25-second verification budget')
  } finally { h.close() }
})

test('timed-out account reads stay fail-closed and ignore late allowance even when abort is ignored', async () => {
  let finish, requestSignal
  const h = await harness({ ready: true, withExistingJob: false,
    accountLookup: (_owner, init) => { requestSignal = init.signal; return new Promise(resolve => { finish = resolve }) },
  })
  try {
    assert.equal(h.quote().checking, true)
    await h.deadline(40000)
    assert.equal(requestSignal.aborted, true)
    assert.equal(h.quote().checking, false); assert.equal(h.quote().quote.state, 'pending')
    finish(Response.json(fundedAccount)); await h.settle()
    assert.equal(h.quote().quote.state, 'pending'); assert.equal(h.quote().quote.points, null)
    assert.equal(h.calls.filter(c => c.method !== 'GET').length, 0)
    assert.equal(h.calls.filter(c => c.path === '/api/account/entitlements').length, 1)
  } finally { h.close() }
})

test('blocked Shop refresh only reads new admission and never turns restored eligibility into generation', async () => {
  let available = false
  const h = await harness({ ready: true, withExistingJob: false, accountLookup: () => Response.json(available ? fundedAccount : blockedAccount) })
  try {
    h.byId('studio-deliverable').props.onChange({ target: { value: 'procedural-blueprint' } }); await h.settle()
    const primary = () => h.all().find(n => n.props.className === 'native-shop-generate')
    assert.equal(primary().props.type, 'button'); assert.equal(primary().props.disabled, false)
    h.byId('studio-prompt').props.onChange({ target: { value: 'My preserved violin draft' } }); await h.settle()
    primary().props.onClick(); await h.settle()
    assert.equal(h.quote().quote.reason, 'PROVIDER_BUDGET_EXHAUSTED')
    available = true
    primary().props.onClick(); await h.settle()
    assert.equal(h.quote().quote.state, 'credits')
    assert.equal(primary().props.type, 'submit'); assert.equal(primary().props.disabled, false)
    assert.equal(h.byId('studio-prompt').props.value, 'My preserved violin draft')
    assert.equal(h.calls.filter(c => c.method !== 'GET').length, 0)
  } finally { h.close() }
})

test('current Pro GET admission remains authoritative when billing is unavailable without refreshing membership', async () => {
  for (const account of [fundedAccount, blockedAccount]) {
    const current = { ...account, paidGenerationPolicy: 'paid-membership-no-quota-v1' }
    const h = await harness({ ready: true, detailedReady: true, withExistingJob: false,
      accountLookup: () => Response.json(current), billingLookup: () => { throw new TypeError('Billing unavailable') },
    })
    try {
      for (let i = 0; i < 2; i++) {
        assert.equal(h.quote().checking, false)
        assert.equal(h.quote().quote.points, 250)
        assert.equal(h.quote().quote.state, account === fundedAccount ? 'credits' : 'blocked')
        assert.equal(h.quote().quote.reason, account === fundedAccount ? undefined : 'PROVIDER_BUDGET_EXHAUSTED')
        assert.equal(h.quote().quote.after, account === fundedAccount ? 2750 : null)
        await h.focus()
      }
      assert.equal(current.subscription.active, true); assert.equal(current.subscription.plan, 'pro')
      assert.equal(h.calls.filter(c => c.method !== 'GET').length, 0)
    } finally { h.close() }
  }
})

test('stale membership admission stays blocked until the authenticated GET changes', async () => {
  let upgraded = false
  const h = await harness({ ready: true, withExistingJob: false,
    accountLookup: () => Response.json(upgraded ? { ...fundedAccount, paidGenerationPolicy: 'paid-membership-no-quota-v1' } : {
      ...fundedAccount, subscription: { active: true, plan: 'creator' }, generationAdmission: { astra: { allowed: false, reason: 'CREATOR_ASTRA_PERIOD_LIMIT' } },
    }),
  })
  try {
    h.byId('studio-deliverable').props.onChange({ target: { value: 'procedural-blueprint' } }); await h.settle()
    assert.equal(h.quote().quote.reason, 'CREATOR_ASTRA_PERIOD_LIMIT')
    await h.focus(); assert.equal(h.quote().quote.reason, 'CREATOR_ASTRA_PERIOD_LIMIT')
    upgraded = true
    await h.focus(); assert.equal(h.quote().quote.state, 'credits')
    assert.equal(h.quote().quote.after, 2750)
    assert.equal(h.calls.filter(c => c.method !== 'GET').length, 0)
  } finally { h.close() }
})

test('supplemental GET admission is usable only on its existing detailed route and its grant flag cannot override a refusal', async () => {
  let allowed = true
  const h = await harness({ ready: true, detailedReady: true, newJobPolicy: 'legacy-usd175-v1', pricingReady: false, withExistingJob: false,
    accountLookup: () => Response.json({ ...blockedAccount, paidGenerationPolicy: 'paid-membership-no-quota-v1',
      astraSupplementalGrant: { available: true, consumed: false }, studioAdmission: { allowed, ...(allowed ? {} : { reason: 'PROVIDER_BUDGET_EXHAUSTED' }) },
    }),
    billingLookup: () => Response.json({}, { status: 503 }),
  })
  try {
    h.byId('studio-deliverable').props.onChange({ target: { value: 'procedural-blueprint' } }); await h.settle()
    assert.equal(h.quote().quote.reason, 'PROVIDER_BUDGET_EXHAUSTED', 'A supplemental detailed allowance never unlocks blueprint')
    h.byId('studio-deliverable').props.onChange({ target: { value: 'detailed-mesh' } }); await h.settle()
    assert.equal(h.quote().quote.state, 'credits'); assert.equal(h.quote().quote.points, 250)
    allowed = false
    await h.balanceChanged()
    assert.equal(h.quote().quote.reason, 'PROVIDER_BUDGET_EXHAUSTED', 'Only admission is authoritative, even with an available grant flag')
    assert.equal(h.calls.filter(c => c.method !== 'GET').length, 0)
  } finally { h.close() }
})

test('logging out and back into the same account reads fresh entitlements without membership repair', async () => {
  let reads = 0
  const h = await harness({ ready: true, withExistingJob: false, accountLookup: () => { reads++; return Response.json(fundedAccount) } })
  try {
    assert.equal(reads, 1)
    await h.account({ user: null, loading: false })
    assert.equal(h.quote().quote.state, 'signin')
    await h.account({ user: { id: 'owner-a' }, loading: false })
    assert.equal(reads, 2); assert.equal(h.quote().quote.state, 'credits')
    assert.equal(h.calls.filter(c => c.method !== 'GET').length, 0)
  } finally { h.close() }
})

test('explicit detailed choice preserves draft and recovered preview, transfers focus, and waits for Generate', async () => {
  const h = await harness({ ready: true, detailedReady: true, newJobPolicy: 'legacy-usd175-v1', pricingReady: false })
  try {
    await h.poll()
    const receipt = h.storeData.get(clientModule.STUDIO_RECEIPT_KEY), original = h.description()
    let focused = 0
    h.byId('studio-deliverable').props.ref.current = { focus() { focused++ } }
    h.byId('studio-prompt').props.onChange({ target: { value: 'A planet Earth 3D model' } })
    h.byId('studio-deliverable').props.onChange({ target: { value: 'procedural-blueprint' } }); await h.settle()
    assert.equal(h.byId('studio-deliverable').props.value, 'procedural-blueprint', 'Choosing the old concept route remains explicit')
    const choice = h.button('Use detailed 3D model')
    assert.equal(choice.props.type, 'button', 'Native Enter/Space activates this choice without submitting its form')
    choice.props.onClick(); choice.props.onClick(); await h.settle()
    assert.equal(h.byId('studio-deliverable').props.value, 'detailed-mesh')
    assert.equal(focused, 2, 'Focus stays on the persistent select when the shortcut disappears')
    assert.equal(h.byId('studio-prompt').props.value, 'A planet Earth 3D model')
    assert.equal(h.byId('studio-mode').props.value, 'standard')
    assert.equal(h.description(), original)
    assert.match(text(h.all()), /250 points on success, with the original USD 1.75 API budget/)
    assert.match(text(h.all().find(n => n.props.className === 'native-shop-generate')), /Generate Astra\/Blender model · 250 points/)
    await h.pageShow(true)
    h.button('Recover this job / reload result').props.onClick(); await h.settle()
    assert.equal(h.byId('studio-deliverable').props.value, 'detailed-mesh')
    assert.equal(h.description(), original)
    assert.equal(h.storeData.get(clientModule.STUDIO_RECEIPT_KEY), receipt)
    h.byId('studio-deliverable').props.onChange({ target: { value: 'procedural-blueprint' } }); await h.settle()
    assert.ok(h.button('Use detailed 3D model'))
    h.button('Clear next-model draft').props.onClick(); await h.settle()
    assert.equal(h.byId('studio-prompt').props.value, '')
    assert.equal(h.byId('studio-deliverable').props.value, 'detailed-mesh')
    assert.equal(h.description(), original)
    assert.equal(h.calls.filter(c => c.method !== 'GET').length, 0)
  } finally { h.close() }
})

test('detailed choice cannot bypass account funding refusal or choose a premium model from FAST', async () => {
  const h = await harness({ ready: true, detailedReady: true, withExistingJob: false, accountLookup: () => Response.json(blockedAccount) })
  try {
    h.byId('studio-deliverable').props.onChange({ target: { value: 'procedural-blueprint' } }); await h.settle()
    h.byId('studio-prompt').props.onChange({ target: { value: 'A planet Earth 3D model' } }); await h.settle()
    h.button('Use detailed 3D model').props.onClick(); await h.settle()
    assert.equal(h.byId('studio-deliverable').props.value, 'detailed-mesh')
    assert.equal(h.quote().quote.reason, 'PROVIDER_BUDGET_EXHAUSTED')
    await h.form().props.onSubmit({ preventDefault() {} }); await h.settle()
    assert.equal(h.calls.filter(c => c.method !== 'GET').length, 0)
    h.byId('studio-mode').props.onChange({ target: { value: FAST_DRAFT_PROFILE } }); await h.settle()
    assert.equal(h.all().some(n => n.props['data-testid'] === 'choose-detailed-model'), false)
    assert.equal(h.byId('studio-mode').props.value, FAST_DRAFT_PROFILE)
  } finally { h.close() }
})

for (const state of ['succeeded', 'failed']) test(`recorded worker duration stays visible for the selected ${state} job and never uses receipt or submission age`, async () => {
  const h = await harness({ ready: true, detailedReady: true, state, receiptCreatedAt: '2026-01-01T00:00:00.000Z', submittedAt: '2026-02-01T00:00:00.000Z',
    jobLookup: () => Response.json({ job: { id: oldId, state, ...(state === 'failed' ? { failureCode: 'ASTRA_COST_LIMIT' } : {}), generationTiming: { source: 'oracle-worker', durationSeconds: 95.4 } } }),
  })
  try {
    const receipt = h.storeData.get(clientModule.STUDIO_RECEIPT_KEY), archived = h.archive.get(oldId)
    await h.poll()
    const panel = () => h.all().find(n => n.props['aria-label'] === 'Saved Shop request')
    assert.match(text(panel()), /Recorded worker generation time: 1m 35s/)
    assert.match(text(panel()), /Excludes upload and queue time/)
    assert.match(text(panel()), new RegExp(`Job ID: ${oldId} · Last known status: ${state}`))
    assert.equal(h.activeIntervals(), 0)
    await h.clockTick()
    assert.match(text(panel()), /Recorded worker generation time: 1m 35s/)
    assert.doesNotMatch(text(h.all()), /Elapsed since this request was tracked:/)
    assert.equal(h.storeData.get(clientModule.STUDIO_RECEIPT_KEY), receipt)
    assert.equal(h.archive.get(oldId), archived)
    assert.equal(h.calls.filter(c => c.method !== 'GET').length, 0)
  } finally { h.close() }
})

for (const state of ['succeeded', 'failed']) test(`legacy ${state} job without worker timing shows unavailable rather than zero or receipt-derived duration`, async () => {
  const h = await harness({ ready: true, state, receiptCreatedAt: '2026-01-01T00:00:00.000Z', submittedAt: '2026-02-01T00:00:00.000Z' })
  try {
    await h.poll()
    const panel = h.all().find(n => n.props['aria-label'] === 'Saved Shop request')
    assert.match(text(panel), /Recorded worker generation time: Duration unavailable/)
    assert.doesNotMatch(text(panel), /Recorded worker generation time: 0s/)
    assert.equal(h.calls.filter(c => c.method !== 'GET').length, 0)
  } finally { h.close() }
})

test('an active saved request labels client elapsed separately and blocks next-generation readiness until terminal', async () => {
  const h = await harness({ ready: true, detailedReady: true, state: 'building' })
  try {
    await h.poll()
    const selected = h.all().find(n => n.props['aria-label'] === 'Saved Shop request')
    assert.match(text(selected), /Elapsed since this request was tracked: .*Includes waiting; not worker generation time/)
    assert.match(text(h.all()), /Recorded worker generation time: Duration unavailable/)
    const availability = h.all().find(n => n.props.className === 'shop-customer-status shop-availability-details')
    assert.match(text(availability), /Next generation is waiting for the selected request/)
    assert.match(text(availability), new RegExp(`Recover selected job ${oldId}`))
    assert.doesNotMatch(text(availability), /model generation available/)
    assert.equal(h.button('Generate Astra/Blender model').props.disabled, true)
    assert.equal(h.calls.filter(c => c.method !== 'GET').length, 0)
  } finally { h.close() }
})


test('historical progress text preserves saved-job status without decorative progress claims', async () => {
  const h = await harness({ state: 'building', accountLookup: () => Response.json(blockedAccount) })
  try {
    await h.poll()
    const selected = h.all().find(node => node.props['aria-label'] === 'Saved Shop request')
    assert.match(text(selected), new RegExp(`Job ID: ${oldId} · Last known status: building`))
    assert.match(text(selected), /Elapsed since this request was tracked/)
    assert.equal(h.all().some(node => node.type?.name === 'GenerationProgressOrb'), false)
    assert.doesNotMatch(text(h.all()), /100%|100 percent|Estimated stage progress/)
    assert.equal(h.quote().quote.reason, 'PROVIDER_BUDGET_EXHAUSTED')
    assert.equal(h.calls.filter(call => call.method !== 'GET').length, 0)
  } finally { h.close() }
})

test('historical preview still saves the exact recovered model before enabling its download', async () => {
  const h = await harness({ state: 'succeeded', withArchivedModel: false })
  try {
    await h.poll()
    assert.equal(h.archive.has(oldId), true)
    assert.match(h.description(), /Original brown chess knight/)
    assert.equal(h.button('Download model · GLB').props.disabled, false)
    assert.equal(h.all().some(node => node.type?.name === 'GenerationProgressOrb'), false)
    assert.equal(h.calls.filter(call => call.method !== 'GET').length, 0)
  } finally { h.close() }
})

for (const failure of [{ archiveSaveFailure: true }, { artifactMalformed: true }]) {
  test(`a completed worker cannot show 100 percent when ${Object.keys(failure)[0]}`, async () => {
    const h = await harness({ state: 'succeeded', withArchivedModel: false, ...failure })
    try {
      await h.poll()
      assert.equal(h.all().some(node => node.type?.name === 'GenerationProgressOrb' && node.props.compact), false)
      assert.equal(h.calls.filter(call => call.method !== 'GET').length, 0)
    } finally { h.close() }
  })
}


test('Luna selection requires its own readiness instead of borrowing the Sol flag', async () => {
  const h = await harness({ ready: true, solReady: true, lunaReady: false, withExistingJob: false })
  try {
    assert.equal(elements(h.byId('studio-mode')).find(node => node.type === 'option' && node.props.value === 'luna').props.disabled, true)
    h.byId('studio-mode').props.onChange({ target: { value: 'luna' } }); await h.settle()
    assert.equal(h.byId('studio-mode').props.value, 'standard')
    assert.equal(h.calls.filter(call => call.method !== 'GET').length, 0)
  } finally { h.close() }
})

test('explicit Luna readiness can select its concept route when Sol is not ready', async () => {
  const h = await harness({ ready: false, solReady: false, lunaReady: true, withExistingJob: false })
  try {
    assert.equal(elements(h.byId('studio-mode')).find(node => node.type === 'option' && node.props.value === 'luna').props.disabled, false)
    h.byId('studio-mode').props.onChange({ target: { value: 'luna' } }); await h.settle()
    assert.equal(h.byId('studio-mode').props.value, 'luna')
    assert.equal(h.byId('studio-deliverable').props.value, 'procedural-blueprint')
    assert.equal(h.calls.filter(call => call.method !== 'GET').length, 0)
  } finally { h.close() }
})


test('forced Luna submission stops when its own runtime readiness is revoked despite ready Sol', async () => {
  let lunaAllowed = true
  const h = await harness({ ready: true, withExistingJob: false, healthLookup: () => Response.json({ generationReady: true, model: 'gpt-6.1-sol', qualityModel: 'gpt-6-astra', astraBlueprintReady: true, lunaBlueprintReady: lunaAllowed, draftModels: ['sol', 'luna'] }) })
  try {
    h.byId('studio-prompt').props.onChange({ target: { value: 'A compact lunar rover' } })
    h.byId('studio-mode').props.onChange({ target: { value: 'luna' } }); await h.settle()
    assert.equal(h.byId('studio-mode').props.value, 'luna')
    assert.match(text(h.all()), /GPT-6 Luna draft generation available/)
    lunaAllowed = false
    h.button('Refresh availability').props.onClick(); await h.settle()
    assert.equal(h.all().find(node => node.props.className === 'native-shop-generate').props.disabled, true)
    await h.form().props.onSubmit({ preventDefault() {} }); await h.settle()
    assert.equal(h.calls.filter(call => call.method !== 'GET').length, 0)
  } finally { h.close() }
})


test('retained archive metadata cannot certify a conflicting or failed current save as 100 percent', async () => {
  const h = await harness({ state: 'succeeded', withArchivedModel: true, archiveSaveFailure: true })
  try {
    await h.poll()
    assert.equal(h.archive.has(oldId), true, 'The original archive entry remains intact')
    assert.equal(h.archive.get(oldId).sha256, 'original')
    assert.match(h.description(), /Original brown chess knight/, 'The new preview can still be shown')
    assert.equal(h.all().some(node => node.type?.name === 'GenerationProgressOrb' && node.props.compact), false)
    assert.equal(h.calls.filter(call => call.method !== 'GET').length, 0)
  } finally { h.close() }
})


test('a reloaded Shop test receipt stays separately scoped and recovers the same model with GETs only', async () => {
  const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const testReceipt = { receipt: makeReceipt(newId), prompt: 'Previously submitted test model', startedAt: new Date().toISOString() }
  const original = JSON.stringify({ receipt: makeReceipt(oldId), prompt: 'Ordinary model preserved', startedAt: new Date().toISOString() })
  const key = `worldifact:overnight-tests:v1:api-tests-20261006-044444-usd4:${owner}:astra-1:${clientModule.STUDIO_RECEIPT_KEY}`
  const initialStore = [[clientModule.STUDIO_RECEIPT_KEY, original], [key, JSON.stringify(testReceipt)], [`worldifact:shop-test-selection:v1:api-tests-20261006-044444-usd4:${owner}`, 'astra-1']]
  const h = await harness({ ready: true, detailedReady: true, pricingReady: false, downloadAllowed: true, initialStore, testPool: {}, initialAccount: { user: { id: owner }, loading: false } })
  try {
    await h.poll()
    assert.match(h.description(), /Previously submitted test model/)
    assert.equal(h.archive.has(newId), true)
    assert.equal(h.storeData.get(clientModule.STUDIO_RECEIPT_KEY), original)
    assert.equal(h.storeData.get(key), JSON.stringify(testReceipt))
    assert.equal(h.calls.filter(call => call.method !== 'GET').length, 0)
    assert.ok(h.button('Close saved request'))
    assert.equal(h.all().some(node => node.props.id === 'shop-funding-source'), false)
  } finally { h.close() }
})


test('ordinary Shop submit re-reads scoped pending work created by another tab after rendering', async () => {
  const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const h = await harness({ ready: true, detailedReady: true, pricingReady: false, withExistingJob: false, testPool: {}, initialAccount: { user: { id: owner }, loading: false } })
  try {
    h.byId('studio-prompt').props.onChange({ target: { value: 'An ordinary new model' } }); h.byId('studio-deliverable').props.onChange({ target: { value: 'detailed-mesh' } }); await h.settle()
    const key = `worldifact:overnight-tests:v1:api-tests-20261006-044444-usd4:${owner}:astra-1:${clientModule.STUDIO_RECEIPT_KEY}`
    h.storeData.set(key, JSON.stringify({ receipt: makeReceipt(newId), prompt: 'Already pending in another tab', startedAt: new Date().toISOString() }))
    await h.form().props.onSubmit({ preventDefault() {} }); await h.settle()
    assert.equal(h.calls.filter(call => call.method === 'POST').length, 0)
    assert.equal(h.storeData.has(clientModule.STUDIO_RECEIPT_KEY), false)
  } finally { h.close() }
})



test('switching accounts cannot relabel a scoped pending blueprint as ordinary recovery', async () => {
  const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const record = { id: newId, fingerprint: 'a'.repeat(64), model: 'sol', providerModel: 'gpt-6.1-sol', state: 'pending', createdAt: Date.now() }
  const key = `worldifact:overnight-tests:v1:api-tests-20261006-044444-usd4:${owner}:sol:worldifact:blueprint-recovery:v1`
  const selection = `worldifact:shop-test-selection:v1:api-tests-20261006-044444-usd4:${owner}`
  const h = await harness({ ready: true, withExistingJob: false, initialStore: [[key, JSON.stringify(record)], [selection, 'sol']], testPool: {}, initialAccount: { user: { id: owner }, loading: false } })
  try {
    await h.account({ user: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }, loading: false })
    assert.equal(h.all().some(node => node.props.role === 'status' && text(node).includes(`Request ${newId}`)), false)
    assert.equal(h.all().some(node => node.type === 'button' && text(node).includes('Recover same request')), false)
    assert.equal(h.storeData.get(key), JSON.stringify(record))
    assert.equal(h.calls.filter(call => call.method !== 'GET').length, 0)
    await h.account({ user: { id: owner }, loading: false })
    assert.ok(h.all().some(node => node.props.role === 'status' && text(node).includes(`Request ${newId}`)))
    assert.equal(h.storeData.get(key), JSON.stringify(record))
    assert.equal(h.calls.filter(call => call.method !== 'GET').length, 0)
  } finally { h.close() }
})


for (const nextSelection of ['astra-2', 'sol']) test(`account switch clears the prior test prompt and preview before restoring ${nextSelection}`, async () => {
  const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', other = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  const first = { receipt: makeReceipt(newId), prompt: 'PRIVATE account A detailed castle', startedAt: new Date().toISOString() }
  const second = { receipt: makeReceipt(oldId), prompt: 'Account B own selected robot', startedAt: new Date().toISOString() }
  const blueprint = { id: oldId, fingerprint: 'a'.repeat(64), model: 'sol', providerModel: 'gpt-6.1-sol', state: 'completed', createdAt: Date.now() }
  const key = (account, slot, receiptKey) => `worldifact:overnight-tests:v1:api-tests-20261006-044444-usd4:${account}:${slot}:${receiptKey}`
  const selection = account => `worldifact:shop-test-selection:v1:api-tests-20261006-044444-usd4:${account}`
  const firstKey = key(owner, 'astra-1', clientModule.STUDIO_RECEIPT_KEY)
  const secondKey = key(other, nextSelection, nextSelection === 'sol' ? 'worldifact:blueprint-recovery:v1' : clientModule.STUDIO_RECEIPT_KEY)
  const initialStore = [[firstKey, JSON.stringify(first)], [selection(owner), 'astra-1'], [secondKey, JSON.stringify(nextSelection === 'sol' ? blueprint : second)], [selection(other), nextSelection]]
  const h = await harness({ ready: true, downloadAllowed: true, withExistingJob: false, initialStore, testPool: {}, initialAccount: { user: { id: owner }, loading: false } })
  try {
    await h.poll()
    assert.match(h.description(), /PRIVATE account A/)
    await h.account({ user: { id: other }, loading: false })
    assert.equal(h.all().some(node => node.props['data-testid'] === 'result-description' || node.props['data-testid'] === 'fast-result-description'), false)
    assert.equal(h.byId('studio-prompt').props.value, nextSelection === 'sol' ? '' : second.prompt)
    assert.equal(h.storeData.get(firstKey), JSON.stringify(first))
    assert.equal(h.storeData.get(secondKey), JSON.stringify(nextSelection === 'sol' ? blueprint : second))
    assert.equal(h.calls.filter(call => call.method !== 'GET').length, 0)
    await h.account({ user: null, loading: false })
    assert.equal(h.byId('studio-prompt').props.value, '')
    assert.equal(h.all().some(node => node.type === 'button' && text(node).includes('Recover this test slot')), false)
    assert.equal(h.storeData.get(firstKey), JSON.stringify(first))
  } finally { h.close() }
})


test('restored SLOW and FAST cards select exact routes and require a separate Generate action', async () => {
  const h = await harness({ ready: true, detailedReady: true, withExistingJob: false })
  try {
    assert.equal(h.byId('studio-deliverable').props.value, 'detailed-mesh')
    assert.equal(h.byId('studio-mode').props.value, 'standard')
    h.byId('studio-prompt').props.onChange({ target: { value: 'Blue medieval rook' } }); await h.settle()
    const slow = () => h.all().find(node => node.props['aria-label']?.startsWith('Select GPT-6 Astra'))
    const fast = () => h.all().find(node => node.props['aria-label']?.startsWith('Select GPT-6.1 Sol'))
    fast().props.onClick(); fast().props.onClick(); await h.settle()
    assert.equal(h.byId('studio-mode').props.value, FAST_DRAFT_PROFILE)
    assert.equal(h.byId('studio-deliverable').props.value, 'procedural-blueprint')
    assert.equal(h.quote().quote.points, 50)
    slow().props.onClick(); slow().props.onClick(); await h.settle()
    assert.equal(h.byId('studio-mode').props.value, 'standard')
    assert.equal(h.byId('studio-deliverable').props.value, 'detailed-mesh')
    assert.equal(h.quote().quote.points, 250)
    assert.equal(h.byId('studio-prompt').props.value, 'Blue medieval rook')
    assert.equal(h.calls.filter(call => call.method !== 'GET').length, 0)
  } finally { h.close() }
})

test('historical form cannot start a hidden test-funded request even with an old selected unused slot', async () => {
  const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const selection = `worldifact:shop-test-selection:v1:api-tests-20261006-044444-usd4:${owner}`
  for (const slot of ['astra-1', 'sol']) {
    const h = await harness({ ready: true, detailedReady: true, withExistingJob: false, testPool: {}, initialStore: [[selection, slot]], initialAccount: { user: { id: owner }, loading: false }, accountLookup: () => Response.json(blockedAccount) })
    try {
      h.byId('studio-prompt').props.onChange({ target: { value: 'An ordinary unpaid draft' } }); await h.settle()
      assert.equal(h.all().some(node => node.props.id === 'shop-funding-source'), false)
      assert.equal(h.all().some(node => node.type === 'button' && /Check approved test pool|Recover this test slot/.test(text(node))), false)
      assert.equal(h.quote().quote.reason, 'PROVIDER_BUDGET_EXHAUSTED')
      await h.form().props.onSubmit({ preventDefault() {} }); await h.form().props.onSubmit({ preventDefault() {} }); await h.settle()
      assert.equal(h.calls.filter(call => call.method !== 'GET').length, 0)
      assert.equal(h.storeData.get(selection), slot, 'An old preference is neither a new funding grant nor a reason to rewrite storage')
    } finally { h.close() }
  }
})

test('closing recovered test work retains both namespaces and does not create or charge another job', async () => {
  const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const testReceipt = { receipt: makeReceipt(newId), prompt: 'Original test model', startedAt: new Date().toISOString() }
  const key = `worldifact:overnight-tests:v1:api-tests-20261006-044444-usd4:${owner}:astra-1:${clientModule.STUDIO_RECEIPT_KEY}`
  const selection = `worldifact:shop-test-selection:v1:api-tests-20261006-044444-usd4:${owner}`
  const h = await harness({ ready: true, detailedReady: true, withExistingJob: false, downloadAllowed: true, testPool: {}, initialStore: [[key, JSON.stringify(testReceipt)], [selection, 'astra-1']], initialAccount: { user: { id: owner }, loading: false } })
  try {
    await h.poll()
    assert.match(h.description(), /Original test model/)
    assert.equal(h.all().find(node => node.props.className === 'native-shop-generate').props.disabled, true)
    const close = h.button('Close saved request')
    close.props.onClick(); close.props.onClick(); await h.settle()
    assert.equal(h.storeData.get(key), JSON.stringify(testReceipt))
    assert.equal(h.storeData.get(selection), 'ordinary')
    assert.equal(h.archive.has(newId), true)
    assert.equal(h.storeData.has(clientModule.STUDIO_RECEIPT_KEY), false)
    assert.equal(h.calls.filter(call => call.method !== 'GET').length, 0)
  } finally { h.close() }
})

test('recovering the same pending selected test restarts its exact-job polling loop', async () => {
  const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const saved = { receipt: makeReceipt(newId), prompt: 'Still building in this same test slot', startedAt: new Date().toISOString() }
  const key = `worldifact:overnight-tests:v1:api-tests-20261006-044444-usd4:${owner}:astra-1:${clientModule.STUDIO_RECEIPT_KEY}`
  const selected = `worldifact:shop-test-selection:v1:api-tests-20261006-044444-usd4:${owner}`
  const current = { fundingSource: 'api-tests-20261006-044444-usd4', ...saved, financialState: 'reserved' }
  const h = await harness({ ready: true, state: 'building', withExistingJob: false, initialStore: [[key, JSON.stringify(saved)], [selected, 'astra-1']], testPool: { current }, initialAccount: { user: { id: owner }, loading: false } })
  try {
    await h.poll()
    await h.button('Recover this job / reload result').props.onClick(); await h.settle()
    const before = h.calls.filter(call => call.path === `/api/studio/jobs/${newId}`).length
    await h.poll()
    assert.equal(h.calls.filter(call => call.path === `/api/studio/jobs/${newId}`).length, before + 1)
    assert.equal(h.calls.filter(call => call.method !== 'GET').length, 0)
  } finally { h.close() }
})




test('restored test blueprint recovery uses its original provider and cannot create ordinary recovery metadata', async () => {
  const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const record = { id: newId, fingerprint: 'a'.repeat(64), model: 'sol', providerModel: 'gpt-6.1-sol', state: 'completed', createdAt: Date.now() }
  const ordinary = JSON.stringify({ ...record, id: oldId })
  const result = { ...fastGeneration, requestId: await blueprintRequestId(newId), delivery: { kind: 'procedural-blueprint', referenceCount: 0, fallbackUsed: false }, evidence: { providerResponseId: 'resp_recovered_pool_fixture', receivedAt: new Date().toISOString(), blueprintSha256: 'f'.repeat(64), inputTokens: 100, outputTokens: 10, totalTokens: 110 } }
  const key = `worldifact:overnight-tests:v1:api-tests-20261006-044444-usd4:${owner}:sol:worldifact:blueprint-recovery:v1`
  const selection = `worldifact:shop-test-selection:v1:api-tests-20261006-044444-usd4:${owner}`
  const h = await harness({ ready: true, detailedReady: true, withExistingJob: false, initialStore: [[key, JSON.stringify(record)], [selection, 'sol'], ['worldifact:blueprint-recovery:v1', ordinary]], testPool: { blueprintRecovery: result }, initialAccount: { user: { id: owner }, loading: false } })
  try {
    const recover = h.button('Recover same request')
    const firstRecovery = recover.props.onClick(); recover.props.onClick(); await firstRecovery; await h.settle()
    assert.ok(h.all().some(node => node.props['data-testid'] === 'fast-result-description'), JSON.stringify({ calls: h.calls.map(call => call.path), alerts: h.all().filter(node => node.props.role === 'alert').map(text) }))
    assert.match(h.fastDescription(), /procedural FAST draft/)
    assert.equal(h.calls.filter(call => call.path === `/api/blueprint/requests/${newId}`).length, 1)
    assert.equal(h.storeData.get('worldifact:blueprint-recovery:v1'), ordinary)
    assert.equal(h.storeData.get(key), JSON.stringify(record))
    h.button('Close saved request').props.onClick(); await h.settle()
    assert.equal(h.storeData.get('worldifact:blueprint-recovery:v1'), ordinary)
    assert.equal(h.storeData.get(key), JSON.stringify(record))
    assert.equal(h.calls.filter(call => call.method !== 'GET').length, 0)
  } finally { h.close() }
})

for (const reloadAfterClose of [false, true]) test(`unselected detailed receipts remain GET-recoverable after ${reloadAfterClose ? 'closing and reloading' : 'loading ordinary funding'}`, async () => {
  const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const receipt = { receipt: makeReceipt(oldId), prompt: 'Existing scoped original', startedAt: new Date().toISOString() }
  const key = `worldifact:overnight-tests:v1:api-tests-20261006-044444-usd4:${owner}:astra-1:${clientModule.STUDIO_RECEIPT_KEY}`
  const selection = `worldifact:shop-test-selection:v1:api-tests-20261006-044444-usd4:${owner}`
  let initialStore = [[key, JSON.stringify(receipt)], [selection, reloadAfterClose ? 'astra-1' : 'ordinary']]
  if (reloadAfterClose) {
    const first = await harness({ ready: true, detailedReady: true, withExistingJob: false, initialStore, testPool: {}, initialAccount: { user: { id: owner }, loading: false } })
    try {
      await first.poll()
      first.button('Close saved request').props.onClick(); await first.settle()
      assert.equal(first.storeData.get(selection), 'ordinary')
      initialStore = [...first.storeData]
    } finally { first.close() }
  }
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks: { request: async (_name, _options, work) => work({ name: 'offline-fixture-lock' }) } } })
  const h = await harness({ ready: true, detailedReady: true, withExistingJob: false, initialStore, testPool: {}, initialAccount: { user: { id: owner }, loading: false } })
  try {
    h.byId('studio-prompt').props.onChange({ target: { value: 'An explicit ordinary next model' } }); await h.settle()
    assert.equal(h.all().find(node => node.props.className === 'native-shop-generate').props.disabled, true)
    const recover = h.button('Recover saved requests')
    const firstRecovery = recover.props.onClick(); recover.props.onClick(); await firstRecovery; await h.settle()
    assert.equal(h.calls.filter(call => call.path === `/api/studio/jobs/${oldId}`).length, 1)
    assert.equal(h.calls.filter(call => call.method !== 'GET').length, 0)
    assert.equal(h.storeData.get(key), JSON.stringify(receipt))
    assert.equal(h.all().find(node => node.props.className === 'native-shop-generate').props.disabled, false)
    await h.form().props.onSubmit({ preventDefault() {} }); await h.settle()
    assert.deepEqual(h.calls.filter(call => call.method === 'POST').map(call => call.path), ['/api/studio/prepare', '/api/studio/jobs'])
    assert.equal(h.storeData.get(key), JSON.stringify(receipt))
    assert.equal(JSON.parse(h.storeData.get(clientModule.STUDIO_RECEIPT_KEY)).receipt.id, newId)
  } finally { h.close(); if (descriptor) Object.defineProperty(globalThis, 'navigator', descriptor); else delete globalThis.navigator }
})

test('read-only other-request recovery cannot unlock a still-pending request or act after account switching', async () => {
  const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const receipt = { receipt: makeReceipt(oldId), prompt: 'Still pending original', startedAt: new Date().toISOString() }
  const key = `worldifact:overnight-tests:v1:api-tests-20261006-044444-usd4:${owner}:astra-1:${clientModule.STUDIO_RECEIPT_KEY}`
  const h = await harness({ ready: true, detailedReady: true, state: 'building', withExistingJob: false, initialStore: [[key, JSON.stringify(receipt)]], testPool: {}, initialAccount: { user: { id: owner }, loading: false } })
  try {
    const recover = h.button('Recover saved requests')
    await recover.props.onClick(); await h.settle()
    assert.match(text(h.all()), /A saved request is still pending or unconfirmed/)
    assert.equal(h.all().find(node => node.props.className === 'native-shop-generate').props.disabled, true)
    const before = h.calls.length
    await h.account({ user: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }, loading: false })
    const after = h.calls.length
    assert.ok(after >= before)
    await recover.props.onClick(); await h.settle()
    assert.equal(h.calls.length, after, 'A retained handler from the original account cannot read its receipt')
    assert.equal(h.storeData.get(key), JSON.stringify(receipt))
    assert.equal(h.calls.filter(call => call.method !== 'GET').length, 0)
  } finally { h.close() }
})


test('Image choice preserves the model draft and receipt and cannot fall through to a paid 3D endpoint', async () => {
  const h = await harness({ ready: true, detailedReady: true, withExistingJob: false })
  try {
    h.byId('studio-prompt').props.onChange({ target: { value: 'A quiet blue forest' } }); await h.settle()
    const before = h.storeData.get(clientModule.STUDIO_RECEIPT_KEY)
    const priorSubmit = h.form().props.onSubmit
    h.button('Image').props.onClick()
    await priorSubmit({ preventDefault() {} })
    await h.settle()
    assert.equal(h.button('Image').props['aria-pressed'], true)
    assert.equal(h.byId('studio-prompt').props.value, 'A quiet blue forest')
    assert.equal(h.button('Image generation not connected').props.disabled, true)
    await h.form().props.onSubmit({ preventDefault() {} }); await h.settle()
    assert.equal(h.calls.filter(call => call.method === 'POST').length, 0)
    assert.equal(h.storeData.get(clientModule.STUDIO_RECEIPT_KEY), before)
    h.button('Model 3D').props.onClick(); await h.settle()
    assert.equal(h.byId('studio-prompt').props.value, 'A quiet blue forest')
    assert.equal(h.byId('studio-mode').props.value, 'standard')
  } finally { h.close() }
})

test('500-point consent stays upfront outside Settings after choosing the extended budget', async () => {
  const h = await harness({ ready: true, detailedReady: true, withExistingJob: false })
  try {
    h.byId('studio-prompt').props.onChange({ target: { value: 'A carefully detailed glass observatory' } })
    h.byId('studio-budget-tier').props.onChange({ target: { value: 'extended' } }); await h.settle()
    const settings = h.all().find(node => node.props.className === 'shop-settings')
    const consent = h.byId('studio-budget-consent')
    assert.equal(elements(settings).includes(consent), false)
    assert.equal(consent.props.checked, false)
    assert.equal(h.button('Generate Astra/Blender model').props.disabled, true)
    consent.props.onChange({ target: { checked: true } }); await h.settle()
    assert.equal(h.button('Generate Astra/Blender model').props.disabled, false)
    h.byId('studio-prompt').props.onChange({ target: { value: 'A different observatory' } }); await h.settle()
    assert.equal(h.byId('studio-budget-consent').props.checked, false)
    assert.equal(h.button('Generate Astra/Blender model').props.disabled, true)
    assert.equal(h.calls.filter(call => call.method === 'POST').length, 0)
  } finally { h.close() }
})
