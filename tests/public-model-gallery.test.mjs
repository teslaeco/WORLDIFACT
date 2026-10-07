import test from 'node:test'
import assert from 'node:assert/strict'
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import React from 'react'
import * as gallery from '../src/lib/publicGallery.ts'
import { readPublicGalleryAssets, verifyPublicGalleryAssets, packEmbeddedGltf, sha256 } from '../scripts/prepare-public-gallery.mjs'
import { buildSoftwareModel, inspectEmbeddedGlb } from '../src/lib/softwareModelPreview.ts'
import { disposeObject } from '../src/lib/worldGeometry.ts'

const assets = await readPublicGalleryAssets()
const arrayBuffer = bytes => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
const text = node => node == null || typeof node === 'boolean' ? '' : Array.isArray(node) ? node.map(text).join('') : React.isValidElement(node) ? text(node.props.children) : String(node)
const nodes = tree => { const all = []; function walk(node) { if (Array.isArray(node)) node.forEach(walk); else if (React.isValidElement(node)) { all.push(node); walk(node.props.children) } } walk(tree); return all }
const memory = initial => { const data = new Map(initial); return { data, getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) } }

test('two real public models exactly match pinned bytes and bounded source geometry', () => {
  assert.equal(assets.size, 2)
  for (const model of gallery.PUBLIC_MODELS) {
    const bytes = assets.get(model.path.split('/').at(-1))
    assert.equal(bytes.length, model.bytes); assert.equal(sha256(bytes), model.sha256)
    const { json } = inspectEmbeddedGlb(arrayBuffer(bytes))
    assert.equal(json.buffers.length, 1); assert.equal(json.buffers[0].uri, undefined)
    assert.equal(json.images?.length || 0, 0)
    const software = buildSoftwareModel(arrayBuffer(bytes))
    assert.ok(software.triangles > 0 && software.triangles <= 20_000)
    assert.equal(software.sourceTriangles, model.id === 'led-polyhedron' ? 2976 : 88020)
    disposeObject(software.model)
  }
})
test('polyhedron repack preserves all original scene, geometry and material definitions', async () => {
  const source = await readFile(new URL('../public/world-assets/polyhedron-led.gltf', import.meta.url)), original = JSON.parse(source)
  const packed = packEmbeddedGltf(source), parsed = inspectEmbeddedGlb(arrayBuffer(packed))
  for (const name of ['scene', 'scenes', 'nodes', 'meshes', 'materials', 'accessors', 'bufferViews']) assert.deepEqual(parsed.json[name], original[name])
  assert.equal(sha256(Buffer.from(parsed.bin.buffer, parsed.bin.byteOffset, original.buffers[0].byteLength)), 'aac357c5288fb186d0776b1313fbef98a8462f2027de876c79d1198ff233c82c')
  assert.throws(() => packEmbeddedGltf(Buffer.from('{}')), /source changed/)
})
test('public asset loader uses credential-free GET and verifies every delivered byte', async () => {
  for (const model of gallery.PUBLIC_MODELS) {
    const bytes = assets.get(model.path.split('/').at(-1)), calls = []
    const blob = await gallery.readPublicModel(model, new AbortController().signal, async (path, init) => { calls.push({ path, init }); return new Response(bytes) })
    assert.equal(sha256(Buffer.from(await blob.arrayBuffer())), model.sha256)
    assert.equal(blob.type, 'model/gltf-binary'); assert.equal(calls.length, 1)
    assert.equal(calls[0].path, model.path); assert.equal(calls[0].init.method, 'GET'); assert.equal(calls[0].init.credentials, 'omit'); assert.equal(calls[0].init.redirect, 'error')
  }
})
test('unapproved, truncated, oversized, changed and aborted model bytes never become a preview Blob', async () => {
  const model = gallery.PUBLIC_MODELS[1], bytes = assets.get('led-polyhedron.glb'), controller = new AbortController()
  let calls = 0
  await assert.rejects(() => gallery.readPublicModel({ ...model, path: '/api/private/model' }, controller.signal, () => { calls++; }), /Unknown/)
  assert.equal(calls, 0)
  for (const body of [bytes.subarray(0, 100), Buffer.concat([bytes, Buffer.from([0])]), Buffer.alloc(bytes.length)]) await assert.rejects(() => gallery.readPublicModel(model, controller.signal, async () => new Response(body)), /incomplete|reviewed size|fingerprint/)
  await assert.rejects(() => gallery.readPublicModel(model, controller.signal, async () => new Response(bytes, { headers: { 'content-length': '100' } })), /size/)
  controller.abort()
  await assert.rejects(() => gallery.readPublicModel(model, controller.signal, () => { calls++; }), /abort/i)
  assert.equal(calls, 0)
})
test('hearts are idempotent per-model local storage, unrelated account storage remains untouched', () => {
  const storage = memory([['worldifact-studio-current-v1', 'private existing receipt'], [gallery.PUBLIC_FAVORITE_PREFIX + 'not-approved', '1']])
  assert.deepEqual(gallery.readPublicHearts(storage), [])
  for (const model of gallery.PUBLIC_MODELS) { gallery.writePublicHeart(storage, model.id, true); gallery.writePublicHeart(storage, model.id, true) }
  assert.deepEqual(gallery.readPublicHearts(storage), gallery.PUBLIC_MODELS.map(model => model.id))
  gallery.writePublicHeart(storage, gallery.PUBLIC_MODELS[0].id, false)
  assert.deepEqual(gallery.readPublicHearts(storage), [gallery.PUBLIC_MODELS[1].id])
  assert.equal(storage.getItem('worldifact-studio-current-v1'), 'private existing receipt')
  assert.throws(() => gallery.writePublicHeart(storage, 'unknown', true), /Unknown/)
})

async function componentHarness(storage = memory(), overrides = {}) {
  const slots = [], effects = [], listeners = new Map()
  let cursor = 0, tree
  const react = { ...React,
    useState(initial) { const index = cursor++; if (!slots[index]) slots[index] = { value: typeof initial === 'function' ? initial() : initial }; return [slots[index].value, next => { slots[index].value = typeof next === 'function' ? next(slots[index].value) : next }] },
    useRef(initial) { const index = cursor++; if (!slots[index]) slots[index] = { value: { current: initial } }; return slots[index].value },
    useEffect(fn, deps) { const index = cursor++; if (!slots[index]) { slots[index] = { deps }; effects.push(() => { slots[index].cleanup = fn() }) } },
  }
  const window = { localStorage: storage, addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) }
  const url = new URL('../src/components/PublicModelGallery.tsx', import.meta.url), source = await readFile(url, 'utf8'), module = { exports: {} }, localRequire = createRequire(url)
  const code = ts.transpileModule(source, { fileName: url.pathname, compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText
  runInNewContext(code, { module, exports: module.exports, window, Error, require(id) { if (id === 'react') return react; if (id === '../lib/publicGallery') return { ...gallery, ...overrides }; if (id === './OracleModelPreview') return () => null; if (id.endsWith('.css')) return {}; return localRequire(id) } })
  const render = () => { cursor = 0; tree = module.exports.default(); return tree }
  render(); for (const effect of effects.splice(0)) effect(); render()
  const cards = () => nodes(tree).filter(node => typeof node.type === 'function' && node.props.model)
  return { storage, listeners, cards, text: () => text(tree), render, button: name => nodes(tree).find(node => node.type === 'button' && text(node).startsWith(name)), toggle(index = 0) { cards()[index].props.onHeart(); render() }, close() { slots.forEach(slot => slot.cleanup?.()) } }
}
test('real gallery heart handlers toggle, persist, undo, filter and restore on reload', async () => {
  const h = await componentHarness()
  assert.equal(h.cards().length, 2); assert.equal(h.cards()[0].props.hearted, false)
  h.toggle(); assert.equal(h.cards()[0].props.hearted, true); assert.match(h.text(), /added to your hearts/)
  h.button('My hearts').props.onClick(); h.render(); assert.equal(h.cards().length, 1)
  h.close()
  const restored = await componentHarness(h.storage)
  assert.equal(restored.cards()[0].props.hearted, true)
  restored.toggle(); assert.equal(restored.cards()[0].props.hearted, false)
  restored.button('My hearts').props.onClick(); restored.render(); assert.equal(restored.cards().length, 0); assert.match(restored.text(), /Nothing saved yet/)
  assert.match(restored.text(), /browser only/); assert.match(restored.text(), /not account likes or public popularity/)
  restored.close(); assert.equal(restored.listeners.size, 0)
})
test('rapid repeated heart events use the latest state, and failed storage stays honestly tab-local', async () => {
  const storage = { getItem() { throw Error('disabled') }, setItem() { throw Error('disabled') }, removeItem() { throw Error('disabled') } }
  const h = await componentHarness(storage)
  const first = h.cards()[0].props.onHeart
  first(); first(); h.render(); assert.equal(h.cards()[0].props.hearted, false)
  h.toggle(); assert.equal(h.cards()[0].props.hearted, true); assert.match(h.text(), /only in this open page/)
  h.close()
})
test('storage events keep hearts in sync without touching other model or account keys', async () => {
  const h = await componentHarness()
  gallery.writePublicHeart(h.storage, gallery.PUBLIC_MODELS[1].id, true)
  h.listeners.get('storage')({ key: gallery.PUBLIC_FAVORITE_PREFIX + gallery.PUBLIC_MODELS[1].id }); h.render()
  assert.equal(h.cards()[1].props.hearted, true); assert.equal(h.cards()[0].props.hearted, false)
  h.close()
})

test('partial storage failure keeps unsaved hearts and warning across other successful writes and tab events', async () => {
  const base = memory(), storage = { ...base, setItem(key, value) { if (key.endsWith('mars-solar-landship')) throw Error('quota'); base.setItem(key, value) } }
  const h = await componentHarness(storage)
  h.toggle(0); h.toggle(1)
  assert.equal(h.cards()[0].props.hearted, true); assert.equal(h.cards()[1].props.hearted, true)
  assert.deepEqual(gallery.readPublicHearts(base), ['led-polyhedron'])
  assert.match(h.text(), /Some hearts could not be saved/)
  h.listeners.get('storage')({ key: gallery.PUBLIC_FAVORITE_PREFIX + 'led-polyhedron' }); h.render()
  assert.equal(h.cards()[0].props.hearted, true); assert.match(h.text(), /Some hearts could not be saved/)
  h.toggle(0); assert.equal(h.cards()[0].props.hearted, false)
  assert.match(h.text(), /saved in this browser only/)
  h.close()
})


test('release gate requires exactly both pinned public GLBs without repairing missing or changed files', async t => {
  const dist = await mkdtemp(join(tmpdir(), 'public-gallery-release-'))
  t.after(() => rm(dist, { recursive: true, force: true }))
  const directory = join(dist, 'gallery-assets')
  await mkdir(directory)
  const restore = async () => { for (const [name, bytes] of assets) await writeFile(join(directory, name), bytes) }
  await restore()
  assert.deepEqual(await verifyPublicGalleryAssets(dist), { models: 2 })
  for (const missing of [[...assets.keys()][0], [...assets.keys()][1], 'both']) {
    const names = missing === 'both' ? [...assets.keys()] : [missing]
    for (const name of names) await rm(join(directory, name))
    await assert.rejects(verifyPublicGalleryAssets(dist), /Both exact public gallery release models are required/)
    for (const name of names) await assert.rejects(lstat(join(directory, name)), { code: 'ENOENT' })
    await restore()
  }
  for (const [name, bytes] of assets) {
    const changed = Buffer.from(bytes); changed[changed.length - 1] ^= 1
    await writeFile(join(directory, name), changed)
    await assert.rejects(verifyPublicGalleryAssets(dist), /bytes do not match/)
    assert.deepEqual(await readFile(join(directory, name)), changed)
    await restore()
  }
  await writeFile(join(directory, 'unreviewed.glb'), 'extra')
  await assert.rejects(verifyPublicGalleryAssets(dist), /Both exact public gallery release models are required/)
  await rm(join(directory, 'unreviewed.glb'))
  assert.deepEqual((await readdir(directory)).sort(), [...assets.keys()].sort())
})

test('release gate rejects missing directories and symlinked or non-regular model paths', async t => {
  const root = await mkdtemp(join(tmpdir(), 'public-gallery-types-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const dist = join(root, 'dist'), directory = join(dist, 'gallery-assets'), source = join(root, 'source')
  await mkdir(dist); await mkdir(source)
  for (const [name, bytes] of assets) await writeFile(join(source, name), bytes)
  await assert.rejects(verifyPublicGalleryAssets(dist), { code: 'ENOENT' })
  await symlink(source, directory)
  await assert.rejects(verifyPublicGalleryAssets(dist), /directory is not reviewed/)
  await rm(directory); await mkdir(directory)
  for (const [name, bytes] of assets) await writeFile(join(directory, name), bytes)
  for (const name of assets.keys()) {
    const path = join(directory, name)
    await rm(path); await symlink(join(source, name), path)
    await assert.rejects(verifyPublicGalleryAssets(dist), /Both exact public gallery release models are required/)
    await rm(path); await mkdir(path)
    await assert.rejects(verifyPublicGalleryAssets(dist), /Both exact public gallery release models are required/)
    await rm(path, { recursive: true }); await writeFile(path, assets.get(name))
  }
  const linkedDist = join(root, 'linked-dist'); await symlink(dist, linkedDist)
  await assert.rejects(verifyPublicGalleryAssets(linkedDist), /directory is not reviewed/)
})
