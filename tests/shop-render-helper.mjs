import * as studioPricing from '../src/lib/studioPricing.ts'
import * as studioTierSelection from '../src/lib/studioTierSelection.ts'
import * as detailedStudio from '../src/lib/detailedStudio.ts'
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
import * as generationAdmission from '../src/lib/generationAdmission.ts'
import * as client from '../src/lib/studioClient.ts'
import * as photos from '../src/lib/studioPhotos.ts'
import * as archive from '../src/lib/studioArchive.ts'
import * as view from '../src/lib/studioView.ts'
import * as draft from '../src/lib/studioDraft.ts'
import * as glb from '../src/lib/glb.ts'
import * as shopManufacturing from '../src/lib/shopManufacturing.ts'
import * as blueprint from '../src/lib/blueprint.ts'
import * as generationQuote from '../src/lib/generationQuote.ts'
import * as modelCatalog from '../src/lib/modelCatalog.ts'
import * as blueprintRequest from '../src/lib/blueprintRequest.ts'
import * as blueprintClient from '../src/lib/blueprintClient.ts'
import * as generationAccount from '../src/lib/generationAccount.ts'
import * as overnightClient from '../src/lib/overnightTestClient.ts'
import * as shopTestFunding from '../src/lib/shopTestFunding.ts'
import * as progressView from '../src/lib/generationProgressView.ts'

// Render the real progress markup; only decorative WebGL is replaced in Node.
export async function loadProgressOrb() {
  const url = new URL('../src/components/GenerationProgressOrb.tsx', import.meta.url)
  const source = await readFile(url, 'utf8'), module = { exports: {} }, localRequire = createRequire(url)
  const code = ts.transpileModule(source, { fileName: url.pathname, compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText
  runInNewContext(code, { module, exports: module.exports, require(id) {
    if (id === '../lib/generationProgressView') return progressView
    if (id === './GenerationSculpture') return { __esModule: true, default: () => React.createElement('img', { src: '/world-assets/polyhedron-led-poster.svg', alt: '', 'data-webgl-stub': true }) }
    if (id.endsWith('.css')) return {}
    if (['react', 'react/jsx-runtime'].includes(id)) return localRequire(id)
    throw new Error(`Unexpected progress dependency: ${id}`)
  } }, { filename: url.pathname, timeout: 1000 })
  return module.exports
}

async function loadQuoteHook(react, account, globals) {
  const url = new URL('../src/lib/useGenerationQuote.ts', import.meta.url)
  const source = await readFile(url, 'utf8'), module = { exports: {} }
  const code = ts.transpileModule(source, { fileName: url.pathname, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  runInNewContext(code, { ...globals, module, exports: module.exports, require(id) {
    if (id === 'react') return react
    if (id === './account') return account
    if (id === './generationAccount') return generationAccount
    if (id === './generationQuote') return generationQuote
    throw new Error(`Unexpected quote dependency: ${id}`)
  } }, { filename: url.pathname, timeout: 1000 })
  return module.exports
}
export async function loadCostNotice(quoteHook) {
  const url = new URL('../src/components/GenerationCostNotice.tsx', import.meta.url)
  const source = await readFile(url, 'utf8'), module = { exports: {} }, localRequire = createRequire(url)
  const code = ts.transpileModule(source, { fileName: url.pathname, compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText
  runInNewContext(code, { module, exports: module.exports, require(id) {
    if (id === '../lib/generationQuote') return generationQuote
    if (id === '../lib/studioPricing') return studioPricing
    if (id === '../lib/modelCatalog') return modelCatalog
    if (id === '../lib/useGenerationQuote') return quoteHook
    if (id === '../lib/account') return { useAccount: () => ({ user: null, loading: true }) }
    if (id.endsWith('.css')) return {}
    if (['react', 'react/jsx-runtime', 'react-router-dom'].includes(id)) return localRequire(id)
    throw new Error(`Unexpected cost notice dependency: ${id}`)
  } }, { filename: url.pathname, timeout: 1000 })
  return module.exports
}
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

// Compile actual checked-in components. Adapters isolate storage, timers and
// account reads for lifecycle tests; cost calculation and markup are real.
export async function loadShopComponent({ react = React, adapters = {}, globals = {} } = {}) {
  const url = new URL('../src/pages/ShopPage.tsx', import.meta.url)
  const source = await readFile(url, 'utf8'), module = { exports: {} }, localRequire = createRequire(url)
  const account = adapters['../lib/account'] || { useAccount: () => ({ user: null, loading: true }) }
  const quoteHook = await loadQuoteHook(react, account, globals)
  const shopOptions = await loadShopManufacturingOptions(react), costNotice = await loadCostNotice(quoteHook), progressOrb = await loadProgressOrb()
  const code = ts.transpileModule(source, { fileName: url.pathname, compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText
  runInNewContext(code, {
    crypto: globalThis.crypto, ...globals, module, exports: module.exports,
    require(id) {
      const modules = { '../lib/overnightTestClient': overnightClient, '../lib/shopTestFunding': shopTestFunding, '../lib/studioPricing': studioPricing, '../lib/studioTierSelection': studioTierSelection, '../lib/detailedStudio': detailedStudio, '../config/portals': portals, '../config/references': references,
        '../lib/studioProtocol': protocol, '../lib/generationAdmission': generationAdmission, '../lib/studioClient': client, '../lib/studioPhotos': photos, '../lib/studioArchive': archive,
        '../lib/studioView': view, '../lib/studioDraft': draft, '../lib/glb': glb, '../lib/shopManufacturing': shopManufacturing,
        '../lib/blueprint': blueprint, '../lib/modelCatalog': modelCatalog, '../lib/blueprintRequest': blueprintRequest, '../lib/blueprintClient': blueprintClient }
      if (id === '../lib/account') return account
      if (id === '../lib/useGenerationQuote') return quoteHook
      if (id in modules) return adapters[id] || modules[id]
      if (id === '../components/ShopManufacturingOptions') return shopOptions
      if (id === '../components/GenerationCostNotice') return costNotice
      if (id === '../components/GenerationProgressOrb') return progressOrb
      if (id === '../components/LiveSolPreview') return { __esModule: true, default: ({ prompt }) => React.createElement('span', { 'data-demo-prompt': prompt, 'data-demo-mode': 'live-fast' }, 'LIVE Sol blueprint-derived GLB') }
      if (id === '../components/OracleModelPreview') return { __esModule: true, default: () => React.createElement('span', null, 'WebGL renderer is not exercised by this server render') }
      if (id === '../components/DemoShopPreview') return { __esModule: true, default: ({ prompt, mode }) => React.createElement('span', { 'data-demo-prompt': prompt, 'data-demo-mode': mode || 'demo' }, mode === 'live-fast' ? 'LIVE Sol procedural 3D draft' : 'DEMO local 3D preview') }
      if (id === '../components/ProjectAttachmentPicker') return { __esModule: true, default: ({ scope }) => React.createElement('section', { 'data-project-attachments': scope }, 'LOCAL REFERENCE project files') }
      if (id === '../components/StudioGallery') return { __esModule: true, default: () => React.createElement('section', { 'data-studio-gallery': 'device-archive' }, 'Your model gallery') }
      if (id.endsWith('.css')) return {}
      if (id === 'react-router-dom' && adapters[id]) return { ...localRequire(id), ...adapters[id] }
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
