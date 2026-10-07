import { createCipheriv, createPublicKey, publicEncrypt, randomBytes, constants } from 'node:crypto'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inspectGlb } from './lib/glb-inspect.mjs'

// One exact failed request; this identifier alone does not authorize access.
// Publication and the one-time production read require the owner's approval.
export const JOB = '7b20b76f-d476-4a47-a98f-a48d27c3e3f0'
export const BRANCH = 'diagnostics/model-readonly-once-20261007'
export const BASE_SHA = '962309ab650fc7cfd93106544bb7d6dd52d0baf5'
export const EXPIRES_AT = '2026-10-08T00:00:00.000Z'
const AAD = Buffer.from('WORLDIFACT_MODEL_READONLY_V1')
const STATES = ['pending', 'queued', 'generating', 'retrying', 'building', 'succeeded', 'failed', 'cancelled']
const ALLOWED = new Map([
  ['/v1/health', 16_384],
  [`/v1/jobs/${JOB}`, 32_768],
  [`/v1/jobs/${JOB}/quality`, 524_288],
  [`/v1/jobs/${JOB}/model`, 12 * 1024 * 1024],
])
const object = value => !!value && typeof value === 'object' && !Array.isArray(value)
const fail = () => { throw new Error('DIAGNOSTIC_FAILED_DETAILS_SUPPRESSED') }

function configuredOrigin(value) {
  try {
    const url = new URL(value)
    if (url.protocol === 'https:' && /^[a-z0-9]+(?:-[a-z0-9]+)*\.trycloudflare\.com$/.test(url.hostname) &&
        !url.username && !url.password && !url.port && url.pathname === '/' && !url.search && !url.hash) return url.origin
  } catch { /* Fail closed. */ }
  return fail()
}

async function boundedBytes(response, limit) {
  const length = response.headers.get('content-length')
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > limit)) { await response.body?.cancel().catch(() => {}); return fail() }
  const reader = response.body?.getReader()
  if (!reader) return fail()
  const chunks = []; let bytes = 0
  try {
    for (;;) {
      const next = await reader.read(); if (next.done) break
      bytes += next.value.byteLength
      if (bytes > limit) return fail()
      chunks.push(next.value)
    }
    return Buffer.concat(chunks)
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
}

export function createReader(env, fetcher = fetch) {
  const origin = configuredOrigin(env.ORACLE_ENDPOINT), token = env.ORACLE_API_TOKEN
  if (typeof token !== 'string' || token.length < 32 || token.length > 256 || /\s/.test(token)) return fail()
  const seen = new Set()
  return async path => {
    if (!ALLOWED.has(path) || seen.has(path)) return fail()
    seen.add(path)
    const model = path.endsWith('/model')
    const response = await fetcher(origin + path, {
      method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(30_000),
      headers: { Authorization: `Bearer ${token}`, Accept: model ? 'model/gltf-binary' : 'application/json' },
    })
    if (response.redirected || response.status >= 300 && response.status < 400) { await response.body?.cancel().catch(() => {}); return fail() }
    if (!response.ok) { await response.body?.cancel().catch(() => {}); if (response.status === 401 || response.status === 403) return fail(); return { status: response.status, unavailable: true } }
    if (!new RegExp(`^${model ? 'model/gltf-binary' : 'application/json'}(?:;|$)`, 'i').test(response.headers.get('content-type') ?? '')) return fail()
    const bytes = await boundedBytes(response, ALLOWED.get(path))
    if (model) return { status: response.status, bytes }
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
    if (!object(value)) return fail()
    return { status: response.status, value }
  }
}

function redact(value, secrets) {
  if (typeof value === 'string') {
    let text = value
    for (const secret of secrets) if (secret) text = text.split(secret).join('[secret]')
    return text.replace(/https?:\/\/[^\s"'<>]+/g, '[url]').replace(/\b(?:sk|rk|whsec)[-_][A-Za-z0-9_-]+/g, '[secret]').replace(/Bearer\s+\S+/g, '[secret]').slice(0, 16_384)
  }
  if (Array.isArray(value)) return value.slice(0, 128).map(item => redact(item, secrets))
  if (object(value)) return Object.fromEntries(Object.entries(value).slice(0, 128).filter(([key]) => !/token|secret|credential|api.?key|authorization/i.test(key) || /tokens|token_count|output_token|input_token/i.test(key)).map(([key, item]) => [key, redact(item, secrets)]))
  return value
}

const pick = (value, keys) => Object.fromEntries(keys.filter(key => Object.hasOwn(value, key)).map(key => [key, value[key]]))
export async function collectReport(env, { fetcher = fetch, now = new Date() } = {}) {
  const read = createReader(env, fetcher)
  const report = { schema: 'worldifact-model-readonly-v1', checkedAt: now.toISOString(), jobId: JOB,
    generationRequested: false, budgetEndpointRead: false, settlementRequested: false, reads: {} }
  const health = await read('/v1/health')
  report.reads.health = health.status
  if (health.value) report.runtime = pick(health.value, ['ready', 'provider', 'model', 'connectorVersion', 'worldifactCompletionRevision', 'worldifactCompletionPolicy', 'astraBudgetRevision', 'astraBudgetMaxUsd', 'astraOutputPolicy', 'astraCacheAccounting', 'studioPricingRevision'])
  const job = await read(`/v1/jobs/${JOB}`)
  report.reads.status = job.status
  if (!job.value) return redact(report, [env.ORACLE_API_TOKEN, env.ORACLE_ENDPOINT])
  if (job.value.id !== JOB || !STATES.includes(job.value.state)) return fail()
  report.job = pick(job.value, ['id', 'prompt', 'state', 'detail', 'created', 'updated', 'modelStatus', 'modelSha256', 'worldifactFailureCode'])
  const quality = await read(`/v1/jobs/${JOB}/quality`)
  report.reads.quality = quality.status
  if (quality.value) {
    if (quality.value.revision !== 6 || !STATES.includes(quality.value.state) || typeof quality.value.hasModel !== 'boolean') return fail()
    report.quality = pick(quality.value, ['revision', 'state', 'hasModel', 'modelStatus', 'automaticQualityAccepted', 'geometry', 'timing', 'visualReview', 'failure', 'validationErrors', 'currentValidation', 'failureHistory', 'agent', 'agentUsage', 'agentTools', 'agentExecution', 'acceptanceGate'])
  }
  // Only an advertised already-written artifact can be read. A failed private
  // candidate is not exposed or promoted, and no rebuild/export is requested.
  if (job.value.state === 'succeeded' && quality.value?.state === 'succeeded' && quality.value.hasModel === true) {
    const model = await read(`/v1/jobs/${JOB}/model`)
    report.reads.model = model.status
    if (model.bytes) {
      try { report.artifact = { containerValid: true, ...inspectGlb(model.bytes), completionProven: quality.value.agent?.finished === true, visualQualityVerified: false } }
      catch { report.artifact = { containerValid: false, bytes: model.bytes.byteLength } }
      model.bytes.fill(0)
    }
  }
  return redact(report, [env.ORACLE_API_TOKEN, env.ORACLE_ENDPOINT])
}

export function encryptReport(report, publicPem) {
  const recipient = createPublicKey(publicPem)
  if (recipient.asymmetricKeyType !== 'rsa' || recipient.asymmetricKeyDetails.modulusLength < 3072) return fail()
  const plaintext = Buffer.from(JSON.stringify(report))
  if (plaintext.length > 1_000_000) return fail()
  const key = randomBytes(32), iv = randomBytes(12)
  try {
    const cipher = createCipheriv('aes-256-gcm', key, iv); cipher.setAAD(AAD)
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
    const wrappedKey = publicEncrypt({ key: recipient, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, key)
    return { schema: 'worldifact-encrypted-report-v1', cipher: 'AES-256-GCM', wrapping: 'RSA-OAEP-SHA256', aad: AAD.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), wrappedKey: wrappedKey.toString('base64'), ciphertext: ciphertext.toString('base64') }
  } finally { key.fill(0); plaintext.fill(0) }
}

export async function main(env = process.env, { fetcher = fetch, now = new Date(), output = value => process.stdout.write(value + '\n') } = {}) {
  try {
    if (env.GITHUB_REPOSITORY !== 'teslaeco/WORLDIFACT' || env.GITHUB_REF !== `refs/heads/${BRANCH}` || env.GITHUB_EVENT_NAME !== 'push' || env.GITHUB_RUN_ATTEMPT !== '1' || env.DIAGNOSTIC_BEFORE !== BASE_SHA || !Number.isFinite(now.getTime()) || now.getTime() >= Date.parse(EXPIRES_AT)) return fail()
    const publicPem = await readFile('.github/model-diagnostic-recipient.pem', 'utf8')
    encryptReport({}, publicPem) // Validate the encryption recipient before reads.
    const report = await collectReport(env, { fetcher, now })
    const envelope = encryptReport(report, publicPem)
    await mkdir('.model-readonly-encrypted', { recursive: true, mode: 0o700 })
    await writeFile('.model-readonly-encrypted/report.enc.json', JSON.stringify(envelope), { flag: 'wx', mode: 0o600 })
    output('ENCRYPTED_DIAGNOSTIC_READY')
    return 0
  } catch { output('DIAGNOSTIC_FAILED_DETAILS_SUPPRESSED'); return 1 }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main()
