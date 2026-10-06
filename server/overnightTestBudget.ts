import { astraProjectBudget } from './astraProjectBudget.ts'
import type { EntitlementStorage } from './entitlements.ts'
import type { OvernightTestDiagnostic } from '../src/lib/overnightTestDiagnostics.ts'

/** One separately authorized test run. None of these names derive from configuration. */
export const OVERNIGHT_TEST_APPROVAL = 'api-tests-20261006-044444-usd4' as const
export const OVERNIGHT_TEST_NAMESPACE = 'api-tests-20261006-044444-usd4:v1'
export const OVERNIGHT_TEST_STATE = 'overnight-api-test-budget:v1'
export const OVERNIGHT_TEST_ISSUED = '2026-10-06T04:44:44.000Z' as const
// Conservative implementation cutoff for the renewed one-time approval.
// The user specified the USD4 ceiling, not this deadline; it never auto-extends.
export const OVERNIGHT_TEST_EXPIRES = '2026-10-06T12:00:00.000Z' as const
export const OVERNIGHT_TEST_CENTS = 400 as const
export const OVERNIGHT_TEST_WORKFLOWS = Object.freeze({
  'detailed-astra': Object.freeze({ model: 'gpt-6-astra', capCents: 175, maxAttempts: 2, channel: 'studio' }),
  'blueprint-sol': Object.freeze({ model: 'gpt-6.1-sol', capCents: 35, maxAttempts: 1, channel: 'blueprint' }),
  'blueprint-luna': Object.freeze({ model: 'gpt-6-luna', capCents: 10, maxAttempts: 1, channel: 'blueprint' }),
} as const)
export type OvernightWorkflow = keyof typeof OVERNIGHT_TEST_WORKFLOWS
export type OvernightTestConfig = { version: 1; approvalId: typeof OVERNIGHT_TEST_APPROVAL; accountId: string; issuedAt: typeof OVERNIGHT_TEST_ISSUED; expiresAt: typeof OVERNIGHT_TEST_EXPIRES; totalCents: 400 }
export type OvernightTestClaim = { version: 1; source: 'overnight-test'; approvalId: typeof OVERNIGHT_TEST_APPROVAL; accountId: string; jobId: string; fingerprint: string; workflow: OvernightWorkflow; model: string; capCents: number; claimedAt: number; expiresAt: typeof OVERNIGHT_TEST_EXPIRES }
type PoolState = { version: 1; authority: OvernightTestConfig; committedCents: number; claims: OvernightTestClaim[] }
export type OvernightTestEnv = { WORLDIFACT_OVERNIGHT_TEST_BUDGET?: string; ACCOUNT_LEDGER_MODE?: string; WORLDIFACT_ASTRA_PROJECT_BUDGET?: string }
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/
const hash = /^[a-f0-9]{64}$/
const configFields = ['version', 'approvalId', 'accountId', 'issuedAt', 'expiresAt', 'totalCents']
const claimFields = ['version', 'source', 'approvalId', 'accountId', 'jobId', 'fingerprint', 'workflow', 'model', 'capCents', 'claimedAt', 'expiresAt']
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const exact = (value: Record<string, unknown>, fields: string[]) => Object.keys(value).length === fields.length && Object.keys(value).every(key => fields.includes(key))

export function overnightTestConfig(raw: unknown, accountId: unknown, ledgerMode: unknown, now: number, allowExpired = false): OvernightTestConfig | null {
  if (ledgerMode !== undefined && ledgerMode !== 'live' || typeof raw !== 'string' || raw.length > 1024 || typeof accountId !== 'string' || !uuid.test(accountId.toLowerCase()) || !Number.isSafeInteger(now)) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (!object(value) || !exact(value, configFields) || value.version !== 1 || value.approvalId !== OVERNIGHT_TEST_APPROVAL || value.totalCents !== OVERNIGHT_TEST_CENTS ||
        value.accountId !== accountId.toLowerCase() || typeof value.accountId !== 'string' || !uuid.test(value.accountId) ||
        value.issuedAt !== OVERNIGHT_TEST_ISSUED || value.expiresAt !== OVERNIGHT_TEST_EXPIRES || now < Date.parse(OVERNIGHT_TEST_ISSUED) ||
        !allowExpired && now >= Date.parse(OVERNIGHT_TEST_EXPIRES)) return null
    return { version: 1, approvalId: OVERNIGHT_TEST_APPROVAL, accountId: value.accountId, issuedAt: OVERNIGHT_TEST_ISSUED, expiresAt: OVERNIGHT_TEST_EXPIRES, totalCents: OVERNIGHT_TEST_CENTS }
  } catch { return null }
}
/** The old private project setting selects the account only. Fresh fixed-run
 * authority comes from this separately approved overnight policy, never that grant. */
export function overnightTestAuthority(env: OvernightTestEnv, accountId: unknown, now: number, allowExpired = false): OvernightTestConfig | null {
  if (env.WORLDIFACT_OVERNIGHT_TEST_BUDGET !== undefined)
    return overnightTestConfig(env.WORLDIFACT_OVERNIGHT_TEST_BUDGET, accountId, env.ACCOUNT_LEDGER_MODE, now, allowExpired)
  const raw = env.WORLDIFACT_ASTRA_PROJECT_BUDGET
  if (typeof raw !== 'string' || raw.length > 1024) return null
  try {
    const original = JSON.parse(raw), issued = Date.parse(original?.issuedAt)
    if (!Number.isSafeInteger(issued) || issued > Date.parse(OVERNIGHT_TEST_ISSUED) || !astraProjectBudget(raw, accountId, env.ACCOUNT_LEDGER_MODE, issued)) return null
    return overnightTestConfig(JSON.stringify({ version: 1, approvalId: OVERNIGHT_TEST_APPROVAL, accountId: original.accountId,
      issuedAt: OVERNIGHT_TEST_ISSUED, expiresAt: OVERNIGHT_TEST_EXPIRES, totalCents: OVERNIGHT_TEST_CENTS }), accountId, env.ACCOUNT_LEDGER_MODE, now, allowExpired)
  } catch { return null }
}
/** Diagnose a refused status read without exposing config values or changing them. */
export function overnightTestStatusDiagnostic(env: OvernightTestEnv, accountId: unknown, now: number): OvernightTestDiagnostic | null {
  if (overnightTestAuthority(env, accountId, now, true)) return null
  if (env.ACCOUNT_LEDGER_MODE !== undefined && env.ACCOUNT_LEDGER_MODE !== 'live') return 'TEST_LEDGER_NOT_LIVE'
  if (!Number.isSafeInteger(now) || now < Date.parse(OVERNIGHT_TEST_ISSUED)) return 'TEST_WINDOW_NOT_STARTED'
  if (env.WORLDIFACT_OVERNIGHT_TEST_BUDGET !== undefined)
    return typeof env.WORLDIFACT_OVERNIGHT_TEST_BUDGET === 'string' ? 'TEST_EXPLICIT_CONFIG_INVALID' : 'TEST_EXPLICIT_BINDING_TYPE'
  const raw = env.WORLDIFACT_ASTRA_PROJECT_BUDGET
  if (raw === undefined) return 'TEST_SELECTOR_MISSING'
  if (typeof raw !== 'string') return 'TEST_SELECTOR_BINDING_TYPE'
  if (raw.length > 1024) return 'TEST_SELECTOR_INVALID'
  try {
    const value: unknown = JSON.parse(raw)
    if (object(value) && typeof value.accountId === 'string' && typeof accountId === 'string' && value.accountId !== accountId.toLowerCase()) return 'TEST_ACCOUNT_NOT_APPROVED'
  } catch { /* Only the fixed validation code leaves this function. */ }
  return 'TEST_SELECTOR_INVALID'
}
export function overnightWorkflow(channel: unknown, model: unknown): OvernightWorkflow | null {
  if (channel === 'studio' && model === 'astra') return 'detailed-astra'
  if (channel === 'blueprint' && model === 'sol') return 'blueprint-sol'
  if (channel === 'blueprint' && model === 'luna') return 'blueprint-luna'
  return null
}
export function matchesOvernightTestClaim(value: unknown, authority: OvernightTestConfig, jobId: string, fingerprint: string, workflow: OvernightWorkflow, now: number): value is OvernightTestClaim {
  if (!object(value) || !exact(value, claimFields) || !Object.hasOwn(OVERNIGHT_TEST_WORKFLOWS, workflow)) return false
  const terms = OVERNIGHT_TEST_WORKFLOWS[workflow]
  return value.version === 1 && value.source === 'overnight-test' && value.approvalId === authority.approvalId && value.accountId === authority.accountId &&
    value.jobId === jobId && uuid.test(jobId) && value.fingerprint === fingerprint && hash.test(fingerprint) && value.workflow === workflow &&
    value.model === terms.model && value.capCents === terms.capCents && value.expiresAt === authority.expiresAt &&
    Number.isSafeInteger(value.claimedAt) && Number(value.claimedAt) >= Date.parse(authority.issuedAt) && Number(value.claimedAt) < Date.parse(authority.expiresAt) &&
    Number.isSafeInteger(now) && Number(value.claimedAt) <= now && now < Date.parse(authority.expiresAt)
}
/** Historical inspection only. This does not extend expired spending authority. */
export function isOvernightTestClaim(value: unknown): value is OvernightTestClaim {
  if (!object(value)) return false
  const authority = overnightTestConfig(JSON.stringify({ version: 1, approvalId: value.approvalId, accountId: value.accountId,
    issuedAt: OVERNIGHT_TEST_ISSUED, expiresAt: value.expiresAt, totalCents: OVERNIGHT_TEST_CENTS }), value.accountId, 'live', Number(value.claimedAt))
  return !!authority && matchesOvernightTestClaim(value, authority, String(value.jobId), String(value.fingerprint), value.workflow as OvernightWorkflow, Number(value.claimedAt))
}
function validatedState(value: unknown, authority: OvernightTestConfig, now: number): PoolState {
  if (!object(value) || !exact(value, ['version', 'authority', 'committedCents', 'claims']) || value.version !== 1 || !object(value.authority) ||
      !exact(value.authority, configFields) || !configFields.every(key => (value.authority as Record<string, unknown>)[key] === authority[key as keyof OvernightTestConfig]) ||
      !Number.isSafeInteger(value.committedCents) || !Array.isArray(value.claims) || value.claims.length < 1 || value.claims.length > 4) throw new Error('Unverified overnight test pool')
  const seen = new Set<string>(), counts = { 'detailed-astra': 0, 'blueprint-sol': 0, 'blueprint-luna': 0 }
  let total = 0
  for (const claim of value.claims) {
    if (!isOvernightTestClaim(claim) || claim.accountId !== authority.accountId || claim.claimedAt > now || seen.has(claim.jobId)) throw new Error('Unverified overnight test claim')
    seen.add(claim.jobId); counts[claim.workflow]++; total += claim.capCents
    if (counts[claim.workflow] > OVERNIGHT_TEST_WORKFLOWS[claim.workflow].maxAttempts) throw new Error('Overnight test quota exceeded')
  }
  if (value.committedCents !== total || total > OVERNIGHT_TEST_CENTS) throw new Error('Overnight test total exceeded')
  return value as unknown as PoolState
}
const reply = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } })

/** Internal fixed-namespace handler; no activation/reset/refund endpoint exists. */
export async function overnightTestPoolRoute(request: Request, storage: EntitlementStorage, env: OvernightTestEnv, clock: () => number): Promise<Response | null> {
  const path = new URL(request.url).pathname
  if (!['/overnight-test-status', '/overnight-test-claim'].includes(path)) return null
  const status = path === '/overnight-test-status'
  if (request.method !== (status ? 'GET' : 'POST') || new URL(request.url).search) return reply({ approved: false }, 405)
  const accountId = request.headers.get('X-WORLDIFACT-Verified-Account')
  const authority = overnightTestAuthority(env, accountId, clock(), status)
  if (!authority) return reply(status ? { available: false, diagnostic: overnightTestStatusDiagnostic(env, accountId, clock()) ?? 'TEST_SELECTOR_INVALID' } : { approved: false }, 403)
  let diagnostic: OvernightTestDiagnostic = 'TEST_POOL_READ_UNAVAILABLE'
  try {
    if (status) {
      const raw = await storage.get(OVERNIGHT_TEST_STATE)
      diagnostic = 'TEST_POOL_STATE_INVALID'
      const state = raw === undefined ? null : validatedState(raw, authority, clock())
      const used = state?.committedCents ?? 0
      const counts = Object.fromEntries(Object.keys(OVERNIGHT_TEST_WORKFLOWS).map(workflow => [workflow, state?.claims.filter(claim => claim.workflow === workflow).length ?? 0]))
      return reply({ available: clock() < Date.parse(authority.expiresAt) && used < 395, approvalId: authority.approvalId, expiresAt: authority.expiresAt,
        totalCents: 400, committedCents: used, remainingCents: 400 - used, attempts: counts, noRecycling: true })
    }
    const raw = await request.text()
    if (raw.length > 512) return reply({ approved: false }, 400)
    const input: unknown = JSON.parse(raw)
    if (!object(input) || !exact(input, ['jobId', 'fingerprint', 'workflow']) || typeof input.jobId !== 'string' || !uuid.test(input.jobId) ||
        typeof input.fingerprint !== 'string' || !hash.test(input.fingerprint) || typeof input.workflow !== 'string' || !Object.hasOwn(OVERNIGHT_TEST_WORKFLOWS, input.workflow)) return reply({ approved: false }, 400)
    const { jobId, fingerprint } = input, workflow = input.workflow as OvernightWorkflow
    const result = await storage.transaction(async tx => {
      const at = clock(), current = overnightTestAuthority(env, accountId, at)
      if (!current || !configFields.every(key => current[key as keyof OvernightTestConfig] === authority[key as keyof OvernightTestConfig])) return { approved: false }
      const stored = await tx.get(OVERNIGHT_TEST_STATE), state = stored === undefined ? null : validatedState(stored, current, at)
      const existing = state?.claims.find(claim => claim.jobId === jobId)
      if (existing) return matchesOvernightTestClaim(existing, current, jobId, fingerprint, workflow, at) ? { approved: true, claim: existing } : { approved: false }
      const terms = OVERNIGHT_TEST_WORKFLOWS[workflow], count = state?.claims.filter(claim => claim.workflow === workflow).length ?? 0
      if (count >= terms.maxAttempts || (state?.committedCents ?? 0) + terms.capCents > OVERNIGHT_TEST_CENTS) return { approved: false }
      const claim: OvernightTestClaim = { version: 1, source: 'overnight-test', approvalId: current.approvalId, accountId: current.accountId, jobId, fingerprint,
        workflow, model: terms.model, capCents: terms.capCents, claimedAt: at, expiresAt: current.expiresAt }
      const next: PoolState = { version: 1, authority: current, committedCents: (state?.committedCents ?? 0) + terms.capCents, claims: [...state?.claims ?? [], claim] }
      validatedState(next, current, at)
      await tx.put(OVERNIGHT_TEST_STATE, next)
      // Late/lost acknowledgement keeps its full commitment. Never recycle.
      return clock() < Date.parse(current.expiresAt) ? { approved: true, claim } : { approved: false }
    })
    return reply(result)
  } catch { return reply({ error: 'Overnight test authority is unavailable.', ...(status ? { diagnostic } : {}) }, 503) }
}
