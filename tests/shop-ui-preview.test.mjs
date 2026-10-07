import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createPreviewFetch, installPreviewGuards, PREVIEW_CSP, PREVIEW_LABEL, PREVIEW_WORKER_NAME, PREVIEW_BRANCH } from '../scripts/build-shop-ui-preview.mjs'

const fixture = createPreviewFetch()
test('static preview has a different Worker identity and no runtime, secrets or storage bindings', async () => {
  const config = JSON.parse(await readFile(new URL('../wrangler.shop-ui-preview.jsonc', import.meta.url), 'utf8'))
  assert.equal(config.name, PREVIEW_WORKER_NAME)
  assert.notEqual(config.name, 'worldifact')
  assert.deepEqual(Object.keys(config).sort(), ['$schema', 'assets', 'compatibility_date', 'name', 'preview_urls', 'workers_dev'])
  assert.deepEqual(config.assets, { directory: './.review/shop-ui-preview', not_found_handling: 'single-page-application' })
  assert.equal(config.preview_urls, false)
})
test('preview only returns explicitly synthetic GETs with an empty account library', async () => {
  const session = await (await fixture('/api/account/session')).json()
  assert.equal(session.previewFixture, true)
  assert.equal(session.user.id, 'ui-preview-only')
  assert.match(session.user.email, /\.invalid$/)
  const library = await (await fixture('/api/studio/library')).json()
  assert.deepEqual(library.models, [])
  assert.equal(library.nextCursor, null)
  assert.equal((await (await fixture('/api/studio/current')).json()).current, null)
  for (const path of ['/api/studio/jobs/00000000-0000-0000-0000-000000000000/model', '/api/images/generate', '/api/blueprint/requests/anything']) assert.equal((await fixture(path)).status, 404)
})
test('all preview writes and every external destination fail without native fetch', async () => {
  const original = globalThis.fetch
  globalThis.fetch = () => { throw new Error('A fixture must never contact the network') }
  try {
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']) {
      for (const path of ['/api/studio/prepare', '/api/studio/jobs', '/api/blueprint', '/api/images/generate', '/api/billing/checkout', '/api/account/login']) assert.equal((await fixture(path, { method })).status, 405)
    }
    for (const target of ['https://worldifact.example/api/health', 'https://api.openai.com/v1/images/generations', '//worldifact.example/api/health']) assert.equal((await fixture(target)).status, 405)
    assert.equal((await fixture(new Request('https://ui-preview.invalid/api/account/session', { method: 'POST' }))).status, 405)
  } finally { globalThis.fetch = original }
})
test('preview guards prevent forms, account navigation and reference-file selection before React handles them', () => {
  const listeners = new Map(), notice = { textContent: '' }, upload = { disabled: false }
  let onMutation
  const scope = { document: { getElementById: () => notice, addEventListener: (name, callback, capture) => { assert.equal(capture, true); listeners.set(name, callback) }, querySelectorAll: () => [upload], documentElement: {} }, MutationObserver: class { constructor(callback) { onMutation = callback } observe() {} } }
  installPreviewGuards(scope, fixture)
  assert.equal(scope.fetch, fixture)
  assert.equal(Object.getOwnPropertyDescriptor(scope, 'fetch').writable, false)
  assert.equal(upload.disabled, true)
  upload.disabled = false; onMutation(); assert.equal(upload.disabled, true)
  let prevented = 0, stopped = 0
  listeners.get('submit')({ preventDefault() { prevented++ }, stopImmediatePropagation() { stopped++ } })
  listeners.get('click')({ target: { closest: () => ({}) }, preventDefault() { prevented++ }, stopImmediatePropagation() { stopped++ } })
  assert.equal(prevented, 2); assert.equal(stopped, 2)
  assert.match(notice.textContent, /No request was sent/)
})
test('public preview disclosure and CSP prohibit connections, forms, frames and service workers', () => {
  assert.match(PREVIEW_LABEL, /sample account and balance/)
  assert.match(PREVIEW_LABEL, /no generation or payments/)
  for (const restriction of ["connect-src 'none'", "form-action 'none'", "frame-src 'none'", "worker-src 'none'", "base-uri 'none'"]) assert.ok(PREVIEW_CSP.includes(restriction))
})
test('dedicated branch workflow reuses protected deployment access without app credentials or production config', async () => {
  const workflow = await readFile(new URL('../.github/workflows/shop-ui-preview.yml', import.meta.url), 'utf8')
  assert.ok(workflow.includes(`branches: ['${PREVIEW_BRANCH}']`))
  assert.match(workflow, /environment: production/)
  assert.match(workflow, /contents: read/)
  const references = [...workflow.matchAll(/secrets\.([A-Z_]+)/g)].map(match => match[1])
  assert.deepEqual(references.sort(), ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN'])
  assert.doesNotMatch(workflow, /wrangler deploy --config wrangler\.jsonc|versions upload|secret (put|bulk)|permissions:[\s\S]*contents: write/)
  assert.match(workflow, /Refusing non-static or production configuration/)
  assert.match(workflow, /response.status!==200/)
  assert.match(workflow, /expectedVersion="a9a6f643-e13b-44b3-9f89-37cf77387a12"/)
  assert.match(workflow, /refusing overwrite/)
  assert.match(workflow, /current\[0\].version_id!==expectedVersion/)
  assert.match(workflow, /response.body\?\.cancel\(\)/, 'Failed preflights discard bytes without disclosing private response details')
})
test('preview builder uses actual Shop source without copying private models or environmental values', async () => {
  const source = await readFile(new URL('../scripts/build-shop-ui-preview.mjs', import.meta.url), 'utf8')
  assert.match(source, /src\/pages\/ShopPage\.tsx/)
  assert.match(source, /publicDir: false, envDir: false, envPrefix: \[\]/)
  assert.match(source, /sourcemap: false/)
  assert.match(source, /history.replaceState\(null, '', '\/shop'\)/)
  assert.doesNotMatch(source, /process\.env|OPENAI_API_KEY|source-models|readFile\([^\n]*\.env/)
})


test('synthetic preview GETs satisfy the actual account, quote and library contracts without fake artifacts', async () => {
  const { fetchAccountBalance } = await import('../src/lib/accountBalance.ts')
  const { quoteGeneration } = await import('../src/lib/generationQuote.ts')
  const { checkStudio } = await import('../src/lib/studioClient.ts')
  const { detailedUnavailable } = await import('../src/lib/detailedStudio.ts')
  const { listStudioLibrary } = await import('../src/lib/studioLibrary.ts')
  const balance = await fetchAccountBalance(new AbortController().signal, fixture)
  assert.equal(balance.credits, 1000)
  const account = await (await fixture('/api/account/entitlements')).json()
  assert.equal(quoteGeneration('astra', account, {}, true, true).state, 'credits')
  assert.equal(detailedUnavailable(await checkStudio(fixture), 0), null)
  const library = await listStudioLibrary('ui-preview-only', null, new AbortController().signal, fixture)
  assert.deepEqual(library.models, [])
})
