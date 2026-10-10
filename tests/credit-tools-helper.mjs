import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import * as generationQuote from '../src/lib/generationQuote.ts'

// Static React component rendering only, without a browser or external requests.
const url = new URL('../src/components/CreditToolsPanel.tsx', import.meta.url)
const localRequire = createRequire(url)
const source = await readFile(url, 'utf8')
const code = ts.transpileModule(source, { fileName: url.pathname, compilerOptions: {
  module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022,
} }).outputText
const module = { exports: {} }
runInNewContext(code, { module, exports: module.exports, require(id) {
  if (id === 'react/jsx-runtime') return localRequire(id)
  if (id === '../lib/generationQuote') return generationQuote
  if (id.endsWith('.css')) return {}
  throw new Error('Unexpected point-display dependency: ' + id)
} }, { filename: url.pathname, timeout: 1000 })
export const CreditToolsPanel = module.exports.default
