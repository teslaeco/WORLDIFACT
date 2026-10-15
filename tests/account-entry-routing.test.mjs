import test from 'node:test'
import assert from 'node:assert/strict'
import { Writable } from 'node:stream'
import { createElement } from 'react'
import { renderToPipeableStream } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from './route-test-server.mjs'

function render(element) {
  return new Promise((resolve, reject) => {
    let html = ''
    const sink = new Writable({ write(chunk, _encoding, next) { html += chunk.toString(); next() } })
    sink.on('finish', () => resolve(html)); sink.on('error', reject)
    const stream = renderToPipeableStream(element, { onAllReady() { stream.pipe(sink) }, onError: reject })
  })
}

test('the public root opens login first and the shared world exposes exactly one six-portal navigation', async () => {
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
    assert.equal(world.split('<nav class="neon-portals"').length - 1, 1, 'one accessible LED navigation, not two grids')
    assert.doesNotMatch(world, /class="portal-nav"|class="accessibility-panel"|product-hunt-panel|cards\.producthunt\.com|api\.producthunt\.com/)
    assert.match(world, /class="resource-marquee"/)
    assert.match(world, /Repair the ISS/)
    const navigation = world.split('<nav class="neon-portals"')[1]?.split('</nav>')[0]
    assert.ok(navigation, 'the shared world still exposes direct portal navigation')
    const routes = [...navigation.matchAll(/href="([^"]+)"/g)].map(match => match[1])
    assert.deepEqual(routes, ['/chess', '/iss', '/planets', '/shop', '/lab', '/account/worlds'], 'all six destinations appear exactly once, including My Worlds')
    assert.equal(entry.split('<nav class="neon-portals"').length - 1, 1, 'the account landing keeps one LED navigation too')
  } finally { await vite.close() }
})

test('the chess route enters the full-screen game without a launcher, generator or nested frame', async () => {
  const vite = await createServer({ server: { middlewareMode: true, watch: null, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' })
  try {
    const { default: App } = await vite.ssrLoadModule('/src/App.tsx')
    const { AccountProvider } = await vite.ssrLoadModule('/src/lib/account.tsx')
    const html = await render(createElement(MemoryRouter, { initialEntries: ['/chess'] }, createElement(AccountProvider, null, createElement(App))))
    assert.match(html, /role="status">Opening Cube Chess 512 AI/)
    assert.doesNotMatch(html, /<iframe|Chess Cube launcher|chess-instant-preview|Launch Chess|Open original public build|Create inside this world|portal-generator-drawer|Portal prompt/)
  } finally { await vite.close() }
})

test('Game Lab playtests, legacy scene builder and saved My World editor remain isolated without external requests', async () => {
  const vite = await createServer({ server: { middlewareMode: true, watch: null, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' })
  const originalFetch = globalThis.fetch
  let externalCalls = 0
  globalThis.fetch = async () => { externalCalls++; throw new Error('Routing must not submit or fetch a model during server rendering.') }
  try {
    const { default: App } = await vite.ssrLoadModule('/src/App.tsx')
    const { AccountProvider } = await vite.ssrLoadModule('/src/lib/account.tsx')
    const page = path => createElement(MemoryRouter, { initialEntries: [path] }, createElement(AccountProvider, null, createElement(App)))
    const lab = await render(page('/lab'))
    assert.match(lab, /AI GAME LAB · PLAYTEST/)
    assert.match(lab, /Build in My World\. Play here\./)
    assert.match(lab, /Your playtest viewport/)
    assert.match(lab, /CONTROLS AND RENDERING/)
    assert.match(lab, /Android \.apk · PLANNED/)
    assert.match(lab, /BLOCKED until that pipeline is tested/)
    assert.match(lab, /href="\/account\/worlds"/)
    assert.doesNotMatch(lab, /id="new-world-title"|Generate world blueprint/, 'Game Lab does not host the world editor or a paid generator')
    const legacyBuilder = await render(page('/builder'))
    assert.doesNotMatch(legacyBuilder, /Ideas become playable worlds\.|AI GAME LAB · PLAYTEST/)
    const workbench = await readFile(new URL('../src/pages/WorkbenchPage.tsx', import.meta.url), 'utf8')
    assert.match(workbench, /kind === 'builder'\) return <Navigate to="\/account\/worlds" replace \/>/, 'old builder deep-links redirect into My World')
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
