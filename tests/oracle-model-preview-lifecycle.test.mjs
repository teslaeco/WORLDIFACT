import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { setImmediate as nextTick } from 'node:timers/promises'
import ts from 'typescript'
import React from 'react'
import * as Three from 'three'
import * as softwareHelpers from '../src/lib/softwareModelPreview.ts'
import { createModelSlot } from '../src/lib/modelSlot.ts'
import { frameModel } from '../src/lib/modelFraming.ts'
import { disposeObject } from '../src/lib/worldGeometry.ts'

function bytes() {
  const json = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }], meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }], accessors: [{ bufferView: 0, count: 3, componentType: 5126, type: 'VEC3' }], bufferViews: [{ buffer: 0, byteLength: 36 }], buffers: [{ byteLength: 36 }] }
  const encoded = new TextEncoder().encode(JSON.stringify(json)), n = Math.ceil(encoded.length / 4) * 4
  const result = new Uint8Array(n + 64), v = new DataView(result.buffer)
  for (const [offset, value] of [[0, 0x46546c67], [4, 2], [8, result.length], [12, n], [16, 0x4e4f534a], [20 + n, 36], [24 + n, 0x004e4942]]) v.setUint32(offset, value, true)
  result.fill(32, 20, 20 + n); result.set(encoded, 20); new Float32Array(result.buffer, n + 28, 9).set([-1, -1, 0, 1, -1, 0, 0, 1, 0])
  return result.buffer
}
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
function nodes(tree) { const result = []; const walk = node => { if (Array.isArray(node)) node.forEach(walk); else if (React.isValidElement(node)) { result.push(node); walk(node.props.children) } }; walk(tree); return result }
const content = node => node == null || typeof node === 'boolean' ? '' : Array.isArray(node) ? node.map(content).join('') : React.isValidElement(node) ? content(node.props.children) : String(node)
class Element {
  attrs = {}; style = {}; listeners = new Map(); parent = null
  setAttribute(key, value) { this.attrs[key] = value }
  addEventListener(name, fn) { this.listeners.set(name, fn) }
  removeEventListener(name, fn) { if (this.listeners.get(name) === fn) this.listeners.delete(name) }
  dispatch(name) { this.listeners.get(name)?.({ preventDefault() {} }) }
  remove() { if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null }
}

// Runs the real component's hooks/effects, Three models, source guards and model
// ownership. DOM/GPU facilities are controlled to exercise failure and races.
async function harness({ mode = 'webgl', source = async () => bytes(), parse, url = 'blob:approved-model' } = {}) {
  const state = [], effects = [], webgl = [], svgs = [], controls = [], envs = [], reads = [], parses = [], built = [], observers = [], frames = new Map()
  const host = { clientWidth: 640, clientHeight: 480, children: [], appendChild(child) { child.parent = this; this.children.push(child) } }
  let cursor = 0, dirty = true, closed = false, lateUpdates = 0, tree, frameId = 0
  const react = { ...React,
    useState(initial) { const i = cursor++; state[i] ??= { value: initial }; return [state[i].value, value => { if (closed) { lateUpdates++; return } if (!Object.is(value, state[i].value)) { state[i].value = value; dirty = true } }] },
    useRef(initial) { const i = cursor++; state[i] ??= { current: initial }; return state[i] },
    useEffect(fn, deps) { const i = cursor++, old = state[i]; if (!old || deps.some((value, j) => !Object.is(value, old.deps[j]))) { const next = { deps, cleanup: old?.cleanup }; state[i] = next; effects.push(() => { next.cleanup?.(); next.cleanup = fn() }) } },
  }
  class Renderer {
    domElement = new Element(); disposed = 0; lost = 0; loop = null; renders = 0
    constructor() { if (['constructor-failure', 'svg-setup-failure', 'svg-render-failure'].includes(mode)) throw new Error('No WebGL'); webgl.push(this) }
    setPixelRatio() {} setClearColor() {} setSize() {}
    setAnimationLoop(fn) { this.loop = fn }
    render() { if (mode === 'render-failure') throw new Error('GPU render failed'); this.renders++ }
    dispose() { this.disposed++ }
    forceContextLoss() { this.lost++; this.domElement.dispatch('webglcontextlost') }
  }
  class Svg {
    domElement = new Element(); cleared = 0; renders = 0
    constructor() { if (mode === 'svg-setup-failure') throw new Error('SVG unavailable'); svgs.push(this) }
    setClearColor() {} setPrecision() {} setSize() {}
    render() { if (mode === 'svg-render-failure') throw new Error('SVG projection failed'); this.renders++ }
    clear() { this.cleared++ }
  }
  class Controls {
    target = new Three.Vector3(); disposed = 0; enableDamping = false
    constructor() { controls.push(this) }
    addEventListener() {} removeEventListener() {} update() {} dispose() { this.disposed++ }
  }
  class PMREM {
    fromScene() { if (mode === 'setup-failure') throw new Error('Environment failed'); const env = { texture: {}, disposed: 0, dispose() { this.disposed++ } }; envs.push(env); return env }
    dispose() {}
  }
  class Loader {
    constructor(manager) { this.manager = manager }
    async parseAsync(value) { parses.push({ value, manager: this.manager }); return parse ? parse(value) : (() => { const model = new Three.Group(); model.add(new Three.Mesh(new Three.BoxGeometry(), new Three.MeshStandardMaterial())); return { scene: model, scenes: [model] } })() }
  }
  const moduleUrl = new URL('../src/components/OracleModelPreview.tsx', import.meta.url), localRequire = createRequire(moduleUrl), module = { exports: {} }
  const code = ts.transpileModule(await readFile(moduleUrl, 'utf8'), { fileName: moduleUrl.pathname, compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText
  runInNewContext(code, { module, exports: module.exports, Error, console, AbortController,
    window: { devicePixelRatio: 1 },
    ResizeObserver: class { disconnected = false; constructor(fn) { this.fn = fn; observers.push(this) } observe() {} disconnect() { this.disconnected = true } },
    requestAnimationFrame(fn) { frames.set(++frameId, fn); return frameId }, cancelAnimationFrame(id) { frames.delete(id) },
    require(id) {
      if (id === 'react') return react
      if (id === 'react/jsx-runtime') return localRequire(id)
      if (id === 'three') return { ...Three, WebGLRenderer: Renderer, PMREMGenerator: PMREM }
      if (id.includes('/OrbitControls')) return { OrbitControls: Controls }
      if (id.includes('/RoomEnvironment')) return { RoomEnvironment: class { dispose() {} } }
      if (id.includes('/GLTFLoader')) return { GLTFLoader: Loader }
      if (id.includes('/SVGRenderer')) return { SVGRenderer: Svg }
      if (id === '../lib/worldGeometry') return { disposeObject }
      if (id === '../lib/modelSlot') return { createModelSlot }
      if (id === '../lib/modelFraming') return { frameModel }
      if (id === '../lib/softwareModelPreview') return { ...softwareHelpers,
        readModelPreviewBytes(...args) { reads.push(args); return source(...args) },
        buildSoftwareModel(value) { const result = softwareHelpers.buildSoftwareModel(value); built.push(result); return result },
      }
      throw new Error(`Unexpected dependency ${id}`)
    },
  }, { timeout: 2000 })
  const wrapper = module.exports.default({ url, label: 'Account model', customerMode: true }), Component = wrapper.type
  async function settle() { for (let i = 0; i < 16; i++) { if (dirty && !closed) { dirty = false; cursor = 0; tree = Component(wrapper.props); for (const node of nodes(tree)) if (node.props.ref) node.props.ref.current = host } while (effects.length) effects.shift()(); await nextTick() } }
  await settle()
  return { webgl, svgs, controls, envs, reads, parses, built, observers, frames, host, settle,
    text: () => content(tree), tree: () => tree, lateUpdates: () => lateUpdates,
    button: name => nodes(tree).find(node => node.type === 'button' && node.props.children === name),
    renderFrames() { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(fn => fn()) },
    close() { if (closed) return; closed = true; for (const slot of state) slot?.cleanup?.() },
    keyFor: value => module.exports.default({ url: value, label: 'Account model', customerMode: true }).key,
  }
}

test('healthy WebGL preserves interactive renderer, textured loader and view controls', async () => {
  const h = await harness()
  try {
    assert.equal(h.webgl.length, 1); assert.equal(h.svgs.length, 0); assert.equal(h.parses.length, 1); assert.equal(h.built.length, 0)
    assert.match(h.text(), /Preview ready.*Drag to rotate/); assert.equal(h.button('Front').props.disabled, false)
    assert.equal(typeof h.webgl[0].loop, 'function')
    assert.throws(() => h.parses[0].manager.resolveURL('https://example.com/private'), /External model resources/)
    assert.equal(h.parses[0].manager.resolveURL('data:image/png;base64,AAAA'), 'data:image/png;base64,AAAA')
  } finally { h.close() }
  assert.equal(h.webgl[0].disposed, 1); assert.equal(h.webgl[0].lost, 1); assert.equal(h.controls[0].disposed, 1); assert.equal(h.envs[0].disposed, 1)
  assert.equal(h.host.children.length, 0); assert.equal(h.webgl[0].loop, null)
})

test('WebGL constructor and partial setup failures produce clearly labelled demand-rendered software previews', async () => {
  for (const mode of ['constructor-failure', 'setup-failure']) {
    const h = await harness({ mode })
    try {
      assert.equal(h.svgs.length, 1); assert.equal(h.parses.length, 0); assert.equal(h.built.length, 1)
      assert.match(h.text(), /Simplified untextured preview.*Base colors only/); assert.doesNotMatch(h.text(), /Drag to rotate/)
      assert.equal(h.host.children.length, 1); assert.equal(h.button('Front').props.disabled, false)
      h.renderFrames(); assert.equal(h.svgs[0].renders, 1); assert.equal(h.frames.size, 0)
      h.button('Front').props.onClick(); h.renderFrames(); assert.equal(h.svgs[0].renders, 2)
      assert.equal(h.reads[0][2], softwareHelpers.SOFTWARE_PREVIEW_LIMITS.bytes)
      if (mode === 'setup-failure') { assert.equal(h.webgl[0].disposed, 1); assert.equal(h.webgl[0].loop, null); assert.equal(h.controls[0].disposed, 1) }
    } finally { h.close() }
    assert.equal(h.host.children.length, 0); assert.equal(h.svgs[0].cleared, 1); assert.equal(h.frames.size, 0)
  }
})

test('context loss tears down WebGL and switches to actual bounded source geometry', async () => {
  const h = await harness()
  try {
    h.webgl[0].domElement.dispatch('webglcontextlost'); await h.settle()
    assert.equal(h.webgl[0].disposed, 1); assert.equal(h.webgl[0].loop, null); assert.equal(h.svgs.length, 1)
    assert.equal(h.built[0].triangles, 1); assert.equal(h.host.children.length, 1)
    assert.match(h.text(), /Simplified untextured preview/)
  } finally { h.close() }
})

test('unmount cancels source reads and prevents delayed results from building or updating state', async () => {
  const pending = deferred(), h = await harness({ mode: 'constructor-failure', source: () => pending.promise })
  h.close(); assert.equal(h.reads[0][1].aborted, true)
  pending.resolve(bytes()); await h.settle()
  assert.equal(h.built.length, 0); assert.equal(h.lateUpdates(), 0); assert.equal(h.host.children.length, 0)
})

test('late WebGL parses after URL replacement dispose every returned scene without stale UI', async () => {
  const pending = deferred(), old = await harness({ parse: () => pending.promise }), next = await harness({ url: 'blob:next-account-model', mode: 'constructor-failure' })
  const scene = new Three.Group(), otherScene = new Three.Group(), sharedGeometry = new Three.BoxGeometry(), sharedMaterial = new Three.MeshStandardMaterial()
  scene.add(new Three.Mesh(sharedGeometry, sharedMaterial)); otherScene.add(new Three.Mesh(sharedGeometry, sharedMaterial))
  let geometryDisposed = 0, materialDisposed = 0
  sharedGeometry.addEventListener('dispose', () => geometryDisposed++); sharedMaterial.addEventListener('dispose', () => materialDisposed++)
  assert.notEqual(old.keyFor('blob:approved-model'), old.keyFor('blob:next-account-model'))
  old.close(); pending.resolve({ scene, scenes: [scene, otherScene] }); await old.settle()
  assert.equal(geometryDisposed, 1); assert.equal(materialDisposed, 1); assert.equal(old.lateUpdates(), 0)
  assert.equal(old.host.children.length, 0); assert.equal(next.host.children.length, 1); assert.match(next.text(), /Simplified untextured preview/)
  next.close()
})

test('rejected source leaves view controls disabled and original-file guidance visible', async () => {
  const h = await harness({ mode: 'constructor-failure', source: async () => new ArrayBuffer(32) })
  try { assert.equal(h.built.length, 0); assert.equal(h.button('Front').props.disabled, true); assert.match(h.text(), /Invalid GLB container.*original file is still available/) }
  finally { h.close() }
})


test('a WebGL render-loop failure stops GPU work and switches to the actual geometry fallback', async () => {
  const h = await harness({ mode: 'render-failure' })
  try {
    h.webgl[0].loop(); await h.settle(); h.renderFrames()
    assert.equal(h.webgl[0].loop, null); assert.equal(h.webgl[0].disposed, 1)
    assert.equal(h.built[0].triangles, 1); assert.equal(h.svgs[0].renders, 1)
    assert.match(h.text(), /Simplified untextured preview/)
  } finally { h.close() }
})

test('both fallback setup and projection failures keep a visible alert and disabled views', async () => {
  for (const mode of ['svg-setup-failure', 'svg-render-failure']) {
    const h = await harness({ mode })
    try {
      h.renderFrames(); await h.settle()
      const alert = nodes(h.tree()).find(node => node.props.role === 'alert')
      assert.match(content(alert), /original file is still available/)
      assert.equal(nodes(h.tree()).find(node => node.props.className === 'oracle-model-canvas').props.hidden, true)
      assert.equal(h.button('Front').props.disabled, true)
      assert.doesNotMatch(h.text(), /Drag to rotate|Choose a view/)
      assert.equal(h.frames.size, 0)
    } finally { h.close() }
  }
})


test('an invalid model stops an otherwise healthy WebGL loop while retaining the error guidance', async () => {
  const h = await harness({ source: async () => new ArrayBuffer(32) })
  try {
    assert.equal(h.webgl.length, 1); assert.equal(h.webgl[0].loop, null)
    assert.match(h.text(), /Invalid GLB container.*original file is still available/)
    assert.equal(h.button('Front').props.disabled, true)
  } finally { h.close() }
})
