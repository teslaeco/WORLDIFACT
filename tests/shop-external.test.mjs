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

// Server-side component tests, not browser/device or external generation proof.
// Compile the actual checked-in TSX without creating a browser or contacting Sites.
async function renderShop() {
  const source = await readFile(sourceUrl, 'utf8')
  const compiled = ts.transpileModule(source, {
    fileName: fileURLToPath(sourceUrl),
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const localRequire = createRequire(sourceUrl)
  const module = { exports: {} }
  runInNewContext(compiled, {
    module, exports: module.exports,
    require(id) {
      if (id === '../config/portals') return { PORTALS }
      if (id === '../config/references') return { REFERENCE_LINKS }
      if (id === './ShopPage.css') return {}
      if (['react', 'react/jsx-runtime', 'react-router-dom'].includes(id)) return localRequire(id)
      throw new Error(`Unreviewed Shop dependency: ${id}`)
    },
  }, { filename: fileURLToPath(sourceUrl), timeout: 1000 })
  return renderToStaticMarkup(React.createElement(MemoryRouter, { initialEntries: ['/shop'] },
    React.createElement(module.exports.default)))
}

test('Shop renders the exact original Studio and two real fallback links before its iframe', async () => {
  const html = await renderShop()
  const frame = html.match(/<iframe\b[^>]*>/g) || []
  assert.equal(frame.length, 1)
  assert.ok(frame[0].includes(`src="${expectedUrl}"`))
  assert.match(frame[0], /title="Froge MPC 2 Studio/)
  const links = [...html.matchAll(/<a\b[^>]*>/g)].map(match => match[0])
  const originals = links.filter(link => link.includes(`href="${expectedUrl}"`))
  assert.equal(originals.length, 2)
  assert.ok(originals.some(link => link.includes('target="_blank"') && link.includes('noopener noreferrer')))
  assert.ok(originals.some(link => link.includes('target="_self"')))
  for (const link of originals) assert.ok(html.indexOf(link) < html.indexOf('<iframe'))
  assert.match(html, /If the embedded studio is blank or asks you to sign in/)
})

test('Shop keeps all five routes accessible and makes the external ownership boundary explicit', async () => {
  const html = await renderShop()
  for (const portal of PORTALS) assert.ok(html.includes(`href="${portal.route}"`))
  assert.match(html, /EXTERNAL 3D GENERATOR/)
  assert.match(html, /owner-reported working/)
  assert.match(html, /MAKE\/manufacturing approval is separate/)
  assert.doesNotMatch(html, /forge-studio-public|FORGE-projekt|3D result appears here/)
})

test('Shop cannot start a native paid request, touch old jobs, or hide links behind a placeholder', async () => {
  const source = await readFile(sourceUrl, 'utf8')
  const css = await readFile(cssUrl, 'utf8')
  assert.doesNotMatch(source, /fetch\s*\(|\/api\/oracle|\/api\/blueprint|localStorage|sessionStorage|\.click\s*\(/)
  assert.doesNotMatch(source, /setTimeout|setInterval|onLoad=|onError=|window\.location|postMessage/)
  assert.doesNotMatch(source, /webgl-fallback|OracleModelPreview|P0GameLab/)
  assert.doesNotMatch(css, /position\s*:\s*(absolute|fixed)|inset\s*:/)
  assert.match(css, /\.froge-shop-frame\s*\{[^}]*position:\s*static/s)
  assert.match(css, /@media\s*\(max-width:\s*760px\)/)
  assert.match(css, /min-height:\s*44px/)
  const html = await renderShop()
  assert.doesNotMatch(html, /<form|<textarea|download=|disabled=/)
})
