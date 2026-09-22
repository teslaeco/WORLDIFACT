import { oracleOrigin, ownerAuthorized, type PlatformEnv } from './platform.ts'
import { getVerifiedAccount, type AccountEnv } from './accounts.ts'
import { reserveUserGeneration, settleUserGeneration, userJobAccess, EntitlementError, type EntitlementEnv } from './entitlements.ts'
import { budgetSettings, APPROVED_FAST_TEST, type BudgetEnv, type BudgetNamespace } from './budget.ts'
import { inputDigest, oracleStudioPayload, validateStudioInput, supportsFastDraft, FAST_DRAFT_PROFILE, STUDIO_BODY_LIMIT, STUDIO_MODEL_LIMIT, STUDIO_RECONCILIATION_DETAIL, JOB_DETAILS, type StudioInput, type StudioJob } from '../src/lib/studioProtocol.ts'

export interface StudioEnv extends PlatformEnv, BudgetEnv, AccountEnv, EntitlementEnv { PUBLIC_PILOT?: string; ENABLE_STUDIO_JOBS?: string; GENERATION_BUDGET?: BudgetNamespace }
const UUID = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}'
const RECEIPT = new RegExp(`^(${UUID})\\.([0-9]{13})\\.([a-f0-9]{64})\\.([a-f0-9]{64})$`)
const EXPORTS: Record<string, { name: string; type: string; limit: number }> = {
  pbr: { name: 'textures-pbr.zip', type: 'application/zip', limit: 512 * 1024 * 1024 },
  fbx: { name: 'model.fbx', type: 'application/octet-stream', limit: 512 * 1024 * 1024 },
  blend: { name: 'model.blend', type: 'application/octet-stream', limit: 512 * 1024 * 1024 },
}
class StudioError extends Error { readonly status: number; constructor(message: string, status = 400) { super(message); this.status = status } }
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } })
const secretReady = (env: StudioEnv) => (env.OWNER_ACCESS_TOKEN?.length ?? 0) >= 32 && (env.OWNER_ACCESS_TOKEN?.length ?? 0) <= 256
const keyOf = (env: StudioEnv) => crypto.subtle.importKey('raw', new TextEncoder().encode(env.OWNER_ACCESS_TOKEN!), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
const hex = (value: ArrayBuffer) => Array.from(new Uint8Array(value), n => n.toString(16).padStart(2, '0')).join('')
const signingBytes = (value: string, userId?: string) => new TextEncoder().encode(`WORLDIFACT-STUDIO-RECEIPT-v1:${value}${userId ? `:account:${userId}` : ''}`)
async function receipt(env: StudioEnv, id: string, hash: string, userId?: string) {
  const issued = Date.now(), payload = `${id}.${issued}.${hash}`
  return { id, ticket: `${payload}.${hex(await crypto.subtle.sign('HMAC', await keyOf(env), signingBytes(payload, userId)))}`, createdAt: new Date(issued).toISOString() }
}
async function verifyReceipt(env: StudioEnv, token: string, id?: string, ownedHistory = false, userId?: string) {
  const match = RECEIPT.exec(token)
  if (!secretReady(env) || !match || (id && match[1] !== id)) throw new StudioError('A valid receipt for this job is required.', 401)
  const issued = Number(match[2])
  if (issued > Date.now() + 30_000 || (!ownedHistory && Date.now() - issued > 7 * 24 * 3600_000)) throw new StudioError('This job receipt expired. Keep your saved model.', 401)
  const signature = Uint8Array.from(match[4].match(/../g)!, byte => parseInt(byte, 16))
  const valid = await crypto.subtle.verify('HMAC', await keyOf(env), signature, signingBytes(`${match[1]}.${match[2]}.${match[3]}`, userId))
  if (!valid) throw new StudioError('The job receipt is not valid.', 401)
  return { id: match[1], issued, hash: match[3] }
}
const accountPolicy = (env: StudioEnv) => env.ENFORCE_ACCOUNT_ENTITLEMENTS === 'true'
async function accountIdentity(request: Request, env: StudioEnv, fetcher: typeof fetch) {
  if (!accountPolicy(env)) return null
  const user = await getVerifiedAccount(request, env, fetcher)
  if (!user) throw new StudioError('Sign in with your shared WORLDIFACT / Cube Chess account to continue.', 401)
  return user
}
async function boundInputDigest(input: StudioInput, userId?: string) {
  const digest = await inputDigest(input)
  // A prepared receipt cannot be submitted by another account, even before a
  // per-user ledger reservation exists. Keep legacy hashes only while disabled.
  return userId ? hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`WORLDIFACT-ACCOUNT-JOB-v1:${userId}:${digest}`))) : digest
}
async function accountAccess(env: StudioEnv, userId: string | undefined, id: string) {
  if (!userId) return null
  const access = await userJobAccess(env, userId, id)
  if (!access.owned) throw new StudioError('This model belongs to a different account or has no account receipt.', 403)
  return access
}
async function accountJob(env: StudioEnv, userId: string | undefined, id: string, state: StudioJob['state']): Promise<StudioJob> {
  if (!userId) return { id, state, detail: JOB_DETAILS[state] }
  if (state === 'succeeded') await settleUserGeneration(env, userId, id, 'completed')
  if (state === 'failed' || state === 'cancelled') await settleUserGeneration(env, userId, id, 'failed')
  const access = await accountAccess(env, userId, id)
  return { id, state, detail: JOB_DETAILS[state], downloadAllowed: access!.downloadAllowed,
    previewOnly: access!.previewOnly, previewAvailable: access!.downloadAllowed }
}
async function limitedJson(response: Request | Response, limit: number) {
  if (!response.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new StudioError('Expected application/json.', 415)
  if (Number(response.headers.get('content-length') || 0) > limit) throw new StudioError('Request or response is too large.', 413)
  const reader = response.body?.getReader()
  if (!reader) throw new StudioError('No request data.')
  let size = 0, text = ''; const decoder = new TextDecoder()
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break
      size += value.length
      if (size > limit) throw new StudioError('Request or response is too large.', 413)
      text += decoder.decode(value, { stream: true })
    }
    const result: unknown = JSON.parse(text + decoder.decode())
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new StudioError('Expected a JSON object.')
    return result as Record<string, unknown>
  } catch (error) { await reader.cancel().catch(() => {}); if (error instanceof StudioError) throw error; throw new StudioError('Invalid JSON data.') }
}
async function inputFrom(request: Request) {
  const value = await limitedJson(request, STUDIO_BODY_LIMIT)
  try { return validateStudioInput(value) } catch (e) { throw new StudioError(e instanceof Error ? e.message : 'Invalid model input.', 400) }
}
async function limit(request: Request, env: StudioEnv, bucket: string) {
  if (!env.GENERATION_LIMITER) throw new StudioError('Request limiter is unavailable.', 503)
  try {
    const key = `studio:${bucket}:${request.headers.get('CF-Connecting-IP') || 'unknown-client'}`
    if (!(await env.GENERATION_LIMITER.limit({ key })).success) throw new StudioError('Please wait before checking or submitting again.', 429)
  } catch (e) { if (e instanceof StudioError) throw e; throw new StudioError('Request limiter is unavailable.', 503) }
}
function budget(env: StudioEnv) {
  if (!env.GENERATION_BUDGET) throw new StudioError('The shared allowance is not configured.', 503)
  return env.GENERATION_BUDGET.get(env.GENERATION_BUDGET.idFromName('worldifact-generation-budget-v1'))
}
async function allowance(env: StudioEnv) {
  const response = await budget(env).fetch(new Request('https://budget.internal/status', { signal: AbortSignal.timeout(5000) }))
  if (!response.ok) throw new StudioError('The shared allowance could not be read.', 503)
  const state = await limitedJson(response, 2000)
  const unlimited = state.unlimited === true
  if (!Number.isSafeInteger(state.used) || Number(state.used) < 0 || typeof state.enabled !== 'boolean' ||
      (unlimited ? state.limit !== null || state.remaining !== null : ![state.limit, state.remaining].every(n => Number.isSafeInteger(n) && Number(n) >= 0)))
    throw new StudioError('Invalid allowance response.', 503)
  return { used: Number(state.used), limit: unlimited ? null : Number(state.limit), remaining: unlimited ? null : Number(state.remaining), enabled: state.enabled,
    expiresAt: typeof state.expiresAt === 'string' ? state.expiresAt : null, unlimited, fastOnly: state.fastOnly === true }
}
async function oracle(env: StudioEnv, path: string, fetcher: typeof fetch, init: RequestInit = {}) {
  const origin = oracleOrigin(env.ORACLE_ENDPOINT)
  if (!origin || !env.ORACLE_API_TOKEN) throw new StudioError('The existing Oracle connection is not configured.', 503)
  return fetcher(origin + path, { ...init, redirect: 'manual', signal: AbortSignal.timeout(path.includes('/model') || path.includes('/exports/') ? 180_000 : 25_000),
    headers: { Authorization: `Bearer ${env.ORACLE_API_TOKEN}`, Accept: path.includes('/model') ? 'model/gltf-binary' : path.includes('/exports/') ? 'application/octet-stream, application/zip' : 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}) } })
}
async function health(env: StudioEnv, fetcher: typeof fetch) {
  const response = await oracle(env, '/v1/health', fetcher)
  if (!response.ok) { await response.body?.cancel(); throw new StudioError('The existing worker did not confirm readiness.', 503) }
  const state = await limitedJson(response, 16_384)
  const compatible = state.ready === true && state.provider === 'openai' && state.model === 'gpt-6-astra' && Number.isSafeInteger(state.connectorVersion) && Number(state.connectorVersion) >= 33
  const fastReady = compatible && supportsFastDraft(state)
  return { ready: compatible, photoReady: compatible && state.photoInput === true, fastReady,
    fastBudgetReady: fastReady && state.fastBudgetRevision === 'fast-usd4-v1' && state.fastBudgetMaxUsd === 4,
    promptMaxLength: state.promptMaxLength === 5000 ? 5000 : 2000 }
}
async function preflight(request: Request, env: StudioEnv, fetcher: typeof fetch, input: StudioInput, userId?: string) {
  const pool = await allowance(env)
  const trial = pool.fastOnly && env.ENABLE_APPROVED_FAST_TEST === 'true'
  if (!trial && (env.ENABLE_STUDIO_JOBS !== 'true' || !budgetSettings(env))) throw new StudioError('Model generation is disabled or its allowance has expired.', 503)
  if (trial) {
    if (input.generationProfile !== FAST_DRAFT_PROFILE) throw new StudioError('The approved extra attempt is FAST only. Select FAST DRAFT; no request was charged.', 409)
    if (!await ownerAuthorized(request, env.OWNER_ACCESS_TOKEN!))
      await verifyReceipt(env, request.headers.get('X-WORLDIFACT-Previous-Job') || '', undefined, false, userId)
  } else if (env.PUBLIC_PILOT !== 'true' && !await ownerAuthorized(request, env.OWNER_ACCESS_TOKEN!)) throw new StudioError('This generation window requires owner access.', 401)
  const current = await health(env, fetcher)
  if (!current.ready) throw new StudioError('The existing Astra/Blender worker is not ready.', 503)
  if (trial && !current.fastBudgetReady) throw new StudioError('The approved cost guard is not confirmed. No paid request was sent.', 503)
  if (input.generationProfile === FAST_DRAFT_PROFILE && (!current.fastReady || !current.fastBudgetReady)) throw new StudioError('FAST DRAFT is not fully verified on the worker. No paid job was submitted; STANDARD remains available.', 409)
  if (input.photos.length && !current.photoReady) throw new StudioError('This worker has not confirmed photo input. Nothing was submitted.', 409)
  if (oracleStudioPayload('', input).prompt.length > current.promptMaxLength) throw new StudioError(`Shorten the description: the worker accepts ${current.promptMaxLength} characters including export instructions.`)
  return { ...current, trial }
}
async function modelOrExport(env: StudioEnv, id: string, format: string, fetcher: typeof fetch) {
  const model = format === 'model'
  const profile = model ? { name: 'model.glb', type: 'model/gltf-binary', limit: STUDIO_MODEL_LIMIT } : EXPORTS[format]
  if (!profile) throw new StudioError('Unsupported export format.', 404)
  const response = await oracle(env, model ? `/v1/jobs/${id}/model` : `/v1/jobs/${id}/exports/${format}`, fetcher)
  if (!response.ok) { await response.body?.cancel(); throw new StudioError('This model/export is not available on the worker yet.', [404, 409].includes(response.status) ? response.status : 502) }
  const size = Number(response.headers.get('content-length'))
  if (!Number.isSafeInteger(size) || size < (model ? 20 : 1) || size > profile.limit || !response.body) { await response.body?.cancel(); throw new StudioError('The export is incomplete or exceeds its download limit.', 413) }
  const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()
  if (model && !['model/gltf-binary', 'application/octet-stream'].includes(contentType || '')) { await response.body.cancel(); throw new StudioError('The worker did not return a GLB.', 502) }
  const reader = response.body.getReader(), initial: Uint8Array[] = []; let initialSize = 0
  if (model) {
    while (initialSize < 12) {
      const next = await reader.read()
      if (next.done) { await reader.cancel(); throw new StudioError('The model download is incomplete.', 502) }
      initial.push(next.value); initialSize += next.value.byteLength
      if (initialSize > size) { await reader.cancel(); throw new StudioError('The model size is invalid.', 502) }
    }
    const first = new Uint8Array(12); let at = 0
    for (const chunk of initial) { const part = chunk.subarray(0, Math.min(12 - at, chunk.length)); first.set(part, at); at += part.length; if (at === 12) break }
    const header = new DataView(first.buffer)
    if (header.getUint32(0, true) !== 0x46546c67 || header.getUint32(4, true) !== 2 || header.getUint32(8, true) !== size) { await reader.cancel(); throw new StudioError('The worker returned an invalid GLB container.', 502) }
  }
  let received = 0
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const value = initial.shift(), next = value ? { done: false, value } : await reader.read()
        if (next.done) { if (received !== size) throw new Error('Incomplete export'); controller.close(); return }
        received += next.value.length
        if (received > size) throw new Error('Invalid export size')
        controller.enqueue(next.value)
      } catch { await reader.cancel().catch(() => {}); controller.error(new Error('Artifact interrupted. Retry the artifact, not generation.')) }
    }, cancel: () => reader.cancel(),
  })
  return new Response(stream, { headers: { 'Content-Type': profile.type, 'Content-Length': String(size), 'Content-Disposition': `attachment; filename="WORLDIFACT-${id}-${profile.name}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'X-WORLDIFACT-Provenance': 'GENERATED-UNREVIEWED' } })
}
export async function studioApi(request: Request, env: StudioEnv, fetcher: typeof fetch = fetch): Promise<Response> {
  const url = new URL(request.url)
  try {
    if (request.method !== 'GET' && request.headers.get('Origin') !== url.origin) throw new StudioError('Same-origin request required.', 403)
    if (url.pathname === '/api/studio/approved-test/activate' && request.method === 'POST') {
      if (env.ENABLE_APPROVED_FAST_TEST !== 'true' || !env.ORACLE_API_TOKEN || !await ownerAuthorized(request, env.ORACLE_API_TOKEN)) throw new StudioError('Installer authorization required.', 401)
      await limit(request, env, 'activate')
      const input = await limitedJson(request, 256)
      if (Object.keys(input).length !== 1 || input.approval !== APPROVED_FAST_TEST) throw new StudioError('Unknown approval.', 400)
      if (!(await health(env, fetcher)).fastBudgetReady) throw new StudioError('Installed FAST monetary guard not verified.', 409)
      const response = await budget(env).fetch(new Request('https://budget.internal/activate-approved-fast', { method: 'POST', body: APPROVED_FAST_TEST }))
      if (!response.ok) throw new StudioError('This single approval cannot be activated or renewed.', response.status)
      const pool = await allowance(env)
      return json({ activated: pool.enabled && pool.fastOnly, remaining: pool.remaining, used: pool.used, limit: pool.limit, expiresAt: pool.expiresAt, paidGenerationRequested: false })
    }
    if (url.pathname === '/api/studio/status' && request.method === 'GET') {
      await limit(request, env, 'status')
      let pool = null, state = null
      try { pool = await allowance(env) } catch { /* Unknown is not exhausted. */ }
      try { state = await health(env, fetcher) } catch { /* Read-only check, no job. */ }
      const trial = pool?.fastOnly === true && env.ENABLE_APPROVED_FAST_TEST === 'true'
      const enabled = trial || (env.ENABLE_STUDIO_JOBS === 'true' && !!budgetSettings(env))
      const authorized = trial || env.PUBLIC_PILOT === 'true' || (secretReady(env) && await ownerAuthorized(request, env.OWNER_ACCESS_TOKEN!))
      const reason = !enabled ? env.ENABLE_APPROVED_FAST_TEST === 'true' ? 'APPROVED_TEST_PENDING_ACTIVATION' : 'DISABLED_OR_EXPIRED' : !secretReady(env) ? 'RECEIPT_SECRET_MISSING' : !pool ? 'ALLOWANCE_UNAVAILABLE' : (!pool.unlimited && pool.remaining === 0) ? 'ALLOWANCE_EXHAUSTED' : !state?.ready ? 'ORACLE_NOT_READY' : trial && !state.fastBudgetReady ? 'APPROVED_TEST_PENDING_ACTIVATION' : !authorized ? 'OWNER_ACCESS_REQUIRED' : 'READY'
      return json({ accountRequired: accountPolicy(env), ready: reason === 'READY', publicPilot: env.PUBLIC_PILOT === 'true', reason, oracle: state?.ready ? 'CONNECTOR_READY' : 'NOT_VERIFIED_READY',
        photoReady: state?.photoReady === true, fastReady: state?.fastReady === true, fastBudgetReady: state?.fastBudgetReady === true,
        fastOnly: trial, promptMaxLength: Math.max(3, (state?.promptMaxLength ?? 2000) - 600), allowance: pool })
    }
    if (!secretReady(env)) throw new StudioError('The job receipt service is not configured.', 503)
    if (url.pathname === '/api/studio/prepare' && request.method === 'POST') {
      await limit(request, env, 'prepare')
      const user = await accountIdentity(request, env, fetcher)
      const input = await inputFrom(request)
      await preflight(request, env, fetcher, input, user?.id)
      const pool = await allowance(env)
      if (!pool.unlimited && pool.remaining === 0) throw new StudioError('The cumulative allowance is exhausted. No job was started.', 429)
      return json(await receipt(env, crypto.randomUUID(), await boundInputDigest(input, user?.id), user?.id))
    }
    if (url.pathname === '/api/studio/jobs' && request.method === 'POST') {
      await limit(request, env, 'submit')
      const user = await accountIdentity(request, env, fetcher)
      const auth = await verifyReceipt(env, request.headers.get('X-WORLDIFACT-Job') || '', undefined, false, user?.id)
      if (Date.now() - auth.issued > 30 * 60_000) throw new StudioError('This unsubmitted receipt expired. Review your inputs before preparing another.', 409)
      const input = await inputFrom(request)
      if (await boundInputDigest(input, user?.id) !== auth.hash) throw new StudioError('Inputs changed after this receipt was prepared. Nothing was submitted.', 409)
      const checked = await preflight(request, env, fetcher, input, user?.id)
      if (user) {
        const userReservation = await reserveUserGeneration(env, user.id, auth.id, input.generationProfile === FAST_DRAFT_PROFILE ? 'fast' : 'slow')
        if (!userReservation.allowed) throw new StudioError('Your free allowance is used and you do not have enough credits. View your account for limits and top-ups.', 429)
        if (userReservation.repeated) return json({ job: await accountJob(env, user.id, auth.id, 'pending'), recoveryOnly: true }, 202)
      }
      // Keep the operator budget independent from customer credits. A rejected
      // global reservation cannot create an Oracle job and releases customer credit.
      let reserved: Response
      try {
        reserved = await budget(env).fetch(new Request('https://budget.internal/reserve-studio', { method: 'POST', body: JSON.stringify({ id: auth.id, ...(checked.trial ? { profile: FAST_DRAFT_PROFILE } : {}) }), signal: AbortSignal.timeout(5000) }))
        if (reserved.status === 409) return json({ job: await accountJob(env, user?.id, auth.id, 'pending'), recoveryOnly: true }, 202)
        if (!reserved.ok || (await reserved.json() as { allowed?: boolean }).allowed !== true) throw new StudioError('The cumulative allowance is exhausted or unavailable. No new job was submitted.', reserved.status === 429 ? 429 : 503)
      } catch (error) {
        if (user) await settleUserGeneration(env, user.id, auth.id, 'failed')
        throw error
      }
      try {
        const response = await oracle(env, '/v1/jobs', fetcher, { method: 'POST', body: JSON.stringify(oracleStudioPayload(auth.id, input)) })
        if (user && response.status === 409) { await response.body?.cancel(); return json({ job: await accountJob(env, user.id, auth.id, 'pending'), recoveryOnly: true }, 202) }
        if ([400, 409, 422, 429].includes(response.status)) { await response.body?.cancel(); return json({ job: await accountJob(env, user?.id, auth.id, 'failed') }, 202) }
        if (!response.ok) { await response.body?.cancel(); throw new Error('Unconfirmed acceptance') }
        const value = await limitedJson(response, 16_384)
        if (value.id !== auth.id || !Object.hasOwn(JOB_DETAILS, String(value.state))) throw new Error('Unconfirmed acceptance')
        return json({ job: await accountJob(env, user?.id, auth.id, value.state as StudioJob['state']) }, 202)
      } catch { return json({ job: { id: auth.id, state: 'pending', detail: JOB_DETAILS.pending } }, 202) }
    }
    const match = new RegExp(`^/api/studio/jobs/(${UUID})(?:/(model|exports/(?:pbr|fbx|blend)))?$`).exec(url.pathname)
    if (match && request.method === 'GET') {
      const user = await accountIdentity(request, env, fetcher)
      const auth = await verifyReceipt(env, request.headers.get('X-WORLDIFACT-Job') || '', match[1], !!user, user?.id)
      const access = await accountAccess(env, user?.id, auth.id)
      await limit(request, env, match[2] ? 'artifact' : `poll:${auth.id}`)
      if (match[2]) {
        // Previewing a GLB transfers its complete bytes. A free SLOW preview
        // therefore cannot use this route; an active subscription is required.
        if (access && !access.downloadAllowed) throw new StudioError('SLOW models and textures require an active subscription to download. Your generated model is preserved.', 403)
        return await modelOrExport(env, auth.id, match[2].replace('exports/', ''), fetcher)
      }
      const response = await oracle(env, `/v1/jobs/${auth.id}`, fetcher)
      if (response.status === 404) {
        await response.body?.cancel()
        const expired = Date.now() - auth.issued >= 180_000
        const state = user || !expired ? 'pending' : 'failed'
        // A missing upstream record does not prove that a paid request failed.
        // Stop automatic waiting after the recovery window and retain its debit.
        return json({ job: { id: auth.id, state, detail: user && expired ? STUDIO_RECONCILIATION_DETAIL : JOB_DETAILS[state],
          ...(user && expired ? { reconciliationRequired: true, downloadAllowed: false, previewAvailable: false } : {}) } })
      }
      if (!response.ok) { await response.body?.cancel(); throw new StudioError('Status temporarily unavailable. Keep the same job.', response.status === 429 ? 429 : 502) }
      const value = await limitedJson(response, 16_384)
      if (((user || value.id !== undefined) && value.id !== auth.id) || !Object.hasOwn(JOB_DETAILS, String(value.state))) throw new StudioError('The worker returned an invalid job status.', 502)
      return json({ job: await accountJob(env, user?.id, auth.id, value.state as StudioJob['state']) })
    }
    return json({ error: 'Studio route or method not found.' }, 404)
  } catch (e) {
    if (e instanceof StudioError || e instanceof EntitlementError) return json({ error: e.message }, e.status)
    return json({ error: 'The request could not be confirmed. Preserve your inputs and receipt; never automatically resubmit a paid job.' }, 503)
  }
}
