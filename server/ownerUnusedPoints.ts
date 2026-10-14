/** One-day, owner-scoped reconciliation of provably unused point holds.
 * A successful AI generation is NEVER retried. The account/cost reader is the
 * existing durable ledger; Oracle's authenticated zero-liability terminal
 * receipt is required before changing any customer's points.
 *
 * This endpoint expires automatically and must subsequently be removed.
 */
import { entitlementCall, pendingUserStudioProvider, userJobAccess, reconcileUserStudioProvider, type EntitlementEnv, type EntitlementStatus } from './entitlements.ts'
import { oracleOrigin, type PlatformEnv } from './platform.ts'
import { validateTerminalBudgetReceipt, type TerminalBudgetReceipt } from './studioBudgetReceipt.ts'

export const OWNER_UNUSED_POINTS_PATH = '/api/ops/owner-unused-points-20261014'
export const OWNER_UNUSED_POINTS_REVISION = 'owner-unused-points-verified-v1'
const OWNER_HASH = '55055d5f79ce5573d5fb08fb0b0ca7295fe32385ba172872dc2843b51d5d7249'
const DEADLINE = Date.parse('2026-10-16T00:00:00Z')
const SIGN_CONTEXT = 'WORLDIFACT-OWNER-UNUSED-POINTS-20261014-v1:'
const MAX_PAGES = 24
const ACCOUNT_ID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/
const SHA = /^[a-f0-9]{64}$/
type RecoveryEnv = EntitlementEnv & PlatformEnv & {
  ENFORCE_ACCOUNT_ENTITLEMENTS?: string
  ACCOUNT_LIMITER?: { limit(options: { key: string }): Promise<{ success: boolean }> }
}
type Expected = { held: number; zeroCount: number; zeroDigest: string; zeroPoints: number }
type Input = { uid: string; at: number; operation: 'preview' | 'release-zero'; expected?: Expected }
type Eligible = { id: string; receipt: TerminalBudgetReceipt; points: number }
type Discovery = { eligible: Eligible[]; scanned: number; unresolved: number; positive: number; ignored: number; blueprints: number; pages: number }
const encode = (value: string) => new TextEncoder().encode(value)
const hex = (buffer: ArrayBuffer) => [...new Uint8Array(buffer)].map(x => x.toString(16).padStart(2, '0')).join('')
const digest = async (value: string) => hex(await crypto.subtle.digest('SHA-256', encode(value)))
const reply = (value: object, status = 200) => Response.json(value, {
  status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', Vary: 'Origin', 'Referrer-Policy': 'no-referrer' },
})
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
const validPoints = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= 1_000_000
function validInput(value: unknown): value is Input {
  if (!record(value) || !['uid', 'at', 'operation', 'expected'].every(key => key in value || key === 'expected') ||
      Object.keys(value).some(key => !['uid','at','operation','expected'].includes(key)) ||
      typeof value.uid !== 'string' || !ACCOUNT_ID.test(value.uid) ||
      !Number.isSafeInteger(value.at) || !['preview','release-zero'].includes(String(value.operation))) return false
  if (value.operation === 'preview') return !Object.hasOwn(value, 'expected')
  const expected = value.expected
  return record(expected) && Object.keys(expected).sort().join(',') === 'held,zeroCount,zeroDigest,zeroPoints' &&
    validPoints(expected.held) && Number.isInteger(expected.zeroCount) && Number(expected.zeroCount) >= 1 && Number(expected.zeroCount) <= MAX_PAGES * 8 &&
    typeof expected.zeroDigest === 'string' && SHA.test(expected.zeroDigest) && validPoints(expected.zeroPoints)
}
async function limitedBody(request: Request) {
  if (!/^application\/json(?:;\s*charset=utf-8)?$/i.test(request.headers.get('Content-Type') || '') ||
      Number(request.headers.get('Content-Length')) > 800) throw new Error('INVALID_BODY')
  const reader = request.body?.getReader()
  if (!reader) throw new Error('INVALID_BODY')
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let count = 0, text = ''
  for (;;) {
    const chunk = await reader.read()
    if (chunk.done) break
    count += chunk.value.byteLength
    if (count > 800) { await reader.cancel(); throw new Error('INVALID_BODY') }
    text += decoder.decode(chunk.value, { stream: true })
  }
  text += decoder.decode()
  if (!text || text.length > 800) throw new Error('INVALID_BODY')
  const value: unknown = JSON.parse(text)
  if (!validInput(value)) throw new Error('INVALID_BODY')
  return { value, text }
}
async function authorized(request: Request, env: RecoveryEnv, source: string) {
  const signature = request.headers.get('X-WORLDIFACT-Owner-Maintenance-Proof')
  if (!signature || !SHA.test(signature) || !env.OWNER_ACCESS_TOKEN ||
      !/^[A-Za-z0-9_-]{32,256}$/.test(env.OWNER_ACCESS_TOKEN)) return false
  const key = await crypto.subtle.importKey('raw', encode(env.OWNER_ACCESS_TOKEN), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
  const actual = new Uint8Array(signature.match(/../g)!.map(part => parseInt(part, 16)))
  return crypto.subtle.verify('HMAC', key, actual, encode(SIGN_CONTEXT + source))
}
async function safeJson(response: Response, id: string): Promise<TerminalBudgetReceipt | null> {
  if (response.status !== 200 || !response.headers.get('content-type')?.includes('application/json')) {
    await response.body?.cancel(); return null
  }
  const buffer = new Uint8Array(await response.arrayBuffer())
  if (buffer.length < 20 || buffer.length > 4096) return null
  try {
    const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer))
    return validateTerminalBudgetReceipt(value, id) ? value : null
  } catch { return null }
}
async function discover(uid: string, env: RecoveryEnv, fetcher: typeof fetch): Promise<Discovery> {
  const endpoint = oracleOrigin(env.ORACLE_ENDPOINT)
  if (!endpoint || !env.ORACLE_API_TOKEN || !env.ACCOUNT_ENTITLEMENTS) throw new Error('PRODUCTION_NOT_READY')
  let cursor: string | null = null
  const seen = new Set<string>()
  const outcome: Discovery = { eligible: [], scanned: 0, unresolved: 0, positive: 0, ignored: 0, blueprints: 0, pages: 0 }
  for (let pageNumber = 0; pageNumber < MAX_PAGES; pageNumber++) {
    const page = await pendingUserStudioProvider(env, uid, cursor)
    outcome.pages++
    outcome.blueprints += page.blueprintIds.length
    const groups = [] as string[][]
    for (let offset = 0; offset < page.ids.length; offset += 5) groups.push(page.ids.slice(offset, offset + 5))
    for (const group of groups) {
      const results = await Promise.all(group.map(async id => {
        try {
          if (seen.has(id)) throw new Error('DUPLICATED_JOB')
          seen.add(id)
          const access = await userJobAccess(env, uid, id)
          if (!access?.owned || access.state !== 'failed' || access.pointSettlement?.state !== 'pending-cost' ||
              !Number.isSafeInteger(access.pointSettlement.heldPoints) || access.pointSettlement.heldPoints <= 0 ||
              !Number.isSafeInteger(access.cost) || access.cost <= 0 || access.cost !== access.pointSettlement.heldPoints)
            return { kind: 'ignored' as const }
          const response = await fetcher(endpoint + '/v1/jobs/' + id + '/budget', {
            method: 'GET', redirect: 'error', headers: { Authorization: 'Bearer ' + env.ORACLE_API_TOKEN, Accept: 'application/json' },
            signal: AbortSignal.timeout(6000),
          })
          const receipt = await safeJson(response, id)
          if (!receipt) return { kind: 'unresolved' as const }
          if (receipt.maximumLiabilityMicroUsd > 0) return { kind: 'positive' as const }
          return { kind: 'eligible' as const, receipt, id, points: access.cost }
        } catch { return { kind: 'unresolved' as const } }
      }))
      for (const result of results) {
        outcome.scanned++
        if (result.kind === 'eligible') outcome.eligible.push({ id: result.id, receipt: result.receipt, points: result.points })
        if (result.kind === 'positive') outcome.positive++
        if (result.kind === 'unresolved') outcome.unresolved++
        if (result.kind === 'ignored') outcome.ignored++
      }
    }
    if (!page.hasMore) return outcome
    if (!page.nextCursor || page.nextCursor === cursor) throw new Error('HISTORY_CURSOR_INVALID')
    cursor = page.nextCursor
  }
  throw new Error('HISTORY_SCAN_INCOMPLETE')
}
async function discoveryDigest(rows: Eligible[]) {
  return digest(JSON.stringify([...rows]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(row => [row.id, row.points, row.receipt.sealId, row.receipt.maximumLiabilityMicroUsd])))
}
/** Never call generation endpoints. The only write is existing atomic,
 * account-bound reconciliation of an authenticated ZERO-liability receipt. */
/** The optional hash argument exists only for deterministic native fixture tests;
 * the production Worker always calls the default pinned owner commitment. */
export async function ownerUnusedPointsApi(request: Request, env: RecoveryEnv, fetcher: typeof fetch = fetch, fixtureOwnerHash: string = OWNER_HASH): Promise<Response | null> {
  if (new URL(request.url).pathname !== OWNER_UNUSED_POINTS_PATH) return null
  if (request.method !== 'POST' || new URL(request.url).search || request.headers.get('Origin') !== new URL(request.url).origin ||
      request.headers.get('Sec-Fetch-Site') === 'cross-site') return reply({ error: 'MAINTENANCE_UNAVAILABLE' }, 403)
  if (env.ACCOUNT_LEDGER_MODE === 'sandbox' || env.ENFORCE_ACCOUNT_ENTITLEMENTS !== 'true' ||
      Date.now() >= DEADLINE || !env.ACCOUNT_ENTITLEMENTS || !env.ACCOUNT_LIMITER) return reply({ error: 'MAINTENANCE_UNAVAILABLE' }, 503)
  let parsed
  try { parsed = await limitedBody(request) }
  catch { return reply({ error: 'INVALID_REQUEST' }, 400) }
  if (await digest(parsed.value.uid) !== fixtureOwnerHash || Math.abs(Date.now() - parsed.value.at) > 90_000 ||
      !(await authorized(request, env, parsed.text))) return reply({ error: 'NOT_AUTHORIZED' }, 403)
  try {
    if (!(await env.ACCOUNT_LIMITER.limit({ key: 'owner-unused-points-20261014:' + OWNER_HASH })).success)
      return reply({ error: 'WAIT_BEFORE_NEXT_CHECK' }, 429)
  } catch { return reply({ error: 'RATE_LIMIT_UNAVAILABLE' }, 503) }
  try {
    const before = await entitlementCall<EntitlementStatus>(env, parsed.value.uid, '/status')
    if (!validPoints(before.credits) || !validPoints(before.reservedCredits) || !validPoints(before.availableCredits) ||
        before.credits - before.reservedCredits !== before.availableCredits) throw new Error('BALANCE_INVALID')
    const discovery = await discover(parsed.value.uid, env, fetcher)
    const zeroDigest = await discoveryDigest(discovery.eligible)
    const zeroCount = discovery.eligible.length
    const zeroPoints = discovery.eligible.reduce((sum, item) => sum + item.points, 0)
    if (!validPoints(zeroPoints)) throw new Error('TOTAL_INVALID')
    const common = {
      revision: OWNER_UNUSED_POINTS_REVISION, before: { credits: before.credits, held: before.reservedCredits, available: before.availableCredits },
      checked: discovery.scanned, pages: discovery.pages, refundableJobs: zeroCount, refundablePoints: zeroPoints,
      positiveProviderCost: discovery.positive, receiptsUnavailable: discovery.unresolved, skipped: discovery.ignored,
      blueprintForReview: discovery.blueprints, zeroDigest, paidGenerationRequested: false,
    }
    if (parsed.value.operation === 'preview') return reply({ status: 'preview', ...common })
    const expected = parsed.value.expected!
    if (expected.held !== before.reservedCredits || expected.zeroCount !== zeroCount ||
        expected.zeroDigest !== zeroDigest || expected.zeroPoints !== zeroPoints)
      return reply({ status: 'changed-since-preview', ...common }, 409)
    let releasedJobs = 0, releasedPoints = 0, refusedJobs = 0
    for (const row of discovery.eligible) {
      const result = await reconcileUserStudioProvider(env, parsed.value.uid, row.id, row.receipt)
      const next = await userJobAccess(env, parsed.value.uid, row.id)
      if (result.reconciled && !result.repeated && next.owned && next.pointSettlement?.state === 'released') {
        releasedJobs++
        releasedPoints += row.points
      } else refusedJobs++
    }
    const after = await entitlementCall<EntitlementStatus>(env, parsed.value.uid, '/status')
    if (!validPoints(after.credits) || !validPoints(after.reservedCredits) || !validPoints(after.availableCredits))
      throw new Error('POST_SETTLEMENT_UNAVAILABLE')
    return reply({ status: 'reconciled', ...common, releasedJobs, releasedPoints, refusedJobs,
      after: { credits: after.credits, held: after.reservedCredits, available: after.availableCredits } })
  } catch {
    return reply({ error: 'VERIFIED_RECONCILIATION_UNAVAILABLE', retryGeneration: false }, 503)
  }
}
