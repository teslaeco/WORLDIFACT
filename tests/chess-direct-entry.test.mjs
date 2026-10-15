import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import * as entry from '../src/lib/chessEntry.ts'

test('direct chess navigation replaces only the disposable route with the fixed same-origin welcome', () => {
  const destinations = []
  entry.openChessEntry({ replace: path => destinations.push(path) })
  assert.deepEqual(destinations, ['/apps/chess/index.html'])
  assert.equal(entry.CHESS_ENTRY_PATH.includes('guest='), false, 'an existing account is never forced into guest mode')
})

test('the actual ChessPage enters once even when React replays its mount effect', async () => {
  const url = new URL('../src/pages/ChessPage.tsx', import.meta.url)
  const source = await readFile(url, 'utf8')
  const localRequire = createRequire(url), effects = [], destinations = []
  const code = ts.transpileModule(source, {
    fileName: url.pathname,
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const module = { exports: {} }
  runInNewContext(code, {
    module, exports: module.exports,
    window: { location: { replace: path => destinations.push(path) } },
    require(id) {
      if (id === 'react') return { useRef: value => ({ current: value }), useEffect: callback => effects.push(callback) }
      if (id === 'react/jsx-runtime') return localRequire(id)
      if (id === '../lib/chessEntry') return entry
      throw new Error('Unexpected chess entry dependency: ' + id)
    },
  }, { filename: url.pathname, timeout: 1000 })
  module.exports.default()
  assert.equal(effects.length, 1)
  effects[0](); effects[0]()
  assert.deepEqual(destinations, ['/apps/chess/index.html'])
  assert.doesNotMatch(source, /<iframe|window\.open|guest=1|location\.reload/)
})
