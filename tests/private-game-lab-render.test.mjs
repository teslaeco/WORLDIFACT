import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import ts from 'typescript'
import * as tools from '../src/lib/editorTools.ts'
import * as world from '../src/lib/privateWorld.ts'
import * as crystal from '../src/lib/crystal18.ts'
import * as models from '../src/lib/modelCatalog.ts'
import * as scopedBlueprint from '../src/lib/scopedBlueprintClient.ts'
import * as blueprintRequest from '../src/lib/blueprintRequest.ts'
import * as gameLabLibrary from '../src/lib/gameLabLibrary.ts'
async function component(path, dependencies, extra = {}) {
  const url = new URL(path, import.meta.url), source = await readFile(url, 'utf8'), module = { exports: {} }, localRequire = createRequire(url)
  const code = ts.transpileModule(source, { fileName: url.pathname, compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText
  runInNewContext(code, { module, exports: module.exports, crypto: globalThis.crypto, ...extra, require(id) {
    if (id in dependencies) return dependencies[id]
    if (id.endsWith('.css')) return {}
    if (['react','react/jsx-runtime','react-router-dom'].includes(id)) return localRequire(id)
    throw new Error(`Unreviewed component dependency: ${id}`)
  } }, { filename: url.pathname, timeout: 1000 })
  return module.exports.default
}
test('real editor onboarding has named world, real 18-face jewel and no shared portal-map or automatic provider call', async () => {
  const Eighteen = await component('../src/components/EighteenCrystal.tsx', { '../lib/crystal18': crystal })
  let externalCalls = 0
  const forbidden = () => { externalCalls++; throw new Error('No external operation is permitted in this render test.') }
  const PrivateLab = await component('../src/pages/PrivateGameLab.tsx', {
    // A server render does not exercise WebGL. The actual renderer is validated separately by build/type checks.
    react: { ...React, lazy: () => () => React.createElement('div', { 'data-renderer-not-exercised': true }) },
    '../lib/account': { useAccount: () => ({ user: null, loading: false }) },
    '../lib/privateWorld': world,
    '../lib/editorTools': tools,
    '../components/WorldSelectionToolbar': { __esModule: true, default: () => React.createElement('section',null,'Transform controls') },
    '../components/WorldCharacterStudio': { __esModule: true, default: forbidden },
    '../components/WorldCodexPanel': { __esModule: true, default: forbidden },
    '../lib/privateWorldAssets': { listWorldAssets: forbidden, storeWorldAsset: forbidden },
    '../lib/studioArchive': { listStudioModels: forbidden, readStudioModel: forbidden },
    '../lib/gameLabLibrary': gameLabLibrary,
    '../components/EighteenCrystal': { __esModule: true, default: Eighteen },
    '../components/GenerationCostNotice': { __esModule: true, default: () => null },
    '../lib/modelCatalog': models,
    '../lib/scopedBlueprintClient': scopedBlueprint,
    '../lib/blueprintRequest': blueprintRequest,
  }, { fetch: forbidden })
  const html = renderToStaticMarkup(React.createElement(MemoryRouter, { initialEntries: ['/lab'] }, React.createElement(PrivateLab)))
  assert.match(html, /Create your world\./)
  assert.match(html, /Name your world\./)
  assert.match(html, /aria-modal="true"/)
  assert.match(html, /New game/)
  assert.match(html, /Import world JSON/)
  assert.match(html, /Delete world/)
  assert.match(html, /5-step guide/)
  assert.match(html, /Mountain/); assert.match(html, /Valley/)
  assert.match(html, /Sign in to create and save your own worlds/)
  assert.equal((html.match(/<polygon /g) || []).length, 36, 'two real 18-face jewels in header and welcome')
  assert.doesNotMatch(html, /Drive Mars landship|Terrace tower|Fan Queen|Create a world blueprint with GPT-6 Astra/)
  assert.equal(externalCalls, 0)
})
test('route integration removes only the shop drawer and no longer mounts the shared world in private editor routes', async () => {
  const [app, portal, page] = await Promise.all(['../src/App.tsx','../src/pages/PortalPage.tsx','../src/pages/PrivateGameLab.tsx'].map(path => readFile(new URL(path, import.meta.url), 'utf8')))
  assert.match(app, /path="\/lab" element=\{<PrivateGameLab \/>\}/)
  assert.match(app, /path="\/builder" element=\{<PrivateGameLab \/>\}/)
  assert.match(app, /createAvatarPreloadLifecycle/)
  const { createAvatarPreloadLifecycle } = await import('../src/lib/avatarPreloadLifecycle.ts')
  const reads = []; const preload = createAvatarPreloadLifecycle({ clear() {}, load: async choice => { reads.push(choice); return new ArrayBuffer(0) } })
  preload.observe({ loading: false, userId: 'test-account', pathname: '/lab' })
  preload.observe({ loading: false, userId: 'test-account', pathname: '/builder' })
  assert.deepEqual(reads, [], 'private editor routes must not preload shared-world characters')
  assert.match(portal, /if \(app.route === '\/shop'\) return <ShopPage \/>/)
  assert.match(portal, /<PortalAstraGenerator worldId=\{worldId\}/, 'other portal tools remain intact')
  assert.doesNotMatch(page, /import StartingWorld|loadAvatarBytes|fetch\(.+\/api\/avatar/)
})
