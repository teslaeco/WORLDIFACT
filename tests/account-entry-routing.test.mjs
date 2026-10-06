import test from 'node:test'
import assert from 'node:assert/strict'
import { Writable } from 'node:stream'
import { createElement } from 'react'
import { renderToPipeableStream } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'

function render(element) {
  return new Promise((resolve, reject) => {
    let html = ''
    const sink = new Writable({ write(chunk, _encoding, next) { html += chunk.toString(); next() } })
    sink.on('finish', () => resolve(html)); sink.on('error', reject)
    const stream = renderToPipeableStream(element, { onAllReady() { stream.pipe(sink) }, onError: reject })
  })
}

test('the public root opens login first and the explicit world route still opens the portals', async () => {
  const vite = await createServer({ server: { middlewareMode: true, watch: null, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' })
  try {
    const { default: App } = await vite.ssrLoadModule('/src/App.tsx')
    const { AccountProvider } = await vite.ssrLoadModule('/src/lib/account.tsx')
    const page = path => createElement(MemoryRouter, { initialEntries: [path] }, createElement(AccountProvider, null, createElement(App)))
    const entry = await render(page('/'))
    assert.match(entry, /WORLDIFAKT/)
    assert.match(entry, /Continue with Google/)
    assert.match(entry, /Email address/)
    assert.doesNotMatch(entry, /Riverlight meadow|Welcome to Cube Chess|Already play Chess/)
    assert.match(entry, /href="\/world"/)
    const world = await render(page('/world'))
    assert.match(world, /Riverlight meadow/)
    assert.match(world, /Five portals/)
  } finally { await vite.close() }
})

test('historical Game Lab routes and the saved private-world workspace both remain reachable without external requests', async () => {
  const vite = await createServer({ server: { middlewareMode: true, watch: null, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' })
  const originalFetch = globalThis.fetch
  let externalCalls = 0
  globalThis.fetch = async () => { externalCalls++; throw new Error('Routing must not submit or fetch a model during server rendering.') }
  try {
    const { default: App } = await vite.ssrLoadModule('/src/App.tsx')
    const { AccountProvider } = await vite.ssrLoadModule('/src/lib/account.tsx')
    const page = path => createElement(MemoryRouter, { initialEntries: [path] }, createElement(AccountProvider, null, createElement(App)))
    for (const path of ['/lab', '/builder']) {
      const lab = await render(page(path))
      assert.match(lab, /Ideas become playable worlds\./, `${path} opens the historical blueprint workbench`)
      assert.match(lab, /World scene/)
      assert.match(lab, /YOU ARE HERE/)
      assert.match(lab, /<option value="queen" selected="">Fan Queen/)
      assert.match(lab, /<option value="terraformer">TerraformingPlanet Heroine/, 'the later original character remains an explicit choice')
      assert.match(lab, /href="\/account\/worlds"[^>]*>My saved worlds/)
      assert.match(lab, /href="\/account\/models"/)
      assert.doesNotMatch(lab, /id="new-world-title"/, 'the private editor cannot replace the restored lab')
    }
    const saved = await render(page('/account/worlds'))
    assert.match(saved, /id="new-world-title"/)
    assert.match(saved, /Name your world\./)
    assert.match(saved, /aria-label="Open my saved world"/)
    assert.match(saved, /Import embedded GLB|Character|Build/, 'the full private editor remains available')
    assert.match(saved, /Save world/)
    assert.doesNotMatch(saved, /Choose player character|Terrace tower|Ideas become playable worlds\./, 'private worlds do not mount the shared-world renderer')
    const models = await render(page('/account/models?model=fixture-existing-model'))
    assert.match(models, /aria-label="Account navigation"/)
    assert.match(models, /Checking your account/)
    assert.match(models, /href="\/account\/credits"/)
    assert.match(models, /href="\/account\/worlds"[^>]*>My saved worlds/)
    assert.equal(externalCalls, 0, 'route rendering never starts generation or loads account/model bytes')
  } finally { globalThis.fetch = originalFetch; await vite.close() }
})
