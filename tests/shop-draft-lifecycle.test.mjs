import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setImmediate as nextTick } from 'node:timers/promises'
import React from 'react'
import { loadShopComponent } from './shop-render-helper.mjs'
import * as clientModule from '../src/lib/studioClient.ts'
import { blueprintRequestId } from '../src/lib/blueprintRequest.ts'
import { FAST_DRAFT_PROFILE } from '../src/lib/studioProtocol.ts'

const oldId = '12345678-1234-4234-8234-123456789abc'
const newId = '87654321-1234-4234-8234-123456789abc'
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
async function harness({ ready = false, state = 'succeeded', failureCode, artifactFailure = false, solReady = ready, downloadAllowed, reconciliationRequired = false, withExistingJob = true, cloudCurrent = false, characterPrompt = '', detailedReady = false, cloudLookup } = {}) {
  const selected = { receipt: makeReceipt(oldId), prompt: 'Original brown chess knight', startedAt: new Date().toISOString() }
  const storeData = new Map(withExistingJob ? [[clientModule.STUDIO_RECEIPT_KEY, JSON.stringify(selected)]] : [])
  const storage = { getItem: k => storeData.get(k) ?? null, setItem: (k,v) => { storeData.set(k,v) }, removeItem: k => { storeData.delete(k) } }
  const calls = [], blob = modelBlob(), archive = new Map([[oldId, { id: oldId, prompt: selected.prompt, byteLength: blob.size, savedAt: selected.startedAt, sha256: 'original', review: 'UNREVIEWED' }]])
  const status = { detailedReady, ready, fastReady: true, fastBudgetReady: false, photoReady: true, oracle: 'CONNECTOR_READY', publicPilot: true,
    reason: ready ? 'READY' : 'DISABLED_OR_EXPIRED', allowance: { used: 6, limit: ready ? 7 : 0, remaining: ready ? 1 : 0, enabled: ready, expiresAt: null }, promptMaxLength: 4000, detailedReferenceLimit: 4 }
  const fetcher = async (url, init = {}) => {
    const path = String(url), method = init.method || 'GET'
    calls.push({ path, method, body: init.body })
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
    if (path === '/api/studio/prepare') return Response.json(makeReceipt(newId))
    if (method === 'POST') return Response.json({ job: { id: newId, state: 'building' } })
    if (path.endsWith('/model') && artifactFailure) throw new TypeError('Interrupted artifact download')
    if (path.endsWith('/model')) return new Response(blob, { headers: { 'Content-Type': 'model/gltf-binary', 'Content-Length': String(blob.size) } })
    return Response.json({ job: { id: path.endsWith(oldId) ? oldId : newId, state, failureCode, reconciliationRequired, ...(downloadAllowed === undefined ? {} : { downloadAllowed, previewOnly: !downloadAllowed, previewAvailable: downloadAllowed }) } })
  }
  const slots = [], effects = [], timers = new Map(), delays = []
  let cursor = 0, dirty = true, tree, serial = 0
  const hookReact = { ...React,
    useState(initial) {
      const index = cursor++
      if (!slots[index]) slots[index] = { value: typeof initial === 'function' ? initial() : initial }
      return [slots[index].value, action => { const next = typeof action === 'function' ? action(slots[index].value) : action; if (!Object.is(next, slots[index].value)) { slots[index].value = next; dirty = true } }]
    },
    useRef(initial) { const index = cursor++; if (!slots[index]) slots[index] = { ref: { current: initial } }; return slots[index].ref },
    useEffect(callback, deps) {
      const index = cursor++, prior = slots[index]
      if (!prior || !deps || deps.some((v,i) => !Object.is(v, prior.deps?.[i]))) {
        const next = { deps, cleanup: prior?.cleanup }; slots[index] = next
        effects.push(() => { next.cleanup?.(); next.cleanup = callback() })
      }
    },
  }
  const timeout = (callback, delay) => { delays.push(delay); const id = ++serial; timers.set(id, callback); return id }
  const interval = () => ++serial
  const globals = { fetch: fetcher, URL, Blob, AbortSignal, AbortController, console, setTimeout: timeout, clearTimeout: id => timers.delete(id),
    window: { localStorage: storage, confirm: () => true, setTimeout: timeout, clearTimeout: id => timers.delete(id), setInterval: interval, clearInterval: () => {} } }
  const Component = await loadShopComponent({ react: hookReact, globals, adapters: {
    'react-router-dom': { useLocation: () => ({ pathname: '/shop', state: characterPrompt ? { worldPrompt: characterPrompt } : null }) },
    '../lib/studioClient': { ...clientModule, StudioCoordinator: class extends clientModule.StudioCoordinator { constructor(store) { super(store, fetcher) } }, checkStudio: () => clientModule.checkStudio(fetcher) },
    '../lib/studioArchive': {
      listStudioModels: async () => [...archive.values()], readStudioModel: async () => blob,
      saveStudioModel: async saved => { if (!archive.has(saved.receipt.id)) archive.set(saved.receipt.id, { id: saved.receipt.id, prompt: saved.prompt, savedAt: saved.startedAt, byteLength: blob.size, sha256: 'new-fixture', review: 'UNREVIEWED' }); return archive.get(saved.receipt.id) },
    },
    '../lib/studioPhotos': { prepareStudioPhoto: async (file, size, view) => ({ name: file.name, view, dataUrl: 'data:image/jpeg;base64,/9j/2Q==', textureMaxSize: size }) },
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
  return { settle, calls, selected, storeData, archive, delays,
    byId: id => node(n => n.props.id === id),
    button: label => node(n => n.type === 'button' && text(n).includes(label)),
    all: () => elements(tree),
    description: () => text(node(n => n.props['data-testid'] === 'result-description')),
    fastDescription: () => text(node(n => n.props['data-testid'] === 'fast-result-description')),
    form: () => node(n => n.type === 'form'),
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
    assert.equal(h.button('Generate GPT-6 Astra blueprint').props.disabled, true)
    await h.form().props.onSubmit({ preventDefault() {} }); await h.settle()
    h.button('Clear next-model draft').props.onClick(); await h.settle()
    assert.equal(h.byId('studio-prompt').props.value, '')
    assert.equal(JSON.parse(h.storeData.get(clientModule.STUDIO_RECEIPT_KEY)).receipt.id, oldId)
    assert.equal(h.calls.filter(c => c.method === 'POST').length, 0)
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
    assert.equal(h.calls.filter(c => c.method === 'POST').length, 0)
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
    assert.equal(h.calls.filter(call => call.method === 'POST').length, 0)
  } finally { h.close() }
})

test('missing local receipt recovers the current cloud job before the sample preview is allowed', async () => {
  const h = await harness({ ready: true, withExistingJob: false, cloudCurrent: true, state: 'building' })
  try {
    await h.settle()
    assert.ok(h.storeData.get(clientModule.STUDIO_RECEIPT_KEY), 'fresh cloud receipt is restored into local recovery storage')
    assert.ok(h.all().some(node => node.type === 'h2' && text(node) === 'Preparing your model…'))
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
    assert.equal(h.button('Generate GPT-6 Astra blueprint').props.disabled, true, 'Uncertain jobs must not be silently duplicated')
    assert.equal(h.calls.filter(call => call.method === 'POST').length, 0)
  } finally { h.close() }
})


test('private character brief fills an empty Shop draft without a generation, and never overwrites a recovered job', async () => {
  const characterPrompt = 'A silver-haired explorer with a teal jacket'
  const fresh = await harness({ withExistingJob: false, characterPrompt })
  try {
    assert.equal(fresh.byId('studio-prompt').props.value, characterPrompt)
    assert.equal(fresh.calls.filter(call => call.method === 'POST').length, 0)
  } finally { fresh.close() }
  const recovered = await harness({ characterPrompt })
  try {
    assert.equal(recovered.byId('studio-prompt').props.value, 'Original brown chess knight')
    assert.equal(recovered.calls.filter(call => call.method === 'POST').length, 0)
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
    assert.equal(h.calls.filter(c=>c.method==='POST').length,0)
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
    assert.equal(h.calls.filter(call => call.method === 'POST').length, 0)
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
      if (detailed) h.byId('studio-deliverable').props.onChange({ target: { value: 'detailed-mesh' } })
      await h.settle()
      assert.ok(h.all().some(node => node.type === 'h2' && text(node) === 'Checking your cloud job…'))
      assert.equal(h.all().some(node => node.type === 'img' && node.props.alt === 'Example 3D product preview'), false)
      assert.equal(h.button(detailed ? 'Generate Astra/Blender model' : 'Generate GPT-6 Astra blueprint').props.disabled, true)
      await h.form().props.onSubmit({ preventDefault() {} }); await h.settle()
      assert.equal(h.calls.filter(call => call.method === 'POST').length, 0)
      finishLookup(Response.json({ current: { receipt: makeReceipt(oldId), prompt: h.selected.prompt, startedAt: h.selected.startedAt, financialState: 'reserved' } }))
      await h.settle()
      assert.equal(JSON.parse(h.storeData.get(clientModule.STUDIO_RECEIPT_KEY)).receipt.id, oldId)
      assert.equal(h.calls.filter(call => call.method === 'POST').length, 0)
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
      assert.equal(h.button('Generate GPT-6 Astra blueprint').props.disabled, true)
      await h.form().props.onSubmit({ preventDefault() {} })
      await h.poll()
    }
    assert.equal(attempts, 6)
    assert.equal(JSON.parse(h.storeData.get(clientModule.STUDIO_RECEIPT_KEY)).receipt.id, oldId)
    assert.equal(h.calls.filter(call => call.method === 'POST').length, 0)
    assert.ok(h.delays.slice(0, 5).every(delay => delay >= 5000 && delay <= 120000))
    assert.ok(h.all().some(node => node.type === 'h2' && text(node) === 'Preparing your model…'))
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
  assert.equal(h.calls.filter(call => call.method === 'POST').length, 0)
  await assert.rejects(h.poll(), /Recovery should have scheduled a GET/)
})


test('failed model shows its safe diagnostic and copyable job ID without rendering the signed receipt', async () => {
  const h = await harness({ ready: true, state: 'failed', failureCode: 'ASTRA_COST_LIMIT' })
  try {
    await h.poll()
    const visible = text(h.all())
    assert.match(visible, new RegExp('Job ID: ' + oldId))
    assert.match(visible, /Reason: ASTRA_COST_LIMIT/)
    assert.match(visible, /Astra stopped at this job’s cost limit/)
    assert.equal(visible.includes(h.selected.receipt.ticket), false)
    assert.equal(h.calls.filter(c => c.method === 'POST').length, 0)
  } finally { h.close() }
})


test('a completed model whose preview download is interrupted never receives failure-reason wording', async () => {
  const h = await harness({ ready: true, state: 'succeeded', artifactFailure: true })
  try {
    await h.poll()
    const visible = text(h.all())
    assert.match(visible, /Your model is complete/)
    assert.doesNotMatch(visible, /original failure reason was not saved/)
    assert.equal(h.calls.filter(c => c.method === 'POST').length, 0)
  } finally { h.close() }
})
