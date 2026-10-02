import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setImmediate as nextTick } from 'node:timers/promises'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import React from 'react'
import { exportBlueprintGlb } from '../src/lib/blueprintExport.ts'
import { saveBlueprintModel, listStudioModels, readStudioModel } from '../src/lib/studioArchive.ts'
import { archiveStorage, generation } from './studio-archive-helper.mjs'

const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
function nodes(tree) { const out = []; const walk = node => { if (Array.isArray(node)) node.forEach(walk); else if (React.isValidElement(node)) { out.push(node); walk(node.props.children) } }; walk(tree); return out }
function text(node) { return node == null || typeof node === 'boolean' ? '' : Array.isArray(node) ? node.map(text).join('') : React.isValidElement(node) ? text(node.props.children) : String(node) }

// Actual component hooks/effects and real archive functions. Only React runtime,
// object URL and IndexedDB facilities are controlled; no DOM or WebGL claim.
async function harness({ result = generation(), prompt = 'Original model\nwith blue roof', exportGlb = exportBlueprintGlb, archiveModel = saveBlueprintModel, noObjectUrl = false } = {}) {
  const slots = [], effects = [], urls = new Map(), revoked = [], exports = [], saves = [], pendingExports = [], pendingSaves = []
  let cursor = 0, dirty = true, tree, closed = false, lateUpdates = 0, props = { result, prompt }
  const react = { ...React,
    useState(initial) {
      const i = cursor++; if (!slots[i]) slots[i] = { value: initial }
      return [slots[i].value, action => { if (closed) { lateUpdates++; return } const next = typeof action === 'function' ? action(slots[i].value) : action; if (!Object.is(next, slots[i].value)) { slots[i].value = next; dirty = true } }]
    },
    useEffect(fn, deps) {
      const i = cursor++, old = slots[i]
      if (!old || deps.some((value, j) => !Object.is(value, old.deps[j]))) {
        const next = { deps, cleanup: old?.cleanup }; slots[i] = next
        effects.push(() => { next.cleanup?.(); next.cleanup = fn() })
      }
    },
  }
  const url = new URL('../src/components/LiveSolPreview.tsx', import.meta.url), module = { exports: {} }, localRequire = createRequire(url)
  const source = await readFile(url, 'utf8'), code = ts.transpileModule(source, { fileName: url.pathname, compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText
  runInNewContext(code, { module, exports: module.exports, Blob, Error, console,
    fetch() { throw new Error('No provider or external request is permitted in local archival') },
    URL: { createObjectURL(blob) { if (noObjectUrl) throw new Error('Object URL unavailable'); const key = `blob:original-${urls.size}`; urls.set(key, blob); return key }, revokeObjectURL(value) { revoked.push(value) } },
    require(id) {
      if (id === 'react') return react
      if (id === 'react/jsx-runtime') return localRequire(id)
      if (id === '../lib/blueprintExport') return { exportBlueprintGlb(value) { exports.push(value); const pending = exportGlb(value); pendingExports.push(pending); return pending } }
      if (id === '../lib/studioArchive') return { saveBlueprintModel(...args) { saves.push(args); const pending = archiveModel(...args); pendingSaves.push(pending); return pending } }
      if (id === './OracleModelPreview') return { __esModule: true, default: () => null }
      throw new Error(`Unexpected preview dependency: ${id}`)
    },
  }, { filename: url.pathname, timeout: 1000 })
  const Component = module.exports.default
  const settle = async () => { for (let i = 0; i < 24; i++) { if (dirty && !closed) { dirty = false; cursor = 0; tree = Component(props) } while (effects.length) effects.shift()(); await nextTick() } }
  await settle()
  return { exports, saves, urls, revoked, settle,
    async finish() { await Promise.allSettled(pendingExports); await settle(); await Promise.allSettled(pendingSaves); await settle() },
    async finishSaves() { await Promise.allSettled(pendingSaves); await settle() },
    all: () => nodes(tree), text: () => text(tree), lateUpdates: () => lateUpdates,
    download: () => nodes(tree).find(n => n.type === 'a' && n.props.download),
    button: () => nodes(tree).find(n => n.type === 'button'),
    async replace(result, prompt = props.prompt) { props = { result, prompt }; dirty = true; await settle() },
    close() { if (closed) return; closed = true; for (const slot of slots) slot?.cleanup?.() },
  }
}

test('successful real preview exports automatically archive identical downloadable bytes and preserve source evidence', async () => {
  const f = archiveStorage(), result = generation('gpt-6-astra'), h = await harness({ result })
  try {
    await h.finish()
    assert.equal(h.exports.length, 1); assert.equal(h.saves.length, 1)
    assert.match(h.text(), /Saved on this device.*available in AI Game Lab/)
    const entry = (await listStudioModels())[0], shown = h.urls.get(h.download().props.href)
    assert.equal(entry.source, 'blueprint'); assert.deepEqual(entry.generation, result)
    assert.deepEqual(await (await readStudioModel(entry.id)).arrayBuffer(), await shown.arrayBuffer())
    assert.strictEqual(h.saves[0][2], shown, 'Archive gets the exact same Blob as preview/download')
    assert.equal(f.events.length, 1)
    await h.replace(structuredClone(result)); await h.finish()
    assert.equal((await listStudioModels()).length, 1, 'A recovery/remount cannot add another model for this request')
    assert.deepEqual((await listStudioModels())[0], entry)
    assert.ok(h.revoked.includes('blob:original-0'))
  } finally { h.close(); f.close() }
})

test('quota failure keeps the original downloadable GLB and storage retry does not export or generate again', async () => {
  const f = archiveStorage(); f.failWrites()
  const h = await harness()
  try {
    await h.finish()
    assert.match(h.text(), /was not saved to the device library/)
    assert.ok(h.download()); assert.equal(f.events.length, 0); assert.equal((await listStudioModels()).length, 0)
    const original = h.saves[0][2], retry = h.button().props.onClick
    f.failWrites(false); retry(); retry(); await h.finish()
    assert.equal(h.exports.length, 1); assert.equal(h.saves.length, 2, 'Repeated clicks share the single storage operation')
    assert.strictEqual(h.saves[1][2], original)
    assert.equal((await listStudioModels()).length, 1); assert.equal(f.events.length, 1)
    assert.match(h.text(), /Saved on this device/); assert.equal(h.button(), undefined)
  } finally { h.close(); f.close() }
})

test('failed export never creates an archive record or a false saved message', async () => {
  const f = archiveStorage(), h = await harness({ exportGlb: async () => { throw new Error('GLB export failed') } })
  try {
    await h.finish()
    assert.match(h.text(), /could not export its GLB/)
    assert.equal(h.download(), undefined); assert.equal(h.saves.length, 0); assert.equal(f.events.length, 0)
    assert.equal((await listStudioModels()).length, 0)
  } finally { h.close(); f.close() }
})

test('immediate Shop to Game Lab navigation still saves a completed export without leaking a preview URL or late UI', async () => {
  const f = archiveStorage(), pending = deferred(), result = generation(), h = await harness({ result, exportGlb: () => pending.promise })
  try {
    h.close()
    const bytes = await exportBlueprintGlb(result.blueprint); pending.resolve(bytes); await h.finish()
    const entry = (await listStudioModels())[0]
    assert.ok(entry); assert.equal(f.events.length, 1, 'The mounted Game Lab can refresh from this completion event')
    assert.deepEqual(await (await readStudioModel(entry.id)).arrayBuffer(), bytes)
    assert.equal(h.urls.size, 0); assert.equal(h.lateUpdates(), 0)
  } finally { h.close(); f.close() }
})

test('late old export archives its original while only the newer result can update the current preview', async () => {
  const f = archiveStorage(), old = generation(), newer = generation('gpt-6-luna'), pending = deferred()
  const h = await harness({ result: old, exportGlb: blueprint => blueprint === old.blueprint ? pending.promise : exportBlueprintGlb(blueprint) })
  try {
    await h.replace(newer, 'New lunar prompt'); await h.finishSaves()
    const latestUrl = h.download().props.href
    pending.resolve(await exportBlueprintGlb(old.blueprint)); await h.finish()
    assert.equal(h.download().props.href, latestUrl); assert.match(h.text(), /LIVE LUNA specification/)
    assert.doesNotMatch(h.text(), /Original model/)
    const entries = await listStudioModels()
    assert.equal(entries.length, 2); assert.equal(h.urls.size, 1)
    assert.equal(entries.find(e => e.generation.requestId === old.requestId).prompt, 'Original model\nwith blue roof')
    assert.equal(entries.find(e => e.generation.requestId === newer.requestId).prompt, 'New lunar prompt')
  } finally { h.close(); f.close() }
})

test('unmount during archive open preserves completed bytes and revokes the existing preview URL', async () => {
  const f = archiveStorage(); f.pauseOpen()
  const h = await harness()
  try {
    assert.match(h.text(), /Saving this procedural GLB/)
    const bytes = await h.saves[0][2].arrayBuffer(); h.close(); f.resumeOpen(); await h.finish()
    assert.equal(h.revoked.length, 1); assert.equal(h.lateUpdates(), 0)
    const entry = (await listStudioModels())[0]
    assert.deepEqual(await (await readStudioModel(entry.id)).arrayBuffer(), bytes)
  } finally { h.close(); f.close() }
})

test('preview URL failure cannot discard an otherwise successfully exported original', async () => {
  const f = archiveStorage(), h = await harness({ noObjectUrl: true })
  try {
    await h.finish()
    assert.match(h.text(), /could not open its preview/); assert.match(h.text(), /Saved on this device/)
    assert.equal((await listStudioModels()).length, 1); assert.equal(h.download(), undefined)
  } finally { h.close(); f.close() }
})
