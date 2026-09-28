/** Owner-approved 2026-09-28 test: one real SOL attempt <=$0.35, one ASTRA job <=$1.75.
 * A permanent Git ref claims the authorization BEFORE provider work. Never delete it
 * or change the fixed job ID to retry. This tests the backend pipelines, not a paid
 * customer checkout or a physical Android browser. It never changes a subscription.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'
import { handle, GenerationBudget } from '../server/worker.ts'
import { validateGenerationResult } from '../src/lib/blueprint.ts'
import { exportBlueprintGlb } from '../src/lib/blueprintExport.ts'
import { inspectGLB } from '../src/lib/glb.ts'
import { oracleStudioPayload, validateStudioInput } from '../src/lib/studioProtocol.ts'
import { oracleOrigin } from '../server/platform.ts'
import { checkAstraRuntime } from './check-astra-runtime.mjs'

export const APPROVAL = 'worldifact-model-check-20260928-2100-v1'
export const ASTRA_JOB = 'ac718eb5-2c54-47b1-ae67-722ad296ff10'
export const SOL_ID = 'bfdbfd21-f946-4fe8-90c2-f33dc2b7db41'
export const CAP_USD = Object.freeze({ sol: 0.35, astra: 1.75, total: 2.10 })
const allowedStates = new Set(['queued','generating','retrying','building','succeeded','failed','cancelled'])
const hash = bytes => createHash('sha256').update(bytes).digest('hex')

export async function boundedBytes(response, maximum) {
  if (!response.ok || Number(response.headers.get('content-length') || 0) > maximum) throw new Error('RESPONSE_NOT_AVAILABLE')
  const reader = response.body?.getReader(); if (!reader) throw new Error('RESPONSE_EMPTY')
  const chunks = []; let size = 0
  try {
    for (;;) {
      const item = await reader.read(); if (item.done) break
      size += item.value.byteLength
      if (size > maximum) throw new Error('RESPONSE_TOO_LARGE')
      chunks.push(Buffer.from(item.value))
    }
  } finally { await reader.cancel().catch(() => {}) }
  const declared = Number(response.headers.get('content-length') || 0)
  if (declared && declared !== size) throw new Error('RESPONSE_INCOMPLETE')
  return Buffer.concat(chunks, size)
}
async function json(response, maximum = 1000000) {
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('JSON_REQUIRED')
  return JSON.parse((await boundedBytes(response, maximum)).toString('utf8'))
}
export async function claimApproval(env, fetcher = fetch) {
  if (env.GITHUB_REPOSITORY !== 'teslaeco/WORLDIFACT' || !/^[0-9a-f]{40}$/.test(env.GITHUB_SHA || '') || !env.GITHUB_TOKEN)
    throw new Error('APPROVAL_CONFIGURATION_MISSING')
  const response = await fetcher('https://api.github.com/repos/teslaeco/WORLDIFACT/git/refs', {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28' },
    body: JSON.stringify({ ref: 'refs/tags/' + APPROVAL, sha: env.GITHUB_SHA }),
  })
  if (response.status !== 201) { await response.body?.cancel(); throw new Error('APPROVAL_ALREADY_CLAIMED_OR_UNAVAILABLE_NO_RETRY') }
  const value = await json(response, 16384)
  if (value.ref !== 'refs/tags/' + APPROVAL || value.object?.sha !== env.GITHUB_SHA) throw new Error('APPROVAL_NOT_CONFIRMED')
}

// Only the browser FileReader adapter is simulated for Node's real GLTFExporter.
function nodeFileReader() {
  if (globalThis.FileReader) return
  globalThis.FileReader = class {
    result = null; error = null; onload = null; onloadend = null; onerror = null
    async readAsArrayBuffer(blob) {
      try { this.result = await blob.arrayBuffer(); this.onload?.({ target: this }); this.onloadend?.({ target: this }) }
      catch (error) { this.error = error; this.onerror?.({ target: this }) }
    }
    async readAsDataURL(blob) {
      try { this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}`; this.onload?.({ target: this }); this.onloadend?.({ target: this }) }
      catch (error) { this.error = error; this.onerror?.({ target: this }) }
    }
  }
}
function storage() {
  const values = new Map()
  const store = { async get(key) { return values.get(key) }, async put(key, value) { values.set(key, value) }, async transaction(fn) { return fn(store) } }
  return store
}
export async function solAttempt(env, output, fetcher = fetch) {
  let providerCalls = 0, tokenCounts = 0, usage = null
  const config = { OPENAI_API_KEY: env.OPENAI_API_KEY, OPENAI_MODEL: 'gpt-6-astra', OPENAI_FAST_MODEL: 'gpt-6-sol',
    ENABLE_PAID_GENERATION: 'true', PUBLIC_PILOT: 'true', GENERATION_REQUEST_LIMIT: '1',
    GENERATION_EXPIRES_AT: new Date(Date.now() + 3600000).toISOString(),
    GENERATION_LIMITER: { async limit() { return { success: true } } } }
  const object = new GenerationBudget({ storage: storage() }, config)
  config.GENERATION_BUDGET = { idFromName: name => name, get: () => object }
  const realProvider = async (url, init) => {
    if (!['https://api.openai.com/v1/responses/input_tokens','https://api.openai.com/v1/responses'].includes(String(url))) throw new Error('UNEXPECTED_PROVIDER_ROUTE')
    const payload = JSON.parse(init.body)
    if (payload.model !== 'gpt-6-sol') throw new Error('UNEXPECTED_MODEL')
    if (String(url).endsWith('/input_tokens')) { if (++tokenCounts > 1) throw new Error('NO_COUNTER_RETRY') }
    else {
      if (++providerCalls > 1 || payload.service_tier !== 'default' || payload.max_output_tokens > 4000) throw new Error('NO_PROVIDER_RETRY')
    }
    const response = await fetcher(url, { ...init, redirect: 'error' })
    if (!String(url).endsWith('/input_tokens') && response.ok) {
      const body = await response.clone().json()
      const u = body.usage
      if (u && ['input_tokens','output_tokens'].every(k => Number.isSafeInteger(u[k]) && u[k] >= 0))
        usage = { inputTokens: u.input_tokens, outputTokens: u.output_tokens, cachedInputTokens: u.input_tokens_details?.cached_tokens ?? 0 }
    }
    return response
  }
  const request = new Request('https://worldifact.xodobrox.workers.dev/api/blueprint', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://worldifact.xodobrox.workers.dev', 'X-WORLDIFACT-Request': SOL_ID },
    body: JSON.stringify({ worldId: 'enchanted-ai-shop', mode: 'live', prompt: 'Create a small solar garden workshop scene: one compact teal habitat at the center, one solar rover to its right and two trees behind it. Use clear separated objects and realistic relative scale. Keep the JSON concise and include the main asset GAME and MAKE limitations. This is a procedural GAME draft, not an approved manufacturing design.' }),
  })
  const response = await handle(request, config, realProvider)
  const body = await response.json()
  if (!response.ok) return { status: 'FAILED', httpStatus: response.status, providerCalls, tokenCounts, usage, reason: String(body.error || 'SOL_FAILED').slice(0,180) }
  const result = validateGenerationResult(body)
  if (result.mode !== 'LIVE' || result.model !== 'gpt-6-sol' || !result.evidence) throw new Error('SOL_LIVE_EVIDENCE_MISSING')
  nodeFileReader()
  const buffer = await exportBlueprintGlb(result.blueprint), mesh = inspectGLB(buffer)
  await writeFile(output + '/sol.glb', Buffer.from(buffer))
  await writeFile(output + '/sol-result.json', JSON.stringify(result, null, 2))
  return { status: 'PASSED', providerCalls, tokenCounts, model: result.model, usage, ceilingUsd: 0.35,
    result: 'VALIDATED_BLUEPRINT_AND_PROCEDURAL_GLB', mesh, sha256: hash(Buffer.from(buffer)),
    accountCheckoutTest: 'NOT_PERFORMED', testContext: 'same backend handler; isolated owner test quota; live provider' }
}
export async function astraAttempt(env, output, fetcher = fetch, wait = sleep) {
  await checkAstraRuntime(env, fetcher)
  const origin = oracleOrigin(env.ORACLE_ENDPOINT)
  if (!origin) throw new Error('ORACLE_NOT_CONFIGURED')
  const call = (path, init = {}, timeout = 30000) => fetcher(origin + path, { ...init, redirect: 'error', signal: AbortSignal.timeout(timeout),
    headers: { Authorization: 'Bearer ' + env.ORACLE_API_TOKEN, Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}) } })
  const existing = await call('/v1/jobs/' + ASTRA_JOB)
  if (existing.status !== 404) { await existing.body?.cancel(); throw new Error('ASTRA_JOB_ALREADY_EXISTS_NO_SECOND_SUBMISSION') }
  await existing.body?.cancel()
  const input = validateStudioInput({ worldId: 'enchanted-ai-shop', purpose: 'object', textureMaxSize: 2048, photos: [],
    prompt: 'Create one simple collectible low-poly teal robot on a circular base. Box torso, rounded box head, two separate short legs, two arms, two small amber eyes. Friendly proportions, clean solid geometry, matte teal and amber PBR materials. No text, people or environment. Keep tool calls compact. Read the contract once, build one complete model, review the necessary renders together, then finish and export the actual GLB/FBX/BLEND/textures. Do not iterate merely for extra decoration. Clearly mark MAKE not validated.' })
  const response = await call('/v1/jobs', { method: 'POST', body: JSON.stringify(oracleStudioPayload(ASTRA_JOB, input)) })
  if (![200,201,202].includes(response.status)) { await response.body?.cancel(); throw new Error('ASTRA_SUBMISSION_NOT_CONFIRMED_NO_RETRY') }
  let job = await json(response, 32768)
  for (let poll = 0; poll < 56; poll++) {
    if (job.id !== ASTRA_JOB || !allowedStates.has(job.state)) throw new Error('ASTRA_JOB_IDENTITY_INVALID')
    if (['succeeded','failed','cancelled'].includes(job.state)) break
    if (poll % 4 === 0) console.log('ASTRA progress:', job.state, '; same job, no resubmission')
    await wait(10000)
    job = await json(await call('/v1/jobs/' + ASTRA_JOB), 32768)
  }
  if (job.state !== 'succeeded') {
    const text = String(job.detail || '')
    const known = ['WORLDIFACT_ASTRA_COST_GUARD','FORGE_JOB_BUDGET','CODEX_TOOLS_MISSING','OPENAI_HTTP_429'].find(code => text.includes(code))
    return { status: 'FAILED', state: job.state, jobId: ASTRA_JOB, submittedJobs: 1, ceilingUsd: 1.75, reason: known || 'MODEL_DID_NOT_FINISH_WITHIN_APPROVED_TEST', actualCostUsd: null }
  }
  const exports = {}
  for (const [name, route] of [['glb','model'],['fbx','exports/fbx'],['blend','exports/blend'],['pbr','exports/pbr']]) {
    try {
      const bytes = await boundedBytes(await call('/v1/jobs/' + ASTRA_JOB + '/' + route, {}, 180000), 50000000)
      if (name === 'glb') {
        const inspection = inspectGLB(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
        if (!inspection.triangles || !inspection.materialCount) throw new Error('EMPTY_GLB')
        exports[name] = { bytes: bytes.length, sha256: hash(bytes), inspection }
      } else {
        if (bytes.length < 16 || /^\s*[{<]/.test(bytes.subarray(0,16).toString())) throw new Error('INVALID_EXPORT')
        exports[name] = { bytes: bytes.length, sha256: hash(bytes) }
      }
      await writeFile(output + '/astra.' + (name === 'pbr' ? 'textures.zip' : name), bytes)
    } catch { exports[name] = { status: 'FAILED' } }
  }
  return { status: Object.values(exports).every(x => !x.status) ? 'PASSED' : 'FAILED', model: 'gpt-6-astra',
    jobId: ASTRA_JOB, submittedJobs: 1, ceilingUsd: 1.75, exports, actualCostUsd: null,
    visualQuality: 'REQUIRES_HUMAN_REVIEW', testContext: 'live authenticated Oracle API; deterministic one-off owner job' }
}

async function main() {
  const env = process.env
  if (env.WORLDIFACT_PAID_TEST_APPROVAL !== 'SOL035_ASTRA175_ONCE' || env.GITHUB_RUN_ATTEMPT !== '1' || Date.now() > Date.parse('2026-09-29T12:00:00Z')) throw new Error('APPROVAL_MISSING_OR_EXPIRED')
  if (!env.OPENAI_API_KEY) throw new Error('OPENAI_CONFIGURATION_MISSING')
  const output = 'model-test-evidence'; await mkdir(output, { recursive: true })
  await checkAstraRuntime(env)
  await claimApproval(env)
  const report = { approval: APPROVAL, checkedAt: new Date().toISOString(), maximumTotalProviderReservationUsd: 2.10, automaticRetries: 0, customerCharges: 0, commercialActivation: 'UNCHANGED', sol: null, astra: null }
  for (const [name, run] of [['sol', solAttempt], ['astra', astraAttempt]]) {
    try { report[name] = await run(env, output) }
    catch (error) { report[name] = { status: 'FAILED', reason: /^[A-Z0-9_]+$/.test(error?.message || '') ? error.message : 'TEST_FAILED_NO_RETRY' } }
    await writeFile(output + '/report.json', JSON.stringify(report, null, 2))
    console.log(JSON.stringify({ completed: name, result: report[name] }, null, 2))
  }
  if (report.sol.status !== 'PASSED' || report.astra.status !== 'PASSED') process.exitCode = 1
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(/^[A-Z0-9_]+$/.test(error?.message || '') ? error.message : 'TEST_STOPPED_NO_RETRY'); process.exitCode = 1 })
}
