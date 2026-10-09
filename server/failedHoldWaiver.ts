import { getVerifiedAccount, type AccountEnv } from './accounts.ts'
import type { EntitlementEnv, EntitlementStorage } from './entitlements.ts'
import { PAID_POINTS_JOB_PREFIX, PAID_POINTS_ROUTE_PREFIX, matchingPaidPointsFence } from './paidPointsStorage.ts'
import { PAID_POINTS_FUNDING, isPointSettlement } from '../src/lib/paidPointsFunding.ts'
import { FAILED_HOLD_WAIVER_APPROVAL, FAILED_HOLD_WAIVER_REVISION, readFailedHoldWaiverResponse, type FailedHoldWaiverResponse } from '../src/lib/failedHoldWaiver.ts'

export const FAILED_HOLD_WAIVER_KEY = 'failed-hold-waiver:20261009:v1'
const HELD_KEY = 'customer-reserved-credits:v1'
const ISSUED_AT = Date.parse('2026-10-09T03:28:42.000Z')
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/
const SHA256 = /^[a-f0-9]{64}$/
const SCAN_LIMIT = 256
export type FailedHoldWaiverAuthority = Readonly<{
  ownerAccountSha256: string
  authorizationReferenceSha256: string
  jobs: readonly Readonly<{ idSha256: string; at: number }>[]
}>
// Reviewed, bounded authority only. These commitments cannot come from an
// environment, request, arbitrary account identifier, amount or job list.
const APPROVED_AUTHORITY: FailedHoldWaiverAuthority = Object.freeze({
  ownerAccountSha256: '55055d5f79ce5573d5fb08fb0b0ca7295fe32385ba172872dc2843b51d5d7249',
  authorizationReferenceSha256: 'ead0bb4b47b08218229a468dec41e5c397cb353e00dd274c90ecfb6e9d8d1827',
  jobs: Object.freeze([
    Object.freeze({ idSha256: '5e3fa68e1ca1a27df8a34c88c286df9a4cc242063c51021aa316645cd59e1880', at: Date.parse('2026-10-07T11:34:17.604Z') }),
    Object.freeze({ idSha256: 'c7bffcf1e27efc74969e2b31ffa7ce0e7d15f17953270084fbdef07a2add9eb8', at: Date.parse('2026-10-07T16:26:48.619Z') }),
    Object.freeze({ idSha256: 'a6f40c999d435d08843858057a11505155f0113fee32955b6d6edaebf0cc5459', at: Date.parse('2026-10-08T06:34:31.045Z') }),
    Object.freeze({ idSha256: '5f318f8683de51a1635161f3d7e1e9dba7dd8c5742cddf3a0802fe9ae6143046', at: Date.parse('2026-10-08T22:57:51.609Z') }),
  ]),
})
type Row = Record<string, unknown>
type JobAudit = { id: string; idSha256: string; at: number; originalJobSha256: string; waivedJobSha256: string; providerLiabilityCents: number }
type Audit = Omit<FailedHoldWaiverResponse, 'status'> & { ownerAccountSha256: string; authorizationReferenceSha256: string; jobs: JobAudit[] }
type BlockCode = 'BASELINE_CHANGED' | 'JOB_BINDING_INVALID' | 'AUDIT_INVALID'
export type FailedHoldWaiverResult = { status: 200; body: FailedHoldWaiverResponse } | { status: 403 | 409; body: { error: string; code?: BlockCode } }
type JobValidator = (value: unknown, id?: string) => boolean
const row = (value: unknown): value is Row => !!value && typeof value === 'object' && !Array.isArray(value)
const exact = (value: unknown, keys: string[]): value is Row => row(value) && Object.keys(value).length === keys.length && Object.keys(value).every(key => keys.includes(key))
const unavailable = (): FailedHoldWaiverResult => ({ status: 403, body: { error: 'This waiver is unavailable.' } })
const blocked = (code: BlockCode): FailedHoldWaiverResult => ({ status: 409, body: { error: 'Failed-hold waiver cannot be applied.', code } })
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: {
  'Cache-Control': 'private, no-store', Vary: 'Cookie', 'X-Content-Type-Options': 'nosniff', ...(status === 405 ? { Allow: 'GET, POST' } : {}),
} })
const hash = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), byte => byte.toString(16).padStart(2, '0')).join('')
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  if (row(value)) return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}'
  return JSON.stringify(value)
}
const jobHash = (value: unknown) => hash(canonical(value))
function validAuthority(value: FailedHoldWaiverAuthority | null): value is FailedHoldWaiverAuthority {
  return exact(value, ['ownerAccountSha256', 'authorizationReferenceSha256', 'jobs']) && typeof value.ownerAccountSha256 === 'string' && SHA256.test(value.ownerAccountSha256) &&
    typeof value.authorizationReferenceSha256 === 'string' && SHA256.test(value.authorizationReferenceSha256) && Array.isArray(value.jobs) && value.jobs.length === 4 &&
    value.jobs.every(job => exact(job, ['idSha256', 'at']) && typeof job.idSha256 === 'string' && SHA256.test(job.idSha256) && Number.isSafeInteger(job.at) && Number(job.at) > 0 && Number(job.at) < ISSUED_AT) &&
    new Set(value.jobs.map(job => job.idSha256)).size === 4
}
async function approvedOwner(account: unknown, authority: FailedHoldWaiverAuthority | null) {
  return validAuthority(authority) && typeof account === 'string' && UUID.test(account.toLowerCase()) && await hash(account.toLowerCase()) === authority.ownerAccountSha256
}
function response(status: FailedHoldWaiverResponse['status'], appliedAt: number | null): FailedHoldWaiverResponse {
  return { revision: FAILED_HOLD_WAIVER_REVISION, status, approvalId: FAILED_HOLD_WAIVER_APPROVAL, releasedPoints: 1000,
    before: { balance: 1190, held: 1000, available: 190 }, after: { balance: 1190, held: 0, available: 1190 }, providerLiabilityCents: 324,
    preservesProviderLiability: true, generationStarted: false, appliedAt }
}
async function validAudit(value: unknown, authority: FailedHoldWaiverAuthority, now: number): Promise<boolean> {
  if (!exact(value, ['revision', 'approvalId', 'releasedPoints', 'before', 'after', 'providerLiabilityCents', 'preservesProviderLiability', 'generationStarted', 'appliedAt', 'ownerAccountSha256', 'authorizationReferenceSha256', 'jobs']) ||
      value.ownerAccountSha256 !== authority.ownerAccountSha256 || value.authorizationReferenceSha256 !== authority.authorizationReferenceSha256 ||
      !Number.isSafeInteger(value.appliedAt) || Number(value.appliedAt) < ISSUED_AT || Number(value.appliedAt) > now || !Array.isArray(value.jobs) || value.jobs.length !== 4) return false
  const { ownerAccountSha256: _owner, authorizationReferenceSha256: _authorization, jobs: _jobs, ...publicFields } = value
  try { readFailedHoldWaiverResponse({ ...publicFields, status: 'applied' }) } catch { return false }
  let liability = 0
  for (let index = 0; index < 4; index++) {
    const job = value.jobs[index], approved = authority.jobs[index]
    if (!exact(job, ['id', 'idSha256', 'at', 'originalJobSha256', 'waivedJobSha256', 'providerLiabilityCents']) || typeof job.id !== 'string' || !UUID.test(job.id) ||
        job.idSha256 !== approved.idSha256 || await hash(job.id) !== approved.idSha256 || job.at !== approved.at ||
        typeof job.originalJobSha256 !== 'string' || !SHA256.test(job.originalJobSha256) || typeof job.waivedJobSha256 !== 'string' || !SHA256.test(job.waivedJobSha256) ||
        job.originalJobSha256 === job.waivedJobSha256 || !Number.isSafeInteger(job.providerLiabilityCents) || Number(job.providerLiabilityCents) <= 0 || Number(job.providerLiabilityCents) > 175) return false
    liability += Number(job.providerLiabilityCents)
  }
  return liability === 324
}
function boundedIncidentJob(value: unknown, id: string, valid: JobValidator, now: number): value is Row & { providerLiability: Row; pointSettlement: Row } {
  return valid(value, id) && row(value) && value.fundingMode === PAID_POINTS_FUNDING && value.state === 'failed' && value.channel === 'studio' &&
    value.profile === 'slow' && (value.model === undefined || value.model === 'astra') && value.kind === 'credits' && value.cost === 250 && value.billingMode === 'hold-v1' &&
    Number.isSafeInteger(value.updatedAt) && Number(value.updatedAt) <= now && row(value.providerLiability) && value.providerLiability.state === 'bounded' &&
    value.providerLiability.capCents === 175 && Number.isSafeInteger(value.providerLiability.maximumLiabilityCents) && Number(value.providerLiability.maximumLiabilityCents) > 0 &&
    row(value.providerLiability.evidence) && value.providerLiability.evidence.kind === 'studio-terminal' && Number(value.providerLiability.evidence.at) <= now &&
    row(value.pointSettlement) && isPointSettlement(value.pointSettlement, 250)
}
const waivedPointSettlement = () => ({ version: 1 as const, state: 'waived' as const, heldPoints: 0 as const, chargedPoints: 0 as const, approvalId: FAILED_HOLD_WAIVER_APPROVAL })
async function matchesAuditJob(job: unknown, entry: JobAudit): Promise<boolean> {
  if (!row(job) || !isPointSettlement(job.pointSettlement, 250) || job.pointSettlement.state !== 'waived' || job.at !== entry.at ||
      !row(job.providerLiability) || job.providerLiability.maximumLiabilityCents !== entry.providerLiabilityCents || await jobHash(job) !== entry.waivedJobSha256) return false
  return await jobHash({ ...job, pointSettlement: { version: 1, state: 'pending-cost', heldPoints: 250, chargedPoints: 0 } }) === entry.originalJobSha256
}
/** Extra paid-storage read barrier: a waived job is valid only with the fixed
 * incident audit and exact ID/content commitments. No loose waived rows exist. */
export async function verifyFailedHoldWaiverJob(storage: EntitlementStorage, id: string, job: unknown): Promise<boolean> {
  const saved = await storage.get<Audit>(FAILED_HOLD_WAIVER_KEY)
  if (!await validAudit(saved, APPROVED_AUTHORITY, Date.now())) return false
  const entry = saved!.jobs.find(item => item.id === id)
  return !!entry && await matchesAuditJob(job, entry)
}
/** Caller supplies the native transaction. The authority and validator arguments
 * permit inert fixture tests; production only uses fixed authority and validator.
 * Original job IDs exist only in the private audit for direct immutable readback;
 * no IDs, prompts, receipts or authorization commitments enter API responses. */
export async function evaluateFailedHoldWaiver(storage: EntitlementStorage, account: unknown, apply: boolean,
  authority: FailedHoldWaiverAuthority | null, now: number, valid: JobValidator): Promise<FailedHoldWaiverResult> {
  if (!await approvedOwner(account, authority) || !Number.isSafeInteger(now) || now < ISSUED_AT) return unavailable()
  const approved = authority!, saved = await storage.get<Audit>(FAILED_HOLD_WAIVER_KEY)
  if (saved !== undefined) {
    if (!await validAudit(saved, approved, now)) return blocked('AUDIT_INVALID')
    for (const entry of saved.jobs) {
      const [job, fence] = await Promise.all([storage.get(PAID_POINTS_JOB_PREFIX + entry.id), storage.get('job:' + entry.id)])
      if (!boundedIncidentJob(job, entry.id, valid, now) || !matchingPaidPointsFence(fence, job) || !await matchesAuditJob(job, entry)) return blocked('AUDIT_INVALID')
    }
    return { status: 200, body: response('already-applied', saved.appliedAt) }
  }
  const [balance, held, billingHold] = await Promise.all([storage.get('balance'), storage.get(HELD_KEY), storage.get('billingHold')])
  if (balance !== 1190 || held !== 1000 || billingHold !== undefined && billingHold !== false) return blocked('BASELINE_CHANGED')
  if (!storage.list) return blocked('JOB_BINDING_INVALID')
  const [paid, legacy] = await Promise.all([storage.list({ prefix: PAID_POINTS_JOB_PREFIX, limit: SCAN_LIMIT }), storage.list({ prefix: 'job:', limit: SCAN_LIMIT })])
  if (!(paid instanceof Map) || !(legacy instanceof Map) || paid.size !== 4 || legacy.size >= SCAN_LIMIT) return blocked('JOB_BINDING_INVALID')
  const selected = new Map<string, { id: string; job: Row & { providerLiability: Row; pointSettlement: Row } }>()
  let allHeld = 0
  for (const [key, value] of paid) {
    const id = key.slice(PAID_POINTS_JOB_PREFIX.length)
    if (!key.startsWith(PAID_POINTS_JOB_PREFIX) || !UUID.test(id) || !valid(value, id) || !row(value) || !isPointSettlement(value.pointSettlement) || !matchingPaidPointsFence(legacy.get('job:' + id), value)) return blocked('JOB_BINDING_INVALID')
    allHeld += value.pointSettlement.heldPoints
    const commitment = await hash(id), expected = approved.jobs.find(job => job.idSha256 === commitment)
    if (!expected) continue
    if (!boundedIncidentJob(value, id, valid, now) || value.at !== expected.at || value.pointSettlement.state !== 'pending-cost' || value.pointSettlement.heldPoints !== 250 || value.pointSettlement.chargedPoints !== 0) return blocked('JOB_BINDING_INVALID')
    selected.set(commitment, { id, job: value })
  }
  for (const [key, value] of legacy) {
    if (!key.startsWith('job:') || !row(value)) return blocked('JOB_BINDING_INVALID')
    if (value.billingMode === 'hold-v1' && value.state === 'reserved' && value.kind === 'credits') {
      if (!Number.isSafeInteger(value.cost) || Number(value.cost) < 0) return blocked('JOB_BINDING_INVALID')
      allHeld += Number(value.cost)
    }
  }
  if (selected.size !== 4 || allHeld !== 1000) return blocked('JOB_BINDING_INVALID')
  const updates = [], jobs: JobAudit[] = []
  let providerLiabilityCents = 0
  for (const commitment of approved.jobs) {
    const { id, job } = selected.get(commitment.idSha256)!, waived = { ...job, pointSettlement: waivedPointSettlement() }
    if (!valid(waived, id)) return blocked('JOB_BINDING_INVALID')
    const liability = Number(job.providerLiability.maximumLiabilityCents)
    jobs.push({ id, ...commitment, originalJobSha256: await jobHash(job), waivedJobSha256: await jobHash(waived), providerLiabilityCents: liability })
    updates.push({ id, waived }); providerLiabilityCents += liability
  }
  if (providerLiabilityCents !== 324) return blocked('JOB_BINDING_INVALID')
  if (!apply) return { status: 200, body: response('preview', null) }
  const result = response('applied', now), { status: _status, ...terms } = result
  const audit: Audit = { ...terms, ownerAccountSha256: approved.ownerAccountSha256, authorizationReferenceSha256: approved.authorizationReferenceSha256, jobs }
  // Every read and validation completes before the first mutation. Only the
  // points markers, held aggregate and audit change; balance/liability never do.
  for (const { id, waived } of updates) await storage.put(PAID_POINTS_JOB_PREFIX + id, waived)
  await storage.put(HELD_KEY, 0)
  await storage.put(FAILED_HOLD_WAIVER_KEY, audit)
  return { status: 200, body: result }
}
async function validApplyRequest(request: Request): Promise<boolean> {
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('Content-Type') ?? '') || Number(request.headers.get('Content-Length')) > 256) return false
  const reader = request.body?.getReader()
  if (!reader) return false
  let text = '', bytes = 0
  const decoder = new TextDecoder('utf-8', { fatal: true })
  try {
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) break
      bytes += chunk.value.byteLength
      if (bytes > 256) { await reader.cancel(); return false }
      text += decoder.decode(chunk.value, { stream: true })
    }
    text += decoder.decode()
    return /^\s*\{\s*"approvalId"\s*:\s*"failed-hold-waiver-20261009-v1"\s*\}\s*$/.test(text)
  } catch { await reader.cancel().catch(() => {}); return false }
}
export async function failedHoldWaiverLedgerRoute(request: Request, storage: EntitlementStorage, env: EntitlementEnv,
  namespaceMatches: boolean, valid: JobValidator, now = Date.now()): Promise<Response> {
  if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Use GET or POST.' }, 405)
  if (new URL(request.url).search) return json({ error: 'Query parameters are not supported.' }, 400)
  if (!namespaceMatches || env.ACCOUNT_LEDGER_MODE !== undefined && env.ACCOUNT_LEDGER_MODE !== 'live') return json(unavailable().body, 403)
  if (request.method === 'POST' && !await validApplyRequest(request)) return json({ error: 'Invalid waiver request.' }, 400)
  const result = await storage.transaction(tx => evaluateFailedHoldWaiver(tx, request.headers.get('X-WORLDIFACT-Verified-Account'), request.method === 'POST', APPROVED_AUTHORITY, now, valid))
  return json(result.body, result.status)
}
export async function failedHoldWaiverApi(request: Request, env: AccountEnv & EntitlementEnv, fetcher: typeof fetch = fetch): Promise<Response> {
  const url = new URL(request.url)
  if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Use GET or POST.' }, 405)
  if (url.search) return json({ error: 'Query parameters are not supported.' }, 400)
  if (request.headers.get('Sec-Fetch-Site') === 'cross-site' || request.headers.has('Origin') && request.headers.get('Origin') !== url.origin || request.method === 'POST' && request.headers.get('Origin') !== url.origin)
    return json({ error: 'Same-origin account access required.' }, 403)
  try {
    const user = await getVerifiedAccount(request, env, fetcher)
    if (!user) return json({ error: 'Sign in to view your failed-hold waiver.' }, 401)
    const limiter = env.ACCOUNT_LIMITER ?? env.GENERATION_LIMITER
    if (!limiter) return json({ error: 'Account protection is unavailable.' }, 503)
    if (!(await limiter.limit({ key: `account:failed-hold-waiver:${user.id.toLowerCase()}` })).success) return json({ error: 'Please wait before checking the waiver again.' }, 429)
    if (!await approvedOwner(user.id, APPROVED_AUTHORITY) || env.ACCOUNT_LEDGER_MODE !== undefined && env.ACCOUNT_LEDGER_MODE !== 'live') return json(unavailable().body, 403)
    if (request.method === 'POST' && !await validApplyRequest(request)) return json({ error: 'Invalid waiver request.' }, 400)
    if (!env.ACCOUNT_ENTITLEMENTS) throw new Error('No account storage')
    const account = user.id.toLowerCase(), object = env.ACCOUNT_ENTITLEMENTS.get(env.ACCOUNT_ENTITLEMENTS.idFromName(`account:v1:${account}`))
    const result = await object.fetch(new Request('https://entitlements.internal' + PAID_POINTS_ROUTE_PREFIX + '/failed-hold-waiver', {
      method: request.method, headers: { 'X-WORLDIFACT-Verified-Account': account, 'Content-Type': 'application/json' },
      ...(request.method === 'POST' ? { body: JSON.stringify({ approvalId: FAILED_HOLD_WAIVER_APPROVAL }) } : {}), signal: AbortSignal.timeout(5000),
    }))
    const body = await result.json() as Record<string, unknown>
    if (result.status === 200) return json(readFailedHoldWaiverResponse(body))
    if (result.status === 403) return json(unavailable().body, 403)
    if (result.status === 409 && exact(body, ['error', 'code']) && body.error === 'Failed-hold waiver cannot be applied.' && ['BASELINE_CHANGED', 'JOB_BINDING_INVALID', 'AUDIT_INVALID'].includes(body.code as string)) return json(blocked(body.code as BlockCode).body, 409)
    throw new Error('Unconfirmed waiver result')
  } catch { return json({ error: 'The waiver is temporarily unavailable. Check its status before trying again.' }, 503) }
}
