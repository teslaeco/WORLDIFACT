import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, stat, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { auditRuntime, EXPECTED_VERSION, runAudit } from '../scripts/audit-promotion-runtime.mjs'
import { preparePrivateBatch, writePrivateBatch } from '../scripts/prepare-private-promotion-batch.mjs'

const env = { CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32), CLOUDFLARE_API_TOKEN: 'synthetic-token-for-test-only',
  GITHUB_REPOSITORY: 'teslaeco/WORLDIFACT', GITHUB_EVENT_NAME: 'push',
  GITHUB_REF: 'refs/heads/ops/promo-readiness-20261010', GITHUB_RUN_ATTEMPT: '1' }
const deployment = () => ({ deployments: [{ id: '00000000-0000-4000-8000-000000000001',
  created_on: '2026-10-10T16:57:00Z', strategy: 'percentage', versions: [{ version_id: EXPECTED_VERSION, percentage: 100 }] }] })
const version = () => ({ id: EXPECTED_VERSION, resources: { bindings: [
  { name: 'OPENAI_API_KEY', type: 'secret_text', text: 'PRIVATE-TEST-CREDENTIAL' },
  { name: 'WORLDIFACT_PROMOTION_DEFINITIONS', type: 'plain_text', text: 'PRIVATE-ACCOUNT-CODE-DEFINITIONS' },
  { name: 'WORLDIFACT_PROMOTIONS_ENABLED', type: 'plain_text', text: 'true' },
  { name: 'UNRELATED_PRIVATE_SETTING', type: 'plain_text', text: 'PRIVATE-UNRELATED' },
] } })
const response = data => Response.json({ success: true, result: data })
function fixture({ mutateDeployment = x => x, mutateVersion = x => x } = {}) {
  const calls = []
  return { calls, fetcher: async (url, options) => {
    calls.push({ url, options })
    return response(url.endsWith('/deployments') ? mutateDeployment(deployment(), calls.length) : mutateVersion(version()))
  } }
}

test('audit makes only fixed GETs, pins exclusive traffic and suppresses all binding values', async () => {
  const f = fixture(); const result = await auditRuntime({ env, fetcher: f.fetcher })
  assert.equal(f.calls.length, 3)
  assert.deepEqual(f.calls.map(c => new URL(c.url).pathname.split('/').slice(-2).join('/')), [
    'worldifact/deployments', `versions/${EXPECTED_VERSION}`, 'worldifact/deployments'])
  for (const { url, options } of f.calls) {
    assert.equal(new URL(url).origin, 'https://api.cloudflare.com')
    assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'error')
    assert.equal(options.credentials, 'omit'); assert.equal(options.body, undefined)
    assert.equal(options.headers.Authorization, `Bearer ${env.CLOUDFLARE_API_TOKEN}`)
  }
  assert.equal(result.promotionsFlag, 'enabled'); assert.equal(result.adminFlag, 'absent')
  assert.equal(result.bindingPresence.WORLDIFACT_PROMOTION_DEFINITIONS, true)
  assert.equal(result.accountRedemptionVerified, false)
  const safe = JSON.stringify(result)
  for (const secret of ['PRIVATE-', env.CLOUDFLARE_ACCOUNT_ID, env.CLOUDFLARE_API_TOKEN, 'UNRELATED_PRIVATE_SETTING']) assert.ok(!safe.includes(secret))
})

for (const [label, mutate] of [
  ['split traffic', d => { d.deployments[0].versions[0].percentage = 50; return d }],
  ['different version', d => { d.deployments[0].versions[0].version_id = '00000000-0000-4000-8000-000000000002'; return d }],
  ['unordered deployments', d => { d.deployments.push({ ...d.deployments[0], created_on: '2026-10-11T00:00:00Z' }); return d }],
  ['concurrent deployment', (d, n) => { if (n === 3) d.deployments[0].id = '00000000-0000-4000-8000-000000000003'; return d }],
]) test(`audit rejects ${label}`, async () => {
  await assert.rejects(auditRuntime({ env, fetcher: fixture({ mutateDeployment: mutate }).fetcher }), /RUNTIME_AUDIT_BLOCKED/)
})

test('duplicate bindings fail and secret flags are never claimed as enabled', async () => {
  await assert.rejects(auditRuntime({ env, fetcher: fixture({ mutateVersion: v => {
    v.resources.bindings.push(v.resources.bindings[0]); return v
  } }).fetcher }))
  const r = await auditRuntime({ env, fetcher: fixture({ mutateVersion: v => {
    v.resources.bindings[2].type = 'secret_text'; return v
  } }).fetcher })
  assert.equal(r.promotionsFlag, 'configured-value-not-inspected')
})

test('invalid credentials stop before network and redirects are not followed', async () => {
  let calls = 0
  await assert.rejects(auditRuntime({ env: { ...env, CLOUDFLARE_ACCOUNT_ID: '../outside' }, fetcher: () => { calls++; throw Error() } }))
  assert.equal(calls, 0)
  await assert.rejects(auditRuntime({ env, fetcher: async () => new Response('', { status: 302, headers: { Location: 'https://example.invalid' } }) }))
})

test('oversized response is cancelled; error bodies and transport errors never reach logs', async () => {
  let cancelled = false
  const stream = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(262145)) }, cancel() { cancelled = true } })
  await assert.rejects(auditRuntime({ env, fetcher: async () => new Response(stream, { headers: { 'Content-Type': 'application/json' } }) }))
  assert.equal(cancelled, true)
  const logs = []; const report = { log: x => logs.push(x), error: x => logs.push(x) }
  assert.equal(await runAudit({ env, report, fetcher: async () => { throw Error('PRIVATE-TRANSPORT-TOKEN') } }), false)
  assert.ok(!logs.join().includes('PRIVATE'))
})

test('audit refuses pull requests, other repositories, branches and reruns before network', async () => {
  for (const patch of [{ GITHUB_EVENT_NAME: 'pull_request' }, { GITHUB_REPOSITORY: 'someone/WORLDIFACT' },
    { GITHUB_REF: 'refs/heads/main' }, { GITHUB_RUN_ATTEMPT: '2' }]) {
    let calls = 0
    assert.equal(await runAudit({ env: { ...env, ...patch }, report: { error() {} }, fetcher: () => { calls++; throw Error() } }), false)
    assert.equal(calls, 0)
  }
})

const now = Date.now()
const original = () => ({ accountId: '11111111-1111-4111-8111-111111111111', startsAt: now,
  codes: Array.from({ length: 10 }, (_, i) => `SYNTHETIC_NOT_A_REAL_CODE_${i}`) })

test('offline preparation preserves the original ten codes as hashes, stable IDs and exact limits', () => {
  const input = original(); const compiled = preparePrivateBatch(input, now)
  const definitions = JSON.parse(compiled.WORLDIFACT_PROMOTION_DEFINITIONS)
  assert.equal(definitions.length, 10); assert.equal(new Set(definitions.map(x => x.sha256)).size, 10)
  assert.equal(new Set(definitions.map(x => x.id)).size, 10)
  for (const d of definitions) {
    assert.equal(d.accountId, input.accountId); assert.equal(d.points, 1000); assert.equal(d.maxRedemptions, 1)
    assert.equal(d.expiresAt - d.startsAt, 30 * 86400000); assert.equal(d.purpose, 'tester')
    assert.match(d.sha256, /^[a-f0-9]{64}$/); assert.match(d.id, /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/)
  }
  assert.deepEqual(preparePrivateBatch(input, now), compiled)
  const reordered = JSON.parse(preparePrivateBatch({ ...input, codes: [...input.codes].reverse() }, now).WORLDIFACT_PROMOTION_DEFINITIONS)
  assert.deepEqual(reordered, [...definitions].reverse())
  for (const code of input.codes) assert.ok(!JSON.stringify(compiled).includes(code))
})

test('offline preparation rejects replacements in count, duplicates, malformed identities and expiry', () => {
  const invalid = [
    { ...original(), codes: original().codes.slice(1) }, { ...original(), codes: [...original().codes, 'EXTRA_SYNTHETIC_CODE'] },
    { ...original(), codes: Array(10).fill('DUPLICATE_SYNTHETIC_CODE') },
    { ...original(), codes: [...original().codes.slice(1), 'invalid code with spaces'] },
    { ...original(), accountId: 'owner@example.invalid' }, { ...original(), accountId: [original().accountId] },
    { ...original(), points: 9999 },
    { ...original(), startsAt: now - 300001 }, { ...original(), startsAt: now + 86400001 },
  ]
  for (const input of invalid) assert.throws(() => preparePrivateBatch(input, now), /PRIVATE_BATCH_INVALID/)
})

test('private output is owner-readable only, refuses overwrite and refuses repository/symlink output', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'worldifact-private-test-'))
  try {
    const file = join(dir, 'batch.json')
    await writePrivateBatch(original(), file)
    assert.equal((await stat(file)).mode & 0o777, 0o600)
    const first = await readFile(file, 'utf8')
    await assert.rejects(writePrivateBatch(original(), file))
    assert.equal(await readFile(file, 'utf8'), first)
    await assert.rejects(writePrivateBatch(original(), new URL('../should-not-exist.json', import.meta.url).pathname))
    await symlink(new URL('..', import.meta.url).pathname, join(dir, 'repo'))
    await assert.rejects(writePrivateBatch(original(), join(dir, 'repo', 'should-not-exist.json')))
  } finally { await rm(dir, { recursive: true, force: true }) }
})
