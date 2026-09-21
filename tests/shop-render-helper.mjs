import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import * as portals from '../src/config/portals.ts'
import * as references from '../src/config/references.ts'
import * as protocol from '../src/lib/studioProtocol.ts'
import * as client from '../src/lib/studioClient.ts'
import * as photos from '../src/lib/studioPhotos.ts'
import * as archive from '../src/lib/studioArchive.ts'
import * as view from '../src/lib/studioView.ts'
import * as draft from '../src/lib/studioDraft.ts'
import * as promptBudget from '../src/lib/studioPromptBudget.ts'
import * as glb from '../src/lib/glb.ts'
import * as shopManufacturing from '../src/lib/shopManufacturing.ts'
import * as blueprint from '../src/lib/blueprint.ts'

async function loadShopManufacturingOptions(react) {
  const url = new URL('../src/components/ShopManufacturingOptions.tsx', import.meta.url)
  const source = await readFile(url, 'utf8')
  const module = { exports: {} }
  const localRequire = createRequire(url)
  const code = ts.transpileModule(source, {
    fileName: url.pathname,
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText
  runInNewContext(code, {
    module,
    exports: module.exports,
    require(id) {
      if (id === '../lib/shopManufacturing') return shopManufacturing
      if (id === 'react') return react
      if (id === 'react/jsx-runtime') return localRequire(id)
      throw new Error(`Unexpected ShopManufacturingOptions dependency: ${id}`)
    },
  }, { filename: url.pathname, timeout: 1000 })
  return module.exports
}

// Compile the actual checked-in component. Optional adapters isolate browser
// storage, timers and server responses for lifecycle tests; no UI stub is used.
export async function loadShopComponent({ react = React, adapters = {}, globals = {} } = {}) {
  const url = new URL('../src/pages/ShopPage.tsx', import.meta.url)
  const source = await readFile(url, 'utf8'), module = { exports: {} }, localRequire = createRequire(url)
  const shopOptions = await loadShopManufacturingOptions(react)
  const code = ts.transpileModule(source, { fileName: url.pathname, compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText
  runInNewContext(code, {
    ...globals, module, exports: module.exports,
    require(id) {
      const modules = { '../config/portals': portals, '../config/references': references,
        '../lib/studioProtocol': protocol, '../lib/studioClient': client, '../lib/studioPhotos': photos, '../lib/studioArchive': archive,
        '../lib/studioView': view, '../lib/studioDraft': draft, '../lib/studioPromptBudget': promptBudget,
        '../lib/glb': glb, '../lib/shopManufacturing': shopManufacturing, '../lib/blueprint': blueprint }
      if (id in modules) return adapters[id] || modules[id]
      if (id === '../components/ShopManufacturingOptions') return shopOptions
      if (id === '../components/OracleModelPreview') return { __esModule: true, default: () => React.createElement('span', null, 'WebGL renderer is not exercised by this server render') }
      if (id === '../components/DemoShopPreview') return { __esModule: true, default: ({ prompt, mode }) => React.createElement('span', { 'data-demo-prompt': prompt, 'data-demo-mode': mode || 'demo' }, mode === 'live-fast' ? 'LIVE Astra procedural 3D draft' : 'DEMO local 3D preview') }
      if (id === '../components/ProjectAttachmentPicker') return { __esModule: true, default: ({ scope }) => React.createElement('section', { 'data-project-attachments': scope }, 'LOCAL REFERENCE project files') }
      if (id.endsWith('.css')) return {}
      if (id === 'react') return react
      if (['react/jsx-runtime', 'react-router-dom'].includes(id)) return localRequire(id)
      throw new Error(`Unexpected Shop dependency: ${id}`)
    },
  }, { filename: url.pathname, timeout: 1000 })
  return module.exports.default
}
export async function renderShopMarkup() {
  const Shop = await loadShopComponent()
  return renderToStaticMarkup(React.createElement(MemoryRouter, { initialEntries: ['/shop'] }, React.createElement(Shop)))
}
