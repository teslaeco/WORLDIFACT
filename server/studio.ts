import { inspectGLB } from '../src/lib/glb.ts'
import { passesStudioStructuralQuality } from '../src/lib/studioQuality.ts'
import { detailedRuntime, DETAILED_REFERENCE_LIMIT } from '../src/lib/detailedStudio.ts'
import { oracleOrigin, ownerAuthorized, type PlatformEnv } from './platform.ts'
import { getVerifiedAccount, type AccountEnv } from './accounts.ts'
import { ADMISSION_FAILURE_DETAILS, isAdmissionFailureCode, type AdmissionFailureCode } from '../src/lib/generationAdmission.ts'
import { PAID_POINTS_FUNDING, PAID_POINTS_POLICY, PAID_POINTS_POLICY_HEADER, POINT_COST_PENDING_DETAIL, isManualPointClosure, manualPointClosureDetail, type PointSettlement } from '../src/lib/paidPointsFunding.ts'
import { clearCurrentUserStudioJob, closeMissingStudioJob, currentUserStudioJob, entitlementStatus, markStudioDispatch, pendingUserStudioProvider, reconcileUserStudioProvider, reconcileUserBlueprintProvider, reserveUserGeneration, settleUserGeneration, userJobAccess, userStudioLibrary, userStudioLibraryModel, STUDIO_ORACLE_TIMEOUT_MS, EntitlementError, type EntitlementEnv, type OwnedStudioLibraryModel } from './entitlements.ts'
import { validateTerminalBudgetReceipt } from './studioBudgetReceipt.ts'
import { astraRepairedMccGrant } from './astraRepairedMccGrant.ts'
import { overnightTestAuthority, OVERNIGHT_TEST_APPROVAL } from './overnightTestBudget.ts'
import { TEST_ACCOUNT_CONTRACT, hasTestAccountHeaders, testAccountMatches, readTestInputEnvelope } from '../src/lib/testAccountContract.ts'
import { astraProjectBudget } from './astraProjectBudget.ts'
import { studioPricingFor, type StudioPricing } from '../src/lib/studioPricing.ts'
import { HISTORICAL_STUDIO_POLICY, studioNewJobPolicy } from '../src/lib/studioNewJobPolicy.ts'
import { budgetSettings, APPROVED_FAST_TEST, type BudgetEnv, type BudgetNamespace } from './budget.ts'
import { inputDigest, oracleStudioPayload, readStudioGenerationTiming, studioQualityProfile, validateStudioInput, validateStudioPrepareManifest, supportsFastDraft, FAST_DRAFT_PROFILE, STUDIO_BODY_LIMIT, STUDIO_MODEL_LIMIT, STUDIO_SUBMISSION_GRACE_MS, JOB_DETAILS, STUDIO_FAILURE_CODES, STUDIO_FAILURE_DETAILS, type StudioInput, type StudioJob, type StudioQualityProfile, type StudioPrepareMetadata, type StudioLibraryModel, type StudioLibraryPage, type StudioGenerationTiming } from '../src/lib/studioProtocol.ts'

export interface StudioEnv extends PlatformEnv, BudgetEnv, AccountEnv, EntitlementEnv { PUBLIC_PILOT?: string; ENABLE_STUDIO_JOBS?: string; STUDIO_NEW_JOB_POLICY?: string; GENERATION_BUDGET?: BudgetNamespace }
const UUID = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}'
const STUDIO_JOB_WATCHDOG_MS = 35 * 60_000
const RECEIPT = new RegExp(`^(${UUID})\\.([0-9]{13})\\.([a-f0-9]{64})\\.([a-f0-9]{64})$`)
const LIBRARY_TOKEN_TTL_MS = 15 * 60_000
const EXPORTS: Record<string, { name: string; type: string; limit: number }> = {
  pbr: { name: 'textures-pbr.zip', type: 'application/zip', limit: 512 * 1024 * 1024 },
  fbx: { name: 'model.fbx', type: 'application/octet-stream', limit: 512 * 1024 * 1024 },
  blend: { name: 'model.blend', type: 'application/octet-stream', limit: 512 * 1024 * 1024 },
}
class StudioError extends Error {
  readonly status: number
  readonly failureCode?: StudioJob['failureCode']
  readonly pointSettlement?: PointSettlement
  readonly requestId?: string
  constructor(message: string, status = 400, failureCode?: StudioJob['failureCode'], pointSettlement?: PointSettlement, requestId?: string) { super(message); this.status = status; this.failureCode = failureCode; this.pointSettlement = pointSettlement; this.requestId = requestId }
}
// Only a proven artifact-content violation is terminal. HTTP/transport errors
// describe an uncertain read and must remain recoverable under the same receipt.
class InvalidStudioModelError extends StudioError {}
class StudioVerificationBusyError extends StudioError {}
class StudioLibraryReceiptExpiredError extends StudioError {
  constructor() { super('This library download receipt expired. Refresh this saved model.', 401) }
}
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } })
type StudioDiagnosticReason = NonNullable<StudioJob['failureCode']> |
  'PREFLIGHT_ACCEPTED' | 'EXISTING_ACCOUNT_RESERVATION' | 'STUDIO_ALLOWANCE_UNAVAILABLE' |
  'ACCOUNT_AND_BUDGET_RESERVED' | 'DISPATCH_FENCE_REFUSED' | 'ORACLE_RESPONSE' |
  'ORACLE_REJECTED' | 'ORACLE_NO_RESPONSE' | 'INPUT_VALIDATED' | 'MODEL_COMPLETED' | 'MODEL_FAILED'
type StudioDiagnostic = {
  requestId: string
  stage: 'PREPARATION' | 'ADMISSION' | 'ORACLE_DISPATCH' | 'RECEIVED' | 'ADMITTED' | 'SENT_TO_PROVIDER' | 'PROVIDER_RESPONSE' | 'COMPLETED' | 'FAILED'
  admission: 'PREPARED' | 'ADMITTED' | 'REFUSED' | 'RECOVERY_ONLY'
  reason: StudioDiagnosticReason
  oracleDispatch: 'NOT_ATTEMPTED' | 'CLAIM_REFUSED' | 'CLAIMED' | 'NO_RESPONSE' | 'RESPONSE' | 'UNKNOWN'
  workerStatus: number | null
}
function logStudioDiagnostic(diagnostic: StudioDiagnostic) {
  // Diagnostics must never change admission, dispatch or recovery behavior.
  try { console.info(JSON.stringify({ event: 'worldifact.studio.generation', ...diagnostic })) } catch { /* Keep the authoritative request outcome. */ }
}
const secretReady = (env: StudioEnv) => (env.OWNER_ACCESS_TOKEN?.length ?? 0) >= 32 && (env.OWNER_ACCESS_TOKEN?.length ?? 0) <= 256
const keyOf = (env: StudioEnv) => crypto.subtle.importKey('raw', new TextEncoder().encode(env.OWNER_ACCESS_TOKEN!), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
const hex = (value: ArrayBuffer) => Array.from(new Uint8Array(value), n => n.toString(16).padStart(2, '0')).join('')
const signingBytes = (value: string, userId?: string, library = false, held = false) => new TextEncoder().encode(`${library ? 'WORLDIFACT-STUDIO-LIBRARY-ARTIFACT-v1' : held ? 'WORLDIFACT-STUDIO-HELD-POINTS-RECEIPT-v1' : 'WORLDIFACT-STUDIO-RECEIPT-v1'}:${value}${userId ? `:account:${userId}` : ''}`)
async function receipt(env: StudioEnv, id: string, hash: string, userId?: string, pricing?: StudioPricing, library = false, held = false) {
  const issued = Date.now(), payload = `${id}.${issued}.${hash}`
  return { id, ticket: `${library ? 'library.' : held ? 'held.' : ''}${payload}.${hex(await crypto.subtle.sign('HMAC', await keyOf(env), signingBytes(payload, userId, library, held)))}`, createdAt: new Date(issued).toISOString(), ...(pricing ? { pricing } : {}) }
}
async function verifyReceipt(env: StudioEnv, token: string, id?: string, ownedHistory = false, userId?: string, allowLibrary = false) {
  const library = token.startsWith('library.'), held = token.startsWith('held.')
  if (library && (!allowLibrary || !userId)) throw new StudioError('Library receipts authorize saved artifact downloads only.', 401)
  const match = RECEIPT.exec(library ? token.slice('library.'.length) : held ? token.slice('held.'.length) : token)
  if (!secretReady(env) || !match || (id && match[1] !== id)) throw new StudioError('A valid receipt for this job is required.', 401)
  const issued = Number(match[2])
  if (issued > Date.now() + 30_000 || (!library && !ownedHistory && Date.now() - issued > 7 * 24 * 3600_000)) throw new StudioError('This job receipt expired. Keep your saved model.', 401)
  const signature = Uint8Array.from(match[4].match(/../g)!, byte => parseInt(byte, 16))
  const valid = await crypto.subtle.verify('HMAC', await keyOf(env), signature, signingBytes(`${match[1]}.${match[2]}.${match[3]}`, userId, library, held))
  if (!valid) throw new StudioError('The job receipt is not valid.', 401)
  if (library && Date.now() - issued >= LIBRARY_TOKEN_TTL_MS) throw new StudioLibraryReceiptExpiredError()
  return { id: match[1], issued, hash: match[3], library, held }
}
const cursorBytes = (value: string, userId: string) => new TextEncoder().encode(`WORLDIFACT-STUDIO-LIBRARY-CURSOR-v1:/api/studio/library:account:${userId}:${value}`)
async function libraryCursor(env: StudioEnv, userId: string, after: string) {
  const encoded = btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify({ after, issued: Date.now() })))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${encoded}.${hex(await crypto.subtle.sign('HMAC', await keyOf(env), cursorBytes(encoded, userId)))}`
}
async function verifyLibraryCursor(env: StudioEnv, userId: string, token: string) {
  const invalid = () => new StudioError('This account library page expired or is invalid. Refresh your library.', 400)
  if (token.length > 12_000) throw invalid()
  const match = /^([A-Za-z0-9_-]+)\.([a-f0-9]{64})$/.exec(token)
  if (!match) throw invalid()
  const signature = Uint8Array.from(match[2].match(/../g)!, byte => parseInt(byte, 16))
  if (!await crypto.subtle.verify('HMAC', await keyOf(env), signature, cursorBytes(match[1], userId))) throw invalid()
  try {
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(atob(match[1].replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0))))
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 2 ||
        typeof value.after !== 'string' || !value.after.startsWith('job:') || value.after.length > 2048 ||
        !Number.isSafeInteger(value.issued) || value.issued > Date.now() + 30_000 || Date.now() - value.issued >= LIBRARY_TOKEN_TTL_MS) throw invalid()
    return value.after as string
  } catch { throw invalid() }
}
async function publicLibraryModel(env: StudioEnv, userId: string, model: OwnedStudioLibraryModel): Promise<StudioLibraryModel> {
  return { id: model.id, prompt: model.prompt, createdAt: new Date(model.at).toISOString(), completedAt: new Date(model.completedAt).toISOString(),
    receipt: await receipt(env, model.id, model.fingerprint, userId, undefined, true), review: 'UNREVIEWED', downloadAllowed: model.downloadAllowed }
}
async function libraryReadLimit(env: StudioEnv, userId: string) {
  if (!env.ACCOUNT_LIMITER) throw new StudioError('The account library read limiter is unavailable.', 503)
  try {
    if (!(await env.ACCOUNT_LIMITER.limit({ key: `studio-library:${userId}` })).success)
      throw new StudioError('Please wait before reading more saved models.', 429)
  } catch (error) {
    if (error instanceof StudioError) throw error
    throw new StudioError('The account library read limiter is unavailable.', 503)
  }
}
const accountPolicy = (env: StudioEnv) => env.ENFORCE_ACCOUNT_ENTITLEMENTS === 'true'
async function accountIdentity(request: Request, env: StudioEnv, fetcher: typeof fetch) {
  if (!accountPolicy(env)) {
    if (hasTestAccountHeaders(request.headers)) throw new StudioError('Verified test account access is unavailable.', 403, 'ACCOUNT_ADMISSION_UNAVAILABLE')
    return null
  }
  const user = await getVerifiedAccount(request, env, fetcher)
  if (!user) throw new StudioError('Sign in with your shared WORLDIFACT / Cube Chess account to continue.', 401)
  if (hasTestAccountHeaders(request.headers) && !testAccountMatches(request.headers, user.id)) throw new StudioError('The signed-in account changed. Reopen the original account before continuing.', 403, 'ACCOUNT_ADMISSION_UNAVAILABLE')
  return user
}
async function boundDigest(digest: string, userId?: string) {
  // A prepared receipt cannot be submitted by another account, even before a
  // per-user ledger reservation exists. Keep legacy hashes only while disabled.
  return userId ? hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`WORLDIFACT-ACCOUNT-JOB-v1:${userId}:${digest}`))) : digest
}
const fundingDigest = async (digest: string, overnightTest = false) => overnightTest ? hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${OVERNIGHT_TEST_APPROVAL}:${digest}`))) : digest
const boundInputDigest = async (input: StudioInput, userId?: string, overnightTest = false) => boundDigest(await fundingDigest(await inputDigest(input), overnightTest), userId)
function prepareMetadata(input: StudioInput): StudioPrepareMetadata {
  const { photos, ...metadata } = input
  return { ...metadata, photoCount: photos.length }
}
function checkOvernightPreparation(env: StudioEnv, userId: string | undefined, input: StudioPrepareMetadata) {
  if (!userId || !accountPolicy(env) || !overnightTestAuthority(env, userId, Date.now())) throw new StudioError('The account-bound overnight test authority is unavailable or expired.', 403)
  if (studioNewJobPolicy(env.STUDIO_NEW_JOB_POLICY) !== HISTORICAL_STUDIO_POLICY || input.generationProfile !== undefined || input.budgetTier !== undefined || input.pricingRevision !== undefined || input.acceptedPoints !== undefined)
    throw new StudioError('Overnight detailed tests require the existing 175-cent STANDARD policy, without tier upgrades.', 409)
}
function repairedMccInputEligible(input: StudioPrepareMetadata): boolean {
  return input.worldId === 'enchanted-ai-shop' && input.photoCount === 0 &&
    input.generationProfile === undefined && input.budgetTier === undefined &&
    input.pricingRevision === undefined && input.acceptedPoints === undefined
}
async function checkRepairedMccPreparation(env: StudioEnv, user: Awaited<ReturnType<typeof accountIdentity>>, input: StudioPrepareMetadata, digest: string) {
  if (!user || !astraRepairedMccGrant(env.WORLDIFACT_ASTRA_REPAIRED_MCC_GRANT, user.id, env.ACCOUNT_LEDGER_MODE, Date.now(), user.emailVerified ? user.email : null)) return
  const fingerprint = await boundDigest(digest, user.id)
  const project = astraProjectBudget(env.WORLDIFACT_ASTRA_PROJECT_BUDGET, user.id, env.ACCOUNT_LEDGER_MODE, Date.now())
  if (project?.fingerprint === fingerprint && repairedMccInputEligible(input)) return
  // This optional check reads eligibility only. Ordinary funding and either
  // earlier allowance retain their existing input contract and never borrow
  // the separate, exact-draft approval.
  const status = await entitlementStatus(env, user.id, user)
  const onlyRepairedMcc = status.astraRepairedMccGrant?.available === true && status.studioAdmission.allowed &&
    !status.generationAdmission.astra.allowed && status.astraSupportOnce?.available !== true && status.astraSupplementalGrant?.available !== true
  if (!onlyRepairedMcc) return
  const approved = astraRepairedMccGrant(env.WORLDIFACT_ASTRA_REPAIRED_MCC_GRANT, user.id, env.ACCOUNT_LEDGER_MODE, Date.now(), user.emailVerified ? user.email : null)
  if (!approved || !repairedMccInputEligible(input) || approved.fingerprint !== fingerprint) {
    throw new StudioError('This one-time allowance is reserved for the approved MCC draft. Restore its exact description and settings. No points were reserved.', 409)
  }
}
async function checkProjectBudgetPreparation(env: StudioEnv, user: Awaited<ReturnType<typeof accountIdentity>>, input: StudioPrepareMetadata, digest: string) {
  if (!user || !astraProjectBudget(env.WORLDIFACT_ASTRA_PROJECT_BUDGET, user.id, env.ACCOUNT_LEDGER_MODE, Date.now())) return
  const status = await entitlementStatus(env, user.id, user)
  const projectOnly = status.astraProjectBudget?.available === true && status.studioAdmission.allowed &&
    !status.generationAdmission.astra.allowed && status.astraSupportOnce?.available !== true &&
    status.astraSupplementalGrant?.available !== true && status.astraRepairedMccGrant?.available !== true
  if (!projectOnly) return
  const fingerprint = await boundDigest(digest, user.id)
  const approved = astraProjectBudget(env.WORLDIFACT_ASTRA_PROJECT_BUDGET, user.id, env.ACCOUNT_LEDGER_MODE, Date.now())
  if (!approved || !repairedMccInputEligible(input) || approved.fingerprint !== fingerprint) {
    throw new StudioError('This project budget covers one approved MCC draft. Restore its exact description and settings. No points were reserved.', 409)
  }
}
async function accountAccess(env: StudioEnv, userId: string | undefined, id: string) {
  if (!userId) return null
  const access = await userJobAccess(env, userId, id)
  if (!access.owned) throw new StudioError('This model belongs to a different account or has no account receipt.', 403)
  return access
}
const outputChecks = new Map<string, Promise<'valid' | 'invalid'>>()
async function validateCompletedModel(env: StudioEnv, userId: string, id: string, fetcher: typeof fetch, qualityProfile: StudioQualityProfile = 'standard') {
  const key = `${userId}:${id}:${qualityProfile}`
  const existing = outputChecks.get(key)
  if (existing) return existing
  // Coalesce same-job polling. This is a byte/structure check, not perceptual QA.
  if (outputChecks.size >= 1) throw new StudioVerificationBusyError('Model verification is busy. Recover the same job; do not generate again.', 503)
  const check = (async (): Promise<'valid' | 'invalid'> => {
    let response: Response
    try { response = await modelOrExport(env, id, 'model', fetcher) }
    catch (e) { if (e instanceof InvalidStudioModelError) return 'invalid'; throw e }
    const bytes = await response.arrayBuffer() // Interrupted reads are uncertain, not an automatic refund.
    try {
      return passesStudioStructuralQuality(inspectGLB(bytes), qualityProfile) ? 'valid' : 'invalid'
    } catch { return 'invalid' }
  })()
  outputChecks.set(key, check)
  try { return await check } finally { if (outputChecks.get(key) === check) outputChecks.delete(key) }
}
type TimingObservation = { value?: StudioGenerationTiming }
async function accountJob(env: StudioEnv, userId: string | undefined, id: string, state: StudioJob['state'], fetcher: typeof fetch = fetch, failureCode?: StudioJob['failureCode'], timingObservation?: TimingObservation): Promise<StudioJob> {
  if (!userId) return { id, state, detail: JOB_DETAILS[state] }
  const previous = await accountAccess(env, userId, id)
  // Customer incident compensation is final and independent of the preserved
  // provider liability. Reading this failed job must not reopen either ledger.
  if (previous?.owned && previous.state === 'failed' && isManualPointClosure(previous.pointSettlement)) return {
    id, state: 'failed', detail: manualPointClosureDetail(previous.pointSettlement), pointSettlement: previous.pointSettlement,
    ...(previous.failureCode ? { failureCode: previous.failureCode } : {}), ...(previous.pricing ? { pricing: previous.pricing } : {}),
    downloadAllowed: false, previewOnly: false, previewAvailable: false,
  }
  if (previous?.state === 'failed' && !(previous.pointSettlement?.state === 'pending-cost' && state === 'succeeded')) { state = 'failed'; failureCode = previous.failureCode }
  if (previous?.state === 'completed') { state = 'succeeded'; failureCode = undefined }
  if (previous?.state === 'reserved' && previous.at && Date.now() - previous.at > STUDIO_JOB_WATCHDOG_MS && !['succeeded','failed','cancelled'].includes(state)) {
    state = 'failed'
    failureCode = 'STUDIO_TIMEOUT'
  }
  if (state === 'succeeded' && (previous?.state === 'reserved' || previous?.pointSettlement?.state === 'pending-cost')) {
    try {
      if (await validateCompletedModel(env, userId, id, fetcher, previous.qualityProfile ?? 'standard') !== 'valid') { state = 'failed'; failureCode = 'INVALID_MODEL_OUTPUT' }
    } catch (error) {
      if (error instanceof StudioVerificationBusyError || !previous.at || Date.now() - previous.at <= STUDIO_JOB_WATCHDOG_MS) throw error
      // A success label without recoverable, verified model bytes cannot keep
      // the customer's hold indefinitely either. Do not claim Oracle cancelled.
      state = 'failed'; failureCode = 'STUDIO_TIMEOUT'
    }
  }
  if (state === 'succeeded') await settleUserGeneration(env, userId, id, 'completed', undefined, previous?.pointSettlement?.state === 'pending-cost')
  if (state === 'failed' || state === 'cancelled') {
    const settlement = await settleUserGeneration(env, userId, id, 'failed', failureCode)
    if (!settlement.settled) { state = 'pending'; failureCode = undefined }
  }
  let access = await accountAccess(env, userId, id)
  // A concurrent poll may have won settlement. Report its durable result,
  // never an uncommitted failure or a refund for a previously completed job.
  if (access?.state === 'failed') { state = 'failed'; failureCode = access.failureCode }
  if (access?.state === 'completed') { state = 'succeeded'; failureCode = undefined }
  if (access?.providerBudgetPending === true && !isManualPointClosure(access.pointSettlement)) {
    await reconcileProviderReservation(env, userId, id, fetcher)
    access = await accountAccess(env, userId, id)
  }
  // Reconciliation may race a separately verified late completion. Re-read
  // generation state together with its financial state before reporting either.
  if (access?.state === 'failed') { state = 'failed'; failureCode = access.failureCode }
  if (access?.state === 'completed') { state = 'succeeded'; failureCode = undefined }
  // A provider success label is insufficient: completion is emitted only after
  // the existing GLB gate and durable account settlement agree. Recovered
  // terminal results are observations, not proof of a new provider dispatch.
  if (access?.state === 'completed' || access?.state === 'failed') {
    const completed = access.state === 'completed'
    const reason = completed ? 'MODEL_COMPLETED' : failureCode && STUDIO_FAILURE_CODES.includes(failureCode) ? failureCode : 'MODEL_FAILED'
    logStudioDiagnostic({ requestId: id, stage: completed ? 'COMPLETED' : 'FAILED', admission: 'RECOVERY_ONLY', reason, oracleDispatch: 'UNKNOWN', workerStatus: null })
  }
  const detail = isManualPointClosure(access?.pointSettlement) ? manualPointClosureDetail(access?.pointSettlement) : access?.pointSettlement?.state === 'pending-cost' ? POINT_COST_PENDING_DETAIL : failureCode ? STUDIO_FAILURE_DETAILS[failureCode] : JOB_DETAILS[state]
  const generationTiming = access?.owned && !isManualPointClosure(access.pointSettlement) && ['completed', 'failed'].includes(access.state!)
    ? timingObservation ? timingObservation.value : await oracleGenerationTiming(env, id, fetcher) : undefined
  return { id, state, detail, ...(access?.pointSettlement ? { pointSettlement: access.pointSettlement } : {}), ...(failureCode ? { failureCode } : {}), downloadAllowed: access!.downloadAllowed,
    ...(generationTiming ? { generationTiming } : {}),
    previewOnly: access!.previewOnly, previewAvailable: access!.downloadAllowed, ...(access?.pricing ? { pricing: access.pricing } : {}) }
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
async function inputFrom(request: Request, overnightTest = false) {
  const raw = await limitedJson(request, STUDIO_BODY_LIMIT)
  const value = overnightTest ? readTestInputEnvelope(raw, request.headers) : raw
  if (!value) throw new StudioError('Refresh the test page to verify its account contract. Nothing was submitted.', 409, 'ACCOUNT_ADMISSION_UNAVAILABLE')
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
async function oracle(env: StudioEnv, path: string, fetcher: typeof fetch, init: RequestInit = {}, timeoutMs?: number) {
  const origin = oracleOrigin(env.ORACLE_ENDPOINT)
  if (!origin || !env.ORACLE_API_TOKEN) throw new StudioError('The existing Oracle connection is not configured.', 503)
  return fetcher(origin + path, { ...init, redirect: 'manual', signal: AbortSignal.timeout(timeoutMs ?? (path.endsWith('/budget') ? 5000 : path.includes('/model') || path.includes('/exports/') ? 180_000 : STUDIO_ORACLE_TIMEOUT_MS)),
    headers: { Authorization: `Bearer ${env.ORACLE_API_TOKEN}`, Accept: path.includes('/model') ? 'model/gltf-binary' : path.includes('/exports/') ? 'application/octet-stream, application/zip' : 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}) } })
}
function qualityGenerationTiming(quality: Record<string, unknown>): StudioGenerationTiming | undefined {
  if (quality.revision !== 6 || typeof quality.state !== 'string' || !['succeeded', 'failed', 'cancelled'].includes(quality.state) ||
      !quality.timing || typeof quality.timing !== 'object' || Array.isArray(quality.timing)) return undefined
  return readStudioGenerationTiming({ source: 'oracle-worker', durationSeconds: (quality.timing as Record<string, unknown>).total_seconds })
}
/** Optional read-only metadata for an already-owned terminal job. Never infer
 * runtime from receipt/ledger dates or let unavailable timing hide its outcome.
 * Oracle writes timing after terminal status; a missing record stays unknown
 * until a later explicit recovery/read, without an immediate retry. */
async function oracleGenerationTiming(env: StudioEnv, id: string, fetcher: typeof fetch): Promise<StudioGenerationTiming | undefined> {
  try {
    const response = await oracle(env, `/v1/jobs/${id}/quality`, fetcher, {}, 5000)
    if (!response.ok) { await response.body?.cancel(); return undefined }
    return qualityGenerationTiming(await limitedJson(response, 262_144))
  } catch { return undefined }
}
/** Only an authenticated, immutable terminal upper-liability receipt can return
 * unused provider funding. A failure label or missing ledger never means zero.
 * Older Oracle installations stay compatible: unavailable evidence leaves the
 * reservation intact and must not hide an already settled model outcome. */
async function reconcileProviderReservation(env: StudioEnv, userId: string, id: string, fetcher: typeof fetch) {
  try {
    const response = await oracle(env, `/v1/jobs/${id}/budget`, fetcher)
    if (!response.ok) { await response.body?.cancel(); return false }
    const value = await limitedJson(response, 4096)
    if (!validateTerminalBudgetReceipt(value, id)) return false
    const result = await reconcileUserStudioProvider(env, userId, id, value)
    return result.reconciled === true
  } catch {
    // Transport, schema and atomic-write failures preserve the existing debit.
    // Recovery of this same receipt can try again; no generation is requested.
    return false
  }
}
function oracleFailureCode(value: Record<string, unknown>): StudioJob['failureCode'] {
  if (value.state === 'cancelled') return 'ORACLE_CANCELLED'
  if (value.state !== 'failed') return undefined
  if (value.worldifactFailureCode === 'ORACLE_JOB_INCOMPLETE' || value.worldifactFailureCode === 'INVALID_MODEL_OUTPUT' || value.worldifactFailureCode === 'ASTRA_COST_LIMIT' || value.worldifactFailureCode === 'MODEL_BUDGET_EXCEEDED') return value.worldifactFailureCode
  return typeof value.detail === 'string' && /astra budget guard|WORLDIFACT_ASTRA_COST_GUARD|astra job budget exhausted/i.test(value.detail)
    ? 'ASTRA_COST_LIMIT' : 'ORACLE_JOB_FAILED'
}
async function submissionFailureCode(response: Response): Promise<NonNullable<StudioJob['failureCode']>> {
  if (response.status === 429) { await response.body?.cancel(); return 'RATE_LIMITED' }
  // Exact reviewed /v1/jobs errors only. Unknown or private provider text is
  // never persisted, returned, or guessed to mean that all 409s are "busy".
  let value: Record<string, unknown> | undefined
  try { value = await limitedJson(response, 4096) } catch { await response.body?.cancel().catch(() => {}) }
  if (response.status === 409 && typeof value?.error === 'string') {
    if (value.error === 'Serwer wykonuje poprzedni model. Poczekaj na wynik lub anuluj tamto zlecenie.') return 'ORACLE_BUSY'
    if (value.error === 'Na serwerze zostalo mniej niz 2 GB wolnego miejsca.') return 'STORAGE_FULL'
    if (value.error === 'Osiagnieto limit 300 zlecen. Zarchiwizuj modele na serwerze przed dalsza praca.') return 'JOB_CAPACITY'
  }
  return 'ORACLE_SUBMISSION_REJECTED'
}
/** Oracle v33 preserves unfinished candidates under state=succeeded. A retained
 * draft is useful diagnostic evidence, never proof of a completed paid model. */
async function completedOracleStatus(env: StudioEnv, id: string, value: Record<string, unknown>, fetcher: typeof fetch): Promise<Record<string, unknown> & { timingObservation?: TimingObservation }> {
  if (value.state !== 'succeeded' || value.modelStatus !== 'draft') return { ...value, timingObservation: undefined }
  const response = await oracle(env, `/v1/jobs/${id}/quality`, fetcher)
  if (!response.ok) { await response.body?.cancel(); throw new StudioError('The worker completion evidence is temporarily unavailable. Recover this same job.', 502) }
  const quality = await limitedJson(response, 262_144)
  if (quality.revision !== 6 || quality.state !== 'succeeded' || quality.hasModel !== true || quality.modelStatus !== 'draft' || quality.automaticQualityAccepted !== false)
    throw new StudioError('The worker completion evidence is inconsistent. Recover this same job.', 502)
  const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
  const usage = record(quality.agentUsage) ? quality.agentUsage : {}
  const agent = record(quality.agent) ? quality.agent : {}
  // Only a fixed allowlisted code crosses this boundary. No raw provider/tool
  // diagnostics, original brief, generated scripts or images are retained.
  // A deliberately finished unreviewed model keeps the existing structural
  // acceptance path. Only an execution that never finished is rejected here.
  const timingObservation = { value: qualityGenerationTiming(quality) }
  if (agent.finished === true) return { ...value, timingObservation }
  const failureCode: StudioJob['failureCode'] = value.worldifactFailureCode === 'MODEL_BUDGET_EXCEEDED' ? 'MODEL_BUDGET_EXCEEDED' : usage.error_code === 'WORLDIFACT_ASTRA_COST_GUARD' ? 'ASTRA_COST_LIMIT' : 'ORACLE_JOB_INCOMPLETE'
  return { ...value, state: 'failed', worldifactFailureCode: failureCode, timingObservation }
}
async function oracleJobStatus(env: StudioEnv, id: string, fetcher: typeof fetch, requireId: boolean) {
  const response = await oracle(env, `/v1/jobs/${id}`, fetcher)
  if (response.status === 404) { await response.body?.cancel(); return null }
  if (!response.ok) { await response.body?.cancel(); throw new StudioError('Status temporarily unavailable. Keep the same job.', response.status === 429 ? 429 : 502) }
  const value = await limitedJson(response, 16_384)
  if (((requireId || value.id !== undefined) && value.id !== id) || !Object.hasOwn(JOB_DETAILS, String(value.state)))
    throw new StudioError('The worker returned an invalid job status.', 502)
  return completedOracleStatus(env, id, value, fetcher)
}
async function health(env: StudioEnv, fetcher: typeof fetch) {
  const response = await oracle(env, '/v1/health', fetcher)
  if (!response.ok) { await response.body?.cancel(); throw new StudioError('The existing worker did not confirm readiness.', 503) }
  const state = await limitedJson(response, 16_384)
  const compatible = state.ready === true && state.provider === 'openai' && state.model === 'gpt-6-astra' && Number.isSafeInteger(state.connectorVersion) && Number(state.connectorVersion) >= 33
  const fastReady = compatible && supportsFastDraft(state)
  return { ...detailedRuntime(state), ready: compatible, photoReady: compatible && state.photoInput === true, fastReady,
    // Read-only evidence of the exact reviewed no-AI export helper. Unknown or
    // newer revisions require review; this does not invoke or enable exports.
    exportPreparationReady: compatible && state.posthocExportRevision === 2 && state.legacyGlbExportRecoveryRevision === 1,
    fastBudgetReady: fastReady && state.fastBudgetRevision === 'fast-usd4-v1' && state.fastBudgetMaxUsd === 4,
    promptMaxLength: state.promptMaxLength === 5000 ? 5000 : 2000 }
}
async function preflight(request: Request, env: StudioEnv, fetcher: typeof fetch, input: StudioPrepareMetadata, userId?: string) {
  if (input.generationProfile === FAST_DRAFT_PROFILE) throw new StudioError('FAST uses the separate GPT-6.1 Sol blueprint path. The Astra Oracle worker will not accept FAST jobs.', 409)
  const pool = await allowance(env)
  const trial = pool.fastOnly && env.ENABLE_APPROVED_FAST_TEST === 'true'
  if (!trial && (env.ENABLE_STUDIO_JOBS !== 'true' || !budgetSettings(env))) throw new StudioError('Model generation is disabled or its allowance has expired.', 503)
  if (trial) {
    if (input.generationProfile !== FAST_DRAFT_PROFILE) throw new StudioError('The approved extra attempt is FAST only. Select FAST DRAFT; no request was charged.', 409)
    if (!await ownerAuthorized(request, env.OWNER_ACCESS_TOKEN!))
      await verifyReceipt(env, request.headers.get('X-WORLDIFACT-Previous-Job') || '', undefined, false, userId)
  } else if (env.PUBLIC_PILOT !== 'true' && !await ownerAuthorized(request, env.OWNER_ACCESS_TOKEN!)) throw new StudioError('This generation window requires owner access.', 401)
  const policy = studioNewJobPolicy(env.STUDIO_NEW_JOB_POLICY)
  if (!policy) throw new StudioError('New model requests are awaiting a verified budget policy. Existing jobs can still be recovered.', 503)
  if (policy === HISTORICAL_STUDIO_POLICY && input.budgetTier !== undefined)
    throw new StudioError(STUDIO_FAILURE_DETAILS.STUDIO_BUDGET_POLICY_CHANGED, 409, 'STUDIO_BUDGET_POLICY_CHANGED')
  const current = await health(env, fetcher)
  if (!current.ready) throw new StudioError('The existing Astra/Blender worker is not ready.', 503)
  if (accountPolicy(env) && !current.costGuardReady) throw new StudioError('The detailed worker did not confirm the current Astra cost guard. No points were reserved.', 503)
  if (accountPolicy(env) && !current.outputPolicyReady) throw new StudioError('The detailed worker requires the reviewed Astra output policy. No points were reserved.', 503)
  if (input.budgetTier !== undefined && (!userId || !accountPolicy(env) || !current.tiersReady)) throw new StudioError('The worker has not confirmed the selected Studio price and cost ceiling. Refresh availability; no points were reserved.', 503)
  if (trial && !current.fastBudgetReady) throw new StudioError('The approved cost guard is not confirmed. No paid request was sent.', 503)
  if (input.generationProfile === FAST_DRAFT_PROFILE && (!current.fastReady || !current.fastBudgetReady)) throw new StudioError('FAST DRAFT is not fully verified on the worker. No paid job was submitted; STANDARD remains available.', 409)
  if (input.photoCount && !current.photoReady) throw new StudioError('This worker has not confirmed photo input. Nothing was submitted.', 409)
  if (oracleStudioPayload('', { ...input, photos: [] }).prompt.length > current.promptMaxLength) throw new StudioError(`Shorten the description: the worker accepts ${current.promptMaxLength} characters including export instructions.`)
  return { ...current, trial }
}
async function modelOrExport(env: StudioEnv, id: string, format: string, fetcher: typeof fetch) {
  const model = format === 'model'
  const profile = model ? { name: 'model.glb', type: 'model/gltf-binary', limit: STUDIO_MODEL_LIMIT } : EXPORTS[format]
  if (!profile) throw new StudioError('Unsupported export format.', 404)
  const response = await oracle(env, model ? `/v1/jobs/${id}/model` : `/v1/jobs/${id}/exports/${format}`, fetcher)
  if (!response.ok) { await response.body?.cancel(); throw new StudioError('This model/export is not available on the worker yet.', [404, 409, 429].includes(response.status) ? response.status : 502) }
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
    if (header.getUint32(0, true) !== 0x46546c67 || header.getUint32(4, true) !== 2 || header.getUint32(8, true) !== size) { await reader.cancel(); throw new InvalidStudioModelError('The worker returned an invalid GLB container.', 502) }
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
export async function studioApi(request: Request, env: StudioEnv, fetcher: typeof fetch = fetch, overnightTest = false): Promise<Response> {
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
      const policy = studioNewJobPolicy(env.STUDIO_NEW_JOB_POLICY)
      const reason = !enabled ? env.ENABLE_APPROVED_FAST_TEST === 'true' ? 'APPROVED_TEST_PENDING_ACTIVATION' : 'DISABLED_OR_EXPIRED' : !policy ? 'STUDIO_POLICY_UNAVAILABLE' : !secretReady(env) ? 'RECEIPT_SECRET_MISSING' : !pool ? 'ALLOWANCE_UNAVAILABLE' : (!pool.unlimited && pool.remaining === 0) ? 'ALLOWANCE_EXHAUSTED' : !state?.ready ? 'ORACLE_NOT_READY' : accountPolicy(env) && !state.costGuardReady ? 'ASTRA_COST_GUARD_REQUIRED' : accountPolicy(env) && !state.outputPolicyReady ? 'ASTRA_OUTPUT_POLICY_REQUIRED' : trial && !state.fastBudgetReady ? 'APPROVED_TEST_PENDING_ACTIVATION' : !authorized ? 'OWNER_ACCESS_REQUIRED' : 'READY'
      return json({ detailedReady: reason === 'READY' && state?.costGuardReady === true && state?.outputPolicyReady === true, detailedReferenceLimit: DETAILED_REFERENCE_LIMIT, costGuardReady: state?.costGuardReady === true, outputPolicyReady: state?.outputPolicyReady === true, accountRequired: accountPolicy(env), ready: reason === 'READY', publicPilot: env.PUBLIC_PILOT === 'true', reason, oracle: state?.ready ? 'CONNECTOR_READY' : 'NOT_VERIFIED_READY',
        photoReady: state?.photoReady === true, fastReady: state?.fastReady === true, fastBudgetReady: state?.fastBudgetReady === true,
        exportPreparationReady: state?.exportPreparationReady === true,
        newJobPolicy: policy,
        tiersReady: policy === 'tiered-v1' && reason === 'READY' && accountPolicy(env) && state?.tiersReady === true,
        ...(policy === 'tiered-v1' && reason === 'READY' && accountPolicy(env) && state?.tiersReady ? { pricingRevision: state.pricingRevision } : {}),
        fastOnly: trial, promptMaxLength: Math.min(4000, Math.max(3, (state?.promptMaxLength ?? 2000) - oracleStudioPayload('', { worldId: 'enchanted-ai-shop', prompt: '', purpose: 'figurine', textureMaxSize: 4096, photos: [] }).prompt.length)), allowance: pool })
    }
    if (!secretReady(env)) throw new StudioError('The job receipt service is not configured.', 503)
    if (url.pathname === '/api/studio/library' || url.pathname.startsWith('/api/studio/library/')) {
      if (request.method !== 'GET') throw new StudioError('Use GET to read your model library.', 405)
      if (request.headers.get('Sec-Fetch-Site') === 'cross-site' || request.headers.get('Origin') && request.headers.get('Origin') !== url.origin)
        throw new StudioError('Same-origin request required.', 403)
      const user = await accountIdentity(request, env, fetcher)
      if (!user) throw new StudioError('Sign in to read your saved cloud models.', 401)
      await libraryReadLimit(env, user.id)
      if (url.pathname !== '/api/studio/library') {
        const id = url.pathname.slice('/api/studio/library/'.length)
        if (!new RegExp(`^${UUID}$`).test(id) || url.search) throw new StudioError('Invalid saved model request.', 400)
        const { model } = await userStudioLibraryModel(env, user.id, id)
        if (!model) throw new StudioError('This saved model is not available in your account library.', 404)
        const generationTiming = await oracleGenerationTiming(env, id, fetcher)
        return json({ accountId: user.id, model: { ...await publicLibraryModel(env, user.id, model), ...(generationTiming ? { generationTiming } : {}) } })
      }
      if ([...url.searchParams.keys()].some(key => key !== 'cursor') || url.searchParams.getAll('cursor').length > 1)
        throw new StudioError('Invalid account library request.', 400)
      const after = url.searchParams.has('cursor') ? await verifyLibraryCursor(env, user.id, url.searchParams.get('cursor')!) : null
      const page = await userStudioLibrary(env, user.id, after)
      return json({ accountId: user.id, models: await Promise.all(page.models.map(model => publicLibraryModel(env, user.id, model))),
        nextCursor: page.hasMore && page.nextCursor ? await libraryCursor(env, user.id, page.nextCursor) : null, hasMore: page.hasMore } satisfies StudioLibraryPage)
    }
    if (url.pathname === '/api/studio/reconcile-budget' && request.method === 'POST') {
      await limit(request, env, 'reconcile-budget')
      const user = await accountIdentity(request, env, fetcher)
      if (!user) throw new StudioError('Sign in to check your account funding.', 401)
      const value = await limitedJson(request, 256)
      if (Object.keys(value).some(key => key !== 'cursor') ||
          value.cursor !== undefined && value.cursor !== null && (typeof value.cursor !== 'string' || !new RegExp(`^${UUID}$`, 'i').test(value.cursor)))
        throw new StudioError('Invalid account history cursor.', 400)
      const page = await pendingUserStudioProvider(env, user.id, typeof value.cursor === 'string' ? value.cursor : null)
      // Receipt reads are bounded and independent. A missing/uncertain receipt
      // retains its original debit; another verified receipt may still settle.
      const results = await Promise.all([
        ...page.ids.map(id => reconcileProviderReservation(env, user.id, id, fetcher)),
        ...page.blueprintIds.map(id => reconcileUserBlueprintProvider(env, user.id, id).then(value => value.reconciled === true).catch(() => false)),
      ])
      const checked = page.ids.length + page.blueprintIds.length, reconciled = results.filter(Boolean).length
      return json({ checked, reconciled, unresolved: checked - reconciled,
        nextCursor: page.nextCursor, hasMore: page.hasMore, paidGenerationRequested: false })
    }
    if (url.pathname === '/api/studio/current' && request.method === 'GET') {
      await limit(request, env, 'current')
      const user = await accountIdentity(request, env, fetcher)
      if (!user) throw new StudioError('Sign in to recover your cloud model.', 401)
      const expectedAccount = hasTestAccountHeaders(request.headers)
      if ([...url.searchParams.keys()].some(key => key !== 'job') || url.searchParams.getAll('job').length > 1 ||
          url.searchParams.has('job') && !new RegExp(`^${UUID}$`).test(url.searchParams.get('job')!)) throw new StudioError('Invalid owned request selection.', 400)
      const selectedJob = url.searchParams.get('job') ?? undefined
      const current = await currentUserStudioJob(env, user.id, selectedJob)
      if (selectedJob && !current.job) throw new StudioError('This held request is not available in your account.', 404)
      if (!current.job) return json({ current: null, ...(expectedAccount ? { accountContract: TEST_ACCOUNT_CONTRACT } : {}) })
      if (!expectedAccount && current.job.fundingSource !== 'ordinary' && current.job.fundingSource !== PAID_POINTS_FUNDING) throw new StudioError('This current request uses separate or unverified funding. Recover its original signed receipt or refresh the approved test controls.', 409, 'ACCOUNT_ADMISSION_UNAVAILABLE')
      const generationTiming = !selectedJob && !isManualPointClosure(current.job.pointSettlement) && ['completed', 'failed'].includes(current.job.state) ? await oracleGenerationTiming(env, current.job.id, fetcher) : undefined
      const freshReceipt = await receipt(env, current.job.id, current.job.fingerprint, user.id, current.job.pricing, false, current.job.fundingSource === PAID_POINTS_FUNDING)
      return json({ ...(expectedAccount ? { accountContract: TEST_ACCOUNT_CONTRACT } : {}), current: {
        receipt: freshReceipt,
        fundingSource: current.job.fundingSource ?? 'unknown',
        prompt: current.job.prompt,
        startedAt: new Date(current.job.at).toISOString(),
        financialState: current.job.state,
        reservedPoints: current.job.held ? current.job.cost : 0,
        ...(current.job.pointSettlement ? { pointSettlement: current.job.pointSettlement } : {}),
        ...(generationTiming ? { generationTiming } : {}),
        ...(current.job.pricing ? { pricing: current.job.pricing } : {}),
        ...(current.job.failureCode ? { failureCode: current.job.failureCode } : {}),
      } })
    }
    if (url.pathname === '/api/studio/current' && request.method === 'DELETE') {
      const user = await accountIdentity(request, env, fetcher)
      if (!user) throw new StudioError('Sign in to dismiss your cloud model.', 401)
      const value = await limitedJson(request, 1024)
      if (typeof value.id !== 'string' || !new RegExp(`^${UUID}$`).test(value.id)) throw new StudioError('Invalid cloud job.', 400)
      return json(await clearCurrentUserStudioJob(env, user.id, value.id))
    }
    if (url.pathname === '/api/studio/prepare' && request.method === 'POST') {
      await limit(request, env, 'prepare')
      const user = await accountIdentity(request, env, fetcher)
      const raw = await limitedJson(request, STUDIO_BODY_LIMIT)
      const value = overnightTest ? readTestInputEnvelope(raw, request.headers) : raw
      if (!value) throw new StudioError('Refresh the test page to verify its account contract. No job was prepared.', 409, 'ACCOUNT_ADMISSION_UNAVAILABLE')
      let metadata: StudioPrepareMetadata, digest: string
      try {
        if (Object.hasOwn(value, 'version')) {
          const manifest = validateStudioPrepareManifest(value)
          metadata = manifest; digest = manifest.inputDigest
        } else {
          // Older clients retain their exact canonical receipt contract.
          const input = validateStudioInput(value)
          metadata = prepareMetadata(input); digest = await inputDigest(input)
        }
      } catch (e) { throw new StudioError(e instanceof Error ? e.message : 'Invalid preparation manifest.', 400) }
      if (overnightTest) checkOvernightPreparation(env, user?.id, metadata)
      else {
        await checkRepairedMccPreparation(env, user, metadata, digest)
        await checkProjectBudgetPreparation(env, user, metadata, digest)
      }
      await preflight(request, env, fetcher, metadata, user?.id)
      const pool = await allowance(env)
      if (!pool.unlimited && pool.remaining === 0) throw new StudioError('The cumulative allowance is exhausted. No job was started.', 429)
      const heldReceipt = !overnightTest && !!user && request.headers.get(PAID_POINTS_POLICY_HEADER) === PAID_POINTS_POLICY &&
        (await entitlementStatus(env, user.id)).paidGenerationPolicy === PAID_POINTS_POLICY
      const prepared = await receipt(env, crypto.randomUUID(), await boundDigest(await fundingDigest(digest, overnightTest), user?.id), user?.id, metadata.budgetTier === undefined ? undefined : studioPricingFor(metadata), false, heldReceipt)
      logStudioDiagnostic({ requestId: prepared.id, stage: 'PREPARATION', admission: 'PREPARED', reason: 'PREFLIGHT_ACCEPTED', oracleDispatch: 'NOT_ATTEMPTED', workerStatus: null })
      return json(prepared)
    }
    if (url.pathname === '/api/studio/jobs' && request.method === 'POST') {
      await limit(request, env, 'submit')
      const user = await accountIdentity(request, env, fetcher)
      const auth = await verifyReceipt(env, request.headers.get('X-WORLDIFACT-Job') || '', undefined, !!user, user?.id)
      const idempotencyKey = request.headers.get('X-WORLDIFACT-Idempotency-Key')
      if (idempotencyKey && idempotencyKey !== auth.id) throw new StudioError('The generation idempotency key does not match this signed job. No new charge was made.', 409)
      const input = await inputFrom(request, overnightTest)
      if (await boundInputDigest(input, user?.id, overnightTest) !== auth.hash) throw new StudioError('Inputs changed after this receipt was prepared. Nothing was submitted.', 409)
      logStudioDiagnostic({ requestId: auth.id, stage: 'RECEIVED', admission: 'PREPARED', reason: 'INPUT_VALIDATED', oracleDispatch: 'NOT_ATTEMPTED', workerStatus: null })
      if (overnightTest) checkOvernightPreparation(env, user?.id, prepareMetadata(input))
      const pricing = input.budgetTier === undefined ? undefined : studioPricingFor(input)
      // Previously admitted work retains its exact signed input and price even
      // after a quote expires or the worker enters maintenance. Recovery must
      // never create a new provider request or reserve customer points again.
      if (user && pricing) {
        const existing = await userJobAccess(env, user.id, auth.id)
        if (existing.owned) {
          if (existing.fingerprint !== auth.hash || existing.pricing?.revision !== pricing.revision || existing.pricing.tier !== pricing.tier || existing.pricing.points !== pricing.points || existing.pricing.maxProviderCents !== pricing.maxProviderCents)
            throw new StudioError('This job belongs to a different input or price. Recover its original receipt.', 409)
          return json({ job: await accountJob(env, user.id, auth.id, existing.state === 'failed' ? 'failed' : existing.state === 'completed' ? 'succeeded' : 'pending', fetcher), recoveryOnly: true }, 202)
        }
      }
      if (Date.now() - auth.issued > (pricing ? 5 : 30) * 60_000) throw new StudioError('This unsubmitted receipt expired. Review your inputs and current price before preparing another.', 409)
      const checked = await preflight(request, env, fetcher, prepareMetadata(input), user?.id)
      let admittedPointSettlement: PointSettlement | undefined
      if (user) {
        const userReservation = await reserveUserGeneration(env, user.id, auth.id, input.generationProfile === FAST_DRAFT_PROFILE ? 'fast' : 'slow', undefined, auth.hash, studioQualityProfile(input), { paidPointsPolicy: auth.held ? request.headers.get(PAID_POINTS_POLICY_HEADER) : undefined, ...(auth.held ? { requiredFundingMode: PAID_POINTS_FUNDING } : {}), channel: 'studio', prompt: input.prompt, supportIdentity: user, ...(overnightTest ? { overnightTest: true } : { repairedMccInputEligible: repairedMccInputEligible(prepareMetadata(input)), projectBudgetInputEligible: repairedMccInputEligible(prepareMetadata(input)) }), ...(pricing ? { pricing } : {}) })
        admittedPointSettlement = userReservation.pointSettlement
        if (userReservation.repeated && userReservation.state === 'failed') return json({ job: await accountJob(env, user.id, auth.id, 'failed', fetcher), recoveryOnly: true }, 202)
        if (!userReservation.allowed) {
          const conflict = ['REQUEST_PAYLOAD_MISMATCH', 'JOB_MODEL_MISMATCH', 'JOB_QUALITY_PROFILE_MISMATCH', 'JOB_CHANNEL_MISMATCH', 'JOB_PROFILE_MISMATCH'].includes(userReservation.reason ?? '')
          const reason: AdmissionFailureCode = isAdmissionFailureCode(userReservation.reason) ? userReservation.reason : conflict ? 'ACCOUNT_REQUEST_CONFLICT' : 'ACCOUNT_ADMISSION_UNAVAILABLE'
          logStudioDiagnostic({ requestId: auth.id, stage: 'FAILED', admission: 'REFUSED', reason, oracleDispatch: 'NOT_ATTEMPTED', workerStatus: null })
          throw new StudioError(ADMISSION_FAILURE_DETAILS[reason], 429, reason)
        }
        if (userReservation.repeated) {
          logStudioDiagnostic({ requestId: auth.id, stage: 'ADMISSION', admission: 'RECOVERY_ONLY', reason: 'EXISTING_ACCOUNT_RESERVATION', oracleDispatch: 'NOT_ATTEMPTED', workerStatus: null })
          return json({ job: await accountJob(env, user.id, auth.id, 'pending', fetcher), recoveryOnly: true }, 202)
        }
      }
      // Keep the operator budget independent from customer credits. A rejected
      // global reservation cannot create an Oracle job and releases customer credit.
      let reserved: Response
      try {
        reserved = await budget(env).fetch(new Request('https://budget.internal/reserve-studio', { method: 'POST', body: JSON.stringify({ id: auth.id, ...(checked.trial ? { profile: FAST_DRAFT_PROFILE } : {}) }), signal: AbortSignal.timeout(5000) }))
        if (reserved.status === 409) return json({ job: await accountJob(env, user?.id, auth.id, 'pending', fetcher), recoveryOnly: true }, 202)
        if (!reserved.ok || (await reserved.json() as { allowed?: boolean }).allowed !== true) throw new StudioError('The cumulative allowance is exhausted or unavailable. No new job was submitted.', reserved.status === 429 ? 429 : 503)
      } catch (error) {
        if (user) await settleUserGeneration(env, user.id, auth.id, 'failed', 'STUDIO_ALLOWANCE_UNAVAILABLE')
        logStudioDiagnostic({ requestId: auth.id, stage: 'FAILED', admission: 'REFUSED', reason: 'STUDIO_ALLOWANCE_UNAVAILABLE', oracleDispatch: 'NOT_ATTEMPTED', workerStatus: null })
        throw new StudioError(STUDIO_FAILURE_DETAILS.STUDIO_ALLOWANCE_UNAVAILABLE, error instanceof StudioError ? error.status : 503, 'STUDIO_ALLOWANCE_UNAVAILABLE')
      }
      logStudioDiagnostic({ requestId: auth.id, stage: 'ADMITTED', admission: 'ADMITTED', reason: 'ACCOUNT_AND_BUDGET_RESERVED', oracleDispatch: 'NOT_ATTEMPTED', workerStatus: null })
      try {
        const payload = JSON.stringify(oracleStudioPayload(auth.id, input))
        // A poll may have closed the account reservation while the global
        // budget call was pending. Claim exactly once before any Oracle POST.
        if (user) {
          const claim = await markStudioDispatch(env, user.id, auth.id, auth.hash)
          // No await between this expiry check and the actual Oracle fetch.
          if (!claim.dispatch || Date.now() >= claim.deadline) {
            logStudioDiagnostic({ requestId: auth.id, stage: 'ORACLE_DISPATCH', admission: 'RECOVERY_ONLY', reason: 'DISPATCH_FENCE_REFUSED', oracleDispatch: 'CLAIM_REFUSED', workerStatus: null })
            return json({ job: await accountJob(env, user.id, auth.id, 'pending', fetcher), recoveryOnly: true }, 202)
          }
        }
        logStudioDiagnostic({ requestId: auth.id, stage: 'SENT_TO_PROVIDER', admission: 'ADMITTED', reason: 'ACCOUNT_AND_BUDGET_RESERVED', oracleDispatch: 'CLAIMED', workerStatus: null })
        let response: Response
        try {
          response = await oracle(env, '/v1/jobs', fetcher, { method: 'POST', body: payload })
        } catch (error) {
          logStudioDiagnostic({ requestId: auth.id, stage: 'ORACLE_DISPATCH', admission: 'ADMITTED', reason: 'ORACLE_NO_RESPONSE', oracleDispatch: 'NO_RESPONSE', workerStatus: null })
          throw error
        }
        logStudioDiagnostic({ requestId: auth.id, stage: 'PROVIDER_RESPONSE', admission: 'ADMITTED', reason: response.ok ? 'ORACLE_RESPONSE' : 'ORACLE_REJECTED', oracleDispatch: 'RESPONSE', workerStatus: response.status })
        if ([400, 409, 422, 429].includes(response.status)) {
          const failureCode = await submissionFailureCode(response)
          const settlement = user ? await settleUserGeneration(env, user.id, auth.id, 'failed', failureCode) : undefined
          logStudioDiagnostic({ requestId: auth.id, stage: 'FAILED', admission: 'REFUSED', reason: failureCode, oracleDispatch: 'RESPONSE', workerStatus: response.status })
          throw new StudioError(settlement?.pointSettlement?.state === 'pending-cost' ? POINT_COST_PENDING_DETAIL : STUDIO_FAILURE_DETAILS[failureCode], response.status, failureCode, settlement?.pointSettlement, auth.id)
        }
        if (!response.ok) { await response.body?.cancel(); throw new Error('Unconfirmed acceptance') }
        const value = await limitedJson(response, 16_384)
        if (value.id !== auth.id || !Object.hasOwn(JOB_DETAILS, String(value.state))) throw new Error('Unconfirmed acceptance')
        const completed = await completedOracleStatus(env, auth.id, value, fetcher)
        return json({ job: await accountJob(env, user?.id, auth.id, completed.state as StudioJob['state'], fetcher, oracleFailureCode(completed), completed.timingObservation) }, 202)
      } catch (error) {
        if (error instanceof StudioError) throw error
        return json({ job: { id: auth.id, state: 'pending', detail: JOB_DETAILS.pending, ...(admittedPointSettlement ? { pointSettlement: admittedPointSettlement } : {}), ...(pricing ? { pricing } : {}) } }, 202)
      }
    }
    const match = new RegExp(`^/api/studio/jobs/(${UUID})(?:/(model|exports/(?:pbr|fbx|blend)))?$`).exec(url.pathname)
    if (match && request.method === 'GET') {
      const user = await accountIdentity(request, env, fetcher)
      // The HMAC receipt is account-bound. If the entitlement Durable Object lost
      // only its job row, keep recovery tied to this exact signed UUID instead of
      // spinning forever or starting another paid generation.
      const auth = await verifyReceipt(env, request.headers.get('X-WORLDIFACT-Job') || '', match[1], !!user, user?.id, !!match[2])
      if (auth.library) {
        // A library ticket only reads the existing completed artifact. Losing or
        // changing the owned row revokes it; never enter legacy Oracle recovery.
        const { model } = await userStudioLibraryModel(env, user!.id, auth.id)
        if (!model || model.fingerprint !== auth.hash) throw new StudioError('This saved model is not available in your account library.', 403)
        if (!model.downloadAllowed) throw new StudioError('This saved model requires eligible account access to download.', 403)
        await limit(request, env, `artifact:${auth.id}:${match[2].replace('exports/', '')}`)
        return await modelOrExport(env, auth.id, match[2].replace('exports/', ''), fetcher)
      }
      const access = user ? await userJobAccess(env, user.id, auth.id) : null
      if (access?.owned && auth.held !== !!access.pointSettlement) throw new StudioError('Recover this model using its original funding-policy receipt.', 401)
      // A preview/model read must not consume another format's download slot.
      // The verified receipt and fixed route grammar bound each independent key.
      await limit(request, env, match[2] ? `artifact:${auth.id}:${match[2].replace('exports/', '')}` : `poll:${auth.id}`)
      if (match[2]) {
        // Legacy/operator mode has no account ledger and keeps its historical
        // signed-receipt artifact behavior unchanged.
        if (!user) return await modelOrExport(env, auth.id, match[2].replace('exports/', ''), fetcher)
        if (access?.owned) {
          if (isManualPointClosure(access.pointSettlement)) throw new StudioError(manualPointClosureDetail(access.pointSettlement), 409, access.failureCode, access.pointSettlement, auth.id)
          if (!access.downloadAllowed) throw new StudioError('SLOW models and textures require an active subscription to download. Your generated model is preserved.', 403)
          return await modelOrExport(env, auth.id, match[2].replace('exports/', ''), fetcher)
        }
        const statusResponse = await oracle(env, `/v1/jobs/${auth.id}`, fetcher)
        if (!statusResponse.ok) { await statusResponse.body?.cancel(); throw new StudioError('The recovered model is not available on the worker.', statusResponse.status === 404 ? 404 : 502) }
        const statusValue = await limitedJson(statusResponse, 16_384)
        if (statusValue.id !== auth.id || statusValue.state !== 'succeeded' || statusValue.modelStatus === 'draft') throw new StudioError('The recovered model has not completed on the worker.', 409)
        const entitlement = await entitlementStatus(env, user.id)
        if (!entitlement.subscription.active || entitlement.billingReview || entitlement.credits < 0)
          throw new StudioError('This recovered SLOW result requires an active account without billing review.', 403)
        return await modelOrExport(env, auth.id, match[2].replace('exports/', ''), fetcher)
      }

      // Previously settled results are durable even if Oracle later stays offline.
      if (user && access?.owned && ['failed', 'completed'].includes(access.state!) && access.pointSettlement?.state !== 'pending-cost') return json({ job: await accountJob(env, user.id, auth.id, access.state === 'completed' ? 'succeeded' : 'failed', fetcher) })
      const overdue = user && access?.owned && (access.state === 'reserved' || access.pointSettlement?.state === 'pending-cost') && access.at && Date.now() - access.at > STUDIO_JOB_WATCHDOG_MS
      let value: Awaited<ReturnType<typeof oracleJobStatus>>
      try {
        // Read a real terminal result first: a late browser return must still
        // recover a model that Oracle completed while this client was away.
        value = await oracleJobStatus(env, auth.id, fetcher, !!user)
      } catch (error) {
        // Transport failures cannot retain a customer hold beyond the whole-job
        // recovery window. This settles only the authenticated account receipt;
        // it neither cancels Oracle nor replenishes the provider-spend budget.
        if (overdue) return json({ job: await accountJob(env, user!.id, auth.id, 'pending', fetcher) })
        throw error
      }
      if (value === null) {
        // The Oracle GET can overlap a just-finished upload/admission. Never
        // decide absence using the account snapshot from before that GET.
        const latest = user ? await userJobAccess(env, user.id, auth.id) : null
        if (user && latest?.owned && ['completed', 'failed'].includes(latest.state!))
          return json({ job: await accountJob(env, user.id, auth.id, latest.state === 'completed' ? 'succeeded' : 'failed', fetcher) })
        const missingAfter = Math.max((latest?.owned && latest.at ? latest.at : auth.issued) + STUDIO_SUBMISSION_GRACE_MS,
          (latest?.studioDispatchUntil ?? 0) + STUDIO_ORACLE_TIMEOUT_MS)
        // A freshly claimed dispatch near the grace boundary may still be in
        // flight. Its bounded deadline plus the existing POST timeout must end
        // before a 404 can close the hold and present a terminal result.
        const expired = Date.now() >= missingAfter || overdue
        if (user && latest?.owned && expired) {
          const job = await accountJob(env, user.id, auth.id, 'failed', fetcher, 'ORACLE_JOB_MISSING')
          return json({ job, ...(job.state === 'failed' ? { reconciledMissing: true } : {}) })
        }
        if (user && !latest?.owned && expired) {
          // Atomic with /reserve: whichever wins determines whether this was a
          // real admission or an absent submission that must never launch late.
          const closed = await closeMissingStudioJob(env, user.id, auth.id, auth.hash, auth.issued)
          if (!closed.fingerprintMatches) throw new StudioError('The existing job commitment could not be reconciled.', 503)
          const state = closed.state === 'completed' ? 'succeeded' : closed.state === 'failed' ? 'failed' : 'pending'
          return json({ job: await accountJob(env, user.id, auth.id, state, fetcher), ...(closed.closed ? { reconciledMissing: true } : {}) })
        }
        const state = !user && expired ? 'failed' : 'pending'
        return json({ job: { id: auth.id, state, detail: JOB_DETAILS[state] } })
      }
      if (user && !access?.owned) {
        const state = value.state as StudioJob['state']
        const entitlement = await entitlementStatus(env, user.id)
        const downloadAllowed = state === 'succeeded' && entitlement.subscription.active && !entitlement.billingReview && entitlement.credits >= 0
        return json({ job: {
          id: auth.id, state,
          detail: state === 'succeeded'
            ? 'Oracle completed this exact signed job, but its account-ledger ownership row is missing. The same receipt can recover the result; no new generation or point charge is started.'
            : state === 'failed' || state === 'cancelled'
              ? 'Oracle finished this exact signed job, but its account-ledger ownership row is missing. No automatic retry, refund, or new charge is performed; billing reconciliation remains separate.'
              : 'Oracle still has this exact signed job, but its account-ledger ownership row is missing. Recovery is paused for review; do not start a duplicate paid generation.',
          downloadAllowed, previewOnly: !downloadAllowed, previewAvailable: downloadAllowed,
          reconciliationRequired: true,
        } })
      }

      return json({ job: await accountJob(env, user?.id, auth.id, value.state as StudioJob['state'], fetcher, oracleFailureCode(value), value.timingObservation) })
    }
    return json({ error: 'Studio route or method not found.' }, 404)
  } catch (e) {
    if (e instanceof StudioError || e instanceof EntitlementError) return json({ error: e.message,
      ...(e instanceof StudioLibraryReceiptExpiredError ? { code: 'STUDIO_LIBRARY_RECEIPT_EXPIRED' } : {}),
      ...(e instanceof StudioError && e.failureCode ? { failureCode: e.failureCode } : {}),
      ...(e instanceof StudioError && e.pointSettlement ? { pointSettlement: e.pointSettlement, requestId: e.requestId, state: e.pointSettlement.state === 'held' ? 'pending' : 'failed' } : {}) }, e.status)
    return json({ error: 'The request could not be confirmed. Preserve your inputs and receipt; never automatically resubmit a paid job.' }, 503)
  }
}
