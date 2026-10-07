import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import * as balances from '../src/lib/accountBalance.ts'

// Execute the actual status-bar render with inert account/route adapters. No
// network, browser, checkout, or point mutation occurs in this Node fixture.
async function render({ pathname = '/shop', search = '', signedIn = true, loading = false, balance = null, error = '' } = {}) {
  const url = new URL('../src/components/AccountStatusBar.tsx', import.meta.url)
  const source = (await readFile(url, 'utf8')).replace('function AccountStatusContent(', 'export function AccountStatusContent(')
  const localRequire = createRequire(url), module = { exports: {} }
  const state = [balance, error, 0]
  let cursor = 0
  const hooks = { ...React, useState: () => [state[cursor++], () => {}], useEffect() {} }
  const code = ts.transpileModule(source, { fileName: url.pathname, compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText
  runInNewContext(code, { URLSearchParams, module, exports: module.exports, require(id) {
    if (id === 'react') return hooks
    if (id === 'react/jsx-runtime') return localRequire(id)
    if (id === 'react-router-dom') return { useLocation: () => ({ pathname, search, hash: '' }), useNavigate: () => () => {}, Link: ({ to, children, ...props }) => React.createElement('a', { ...props, href: to }, children) }
    if (id === '../lib/account') return { useAccount: () => ({ user: signedIn ? { id: 'fixture' } : null, loading }) }
    if (id === '../lib/accountBalance') return balances
    if (id.endsWith('.css')) return {}
    throw new Error(`Unexpected dependency ${id}`)
  } }, { filename: url.pathname })
  return renderToStaticMarkup(module.exports.AccountStatusContent({ signedIn, loading }))
}

test('Shop omits duplicated global navigation but keeps held vs available points explicit', async () => {
  assert.equal(await render(), '')
  const html = await render({ balance: { credits: 1000, reservedCredits: 250, availableCredits: 750, fastRemaining: 2 } })
  assert.match(html, /250 points held/)
  assert.match(html, /750 available/)
  assert.match(html, /href="\/account\/generation-funding"/)
  assert.doesNotMatch(html, /account-status-brand|Free drafts/)
})
test('Shop keeps balance failures and read-only retry visible', async () => {
  const html = await render({ error: 'Your credits are temporarily unavailable. Tap Refresh.' })
  assert.match(html, /role="status"/)
  assert.match(html, /Your credits are temporarily unavailable/)
  assert.match(html, /aria-label="Refresh credit balance"/)
})
test('Shop keeps checkout-return and sign-in notices, while other routes keep full account bar', async () => {
  const welcome = await render({ search: '?billing=processing', signedIn: false })
  assert.match(welcome, /Welcome back from checkout/)
  assert.match(welcome, /Please do not pay again/)
  assert.match(welcome, /Sign in/)
  const elsewhere = await render({ pathname: '/world' })
  assert.match(elsewhere, /account-status-brand/)
  assert.match(elsewhere, /Credits/)
})
test('stale held balances are not shown during account loading or after sign-out', async () => {
  const balance = { credits: 1000, reservedCredits: 250, availableCredits: 750, fastRemaining: 2 }
  assert.equal(await render({ balance, loading: true }), '')
  assert.equal(await render({ balance, signedIn: false }), '')
})
