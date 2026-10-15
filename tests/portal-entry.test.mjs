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
import * as chessEntry from '../src/lib/chessEntry.ts'
import { loadShopComponent } from './shop-render-helper.mjs'

const files = {
  portal: new URL('../src/pages/PortalPage.tsx', import.meta.url),
  planets: new URL('../src/components/PlanetsWorld.tsx', import.meta.url),
  chess: new URL('../src/pages/ChessPage.tsx', import.meta.url),
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
        if (id === '../lib/chessEntry') return chessEntry
        if (id === '../lib/account') return { useAccount: () => ({ user }) }
        // Load the real entry component rather than substituting a fake chess page.
        if (id === './ChessPage') return load('chess')
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

test('Chess visitors enter the real full-screen game without a second launcher or nested 3D iframe', async () => {
  const html = await renderPortal('/chess')
  assert.match(html, /role="status">Opening Cube Chess 512 AI/)
  assert.match(html, /aria-label="Cube Chess 512 AI"/)
  assert.doesNotMatch(html, /<iframe|<button|<a |Chess Cube preview|Launch Chess|Shop boards|Open original|data-world="chess-cube-512-ai"|astra-portal/)
  assert.equal(chessEntry.CHESS_ENTRY_PATH, '/apps/chess/index.html')
})

test('historical Shop portal keeps the real model form and its separate world-blueprint drawer', async () => {
  const html = await renderPortal('/shop')
  assert.match(html, /data-world="enchanted-ai-shop"/)
  assert.match(html, /<details class="portal-generator-drawer portal-page shop-world-disclosure">/, 'Secondary world tools start collapsed')
  assert.match(html, /<summary>Create a world blueprint with GPT-6 Astra<\/summary>/)
  assert.match(html, /3D model/)
  assert.match(html, /Back to WORLDIFACT/)
  assert.match(html, /id="studio-prompt"/)
  assert.match(html, /Generate Astra\/Blender model/)
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
  assert.match(html, /Solar System Scope/)
  assert.match(html, /CC BY 4.0/)
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

test('signed-in Chess players use the same account-capable entry without a guest override', async () => {
  const html = await renderPortal('/chess', { id: 'account', displayName: 'Explorer' })
  assert.match(html, /Opening Cube Chess 512 AI/)
  assert.doesNotMatch(html, /guest=1|guest\.html|<iframe|Launch Chess/)
  const destinations = []
  chessEntry.openChessEntry({ replace: path => destinations.push(path) })
  assert.deepEqual(destinations, ['/apps/chess/index.html'])
})
