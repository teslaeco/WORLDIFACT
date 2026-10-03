import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { setImmediate as tick } from 'node:timers/promises'
import ts from 'typescript'
import React from 'react'

const idA = '11111111-1111-4111-8111-111111111111'
const idB = '22222222-2222-4222-8222-222222222222'
const endpoint = 'https://worldifact.example.com/mcp'
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
const text = node => node == null || typeof node === 'boolean' ? '' : Array.isArray(node) ? node.map(text).join('') : React.isValidElement(node) ? text(node.props.children) : String(node)
const nodes = tree => { const items = []; function walk(node) { if (Array.isArray(node)) node.forEach(walk); else if (React.isValidElement(node)) { items.push(node); walk(node.props.children) } } walk(tree); return items }
const details = id => ({ authorizationId: id, client: { id: 'openai-client', name: 'Fixture client' }, redirectUri: 'https://chatgpt.com/connector_platform/oauth/callback', scope: 'email profile' })
const status = configured => Response.json({ jsonrpc: '2.0', id: 'connection-status', result: { structuredContent: { mcp: 'RESPONDING', oauthConfigured: configured, oauthScopes: ['email', 'profile'], generationStarted: false } } })
const metadata = () => Response.json({ resource: endpoint, authorization_servers: ['https://auth.example.com/auth/v1'], scopes_supported: ['email', 'profile'] })

async function harness(file, request) {
  const url = new URL('../src/pages/' + file, import.meta.url), module = { exports: {} }, localRequire = createRequire(url)
  const slots = [], effects = [], layouts = [], requests = [], redirects = [], copied = []
  let cursor = 0, dirty = true, tree, closed = false
  let account = { loading: false, user: { id: 'owner-a', displayName: 'Owner A', email: 'fixture@example.com' } }, authorizationId = idA
  const hooks = { ...React,
    useState(initial) { const i = cursor++; if (!slots[i]) slots[i] = { value: typeof initial === 'function' ? initial() : initial }; return [slots[i].value, next => { slots[i].value = typeof next === 'function' ? next(slots[i].value) : next; dirty = true }] },
    useRef(initial) { const i = cursor++; if (!slots[i]) slots[i] = { value: { current: initial } }; return slots[i].value },
    useMemo(fn, deps) { const i = cursor++, old = slots[i]; if (!old || deps.some((v, j) => !Object.is(v, old.deps[j]))) slots[i] = { value: fn(), deps }; return slots[i].value },
    useEffect(fn, deps) { const i = cursor++, old = slots[i]; if (!old || deps.some((v, j) => !Object.is(v, old.deps[j]))) { const slot = { deps, cleanup: old?.cleanup }; slots[i] = slot; effects.push(() => { slot.cleanup?.(); slot.cleanup = fn() }) } },
    useLayoutEffect(fn, deps) { const i = cursor++, old = slots[i]; if (!old || deps.some((v, j) => !Object.is(v, old.deps[j]))) { const slot = { deps, cleanup: old?.cleanup }; slots[i] = slot; layouts.push(() => { slot.cleanup?.(); slot.cleanup = fn() }) } },
  }
  const io = async (path, input) => { requests.push({ path, input, owner: account.user?.id }); return request(path, input, account.user?.id) }
  const source = await readFile(url, 'utf8')
  const code = ts.transpileModule(source, { fileName: url.pathname, compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText
  runInNewContext(code, { module, exports: module.exports, URL, Error, AbortController, fetch: io,
    setTimeout: () => 1, clearTimeout: () => {},
    window: { location: { origin: 'https://worldifact.example.com', assign: url => redirects.push(url) } },
    navigator: { clipboard: { writeText: async value => { copied.push(value) } } },
    require(id) {
      if (id === 'react') return hooks
      if (id === 'react/jsx-runtime') return localRequire(id)
      if (id === 'react-router-dom') return { Link: 'a', useNavigate: () => path => redirects.push(path), useSearchParams: () => [new URLSearchParams({ authorization_id: authorizationId })] }
      if (id === '../lib/account') return { useAccount: () => account, accountRequest: io }
      if (id.endsWith('.css')) return {}
      throw new Error('Unexpected UI fixture dependency ' + id)
    },
  }, { filename: url.pathname, timeout: 1000 })
  const render = () => { cursor = 0; dirty = false; tree = module.exports.default(); while (layouts.length) layouts.shift()() }
  const settle = async () => { for (let i = 0; i < 16; i++) { if (dirty && !closed) render(); while (effects.length) effects.shift()(); await tick() } }
  await settle()
  return { requests, redirects, copied, exports: module.exports, settle,
    text: () => text(tree), buttons: () => nodes(tree).filter(node => node.type === 'button'),
    button: label => nodes(tree).find(node => node.type === 'button' && text(node).includes(label)),
    // Render without effects to exercise the interval before a new request starts.
    switch(nextOwner, nextId) { account = { loading: false, user: nextOwner ? { id: nextOwner, displayName: nextOwner } : null }; authorizationId = nextId; render() },
    close() { closed = true; for (const slot of slots) slot?.cleanup?.() },
  }
}

test('endpoint is offered only after same-origin public status and configured metadata are confirmed', async () => {
  const pending = deferred()
  const h = await harness('OpenAIIntegrationPage.tsx', path => path === '/mcp' ? status(true) : pending.promise)
  assert.equal(h.button('Copy MCP endpoint'), undefined)
  pending.resolve(metadata()); await h.settle()
  assert.match(h.text(), /Configured · connection unverified/)
  assert.match(h.text(), /Not tested here/)
  await h.button('Copy MCP endpoint').props.onClick(); await h.settle()
  assert.deepEqual(h.copied, [endpoint])
  assert.equal(h.requests.length, 2)
  assert.equal(h.requests[0].path, '/mcp')
  assert.equal(JSON.parse(h.requests[0].input.body).params.name, 'get_worldifact_status')
  for (const call of h.requests) assert.equal(call.input.credentials, 'omit')
  h.close()
})

test('unconfigured OAuth and HTML fallback keep the endpoint unavailable', async () => {
  for (const response of [status(false), new Response('<html>SPA fallback</html>', { headers: { 'Content-Type': 'text/html' } })]) {
    const h = await harness('OpenAIIntegrationPage.tsx', async () => response)
    assert.equal(h.button('Copy MCP endpoint'), undefined)
    assert.equal(h.requests.length, 1)
    assert.doesNotMatch(h.text(), /https:\/\/worldifact\.example\.com\/mcp/)
    h.close()
  }
})

test('changing account or authorization request immediately hides old consent and fences stale callbacks', async () => {
  const decision = deferred(), nextRead = deferred()
  const h = await harness('OAuthConsentPage.tsx', (path, input, owner) => input ? decision.promise : owner === 'owner-a' ? Promise.resolve(details(idA)) : nextRead.promise)
  const approve = h.button('Approve connection').props.onClick
  approve(); approve(); await h.settle()
  assert.equal(h.requests.filter(call => call.input).length, 1, 'Synchronous double clicks submit one decision')
  h.switch('owner-b', idB)
  assert.equal(h.button('Approve connection'), undefined, 'Old details disappear in render before new effects run')
  approve(); await h.settle()
  assert.equal(h.requests.filter(call => call.input).length, 1, 'A retained old handler cannot approve after account/request change')
  decision.resolve({ redirectUrl: 'https://chatgpt.com/old-flow' }); await h.settle()
  assert.deepEqual(h.redirects, [])
  nextRead.reject(new Error('New request unavailable')); await h.settle()
  assert.equal(h.button('Approve connection'), undefined)
  assert.match(h.text(), /New request unavailable/)
  h.close()
})

test('a prior request does not return when navigating away and back, or after unmount', async () => {
  const oldRead = deferred(), newRead = deferred()
  let reads = 0
  const h = await harness('OAuthConsentPage.tsx', () => ++reads === 1 ? oldRead.promise : newRead.promise)
  h.switch('owner-b', idB); await h.settle()
  h.switch('owner-a', idA); await h.settle()
  oldRead.resolve({ redirectUrl: 'https://chatgpt.com/stale-read' }); await h.settle()
  assert.deepEqual(h.redirects, [])
  h.close(); newRead.resolve({ redirectUrl: 'https://chatgpt.com/after-unmount' }); await h.settle()
  assert.deepEqual(h.redirects, [])
})

test('a decision that finishes after unmount never redirects', async () => {
  const pending = deferred()
  const h = await harness('OAuthConsentPage.tsx', (path, input) => input ? pending.promise : Promise.resolve(details(idA)))
  h.button('Approve connection').props.onClick(); h.close()
  pending.resolve({ redirectUrl: 'https://chatgpt.com/late-decision' }); await h.settle()
  assert.deepEqual(h.redirects, [])
})
