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
