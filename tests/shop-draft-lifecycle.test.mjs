import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setImmediate as nextTick } from 'node:timers/promises'
import React from 'react'
import { loadShopComponent } from './shop-render-helper.mjs'
import * as clientModule from '../src/lib/studioClient.ts'
import { FAST_DRAFT_PROFILE } from '../src/lib/studioProtocol.ts'

const oldId = '12345678-1234-4234-8234-123456789abc'
const newId = '87654321-1234-4234-8234-123456789abc'
const makeReceipt = id => ({ id, createdAt: new Date().toISOString(), ticket: `${id}.${Date.now()}.${'a'.repeat(64)}.${'b'.repeat(64)}` })
const fastGeneration = {
  mode: 'LIVE', provenance: 'GENERATED', requestId: 'req_fast_fixture', model: 'gpt-6-astra',
  limitation: 'Astra generated a validated specification; visible geometry is a procedural draft.',
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
async function harness({ ready = false, state = 'succeeded', astraReady = ready } = {}) {
  const selected = { receipt: makeReceipt(oldId), prompt: 'Original brown chess knight', startedAt: new Date().toISOString() }
  const storeData = new Map([[clientModule.STUDIO_RECEIPT_KEY, JSON.stringify(selected)]])
  const storage = { getItem: k => storeData.get(k) ?? null, setItem: (k,v) => { storeData.set(k,v) }, removeItem: k => { storeData.delete(k) } }
  const calls = [], blob = modelBlob(), archive = new Map([[oldId, { id: oldId, prompt: selected.prompt, byteLength: blob.size, savedAt: selected.startedAt, sha256: 'original', review: 'UNREVIEWED' }]])
  const status = { ready, fastReady: true, fastBudgetReady: false, photoReady: true, oracle: 'CONNECTOR_READY', publicPilot: true,
    reason: ready ? 'READY' : 'DISABLED_OR_EXPIRED', allowance: { used: 6, limit: ready ? 7 : 0, remaining: ready ? 1 : 0, enabled: ready, expiresAt: null }, promptMaxLength: 4000 }
  const fetcher = async (url, init = {}) => {
    const path = String(url), method = init.method || 'GET'
    calls.push({ path, method, body: init.body })
    if (path === '/api/studio/status') return Response.json(status)
    if (path === '/api/health') return Response.json({ generationReady: astraReady })
    if (path === '/api/blueprint' && method === 'POST') return Response.json(fastGeneration)
    if (path === '/api/studio/prepare') return Response.json(makeReceipt(newId))
    if (method === 'POST') return Response.json({ job: { id: newId, state: 'building' } })
    if (path.endsWith('/model')) return new Response(blob, { headers: { 'Content-Type': 'model/gltf-binary', 'Content-Length': String(blob.size) } })
    return Response.json({ job: { id: path.endsWith(oldId) ? oldId : newId, state } })
  }
  const slots = [], effects = [], timers = new Map()
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
  const timeout = callback => { const id = ++serial; timers.set(id, callback); return id }
  const interval = () => ++serial
  const globals = { fetch: fetcher, URL, Blob, AbortSignal, AbortController, console, setTimeout: timeout, clearTimeout: id => timers.delete(id),
    window: { localStorage: storage, confirm: () => true, setTimeout: timeout, clearTimeout: id => timers.delete(id), setInterval: interval, clearInterval: () => {} } }
  const Component = await loadShopComponent({ react: hookReact, globals, adapters: {
    '../lib/studioClient': { ...clientModule, StudioCoordinator: class extends clientModule.StudioCoordinator { constructor(store) { super(store, fetcher) } }, checkStudio: () => clientModule.checkStudio(fetcher) },
    '../lib/studioArchive': {
      listStudioModels: async () => [...archive.values()], readStudioModel: async () => blob,
      saveStudioModel: async saved => { if (!archive.has(saved.receipt.id)) archive.set(saved.receipt.id, { id: saved.receipt.id, prompt: saved.prompt, savedAt: saved.startedAt, byteLength: blob.size, sha256: 'new-fixture', review: 'UNREVIEWED' }); return archive.get(saved.receipt.id) },
    },
    '../lib/studioPhotos': { prepareStudioPhoto: async (file, size, view) => ({ name: file.name, view, dataUrl: 'data:image/jpeg;base64,ZmFrZQ==', textureMaxSize: size }) },
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
  return { settle, calls, selected, storeData, archive,
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

test('restored completed knight stays editable and unavailable FAST cannot bypass the live Astra gate', async () => {
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
    assert.equal(h.button('Generate 3D').props.disabled, true)
    await h.form().props.onSubmit({ preventDefault() {} }); await h.settle()
    h.button('Clear next-model draft').props.onClick(); await h.settle()
    assert.equal(h.byId('studio-prompt').props.value, '')
    assert.equal(JSON.parse(h.storeData.get(clientModule.STUDIO_RECEIPT_KEY)).receipt.id, oldId)
    assert.equal(h.calls.filter(c => c.method === 'POST').length, 0)
  } finally { h.close() }
})

test('explicit FAST after completion sends one Astra blueprint POST and never submits an Oracle Studio job', async () => {
  const h = await harness({ ready: true })
  try {
    await h.poll()
    const storedBefore = h.storeData.get(clientModule.STUDIO_RECEIPT_KEY)
    h.byId('studio-prompt').props.onChange({ target: { value: 'A blue rook in FAST' } })
    h.byId('studio-mode').props.onChange({ target: { value: FAST_DRAFT_PROFILE } }); await h.settle()
    assert.equal(h.button('Generate FAST').props.disabled, false)
    const first = h.form().props.onSubmit({ preventDefault() {} })
    const duplicate = h.form().props.onSubmit({ preventDefault() {} })
    await Promise.all([first, duplicate]); await h.settle()
    const astraPosts = h.calls.filter(c => c.path === '/api/blueprint' && c.method === 'POST')
    const studioPosts = h.calls.filter(c => c.path === '/api/studio/jobs' && c.method === 'POST')
    assert.equal(astraPosts.length, 1)
    assert.equal(studioPosts.length, 0)
    assert.deepEqual(JSON.parse(astraPosts[0].body), { worldId: 'enchanted-ai-shop', prompt: 'A blue rook in FAST', mode: 'live' })
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
