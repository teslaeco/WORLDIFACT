import { getVerifiedAccount, type AccountEnv } from './accounts.ts'
import type { EntitlementEnv, EntitlementStorage } from './entitlements.ts'
import { PROMOTION_CAMPAIGN_ID, PROMOTION_CODE_HASHES, PROMOTION_POINTS } from './promotionCampaign.ts'
import { normalizePromotionCode, readPromotionReply, type PromotionReply } from '../src/lib/promotionCode.ts'

const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/
const HASH = /^[a-f0-9]{64}$/
const CLAIM_KEY = 'promotion-claim:v1'
const HELD_KEY = 'customer-reserved-credits:v1'
const START = Date.parse('2026-10-10T00:00:00Z')
const MAX_BODY = 512
const RECORD_KEYS = 'accountId,campaignId,claimedAt,codeHash,points,revision'
export type PromotionEnv = EntitlementEnv & { ENABLE_PROMOTIONAL_CODES?: string }
export type PromotionCampaign = { id: string; points: 1000; hashes: readonly string[] }
export const REGISTERED_PROMOTIONS: PromotionCampaign = Object.freeze({ id: PROMOTION_CAMPAIGN_ID, points: PROMOTION_POINTS, hashes: PROMOTION_CODE_HASHES })
type Claim = { revision: 'promotion-v1'; campaignId: string; points: 1000; codeHash: string; accountId: string; claimedAt: number }
type Receipt = Claim & { appliedAt: number; balanceBefore: number; balanceAfter: number }
class PromotionError extends Error {
  status: number
  constructor(message: string, status: number) { super(message); this.status = status }
}
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: {
  'Cache-Control': 'private, no-store', Vary: 'Cookie', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
} })
const failed = (error: unknown) => json({ error: error instanceof PromotionError ? error.message :
  'The result is not confirmed. Retry the same code on the same account; it cannot add points twice.' }, error instanceof PromotionError ? error.status : 503)
export const promotionHash = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), n => n.toString(16).padStart(2, '0')).join('')
function configured(env: PromotionEnv, campaign: PromotionCampaign) {
  return env.ENABLE_PROMOTIONAL_CODES !== 'false' && (env.ACCOUNT_LEDGER_MODE === undefined || env.ACCOUNT_LEDGER_MODE === 'live') &&
    campaign.id === PROMOTION_CAMPAIGN_ID && campaign.points === 1000 && campaign.hashes.length === 10 && new Set(campaign.hashes).size === 10 && campaign.hashes.every(x => HASH.test(x))
}
function approvedHash(value: unknown, campaign: PromotionCampaign): value is string { return typeof value === 'string' && HASH.test(value) && campaign.hashes.includes(value) }
function validClaim(value: unknown, campaign: PromotionCampaign, hash: string, account: string, now: number): value is Claim {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const r = value as Claim
  return Object.keys(r).sort().join(',') === RECORD_KEYS && r.revision === 'promotion-v1' && r.campaignId === campaign.id && r.points === 1000 &&
    r.codeHash === hash && r.accountId === account && UUID.test(r.accountId) && Number.isSafeInteger(r.claimedAt) && r.claimedAt >= START && r.claimedAt <= now
}
function validReceipt(value: unknown, claim: Claim, now: number): value is Receipt {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const r = value as Receipt
  if (Object.keys(r).sort().join(',') !== 'accountId,appliedAt,balanceAfter,balanceBefore,campaignId,claimedAt,codeHash,points,revision') return false
  return Object.entries(claim).every(([key, value]) => r[key as keyof Receipt] === value) && Number.isSafeInteger(r.appliedAt) && r.appliedAt >= claim.claimedAt && r.appliedAt <= now &&
    Number.isSafeInteger(r.balanceBefore) && r.balanceBefore >= 0 && Number.isSafeInteger(r.balanceAfter) && r.balanceAfter === r.balanceBefore + 1000
}
async function body(request: Request): Promise<Record<string, unknown>> {
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('Content-Type') ?? '') ||
      Number(request.headers.get('Content-Length')) > MAX_BODY) throw new PromotionError('Invalid promotion request.', 400)
  const reader = request.body?.getReader()
  if (!reader) throw new PromotionError('Invalid promotion request.', 400)
  const parts: Uint8Array[] = []; let size = 0, timer: ReturnType<typeof setTimeout> | undefined
  try {
    const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => { void reader.cancel().catch(() => {}); reject(new PromotionError('Promotion request timed out.', 408)) }, 5000) })
    for (;;) {
      const part = await Promise.race([reader.read(), deadline]); if (part.done) break
      size += part.value.byteLength
      if (size > MAX_BODY) throw new PromotionError('Promotion request is too large.', 413)
      parts.push(part.value)
    }
    const bytes = new Uint8Array(size); let offset = 0
    for (const part of parts) { bytes.set(part, offset); offset += part.byteLength }
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    const parsed: unknown = JSON.parse(text)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid object')
    // Only bounded plain-string fields are allowed; escaped names, duplicate
    // keys and nested objects cannot hide an amount, account or code override.
    const keys = [...text.matchAll(/"([A-Za-z][A-Za-z0-9]*)"\s*:/g)].map(x => x[1])
    if (new Set(keys).size !== keys.length || keys.length !== Object.keys(parsed).length || text.includes('\\')) throw new Error('Ambiguous JSON')
    return parsed as Record<string, unknown>
  } catch (error) { await reader.cancel().catch(() => {}); if (error instanceof PromotionError) throw error; throw new PromotionError('Invalid promotion request.', 400) }
  finally { if (timer) clearTimeout(timer) }
}
async function currentBalance(storage: EntitlementStorage) {
  const [raw, reserved, review] = await Promise.all([storage.get<unknown>('balance'), storage.get<unknown>(HELD_KEY), storage.get<unknown>('billingHold')])
  const total = raw === undefined ? 0 : raw, held = reserved === undefined ? 0 : reserved
  if (typeof total !== 'number' || typeof held !== 'number' || !Number.isSafeInteger(total) || !Number.isSafeInteger(held) || total < 0 || held < 0 || held > total ||
      review !== undefined && typeof review !== 'boolean') throw new PromotionError('Account balance needs review before a code can be used.', 409)
  if (review === true) throw new PromotionError('Resolve the account billing review before using a code.', 409)
  return { total, held, available: total - held }
}
function namespace(env: PromotionEnv, name: string, objectId: string | null) {
  return !!env.ACCOUNT_ENTITLEMENTS && objectId !== null && objectId === String(env.ACCOUNT_ENTITLEMENTS.idFromName(name))
}
async function call(env: PromotionEnv, name: string, path: string, accountId: string, codeHash: string) {
  if (!env.ACCOUNT_ENTITLEMENTS) throw new Error('Missing account storage')
  const object = env.ACCOUNT_ENTITLEMENTS.get(env.ACCOUNT_ENTITLEMENTS.idFromName(name))
  return object.fetch(new Request('https://entitlements.internal' + path, { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-WORLDIFACT-Verified-Account': accountId }, body: JSON.stringify({ codeHash }), signal: AbortSignal.timeout(5000) }))
}
/** This is a sticky global claim followed by a transactional account grant.
 * A lost acknowledgement never releases/reassigns the claim. The same account
 * can retry until its deterministic receipt exists, without duplicate credit.
 * No network request occurs inside a Durable Object storage transaction. */
export async function promotionLedgerRoute(request: Request, storage: EntitlementStorage, env: PromotionEnv, objectId: string | null,
  now = Date.now(), campaign = REGISTERED_PROMOTIONS): Promise<Response> {
  try {
    const url = new URL(request.url), path = url.pathname, account = request.headers.get('X-WORLDIFACT-Verified-Account') ?? ''
    if (!configured(env, campaign) || !Number.isSafeInteger(now) || now < START) return json({ error: 'Promotional codes are unavailable.' }, 503)
    if (url.origin !== 'https://entitlements.internal' || url.search || request.method !== 'POST' || !UUID.test(account)) return json({ error: 'Invalid promotion operation.' }, 400)
    const input = await body(request)
    if (Object.keys(input).length !== 1 || !approvedHash(input.codeHash, campaign)) return json({ error: 'The promotional code is invalid.' }, 400)
    const hash = input.codeHash, codeName = 'promotion-code:v1:' + hash, accountName = 'account:v1:' + account
    if (path === '/promo/code/claim' || path === '/promo/code/status') {
      if (!namespace(env, codeName, objectId)) return json({ error: 'Invalid promotion storage.' }, 403)
      return json(await storage.transaction(async tx => {
        const prior = await tx.get<unknown>(CLAIM_KEY)
        if (prior !== undefined) {
          const owner = prior && typeof prior === 'object' && !Array.isArray(prior) ? (prior as Claim).accountId : ''
          if (!validClaim(prior, campaign, hash, owner, now)) throw new Error('Invalid original claim')
          if (owner !== account) throw new PromotionError('This code has already been used.', 409)
          return prior
        }
        if (path.endsWith('/status')) throw new PromotionError('A confirmed code claim is required.', 409)
        const claim: Claim = { revision: 'promotion-v1', campaignId: campaign.id, points: 1000, codeHash: hash, accountId: account, claimedAt: now }
        await tx.put(CLAIM_KEY, claim)
        return claim
      }))
    }
    if (!namespace(env, accountName, objectId)) return json({ error: 'Invalid account storage.' }, 403)
    if (path === '/promo/account/check') return json(await storage.transaction(currentBalance))
    if (path !== '/promo/account/grant') return json({ error: 'Unknown promotion operation.' }, 404)
    const confirmation = await call(env, codeName, '/promo/code/status', account, hash)
    if (!confirmation.ok) throw new PromotionError('The original code claim could not be confirmed. Retry the same code.', 409)
    const claim: unknown = await confirmation.json()
    if (!validClaim(claim, campaign, hash, account, now)) throw new Error('Unconfirmed owner claim')
    return json(await storage.transaction(async tx => {
      const key = 'promotion-credit:v1:' + hash, prior = await tx.get<unknown>(key), balance = await currentBalance(tx)
      if (prior !== undefined && !validReceipt(prior, claim, now)) throw new Error('Invalid prior credit receipt')
      let total = balance.total
      if (prior === undefined) {
        total += 1000
        if (!Number.isSafeInteger(total)) throw new Error('Balance overflow')
        const receipt: Receipt = { ...claim, appliedAt: now, balanceBefore: balance.total, balanceAfter: total }
        await tx.put('balance', total)
        await tx.put(key, receipt)
      }
      // Purchased grant records, subscription, point holds, cost receipts and
      // provider-budget-cents:v1 are deliberately never changed by a promotion.
      const result: PromotionReply = { revision: 'promotion-v1', status: prior === undefined ? 'redeemed' : 'already-redeemed', points: 1000,
        receiptId: 'promo:' + hash, accountId: account, balance: { total, held: balance.held, available: total - balance.held } }
      return result
    }))
  } catch (error) { return failed(error) }
}
/** Public, authenticated same-origin route. Client-supplied account identifiers
 * only fence a stale UI session; they can never select a different beneficiary. */
export async function promotionApi(request: Request, env: AccountEnv & PromotionEnv, fetcher: typeof fetch = fetch,
  campaign = REGISTERED_PROMOTIONS): Promise<Response> {
  const url = new URL(request.url)
  if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Use GET or POST.' }, 405)
  if (url.search) return json({ error: 'Query parameters are not supported.' }, 400)
  if (request.headers.get('Sec-Fetch-Site') === 'cross-site' || request.headers.has('Origin') && request.headers.get('Origin') !== url.origin ||
      request.method === 'POST' && request.headers.get('Origin') !== url.origin) return json({ error: 'Same-origin access required.' }, 403)
  try {
    const user = await getVerifiedAccount(request, env, fetcher)
    if (!user) return json({ error: 'Sign in before using a promotional code.' }, 401)
    if (user.emailVerified !== true) return json({ error: 'Confirm your account email before using a code.' }, 403)
    const limiter = env.ACCOUNT_LIMITER ?? env.GENERATION_LIMITER
    if (!limiter || !env.ACCOUNT_ENTITLEMENTS) return json({ error: 'Promotion protection is unavailable.' }, 503)
    if (!(await limiter.limit({ key: 'account:promotion:' + user.id.toLowerCase() })).success) return json({ error: 'Please wait before trying the code again.' }, 429)
    if (request.method === 'GET') return json({ revision: 'promotion-v1', configured: configured(env, campaign), points: 1000, campaignId: campaign.id, accountId: user.id.toLowerCase() })
    if (!configured(env, campaign)) return json({ error: 'Promotional codes are not activated.' }, 503)
    const input = await body(request), account = user.id.toLowerCase()
    if (Object.keys(input).sort().join(',') !== 'code,expectedAccountId' || input.expectedAccountId !== account) return json({ error: 'The signed-in account changed. Refresh before using this code.' }, 409)
    const code = normalizePromotionCode(input.code)
    if (!code) return json({ error: 'Enter the complete promotional code.' }, 400)
    const hash = await promotionHash(code)
    if (!approvedHash(hash, campaign)) return json({ error: 'The promotional code is invalid.' }, 400)
    const preflight = await call(env, 'account:v1:' + account, '/promo/account/check', account, hash)
    if (!preflight.ok) return json({ error: 'The account needs review before this code can be claimed.' }, preflight.status === 409 ? 409 : 503)
    const claimResponse = await call(env, 'promotion-code:v1:' + hash, '/promo/code/claim', account, hash)
    if (claimResponse.status === 409) return json({ error: 'This code has already been used.' }, 409)
    if (!claimResponse.ok || !validClaim(await claimResponse.json(), campaign, hash, account, Date.now())) throw new Error('Unconfirmed claim')
    const grant = await call(env, 'account:v1:' + account, '/promo/account/grant', account, hash)
    if (!grant.ok) throw new Error('Unconfirmed account grant')
    const result = readPromotionReply(await grant.json(), account)
    if (result.receiptId !== 'promo:' + hash) throw new Error('Wrong code receipt')
    return json(result)
  } catch (error) { return failed(error) }
}
