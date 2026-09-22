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
import { loadShopComponent } from './shop-render-helper.mjs'

const files = {
  portal: new URL('../src/pages/PortalPage.tsx', import.meta.url),
  planets: new URL('../src/components/PlanetsWorld.tsx', import.meta.url),
}
async function renderPortal(path, user = null) {
  const Shop = await loadShopComponent()
  assert.equal(typeof Shop, 'function', 'The real checked-in Shop component must be loaded')
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
        if (id === '../lib/account') return { useAccount: () => ({ user }) }
        // The source is an ES module with a default export. Without this marker,
        // transpiled __importDefault wraps the adapter again and React sees an
        // object, not the actual component. This is a harness adapter, not a
        // replacement for the dedicated PortalAstraGenerator tests.
        if (id === './ShopPage') return { __esModule: true, default: Shop }
        if (id === '../components/PortalAstraGenerator') return { __esModule: true, default: ({ worldId }) => React.createElement('section', { 'data-testid': 'astra-portal', 'data-world': worldId }, 'Astra portal generator') }
        if (id === '../components/PlanetsWorld') return load('planets')
        if (id === './PlanetsDemo') return { __esModule: true, default: () => React.createElement('span', null, 'Mini test not exercised by this server render') }
        if (['react', 'react/jsx-runtime', 'react-router-dom'].includes(id)) return localRequire(id)
        throw new Error(`Unexpected portal dependency: ${id}`)
      },
    }, { filename: files[key].pathname, timeout: 1000 })
    cache.set(key, module.exports)
    return module.exports
  }
  return renderToStaticMarkup(React.createElement(MemoryRouter, { initialEntries: [path] }, React.createElement(load('portal').default)))
}

test('Chess visitors get a mobile-safe full-screen guest launch instead of a nested 3D iframe', async () => {
  const html = await renderPortal('/chess')
  assert.match(html, /href="\/apps\/chess\/guest\.html\?guest=1"/)
  assert.match(html, /CHESS CUBE 512 AI/)
  assert.match(html, /Launch Chess Cube 512 AI/)
  assert.match(html, /data-world="chess-cube-512-ai"/)
  assert.match(html, /Shop boards and pieces/)
  assert.match(html, /Open original/)
  assert.doesNotMatch(html, /<iframe[^>]+src="\/apps\/chess\//)
})

test('direct PortalPage Shop renders the real native generation form, Astra surface and WORLDIFACT return', async () => {
  const html = await renderPortal('/shop')
  assert.match(html, /data-world="enchanted-ai-shop"/)
  assert.match(html, /Back to WORLDIFAKT/)
  assert.match(html, /id="studio-prompt"/)
  assert.match(html, /Generate SLOW model/)
  assert.match(html, /target="_blank"/)
  assert.doesNotMatch(html, /<iframe|target="_(top|self|parent)"|3D result appears here|FORGE-projekt/)
})

test('native Planets entry renders all eight English stages and labels its separate external prototype', async () => {
  const html = await renderPortal('/planets')
  assert.match(html, /data-world="8-planets-in-8-days"/)
  assert.match(html, /Eight worlds\. Eight days\. One expedition\./)
  assert.match(html, /Mini test/)
  assert.match(html, /FULL CAMPAIGN PLANNED/)
  assert.match(html, /Original FORGE prototype/)
  for (const stage of campaign.PLANET_CAMPAIGN) assert.ok(html.includes(stage.name))
  assert.doesNotMatch(html, /<iframe|Świat|Otwórz|Wygeneruj|Powrót/)
})

test('ISS and Terra still embed their separate reviewed applications after the routing repair', async () => {
  const iss = await renderPortal('/iss')
  assert.match(iss, /data-world="terra-fix-iss"/)
  assert.match(iss, /<iframe[^>]+src="\/apps\/iss\/index\.html"/)
  const terra = await renderPortal('/terra')
  assert.match(terra, /<iframe[^>]+src="\/apps\/terra\/index\.html"/)
  assert.match(terra, /EARTH OBSERVATION/)
  assert.match(terra, /separate simulation/)
})


test('signed-in Chess players launch the shared-account build without guest override', async () => {
  const html = await renderPortal('/chess', { id: 'account', displayName: 'Explorer' })
  assert.match(html, /href="\/apps\/chess\/index\.html"/)
  assert.doesNotMatch(html, /href="\/apps\/chess\/guest\.html\?guest=1"/)
})
