import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkPrivateGamePublication } from '../scripts/check-private-game-publication.mjs'
const assets = ['PrivateGameLab-fixture.js', 'PrivateWorldCanvas-fixture.js', 'PrivateGameLab-fixture.css'].map(name => ({ name, bytes: Buffer.from('fixture:' + name) }))
function transport(corrupt = false, brokenAccess = false) {
  const calls = []
  return { calls, fetch: async (url, init) => {
    const path = new URL(url).pathname; calls.push({ url, ...init })
    assert.equal(init.method, 'GET'); assert.equal(init.redirect, 'error')
    if (path.startsWith('/assets/')) return new Response(corrupt ? 'wrong' : assets.find(a => '/assets/' + a.name === path).bytes)
    if (['/lab', '/builder', '/shop'].includes(path)) return new Response('<html><div id="root"></div></html>', { headers: { 'Content-Type': 'text/html' } })
    if (path === '/api/billing/status') return Response.json({ generationCosts: { luna: 15, sol: 50, astra: 250 }, plans: { creator: { amountCents: 2999, credits: 1500, allowedModels: ['sol', 'luna', 'astra'] }, pro: { checkoutReady: false } } })
    const status = brokenAccess ? 200 : path.endsWith('/library') ? 405 : new URL(url).search ? 400 : init.headers?.Origin ? 403 : 401
    return Response.json({ error: 'Fixture denied' }, { status, headers: { 'Cache-Control': 'private, no-store' } })
  } }
}
test('publication check only reads fixed public routes and validates unchanged prices plus auth protections', async () => {
  const t = transport(), result = await checkPrivateGamePublication(assets, t.fetch)
  assert.equal(result.status, 'PUBLICATION_VERIFIED'); assert.equal(result.astraSalesReady, false)
  assert.equal(result.modelRequests, 0); assert.equal(result.accountWrites, 0)
  assert.ok(t.calls.every(c => c.method === 'GET' && c.body === undefined && !new Headers(c.headers).has('Cookie')))
})
test('publication check fails on mismatched bundles or a public private-world endpoint', async () => {
  await assert.rejects(checkPrivateGamePublication(assets, transport(true).fetch))
  await assert.rejects(checkPrivateGamePublication(assets, transport(false, true).fetch))
})
