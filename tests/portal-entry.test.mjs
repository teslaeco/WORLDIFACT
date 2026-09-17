import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import * as portals from '../src/config/portals.ts'
import * as foundations from '../src/config/foundations.ts'
import * as references from '../src/config/references.ts'
import * as campaign from '../src/lib/planetCampaign.ts'

// Actual source components, server-rendered without a browser or external API.
const files = {
  portal: new URL('../src/pages/PortalPage.tsx', import.meta.url),
  shop: new URL('../src/pages/ShopPage.tsx', import.meta.url),
  planets: new URL('../src/components/PlanetsWorld.tsx', import.meta.url),
}
async function renderPortal(path) {
  const sources = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([key, url]) => [key, await readFile(url, 'utf8')])))
  const cache = new Map()
  function load(key) {
    if (cache.has(key)) return cache.get(key)
    const module = { exports: {} }, localRequire = createRequire(files[key])
    const code = ts.transpileModule(sources[key], {
      fileName: files[key].pathname,
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
    }).outputText
    runInNewContext(code, {
      module, exports: module.exports,
      require(id) {
        if (id.endsWith('.css')) return {}
        if (id === '../config/portals') return portals
        if (id === '../config/foundations') return foundations
        if (id === '../config/references') return references
        if (id === '../lib/planetCampaign') return campaign
        if (id === './ShopPage') return load('shop')
        if (id === '../components/PlanetsWorld') return load('planets')
        if (id === './PlanetsDemo') return { default: () => React.createElement('span', null, 'Mini test not exercised by this server render') }
        if (['react', 'react/jsx-runtime', 'react-router-dom'].includes(id)) return localRequire(id)
        throw new Error(`Unexpected portal dependency: ${id}`)
      },
    }, { filename: files[key].pathname, timeout: 1000 })
    cache.set(key, module.exports)
    return module.exports
  }
  return renderToStaticMarkup(React.createElement(MemoryRouter, { initialEntries: [path] }, React.createElement(load('portal').default)))
}

test('Chess visitors get the reviewed copied guest build rather than an unpinned redirect', async () => {
  const html = await renderPortal('/chess')
  assert.match(html, /<iframe[^>]+src="\/apps\/chess\/guest\.html"/)
  assert.match(html, /Shop boards and pieces/)
  assert.match(html, /Open original/)
  const source = await readFile(files.portal, 'utf8')
  assert.doesNotMatch(source, /window\.location|location\.replace|location\.assign|Opening the original Chess Cube website/)
})

test('even direct PortalPage Shop rendering opens only the original hosted Studio, never the failed iframe or retired form', async () => {
  const html = await renderPortal('/shop')
  const exact = references.REFERENCE_LINKS.modelGenerator
  assert.ok(html.includes(`href="${exact}"`))
  assert.match(html, /Open 3D generator/)
  assert.match(html, /embedded Studio has been removed/)
  assert.doesNotMatch(html, /<iframe|<textarea|3D result appears here|FORGE-projekt|Generate REAL 3D model/)
})

test('native Planets entry renders all eight English stages and labels its separate external prototype', async () => {
  const html = await renderPortal('/planets')
  assert.match(html, /Eight worlds\. Eight days\. One expedition\./)
  assert.match(html, /Mini test/)
  assert.match(html, /FULL CAMPAIGN PLANNED/)
  assert.match(html, /Original FORGE prototype/)
  for (const stage of campaign.PLANET_CAMPAIGN) assert.ok(html.includes(stage.name))
  assert.doesNotMatch(html, /<iframe|Świat|Otwórz|Wygeneruj|Powrót/)
})

test('ISS and Terra still embed their separate reviewed applications after the routing repair', async () => {
  assert.match(await renderPortal('/iss'), /<iframe[^>]+src="\/apps\/iss\/index\.html"/)
  const terra = await renderPortal('/terra')
  assert.match(terra, /<iframe[^>]+src="\/apps\/terra\/index\.html"/)
  assert.match(terra, /EARTH OBSERVATION/)
  assert.match(terra, /separate simulation/)
})
