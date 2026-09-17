import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { PORTALS } from '../src/config/portals.ts'
import { REFERENCE_LINKS } from '../src/config/references.ts'

const sourceUrl = new URL('../src/pages/ShopPage.tsx', import.meta.url)
const cssUrl = new URL('../src/pages/ShopPage.css', import.meta.url)
const expectedUrl = 'https://froge-mpc-2-studio.terraformingplanet.chatgpt.site/'

// Render the real checked-in component. Capture its effect explicitly when a
// test window is supplied; this is not browser/session or generation evidence.
async function renderShop(browser) {
  const source = await readFile(sourceUrl, 'utf8')
  const compiled = ts.transpileModule(source, {
    fileName: fileURLToPath(sourceUrl),
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const localRequire = createRequire(sourceUrl)
  const module = { exports: {} }
  const effects = []
  runInNewContext(compiled, {
    module, exports: module.exports, ...(browser ? { window: browser } : {}),
    require(id) {
      if (id === '../config/portals') return { PORTALS }
      if (id === '../config/references') return { REFERENCE_LINKS }
      if (id === './ShopPage.css') return {}
      if (id === 'react' && browser) return { ...React, useEffect: effect => effects.push(effect) }
      if (['react', 'react/jsx-runtime', 'react-router-dom'].includes(id)) return localRequire(id)
      throw new Error(`Unreviewed Shop dependency: ${id}`)
    },
  }, { filename: fileURLToPath(sourceUrl), timeout: 1000 })
  const html = renderToStaticMarkup(React.createElement(MemoryRouter, { initialEntries: ['/shop'] },
    React.createElement(module.exports.default)))
  return { html, effects }
}

function testWindow(replace) {
  const browser = { location: { replace } }
  browser.self = browser
  browser.top = browser
  return browser
}

test('Shop removes the embedded generator and renders exact top-level and new-tab links', async () => {
  const { html } = await renderShop()
  assert.doesNotMatch(html, /<iframe|<object|<embed/)
  const links = [...html.matchAll(/<a\b[^>]*>/g)].map(match => match[0])
  const originals = links.filter(link => link.includes(`href="${expectedUrl}"`))
  assert.equal(originals.length, 2)
  assert.ok(originals.some(link => link.includes('target="_top"')))
  assert.ok(originals.some(link => link.includes('target="_blank"') && link.includes('noopener noreferrer')))
  assert.match(html, /Sign in to your existing Froge account/)
  assert.match(html, /embedded Studio has been removed/)
})

test('Shop launches only the exact original document once, without creating a Back redirect loop', async () => {
  const destinations = []
  const browser = testWindow(url => destinations.push(url))
  browser.location.search = '?next=https://example.invalid/&token=private'
  browser.location.hash = '#old-job'
  const { effects } = await renderShop(browser)
  assert.equal(effects.length, 1)
  effects[0]()
  effects[0]()
  assert.deepEqual(destinations, [expectedUrl])
})

test('embedded WORLDIFACT does not navigate an ancestor without an explicit user click', async () => {
  const destinations = []
  const browser = testWindow(url => destinations.push(url))
  browser.top = {}
  const { html, effects } = await renderShop(browser)
  effects.forEach(effect => effect())
  assert.deepEqual(destinations, [])
  assert.match(html, /target="_top"/)
  assert.match(html, /Open 3D generator/)
})

test('denied document navigation preserves manual links and is not retried on effect replay', async () => {
  let attempted = 0
  const { html, effects } = await renderShop(testWindow(() => {
    attempted++
    throw new Error('Navigation blocked by host')
  }))
  assert.doesNotThrow(() => { effects[0](); effects[0]() })
  assert.equal(attempted, 1)
  assert.ok(html.includes(`href="${expectedUrl}"`))
  assert.match(html, /Open in a new tab/)
})

test('Shop preserves five-world navigation and original-app ownership boundaries', async () => {
  const { html } = await renderShop()
  for (const portal of PORTALS) assert.ok(html.includes(`href="${portal.route}"`))
  assert.match(html, /External tool/)
  assert.match(html, /MAKE\/manufacturing approval is separate/)
  assert.doesNotMatch(html, /forge-studio-public|FORGE-projekt|3D result appears here/)
})

test('Shop cannot generate, read credentials/jobs, embed another form, or cover launch controls', async () => {
  const source = await readFile(sourceUrl, 'utf8')
  const css = await readFile(cssUrl, 'utf8')
  assert.doesNotMatch(source, /fetch\s*\(|\/api\/oracle|\/api\/blueprint|localStorage|sessionStorage|document\.cookie|\.click\s*\(/)
  assert.doesNotMatch(source, /setTimeout|setInterval|onLoad=|onError=|postMessage|window\.open/)
  assert.doesNotMatch(source, /webgl-fallback|OracleModelPreview|P0GameLab|<iframe/)
  assert.doesNotMatch(css, /position\s*:\s*(absolute|fixed)|inset\s*:|froge-shop-frame/)
  assert.match(css, /@media\s*\(max-width:\s*760px\)/)
  assert.match(css, /min-height:\s*44px/)
  const { html } = await renderShop()
  assert.doesNotMatch(html, /<form|<textarea|download=|disabled=/)
})
