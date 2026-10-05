import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { setImmediate as tick } from 'node:timers/promises'
import ts from 'typescript'
import React from 'react'
import * as archive from '../src/lib/studioArchive.ts'
import * as library from '../src/lib/studioLibrary.ts'
import * as glb from '../src/lib/glb.ts'
import * as view from '../src/lib/studioView.ts'
import { archiveStorage, generation } from './studio-archive-helper.mjs'

const id = '5a7c9284-1234-4234-8234-123456789abc'
const otherId = '11111111-1111-4111-8111-111111111111'
const thirdId = '22222222-2222-4222-8222-222222222222'
const pageCursor = `cGFnZQ.${'a'.repeat(64)}`
const model = (jobId = id, prompt = 'Completed MCC on this account') => ({ id: jobId, prompt,
  createdAt: '2026-10-05T10:00:00.000Z', completedAt: '2026-10-05T10:30:00.000Z', review: 'UNREVIEWED', downloadAllowed: true,
  receipt: { id: jobId, createdAt: '2026-10-05T10:00:00.000Z', ticket: `library.${jobId}.1791196200000.${'a'.repeat(64)}.${'b'.repeat(64)}` } })
const page = (models = [], nextCursor = null, accountId = 'owner-a') => Response.json({ accountId, models, nextCursor, hasMore: nextCursor !== null })
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
const text = node => node == null || typeof node === 'boolean' ? '' : Array.isArray(node) ? node.map(text).join('') : React.isValidElement(node) ? text(node.props.children) : String(node)
const nodes = tree => { const result = []; const walk = node => { if (Array.isArray(node)) node.forEach(walk); else if (React.isValidElement(node)) { result.push(node); walk(node.props.children) } }; walk(tree); return result }
function fixtureGLB(label = 'trusted cloud bytes') {
  const json = JSON.stringify({ asset: { version: '2.0', generator: label }, accessors: [{ count: 3 }], meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }], nodes: [{ mesh: 0 }] })
  const data = new TextEncoder().encode(json.padEnd(Math.ceil(json.length / 4) * 4, ' ')), buffer = new ArrayBuffer(20 + data.length), view = new DataView(buffer)
  ;[0x46546c67, 2, buffer.byteLength, data.length, 0x4e4f534a].forEach((value, i) => view.setUint32(i * 4, value, true))
  new Uint8Array(buffer, 20).set(data)
  return new Blob([buffer], { type: 'model/gltf-binary' })
}
function local(jobId = otherId, prompt = 'Older MCC saved locally', source) {
  return { id: jobId, prompt, savedAt: '2026-10-02T10:00:00.000Z', byteLength: 200, sha256: 'original-hash', review: 'UNREVIEWED', ...(source === 'blueprint' ? { source, generation: generation() } : {}) }
}

// Actual component hooks/events with the real library transport/parser and real
// archive reads. HTTP, React scheduling and object URLs are deterministic adapters;
// this does not claim browser, WebGL or physical mobile verification.
async function harness({ locals = [], owner = 'owner-a', loading = false, requestedModelId = '', compact = false, io, localBlob } = {}) {
  const storage = archiveStorage(), slots = [], effects = [], calls = [], localReads = [], urls = new Map(), revoked = [], downloads = [], timers = []
  const archived = locals.map(entry => ({ ...entry }))
  for (const entry of archived) { storage.stores.get('metadata').set(entry.id, entry); storage.stores.get('models').set(entry.id, fixtureGLB(entry.prompt)) }
  const originalFiles = new Map(storage.stores.get('models'))
  const failedReceipt = JSON.stringify({ receipt: { id: '44c03fa4-1234-4234-8234-123456789abc' }, rejection: 'Old failed receipt', prompt: 'Older failed model' })
  const localState = new Map([['worldifact-studio-current-v1', failedReceipt]])
  globalThis.window.localStorage = { getItem() { throw new Error('Gallery must not consult the old current receipt') }, setItem() { throw new Error('Gallery must not mutate local receipts') }, removeItem() { throw new Error('Gallery must not clear local receipts') } }
  let cursor = 0, dirty = true, tree, closed = false, serial = 0
  let sessionRefreshes = 0
  const refresh = async () => { sessionRefreshes++; return owner ? { id: owner } : null }
  const react = { ...React,
    useState(initial) { const index = cursor++; if (!slots[index]) slots[index] = { value: typeof initial === 'function' ? initial() : initial }; return [slots[index].value, action => { if (closed) return; const next = typeof action === 'function' ? action(slots[index].value) : action; if (!Object.is(next, slots[index].value)) { slots[index].value = next; dirty = true } }] },
    useRef(initial) { const index = cursor++; if (!slots[index]) slots[index] = { ref: { current: initial } }; return slots[index].ref },
    useMemo(create, deps) { const index = cursor++, prior = slots[index]; if (!prior || deps.some((value, i) => !Object.is(value, prior.deps?.[i]))) slots[index] = { value: create(), deps }; return slots[index].value },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps) },
    useEffect(fn, deps) { const index = cursor++, prior = slots[index]; if (!prior || !deps || deps.some((value, i) => !Object.is(value, prior.deps?.[i]))) { const next = { deps, cleanup: prior?.cleanup }; slots[index] = next; effects.push(() => { next.cleanup?.(); next.cleanup = fn() }) } },
  }
  const fetcher = async (path, init = {}) => {
    calls.push({ path, method: init.method || 'GET', headers: new Headers(init.headers), signal: init.signal, owner, init })
    assert.equal(init.method, 'GET', 'Gallery cannot invoke generation, recovery, settlement or financial POSTs')
    assert.equal(init.credentials, 'same-origin'); assert.equal(init.cache, 'no-store'); assert.equal(init.redirect, 'error')
    assert.match(path, /^\/api\/studio\/(?:library(?:\?cursor=[A-Za-z0-9_.%-]+|\/[a-f0-9-]{36})?|jobs\/[a-f0-9-]{36}\/model)$/)
    if (io) return io(path, init, owner)
    if (path === '/api/studio/library') return page([model()])
    if (path === `/api/studio/library/${id}`) return Response.json({ accountId: 'owner-a', model: model() })
    return new Response(fixtureGLB())
  }
  const preview = props => React.createElement('preview', props)
  const modules = {
    react, 'react-router-dom': { Link: 'a' }, './OracleModelPreview': preview,
    '../lib/account': { useAccount: () => ({ user: owner ? { id: owner } : null, loading, refresh }) },
    '../lib/studioArchive': { ...archive, readStudioModel: async key => { localReads.push(key); return localBlob ? localBlob(key) : archive.readStudioModel(key) } },
    '../lib/studioLibrary': { ...library,
      listStudioLibrary: (accountId, next, signal) => library.listStudioLibrary(accountId, next, signal, fetcher),
      getStudioLibraryModel: (accountId, key, signal) => library.getStudioLibraryModel(accountId, key, signal, fetcher),
      readStudioLibraryModel: (accountId, entry, signal) => library.readStudioLibraryModel(accountId, entry, signal, fetcher),
    }, '../lib/glb': glb, '../lib/studioView': view,
  }
  const globals = { Blob, Error, AbortController, AbortSignal, console,
    window: Object.assign(globalThis.window, { setTimeout: (fn, delay) => { timers.push({ fn, delay }); return timers.length } }),
    URL: { createObjectURL(blob) { const key = `blob:fixture-${++serial}`; urls.set(key, blob); return key }, revokeObjectURL(key) { revoked.push(key); urls.delete(key) } },
    document: { createElement: () => { const anchor = { click: () => downloads.push({ url: anchor.href, name: anchor.download }) }; return anchor } },
  }
  const sourceUrl = new URL('../src/components/StudioGallery.tsx', import.meta.url), module = { exports: {} }, require = createRequire(sourceUrl)
  const source = await readFile(sourceUrl, 'utf8'), code = ts.transpileModule(source, { fileName: sourceUrl.pathname, compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText
  runInNewContext(code, { ...globals, module, exports: module.exports, require(key) { return modules[key] || (key.endsWith('.css') ? {} : require(key)) } })
  const Component = module.exports.default
  const render = () => { dirty = false; cursor = 0; tree = Component({ requestedModelId, compact }) }
  const settle = async () => { for (let i = 0; i < 16; i++) { if (dirty) render(); while (effects.length) effects.shift()(); await tick() } }
  const articles = () => nodes(tree).filter(node => node.type === 'article')
  const button = (label, article) => { const found = nodes(article || tree).find(node => node.type === 'button' && text(node) === label); assert.ok(found, `Missing ${label}`); return found }
  await settle()
  return { calls, localReads, urls, revoked, downloads, localState, failedReceipt, storage, originalFiles, settle, text: () => text(tree), articles,
    sessionRefreshes: () => sessionRefreshes,
    preview: () => nodes(tree).find(node => node.type === preview),
    button, click(label, article) { button(label, article).props.onClick(); return settle() },
    async account(nextOwner, nextLoading = false) { owner = nextOwner; loading = nextLoading; dirty = true; render(); const beforeEffects = text(tree), hadPreview = !!nodes(tree).find(node => node.type === preview); await settle(); return { beforeEffects, hadPreview } },
    async target(value) { requestedModelId = value; dirty = true; await settle() },
    async event() { globals.window.dispatchEvent(new CustomEvent(archive.STUDIO_ARCHIVE_EVENT, { detail: { id: 'fixture' } })); await settle() },
    close() { closed = true; for (const slot of slots) slot?.cleanup?.(); storage.close() },
  }
}

const artifacts = h => h.calls.filter(call => call.path.endsWith('/model'))

test('fresh browser lists completed account models independently of an old failed receipt and fetches only the selected GLB', async () => {
  const h = await harness()
  try {
    assert.equal(h.articles().length, 1); assert.match(h.text(), /Completed MCC on this account/)
    assert.match(h.text(), /Account model · Studio · UNREVIEWED/)
    assert.equal(artifacts(h).length, 0); assert.equal(h.localReads.length, 0)
    assert.equal(h.localState.get('worldifact-studio-current-v1'), h.failedReceipt)
    await h.click('Preview 3D', h.articles()[0])
    assert.equal(artifacts(h).length, 1); assert.equal(h.localReads.length, 0); assert.ok(h.preview())
    assert.equal(artifacts(h)[0].headers.get('X-WORLDIFACT-Job'), model().receipt.ticket)
    assert.equal(h.storage.stores.get('models').size, 0, 'Preview must not silently save an unscoped device file')
    assert.equal(h.localState.get('worldifact-studio-current-v1'), h.failedReceipt)
    await h.click('Download GLB', h.articles()[0])
    assert.equal(h.downloads.length, 1); assert.match(h.downloads[0].name, /\.glb$/)
    assert.deepEqual(await h.urls.get(h.downloads[0].url).arrayBuffer(), await fixtureGLB().arrayBuffer())
  } finally { h.close() }
})

test('all older local MCC and SOL records survive account listing, same-ID conflicts and cloud failure', async () => {
  let fail = false
  const originals = [local(id, 'Untrusted device copy with cloud ID'), local(otherId), local('blueprint:local-sol', 'Older SOL', 'blueprint')]
  const h = await harness({ locals: originals, io: path => path === '/api/studio/library' ? fail ? Response.json({ error: 'Cloud list is temporarily unavailable' }, { status: 503 }) : page([model()]) : new Response(fixtureGLB()) })
  try {
    assert.equal(h.articles().length, 4); assert.match(h.text(), /Older SOL/); assert.match(h.text(), /ownership is unverified/)
    await h.click('Preview 3D', h.articles()[0])
    assert.equal(h.localReads.length, 0, 'Matching local ID must not supply the authenticated account model')
    assert.equal(artifacts(h).length, 1)
    await h.click('Preview 3D', h.articles().find(article => text(article).includes('Untrusted device copy')))
    assert.deepEqual(h.localReads, [id]); assert.equal(artifacts(h).length, 1)
    fail = true; await h.click('Refresh')
    assert.match(h.text(), /Cloud list is temporarily unavailable/); assert.equal(h.articles().length, 4)
    assert.deepEqual([...h.storage.stores.get('metadata').values()], originals)
    for (const [key, blob] of h.originalFiles) assert.deepEqual(await h.storage.stores.get('models').get(key).arrayBuffer(), await blob.arrayBuffer())
    assert.equal(h.storage.events.length, 0)
  } finally { h.close() }
})

test('metadata pagination is explicit, continues empty pages and deduplicates only account job IDs', async () => {
  let pageCalls = 0
  const secondCursor = `c2Vjb25k.${'b'.repeat(64)}`
  const h = await harness({ locals: [local(otherId, 'Same title')], io: path => {
    assert.ok(!path.endsWith('/model'))
    pageCalls++
    if (path === '/api/studio/library') return page([model(id, 'Same title')], pageCursor)
    if (path.includes(encodeURIComponent(pageCursor))) return page([], secondCursor)
    return page([model(id, 'Same title'), model(otherId, 'Same title')])
  } })
  try {
    assert.equal(pageCalls, 1); assert.equal(h.articles().length, 2)
    await h.click('Load more account models'); assert.equal(pageCalls, 2); assert.equal(h.articles().length, 2)
    await h.click('Load more account models'); assert.equal(pageCalls, 3); assert.equal(h.articles().length, 3)
    assert.equal(h.articles().filter(article => text(article).includes('Account model')).length, 2)
    assert.equal(artifacts(h).length, 0)
  } finally { h.close() }
})

test('authenticated deep link finds its completed model outside the first page, without trusting URL ownership or autofetching bytes', async () => {
  const h = await harness({ requestedModelId: id, io: path => path === `/api/studio/library/${id}` ? Response.json({ accountId: 'owner-a', model: model() }) : page([model(otherId, 'Another completed model')], pageCursor) })
  try {
    assert.equal(h.articles().length, 2); assert.equal(h.articles()[0].props['aria-label'], 'Requested account model')
    assert.match(text(h.articles()[0]), /Completed MCC/); assert.equal(artifacts(h).length, 0)
    assert.equal(h.calls.filter(call => call.path === `/api/studio/library/${id}`).length, 1)
  } finally { h.close() }
  const invalid = await harness({ requestedModelId: '../../private?target=https://evil.test' })
  try { assert.match(invalid.text(), /model link is invalid/); assert.equal(invalid.calls.length, 1); assert.equal(artifacts(invalid).length, 0) }
  finally { invalid.close() }
})

test('expired library receipt refreshes once via owned metadata GET and never invokes recovery or paid endpoints', async () => {
  let opens = 0, refreshed = 0
  const fresh = model(); fresh.receipt.ticket = fresh.receipt.ticket.replace(/b{64}$/, 'c'.repeat(64))
  const h = await harness({ io: (path, init) => {
    if (path === '/api/studio/library') return page([model()])
    if (path === `/api/studio/library/${id}`) { refreshed++; return Response.json({ accountId: 'owner-a', model: fresh }) }
    if (opens++ === 0) return Response.json({ error: 'This library download receipt expired. Refresh this saved model.', code: 'STUDIO_LIBRARY_RECEIPT_EXPIRED' }, { status: 401 })
    assert.equal(new Headers(init.headers).get('X-WORLDIFACT-Job'), fresh.receipt.ticket)
    return new Response(fixtureGLB())
  } })
  try { await h.click('Preview 3D', h.articles()[0]); assert.ok(h.preview()); assert.equal(opens, 2); assert.equal(refreshed, 1); assert.ok(h.calls.every(call => call.method === 'GET')) }
  finally { h.close() }
})

test('missing artifact, lost membership and unrelated authentication failures stay truthful without local substitution or retries', async () => {
  for (const [status, message] of [[404, 'This completed model file is unavailable'], [403, 'This saved model requires eligible account access to download.'], [401, 'Sign in to access your account models.']]) {
    const h = await harness({ locals: [local(id)], io: path => path === '/api/studio/library' ? page([model()]) : Response.json({ error: message }, { status }) })
    try {
      await h.click('Preview 3D', h.articles()[0]); assert.ok(h.text().includes(message)); assert.equal(artifacts(h).length, 1)
      assert.equal(h.calls.length, 2); assert.equal(h.localReads.length, 0); assert.equal(h.preview(), undefined); assert.equal(h.downloads.length, 0)
      assert.equal(h.storage.stores.get('models').size, 1)
    } finally { h.close() }
  }
})

test('account switch immediately hides private metadata and previews before effects; compact mounts handle logout too', async () => {
  const h = await harness({ compact: true, io: (path, init, owner) => path === '/api/studio/library' ? page([model(owner === 'owner-a' ? id : otherId, `${owner} private model`)], null, owner) : new Response(fixtureGLB()) })
  try {
    await h.click('Preview 3D', h.articles()[0]); assert.ok(h.preview())
    const switched = await h.account('owner-b')
    assert.doesNotMatch(switched.beforeEffects, /owner-a private/); assert.equal(switched.hadPreview, false)
    assert.match(h.text(), /owner-b private/); assert.equal(h.urls.size, 0); assert.equal(h.revoked.length, 1)
    await h.click('Preview 3D', h.articles()[0]); assert.ok(h.preview())
    const out = await h.account(null)
    assert.doesNotMatch(out.beforeEffects, /owner-b private/); assert.equal(out.hadPreview, false)
    assert.equal(h.urls.size, 0); assert.equal(h.articles().length, 0)
    const before = h.calls.length; await h.event(); assert.equal(h.calls.length, before)
  } finally { h.close() }
})

test('late list and target metadata from an old account cannot populate the next account', async () => {
  const oldList = deferred(), oldTarget = deferred()
  const h = await harness({ requestedModelId: id, io: (path, init, owner) => {
    if (owner === 'owner-a') return path === '/api/studio/library' ? oldList.promise : oldTarget.promise
    return path === '/api/studio/library' ? page([model(otherId, 'Account B model')], null, owner) : Response.json({ error: 'This saved model was not found on your account.' }, { status: 404 })
  } })
  try {
    await h.account('owner-b'); assert.ok(h.calls.filter(call => call.owner === 'owner-a').every(call => call.signal.aborted))
    oldList.resolve(page([model(id, 'Account A private record')])); oldTarget.resolve(Response.json({ accountId: 'owner-a', model: model(id, 'Account A private record') })); await h.settle()
    assert.doesNotMatch(h.text(), /Account A private/); assert.match(h.text(), /Account B model/); assert.equal(artifacts(h).length, 0)
  } finally { h.close() }
})

test('logout and account changes during download, body reads or receipt refresh abort old work without previews or saves', async () => {
  for (const phase of ['artifact', 'body', 'receipt']) {
    const pending = deferred()
    const h = await harness({ io: (path, init, owner) => {
      if (path === '/api/studio/library') return page(owner === 'owner-a' ? [model()] : [model(otherId, 'B model')], null, owner)
      if (path === `/api/studio/library/${id}`) return pending.promise
      if (phase === 'receipt') return Response.json({ error: 'Expired', code: 'STUDIO_LIBRARY_RECEIPT_EXPIRED' }, { status: 401 })
      if (phase === 'body') return new Response(new ReadableStream({ async start(controller) { await pending.promise; controller.enqueue(new Uint8Array(await fixtureGLB().arrayBuffer())); controller.close() } }))
      return pending.promise
    } })
    try {
      await h.click('Download GLB', h.articles()[0]); await h.account(null)
      assert.ok(h.calls.filter(call => call.path !== '/api/studio/library').every(call => call.signal.aborted))
      if (phase === 'artifact') pending.resolve(new Response(fixtureGLB()))
      else if (phase === 'receipt') pending.resolve(Response.json({ accountId: 'owner-a', model: model() }))
      else pending.resolve()
      await h.settle()
      assert.equal(h.downloads.length, 0); assert.equal(h.urls.size, 0); assert.equal(h.storage.stores.get('models').size, 0)
      assert.equal(artifacts(h).length, 1)
    } finally { h.close() }
  }
})

test('an old local arrayBuffer completion cannot open after logout or clear a newer account operation', async () => {
  const localBytes = deferred(), nextFile = deferred()
  const h = await harness({ locals: [local()], localBlob: async () => ({ size: 200, arrayBuffer: () => localBytes.promise }), io: (path, init, owner) => {
    if (path === '/api/studio/library') return page([model(owner === 'owner-a' ? id : thirdId, `${owner} model`)], null, owner)
    return nextFile.promise
  } })
  try {
    await h.click('Preview 3D', h.articles().find(article => text(article).includes('Device copy')))
    await h.account('owner-b')
    await h.click('Preview 3D', h.articles()[0])
    localBytes.resolve(await fixtureGLB().arrayBuffer()); await h.settle()
    assert.equal(h.preview(), undefined); assert.ok(h.button('Opening…').props.disabled, 'Old finally must not unlock the new request')
    nextFile.resolve(new Response(fixtureGLB())); await h.settle()
    assert.ok(h.preview()); assert.match(h.preview().props.label, /owner-b/)
  } finally { h.close() }
})

test('malformed metadata, receipts, cursors and IDs cannot trigger arbitrary artifact URLs', async () => {
  const signal = new AbortController().signal, calls = []
  const fetcher = async (path, init) => { calls.push({ path, init }); return page() }
  await assert.rejects(library.getStudioLibraryModel('owner-a', '../secrets', signal, fetcher), /invalid/)
  await assert.rejects(library.listStudioLibrary('owner-a', 'https://evil.test/path', signal, fetcher), /invalid/)
  await assert.rejects(library.readStudioLibraryModel('owner-a', { ...model(), id: '../secrets' }, signal, fetcher), /verified/)
  const wrong = model(); wrong.receipt.id = otherId
  await assert.rejects(library.readStudioLibraryModel('owner-a', wrong, signal, fetcher), /verified/)
  const legacy = model(); legacy.receipt.ticket = legacy.receipt.ticket.replace('library.', '')
  await assert.rejects(library.readStudioLibraryModel('owner-a', legacy, signal, fetcher), /verified/)
  assert.equal(calls.length, 0)
  await assert.rejects(library.listStudioLibrary('owner-a', null, signal, async () => page(Array.from({ length: 65 }, () => model()))), /verified/)
  await assert.rejects(library.listStudioLibrary('owner-a', pageCursor, signal, async () => page([], pageCursor)), /verified/)
  await assert.rejects(library.getStudioLibraryModel('owner-a', id, signal, async () => Response.json({ accountId: 'owner-a', model: model(otherId) })), /different model/)
  let attempts = 0, refreshes = 0
  await assert.rejects(library.readStudioLibraryModel('owner-a', model(), signal, async path => {
    if (path === `/api/studio/library/${id}`) { refreshes++; return Response.json({ accountId: 'owner-a', model: model() }) }
    attempts++
    return Response.json({ error: 'Receipt remains expired', code: 'STUDIO_LIBRARY_RECEIPT_EXPIRED' }, { status: 401 })
  }), /Receipt remains expired/)
  assert.equal(attempts, 2); assert.equal(refreshes, 1)
})

test('verified response ownership must match current context despite cross-tab cookie changes', async () => {
  for (const phase of ['list', 'target', 'receipt']) {
    const h = await harness({ requestedModelId: phase === 'target' ? id : '', io: path => {
      if (path === '/api/studio/library') return phase === 'list' ? page([model(id, 'Account B private model')], null, 'owner-b') : page(phase === 'receipt' ? [model()] : [])
      if (path === `/api/studio/library/${id}`) return Response.json({ accountId: 'owner-b', model: model(id, 'Account B private model') })
      return Response.json({ error: 'Expired', code: 'STUDIO_LIBRARY_RECEIPT_EXPIRED' }, { status: 401 })
    } })
    try {
      if (phase === 'receipt') await h.click('Preview 3D', h.articles()[0])
      assert.doesNotMatch(h.text(), /Account B private/); assert.match(h.text(), /signed-in account changed/)
      assert.equal(h.preview(), undefined); assert.equal(h.downloads.length, 0)
      assert.equal(artifacts(h).length, phase === 'receipt' ? 1 : 0)
    } finally { h.close() }
  }
})

test('account loading masks old records immediately and duplicate target/page records remain one account row', async () => {
  const h = await harness({ requestedModelId: id })
  try {
    assert.equal(h.articles().length, 1); assert.equal(h.calls.length, 2)
    await h.click('Preview 3D', h.articles()[0]); assert.ok(h.preview())
    const loading = await h.account('owner-a', true)
    assert.doesNotMatch(loading.beforeEffects, /Completed MCC on this account/); assert.equal(loading.hadPreview, false)
    assert.equal(h.articles().length, 0); assert.equal(h.urls.size, 0)
  } finally { h.close() }
})

test('proven cookie ownership change clears prior account rows and preview while preserving every local original', async () => {
  let cookieOwner = 'owner-a'
  const h = await harness({ locals: [local()], io: path => path === '/api/studio/library' ? page([model(id, `${cookieOwner} private model`)], null, cookieOwner) : new Response(fixtureGLB()) })
  try {
    await h.click('Preview 3D', h.articles()[0]); assert.ok(h.preview())
    cookieOwner = 'owner-b'; await h.click('Refresh')
    assert.match(h.text(), /signed-in account changed/); assert.equal(h.preview(), undefined)
    assert.doesNotMatch(h.text(), /owner-a private model|owner-b private model/)
    assert.equal(h.articles().length, 1); assert.match(h.text(), /Older MCC saved locally/)
    assert.equal(h.urls.size, 0); assert.equal(h.sessionRefreshes(), 1)
    assert.equal(h.storage.stores.get('models').size, 1)
  } finally { h.close() }
})

test('identity mismatch from a deep link cancels an outstanding old-account list before it can repopulate', async () => {
  const oldList = deferred()
  const h = await harness({ requestedModelId: id, io: path => path === '/api/studio/library' ? oldList.promise : Response.json({ accountId: 'owner-b', model: model(id, 'B private target') }) })
  try {
    assert.match(h.text(), /signed-in account changed/); assert.equal(h.sessionRefreshes(), 1)
    assert.ok(h.calls.find(call => call.path === '/api/studio/library').signal.aborted)
    oldList.resolve(page([model(id, 'Late A private record')])); await h.settle()
    assert.equal(h.articles().length, 0); assert.doesNotMatch(h.text(), /Late A private|B private/)
  } finally { h.close() }
})

test('receipt refresh detecting another account clears a prior preview and aborts the selected download', async () => {
  let expire = false
  const h = await harness({ locals: [local()], io: path => {
    if (path === '/api/studio/library') return page([model()])
    if (path === `/api/studio/library/${id}`) return Response.json({ accountId: 'owner-b', model: model(id, 'B private record') })
    return expire ? Response.json({ error: 'Expired', code: 'STUDIO_LIBRARY_RECEIPT_EXPIRED' }, { status: 401 }) : new Response(fixtureGLB())
  } })
  try {
    await h.click('Preview 3D', h.articles()[0]); assert.ok(h.preview()); expire = true
    await h.click('Download GLB', h.articles()[0])
    assert.equal(h.preview(), undefined); assert.equal(h.articles().length, 1); assert.equal(h.downloads.length, 0)
    assert.equal(h.sessionRefreshes(), 1); assert.equal(h.urls.size, 0)
    assert.doesNotMatch(h.text(), /Completed MCC on this account|B private record/)
    assert.ok(h.calls.at(-1).signal.aborted)
  } finally { h.close() }
})
