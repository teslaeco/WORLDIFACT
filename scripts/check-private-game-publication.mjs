import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
const ORIGIN = 'https://worldifact.xodobrox.workers.dev'
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
async function bounded(response, max = 2_000_000) {
  const reader = response.body?.getReader()
  if (!reader) throw new Error('Missing public response')
  const chunks = []; let total = 0
  for (;;) { const item = await reader.read(); if (item.done) break; total += item.value.length; if (total > max) { await reader.cancel(); throw new Error('Public response exceeds verification bound') }; chunks.push(item.value) }
  return Buffer.concat(chunks)
}
export async function checkPrivateGamePublication(assets, fetcher = fetch) {
  assert.ok(assets.some(v => /^PrivateGameLab-.*\.js$/.test(v.name)), 'Missing editor bundle')
  assert.ok(assets.some(v => /^PrivateWorldCanvas-.*\.js$/.test(v.name)), 'Missing scene bundle')
  assert.ok(assets.some(v => /^PrivateGameLab-.*\.css$/.test(v.name)), 'Missing editor stylesheet')
  const evidence = []
  const get = (path, headers) => fetcher(ORIGIN + path, { method: 'GET', redirect: 'error', cache: 'no-store', headers, signal: AbortSignal.timeout(20000) })
  for (const { name, bytes } of assets) {
    assert.match(name, /^Private(?:GameLab|WorldCanvas)-[A-Za-z0-9_-]+\.(js|css)$/)
    const path = '/assets/' + name, response = await get(path)
    assert.equal(response.status, 200, path)
    const received = await bounded(response)
    assert.equal(digest(received), digest(bytes), 'Published editor file differs: ' + path)
    evidence.push({ path, sha256: digest(received), bytes: received.length })
  }
  for (const path of ['/lab', '/builder', '/shop']) {
    const response = await get(path); assert.equal(response.status, 200, path)
    assert.match(response.headers.get('content-type') || '', /text\/html/)
    assert.match((await bounded(response)).toString('utf8'), /<div id="root"/)
  }
  for (const [path, headers, expected] of [
    ['/api/worlds', {}, 401],
    ['/api/worlds', { Origin: 'https://untrusted.example' }, 403],
    ['/api/worlds?owner=11111111-1111-4111-8111-111111111111', {}, 400],
    ['/api/worlds/library', {}, 405],
  ]) {
    const response = await get(path, headers); assert.equal(response.status, expected, path)
    assert.match(response.headers.get('cache-control') || '', /no-store/)
    const data = JSON.parse((await bounded(response, 16384)).toString('utf8'))
    assert.equal(typeof data.error, 'string'); assert.equal(data.document, undefined); assert.equal(data.worlds, undefined)
    evidence.push({ path, status: response.status })
  }
  const billing = await get('/api/billing/status'); assert.equal(billing.status, 200)
  const data = JSON.parse((await bounded(billing, 65536)).toString('utf8'))
  assert.deepEqual(data.generationCosts, { luna: 15, sol: 50, astra: 250 })
  assert.ok(data.plans.creator.allowedModels.includes('astra'))
  assert.equal(data.plans.creator.amountCents, 2999)
  assert.equal(data.plans.creator.credits, 1500)
  return { status: 'PUBLICATION_VERIFIED', checks: evidence, publicPrices: data.generationCosts,
    creatorPriceCents: 2999, astraSalesReady: data.plans.pro.checkoutReady === true,
    modelRequests: 0, accountWrites: 0, customerCharges: 0, visualDeviceTest: 'NOT_PERFORMED' }
}
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const names = (await readdir('dist/assets')).filter(name => /^Private(?:GameLab|WorldCanvas)-.*\.(js|css)$/.test(name))
  const assets = await Promise.all(names.map(async name => ({ name, bytes: await readFile('dist/assets/' + name) })))
  console.log(JSON.stringify(await checkPrivateGamePublication(assets), null, 2))
}
