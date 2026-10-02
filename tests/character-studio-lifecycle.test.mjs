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
async function harness(readStatus) {
  const slots = [], effects = [], timers = new Map(), delays = []
  let dirty = true, cursor = 0, serial = 0, polls = 0, posts = 0, loads = 0, adopted = 0, elapsed = 0
  const record = { receipt: { id: '12345678-1234-4234-8234-123456789abc', ticket: 'fixture', createdAt: new Date().toISOString() },
    prompt: 'Synthetic adult character', startedAt: new Date().toISOString() }
  const react = { ...React,
    useRef(initial) { const index = cursor++; if (!slots[index]) slots[index] = { ref: { current: initial } }; return slots[index].ref },
    useState(initial) {
      const index = cursor++; if (!slots[index]) slots[index] = { value: typeof initial === 'function' ? initial() : initial }
      return [slots[index].value, update => { const next = typeof update === 'function' ? update(slots[index].value) : update
        if (!Object.is(next, slots[index].value)) { slots[index].value = next; dirty = true } }]
    },
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
    window: { localStorage: { getItem: () => null, setItem() {}, removeItem() {} } },
    require(id) {
      if (id === 'react') return react
      if (id === 'react/jsx-runtime') return localRequire(id)
      if (id === '../lib/studioClient') return { StudioCoordinator: class {
        restore() { return record }
        async poll() { polls++; return { id: record.receipt.id, detail: 'Synthetic status', ...await readStatus(polls, elapsed) } }
        async start() { posts++; throw new Error('No generation permitted') }
        async artifact() { loads++; return new Blob(['Synthetic bytes; geometry is not under test']) }
      } }
      if (id === '../lib/studioProtocol') return { validateStudioInput: value => value, STUDIO_POLL_MS: 25_000 }
      if (id === '../lib/studioArchive') return { saveStudioModel: async () => {} }
      if (id === '../lib/privateWorldAssets') return { listWorldAssets: async () => [], storeWorldAsset: async () => ({ id: 'fixture-asset' }) }
      if (id === '../lib/editorTools') return { characterGenerationPrompt: () => '' }
      if (id === '../lib/generationQuote') return { quoteGeneration: () => ({ state: 'pending' }) }
      if (id === './GenerationCostNotice') return { __esModule: true, default: () => null }
      throw new Error(`Unexpected component dependency: ${id}`)
    },
  }, { filename: sourceUrl.pathname, timeout: 1000 })
  const props = { owner: 'fixture-owner', world: { id: 'fixture-world', name: 'Fixture', character: {} }, disabled: false,
    onReady() { adopted++ }, onSetAsset() {}, onFocus() {} }
  const settle = async () => {
    for (let index = 0; index < 12; index++) {
      if (dirty) { dirty = false; cursor = 0; module.exports.default(props) }
      while (effects.length) effects.shift()()
      await nextTick()
    }
  }
  await settle()
  return {
    delays, timers, counts: () => ({ polls, posts, loads, adopted }), settle,
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
