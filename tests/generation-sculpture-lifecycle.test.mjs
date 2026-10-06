import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { setImmediate as nextTick } from 'node:timers/promises'
import ts from 'typescript'
import React from 'react'

// Actual component effects, with deterministic DOM/WebGL adapters. No browser
// starts here; these tests do not establish visual or device performance.
async function harness({ animate = true, deferAsset = false, failRenderer = false } = {}) {
  const sourceUrl = new URL('../src/components/GenerationSculpture.tsx', import.meta.url)
  const source = await readFile(sourceUrl, 'utf8'), localRequire = createRequire(sourceUrl), module = { exports: {} }
  const code = ts.transpileModule(source, { fileName: sourceUrl.pathname, compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText
  const events = new EventTarget(), canvas = new EventTarget(), frames = new Map(), effects = [], states = [], calls = []
  const host = { clientWidth: 240, clientHeight: 240, appendChild(node) { calls.push('append'); assert.equal(node, canvas) } }
  canvas.setAttribute = () => {}; canvas.remove = () => calls.push('remove')
  let serial = 0, intersect, resolveAsset
  const document = { hidden: false, addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events) }
  const geometry = { dispose() { calls.push('geometry.dispose') } }, material = { dispose() { calls.push('material.dispose') } }
  const sculpture = { traverse(callback) { callback({ isMesh: true, geometry, material }); callback({ isMesh: true, geometry, material }) } }
  const assetPromise = new Promise(resolve => { resolveAsset = resolve })
  const asset = { LOGIN_SCULPTURE_PALETTE: ['green', 'blue'], async loadPortalSculpture() { calls.push('load'); return deferAsset ? assetPromise : sculpture }, rotatePortalSculpture() { calls.push('rotate') } }
  class Renderer {
    constructor(options) { calls.push('renderer'); if (failRenderer) throw new Error('WebGL unavailable'); this.domElement = canvas; assert.equal(options.powerPreference, 'low-power') }
    setPixelRatio(ratio) { assert.ok(ratio <= 1.5) }
    setClearColor() {} setSize() {} render() { calls.push('render') }
    dispose() { calls.push('renderer.dispose') } forceContextLoss() { calls.push('context.release') }
  }
  const three = { WebGLRenderer: Renderer, Scene: class { add() {} }, PerspectiveCamera: class { position = { set() {} }; updateProjectionMatrix() {} }, AmbientLight: class {}, DirectionalLight: class { position = { set() {} } } }
  const react = { ...React, useRef: () => ({ current: host }), useState: () => [false, value => states.push(value)], useEffect: callback => effects.push(callback) }
  runInNewContext(code, { module, exports: module.exports, window: { devicePixelRatio: 3 }, document, Event,
    requestAnimationFrame(callback) { const id = ++serial; frames.set(id, callback); return id }, cancelAnimationFrame(id) { frames.delete(id) },
    ResizeObserver: class { observe() {} disconnect() { calls.push('resize.disconnect') } },
    IntersectionObserver: class { constructor(callback) { intersect = callback } observe() {} disconnect() { calls.push('intersection.disconnect') } },
    require(id) { if (id === 'react') return react; if (id === 'react/jsx-runtime') return localRequire(id); if (id === 'three') return three; if (id === '../lib/portalSculpture') return asset; throw new Error(`Unexpected sculpture dependency: ${id}`) },
  }, { filename: sourceUrl.pathname })
  module.exports.default({ animate })
  const cleanup = effects[0]()
  await nextTick(); await nextTick()
  return { calls, states, frames, cleanup,
    async finishAsset() { resolveAsset(sculpture); await nextTick(); await nextTick() },
    visibility(hidden) { document.hidden = hidden; events.dispatchEvent(new Event('visibilitychange')) },
    intersection(visible) { intersect([{ isIntersecting: visible }]) },
    contextLost() { canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true })) },
    frame(now) { const entry = frames.entries().next().value; assert.ok(entry, 'A frame should be scheduled'); frames.delete(entry[0]); entry[1](now) },
  }
}

test('static/reduced-motion mode performs no WebGL work or asset load', async () => {
  const h = await harness({ animate: false })
  assert.deepEqual(h.calls, [])
  assert.equal(h.frames.size, 0)
  assert.equal(h.cleanup, undefined)
})

test('animation pauses in hidden tabs and offscreen, then disposes resources once', async () => {
  const h = await harness()
  assert.equal(h.frames.size, 1)
  h.frame(100); h.frame(110)
  h.visibility(true); assert.equal(h.frames.size, 0)
  h.visibility(false); assert.equal(h.frames.size, 1)
  h.intersection(false); assert.equal(h.frames.size, 0)
  h.intersection(true); assert.equal(h.frames.size, 1)
  h.cleanup()
  assert.equal(h.frames.size, 0)
  for (const event of ['geometry.dispose', 'material.dispose', 'renderer.dispose', 'context.release', 'remove']) assert.equal(h.calls.filter(call => call === event).length, 1, event)
  h.visibility(false); assert.equal(h.frames.size, 0)
})

test('a sculpture finishing after unmount is disposed and never animated', async () => {
  const h = await harness({ deferAsset: true })
  h.cleanup(); await h.finishAsset()
  assert.equal(h.calls.filter(call => call === 'geometry.dispose').length, 1)
  assert.equal(h.calls.filter(call => call === 'material.dispose').length, 1)
  assert.equal(h.calls.includes('rotate'), false)
  assert.equal(h.frames.size, 0)
  assert.equal(h.states.includes(true), false)
})

test('WebGL failure and context loss leave the poster fallback and no animation', async () => {
  const failed = await harness({ failRenderer: true })
  assert.equal(failed.states.at(-1), false)
  assert.equal(failed.frames.size, 0)
  failed.cleanup()
  const lost = await harness()
  lost.contextLost()
  assert.equal(lost.states.at(-1), false)
  assert.equal(lost.frames.size, 0)
  lost.visibility(false); assert.equal(lost.frames.size, 0)
  lost.cleanup()
})
