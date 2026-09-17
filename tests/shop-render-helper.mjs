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
import * as glb from '../src/lib/glb.ts'

export async function loadShopComponent() {
  const url = new URL('../src/pages/ShopPage.tsx', import.meta.url)
  const source = await readFile(url, 'utf8'), module = { exports: {} }, localRequire = createRequire(url)
  const code = ts.transpileModule(source, { fileName: url.pathname, compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText
  runInNewContext(code, {
    module, exports: module.exports,
    require(id) {
      const modules = { '../config/portals': portals, '../config/references': references,
        '../lib/studioProtocol': protocol, '../lib/studioClient': client, '../lib/studioPhotos': photos, '../lib/studioArchive': archive, '../lib/studioView': view, '../lib/glb': glb }
      if (id in modules) return modules[id]
      if (id === '../components/OracleModelPreview') return { __esModule: true, default: () => React.createElement('span', null, 'WebGL renderer is not exercised by this server render') }
      if (id.endsWith('.css')) return {}
      if (['react', 'react/jsx-runtime', 'react-router-dom'].includes(id)) return localRequire(id)
      throw new Error(`Unexpected Shop dependency: ${id}`)
    },
  }, { filename: url.pathname, timeout: 1000 })
  return module.exports.default
}
export async function renderShopMarkup() {
  const Shop = await loadShopComponent()
  return renderToStaticMarkup(React.createElement(MemoryRouter, { initialEntries: ['/shop'] }, React.createElement(Shop)))
}
