import test from 'node:test'
import assert from 'node:assert/strict'
import { constants, createDecipheriv, generateKeyPairSync, privateDecrypt } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { JOB, BRANCH, BASE_SHA, EXPIRES_AT, collectReport, createReader, encryptReport, main } from '../scripts/model-readonly-once.mjs'

const env = { ORACLE_ENDPOINT: 'https://diagnostic-fixture.trycloudflare.com', ORACLE_API_TOKEN: 'x'.repeat(48) }
const now = new Date('2026-10-07T12:15:00Z')
const health = { ready: true, model: 'gpt-6-astra', provider: 'openai', astraBudgetMaxUsd: 1.75 }
const job = { id: JOB, prompt: 'Private test object', state: 'failed', modelStatus: 'none', worldifactFailureCode: 'MODEL_BUDGET_EXCEEDED' }
const quality = { revision: 6, state: 'failed', hasModel: false, agent: { finished: false }, agentUsage: { error_code: 'WORLDIFACT_ASTRA_COST_GUARD', cost_guard: { reason: 'INSUFFICIENT_RESERVATION', remaining_micro_usd: 410000 } } }
const json = value => Response.json(value)
function fixture({ status = job, report = quality, extraHealth = {}, model } = {}) {
  const requests = []
  const fetcher = async (url, options) => {
    requests.push({ url, options })
    const path = new URL(url).pathname
    if (path === '/v1/health') return json({ ...health, ...extraHealth })
    if (path === `/v1/jobs/${JOB}`) return json(status)
    if (path === `/v1/jobs/${JOB}/quality`) return json(report)
    if (path === `/v1/jobs/${JOB}/model` && model) return new Response(model, { headers: { 'content-type': 'model/gltf-binary' } })
    throw new Error('Unapproved endpoint')
  }
  return { fetcher, requests }
}
function minimalGlb() {
  const text = JSON.stringify({ asset: { version: '2.0' }, meshes: [], nodes: [] })
  const body = Buffer.from(text.padEnd(Math.ceil(text.length / 4) * 4))
  const data = Buffer.alloc(20 + body.length)
  data.writeUInt32LE(0x46546c67, 0); data.writeUInt32LE(2, 4); data.writeUInt32LE(data.length, 8)
  data.writeUInt32LE(body.length, 12); data.writeUInt32LE(0x4e4f534a, 16); body.copy(data, 20)
  return data
}

test('exact failed job diagnosis reads only health, status and quality; no budget, generation or settlement', async () => {
  const f = fixture(), report = await collectReport(env, { fetcher: f.fetcher, now })
  assert.equal(report.job.prompt, job.prompt)
  assert.equal(report.quality.agentUsage.cost_guard.remaining_micro_usd, 410000)
  assert.equal(report.generationRequested, false); assert.equal(report.settlementRequested, false); assert.equal(report.budgetEndpointRead, false)
  assert.equal(report.artifact, undefined)
  assert.deepEqual(f.requests.map(r => new URL(r.url).pathname), ['/v1/health', `/v1/jobs/${JOB}`, `/v1/jobs/${JOB}/quality`])
  for (const { options } of f.requests) {
    assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'manual'); assert.equal(options.body, undefined)
    assert.equal(options.headers.Authorization, `Bearer ${env.ORACLE_API_TOKEN}`)
  }
})

test('readable draft GLB remains explicitly unfinished and never implies visual quality', async () => {
  const f = fixture({ status: { ...job, state: 'succeeded', modelStatus: 'draft' }, report: { ...quality, state: 'succeeded', hasModel: true }, model: minimalGlb() })
  const r = await collectReport(env, { fetcher: f.fetcher, now })
  assert.equal(f.requests.length, 4); assert.equal(r.artifact.containerValid, true)
  assert.equal(r.artifact.completionProven, false); assert.equal(r.artifact.visualQualityVerified, false)
  assert.match(r.artifact.sha256, /^[a-f0-9]{64}$/)
})

test('failed private candidate is never requested even if hasModel is true', async () => {
  const f = fixture({ report: { ...quality, hasModel: true } })
  await collectReport(env, { fetcher: f.fetcher, now })
  assert.equal(f.requests.length, 3)
})

test('conflicting quality state is never used to request an artifact', async () => {
  const f = fixture({ status: { ...job, state: 'succeeded' }, report: { ...quality, hasModel: true } })
  await collectReport(env, { fetcher: f.fetcher, now }); assert.equal(f.requests.length, 3)
})

test('no status identity mismatch, missing fields or malformed quality can pass', async () => {
  for (const status of [{ ...job, id: '00000000-0000-0000-0000-000000000000' }, { ...job, state: 'other' }]) {
    const f = fixture({ status }); await assert.rejects(collectReport(env, { fetcher: f.fetcher, now })); assert.equal(f.requests.length, 2)
  }
  for (const report of [{ ...quality, revision: 7 }, { ...quality, hasModel: 'yes' }, { ...quality, state: 'unknown' }]) {
    const f = fixture({ report }); await assert.rejects(collectReport(env, { fetcher: f.fetcher, now })); assert.equal(f.requests.length, 3)
  }
})

test('non-allowlisted paths, additional jobs, repeated requests and budget seal are blocked before fetch', async () => {
  const f = fixture(), read = createReader(env, f.fetcher)
  for (const path of ['/v1/jobs', `/v1/jobs/${JOB}/budget`, `/v1/jobs/${JOB}/cancel`, `/v1/jobs/${JOB}/exports/prepare`, '/v1/jobs/00000000-0000-0000-0000-000000000000', `/v1/jobs/${JOB}?x=1`]) await assert.rejects(read(path))
  assert.equal(f.requests.length, 0)
  await read('/v1/health'); await assert.rejects(read('/v1/health')); assert.equal(f.requests.length, 1)
})

test('unapproved origin/credential configuration is refused before network activity', () => {
  for (const origin of ['http://diagnostic-fixture.trycloudflare.com', 'https://example.com', 'https://x.trycloudflare.com/path', 'https://u:p@x.trycloudflare.com', 'https://x.trycloudflare.com?token=x', 'https://x.trycloudflare.com:8443']) assert.throws(() => createReader({ ...env, ORACLE_ENDPOINT: origin }))
  for (const token of ['', 'short', 'x'.repeat(257), 'x'.repeat(40) + '\n']) assert.throws(() => createReader({ ...env, ORACLE_API_TOKEN: token }))
})

test('redirects are not followed, response body types and streaming bounds fail closed', async () => {
  for (const response of [new Response('', { status: 302, headers: { location: 'https://unrelated.example/' } }), new Response('hello', { headers: { 'content-type': 'text/html' } }), new Response('{}', { headers: { 'content-type': 'application/json', 'content-length': '9999999' } }), json({ padded: 'x'.repeat(20_000) }), json([])]) {
    let reads = 0
    const read = createReader(env, async () => { reads++; return response })
    await assert.rejects(read('/v1/health')); assert.equal(reads, 1)
  }
})

test('private credentials and arbitrary health fields never enter the report', async () => {
  const f = fixture({ extraHealth: { secret: 'SHOULD_NOT_SURVIVE' }, status: { ...job, detail: `bad ${env.ORACLE_API_TOKEN} sk-proj-PRIVATE https://secret.example/path`, arbitrary: 'SHOULD_NOT_SURVIVE' }, report: { ...quality, agentUsage: { api_key: 'SHOULD_NOT_SURVIVE', input_tokens: 1234, last_error: `Bearer abcdef ${env.ORACLE_ENDPOINT}` } } })
  const r = await collectReport(env, { fetcher: f.fetcher, now }), raw = JSON.stringify(r)
  assert.doesNotMatch(raw, /SHOULD_NOT_SURVIVE|sk-proj-PRIVATE|abcdef|secret\.example|diagnostic-fixture|x{48}/)
  assert.equal(r.quality.agentUsage.input_tokens, 1234)
})

test('missing status also redacts health values and authorization denial stops all further reads', async () => {
  const fetcher = async url => new URL(url).pathname === '/v1/health' ? json({ ...health, model: env.ORACLE_API_TOKEN }) : new Response('', { status: 404 })
  assert.doesNotMatch(JSON.stringify(await collectReport(env, { fetcher, now })), /x{48}/)
  for (const status of [401, 403]) {
    let reads = 0
    await assert.rejects(collectReport(env, { now, fetcher: async () => { reads++; return new Response('', { status }) } }))
    assert.equal(reads, 1)
  }
})

test('private report round trips only with recipient private key; ciphertext exposes no prompt', () => {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 3072 })
  const plain = { privatePrompt: 'UNIQUE_PRIVATE_PROMPT', state: 'failed' }
  const encrypted = encryptReport(plain, publicKey.export({ type: 'spki', format: 'pem' }))
  assert.doesNotMatch(JSON.stringify(encrypted), /UNIQUE_PRIVATE_PROMPT|failed/)
  const key = privateDecrypt({ key: privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, Buffer.from(encrypted.wrappedKey, 'base64'))
  const cipher = createDecipheriv('aes-256-gcm', key, Buffer.from(encrypted.iv, 'base64'))
  cipher.setAAD(Buffer.from(encrypted.aad, 'base64')); cipher.setAuthTag(Buffer.from(encrypted.tag, 'base64'))
  assert.deepEqual(JSON.parse(Buffer.concat([cipher.update(Buffer.from(encrypted.ciphertext, 'base64')), cipher.final()])), plain)
})

test('wrong repo, event, branch, parent, retry or expiry fails before any read and suppresses details', async () => {
  const valid = { ...env, GITHUB_REPOSITORY: 'teslaeco/WORLDIFACT', GITHUB_REF: `refs/heads/${BRANCH}`, GITHUB_EVENT_NAME: 'push', GITHUB_RUN_ATTEMPT: '1', DIAGNOSTIC_BEFORE: BASE_SHA }
  for (const change of [{ GITHUB_REPOSITORY: 'other/repo' }, { GITHUB_REF: 'refs/heads/main' }, { GITHUB_EVENT_NAME: 'pull_request' }, { GITHUB_RUN_ATTEMPT: '2' }, { DIAGNOSTIC_BEFORE: '0'.repeat(40) }]) {
    let reads = 0; const logs = []
    assert.equal(await main({ ...valid, ...change }, { now, output: s => logs.push(s), fetcher: async () => { reads++; throw new Error(env.ORACLE_API_TOKEN) } }), 1)
    assert.equal(reads, 0); assert.deepEqual(logs, ['DIAGNOSTIC_FAILED_DETAILS_SUPPRESSED'])
  }
  let reads = 0
  assert.equal(await main(valid, { now: new Date(EXPIRES_AT), output: () => {}, fetcher: async () => { reads++ } }), 1); assert.equal(reads, 0)
})

test('workflow is branch-isolated, first-run-only, read-permission-only, ciphertext-only and never deploys', async () => {
  const yaml = await readFile(new URL('../.github/workflows/model-readonly-once.yml', import.meta.url), 'utf8')
  assert.match(yaml, /contents: read/); assert.match(yaml, /deployment: false/); assert.match(yaml, /github\.run_attempt == 1/)
  assert.ok(yaml.includes(BASE_SHA)); assert.ok(yaml.includes(BRANCH))
  assert.match(yaml, /retention-days: 1/); assert.match(yaml, /path: \.model-readonly-encrypted\/report\.enc\.json/)
  assert.doesNotMatch(yaml, /contents: write|git push|npm run deploy|wrangler|OPENAI_API_KEY/)
})

test('authorized runtime network errors cannot print credentials, endpoint or upstream details', async () => {
  const valid = { ...env, GITHUB_REPOSITORY: 'teslaeco/WORLDIFACT', GITHUB_REF: `refs/heads/${BRANCH}`, GITHUB_EVENT_NAME: 'push', GITHUB_RUN_ATTEMPT: '1', DIAGNOSTIC_BEFORE: BASE_SHA }
  let reads = 0; const logs = []
  const result = await main(valid, { now, output: s => logs.push(s), fetcher: async () => { reads++; throw new Error(`${env.ORACLE_API_TOKEN} ${env.ORACLE_ENDPOINT} PRIVATE_PROVIDER_TEXT`) } })
  assert.equal(result, 1); assert.equal(reads, 1)
  assert.deepEqual(logs, ['DIAGNOSTIC_FAILED_DETAILS_SUPPRESSED'])
})
