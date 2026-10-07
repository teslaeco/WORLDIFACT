import { getVerifiedAccount, type AccountEnv } from './accounts.ts'
import type { EntitlementEnv, EntitlementStorage } from './entitlements.ts'
import { OWNER_RESERVE_ADJUSTMENT_APPROVAL, OWNER_RESERVE_ADJUSTMENT_REVISION, readOwnerReserveAdjustmentResponse,
  type OwnerReserveAdjustmentResponse } from '../src/lib/ownerReserveAdjustment.ts'

export const OWNER_RESERVE_ADJUSTMENT_KEY = 'owner-reserve-adjustment:20261007:v1'
const RESERVE_KEY = 'provider-budget-cents:v1'
const HELD_KEY = 'customer-reserved-credits:v1'
const ISSUED_AT = Date.parse('2026-10-07T06:30:00.000Z')
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i
const SHA256 = /^[a-f0-9]{64}$/
const INVOICE = /^in_[A-Za-z0-9]{1,180}$/
const INVOICE_SCAN_LIMIT = 64
export type OwnerReserveAdjustmentAuthority = Readonly<{
  ownerAccountSha256: string
  stripeCustomerSha256: string
  subscriptionSha256: string
  invoiceSha256: readonly [string, string]
  authorizationReferenceSha256: string
}>
// Commitments bind the verified owner's existing paid invoices and the exact
// one-time approval. Never source this authority from an environment or request.
const APPROVED_AUTHORITY: OwnerReserveAdjustmentAuthority = Object.freeze({
  ownerAccountSha256: '55055d5f79ce5573d5fb08fb0b0ca7295fe32385ba172872dc2843b51d5d7249',
  stripeCustomerSha256: 'd8271adb1c72b0c8923c500661e0a83c10c9c20600d588ad2e90336701f7c417',
  subscriptionSha256: 'c3f3a767b0a3f4893d1626482d768bc7d4feb75f296b3784923b4c2982943552',
  invoiceSha256: Object.freeze(['9a112b04ac4e17d7c1f2c960cb990e551fea475aefe0c18f4553005224b20708',
    '055a38c6eef8ad0c2474e4030e3cc581d446562a4db70ac8b0287a44acabe363']) as readonly [string, string],
  authorizationReferenceSha256: '0f5a67ab8d7d84cfc7e3803470af3ab10e30bb151d234b11ed081d80e130066c',
})

type BlockCode = 'BASELINE_CHANGED' | 'PAYMENT_BINDING_INVALID' | 'AUDIT_INVALID'
type Failure = { error: string; code?: BlockCode }
export type OwnerReserveAdjustmentResult = { status: 200; body: OwnerReserveAdjustmentResponse } | { status: 403 | 409; body: Failure }
type Audit = Omit<OwnerReserveAdjustmentResponse, 'status'> & OwnerReserveAdjustmentAuthority
const unavailable = (): OwnerReserveAdjustmentResult => ({ status: 403, body: { error: 'This adjustment is unavailable.' } })
const blocked = (code: BlockCode): OwnerReserveAdjustmentResult => ({ status: 409, body: { error: 'Owner reserve adjustment cannot be applied.', code } })
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: {
  'Cache-Control': 'private, no-store', Vary: 'Cookie', 'X-Content-Type-Options': 'nosniff',
  ...(status === 405 ? { Allow: 'GET, POST' } : {}),
} })
const hash = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), byte => byte.toString(16).padStart(2, '0')).join('')
function validAuthority(authority: OwnerReserveAdjustmentAuthority | null): authority is OwnerReserveAdjustmentAuthority {
  return !!authority && Object.keys(authority).length === 5 &&
    ['ownerAccountSha256', 'stripeCustomerSha256', 'subscriptionSha256', 'authorizationReferenceSha256'].every(key => {
      const value = authority[key as keyof OwnerReserveAdjustmentAuthority]; return typeof value === 'string' && SHA256.test(value)
    }) &&
    Array.isArray(authority.invoiceSha256) && authority.invoiceSha256.length === 2 && authority.invoiceSha256.every(value => typeof value === 'string' && SHA256.test(value)) &&
    authority.invoiceSha256[0] !== authority.invoiceSha256[1]
}
async function approvedOwner(account: unknown, authority: OwnerReserveAdjustmentAuthority | null): Promise<boolean> {
  return validAuthority(authority) && typeof account === 'string' && UUID.test(account) && await hash(account.toLowerCase()) === authority.ownerAccountSha256
}
function response(status: OwnerReserveAdjustmentResponse['status'], appliedAt: number | null): OwnerReserveAdjustmentResponse {
  return { revision: OWNER_RESERVE_ADJUSTMENT_REVISION, status, approvalId: OWNER_RESERVE_ADJUSTMENT_APPROVAL, amountCents: 112,
    before: { reserveCents: 63, points: 1440, heldPoints: 0 }, after: { reserveCents: 175, points: 1440, heldPoints: 0 }, generationStarted: false, appliedAt }
}
function validAudit(value: unknown, authority: OwnerReserveAdjustmentAuthority, now: number): value is Audit {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const audit = value as Audit
  if (Object.keys(audit).length !== 12 || audit.ownerAccountSha256 !== authority.ownerAccountSha256 || audit.subscriptionSha256 !== authority.subscriptionSha256 ||
      audit.stripeCustomerSha256 !== authority.stripeCustomerSha256 || audit.authorizationReferenceSha256 !== authority.authorizationReferenceSha256 ||
      !Array.isArray(audit.invoiceSha256) || audit.invoiceSha256.length !== 2 || audit.invoiceSha256.some((item, index) => item !== authority.invoiceSha256[index]) ||
      !Number.isSafeInteger(audit.appliedAt) || Number(audit.appliedAt) < ISSUED_AT || Number(audit.appliedAt) > now) return false
  const { ownerAccountSha256: _owner, stripeCustomerSha256: _customer, subscriptionSha256: _subscription, authorizationReferenceSha256: _authorization, invoiceSha256: _invoices, ...publicFields } = audit
  try { readOwnerReserveAdjustmentResponse({ ...publicFields, status: 'applied' }); return true } catch { return false }
}
async function paidUnreversedInvoiceGrant(value: unknown, expectedCredits: 1500 | 4500, subscriptionSha256: string): Promise<boolean> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const grant = value as Record<string, unknown>
  return Object.keys(grant).length === 3 &&
    Object.keys(grant).every(key => ['credits', 'revoked', 'subscriptionId'].includes(key)) &&
    grant.credits === expectedCredits && grant.revoked === 0 && typeof grant.subscriptionId === 'string' &&
    /^sub_[A-Za-z0-9]{1,180}$/.test(grant.subscriptionId) && await hash(grant.subscriptionId) === subscriptionSha256
}
async function paymentBinding(storage: EntitlementStorage, authority: OwnerReserveAdjustmentAuthority): Promise<boolean> {
  const customer = await storage.get('customer')
  if (typeof customer !== 'string' || !/^cus_[A-Za-z0-9]{1,180}$/.test(customer) || await hash(customer) !== authority.stripeCustomerSha256 || !storage.list) return false
  const entries = await storage.list({ prefix: 'grant:in_', limit: INVOICE_SCAN_LIMIT })
  if (!(entries instanceof Map) || entries.size >= INVOICE_SCAN_LIMIT) return false
  const found = new Set<string>()
  for (const [key, grant] of entries) {
    if (typeof key !== 'string' || !key.startsWith('grant:') || !INVOICE.test(key.slice(6))) return false
    const commitment = await hash(key.slice(6))
    if (authority.invoiceSha256.includes(commitment)) {
      if (!await paidUnreversedInvoiceGrant(grant, authority.invoiceSha256.indexOf(commitment) === 0 ? 1500 : 4500, authority.subscriptionSha256)) return false
      found.add(commitment)
    }
  }
  return found.size === 2
}

/** The caller owns the native transaction; no network, initialization, refunds or
 * generation are performed. The authority argument exists for pure fixture tests;
 * both production entrypoints below pass only the reviewed fixed authority. */
export async function evaluateOwnerReserveAdjustment(storage: EntitlementStorage, account: unknown, apply: boolean,
  authority: OwnerReserveAdjustmentAuthority | null, now: number): Promise<OwnerReserveAdjustmentResult> {
  if (!await approvedOwner(account, authority)) return unavailable()
  if (!Number.isSafeInteger(now) || now < ISSUED_AT) return unavailable()
  const approved = authority!
  const saved = await storage.get(OWNER_RESERVE_ADJUSTMENT_KEY)
  if (saved !== undefined) {
    if (!validAudit(saved, approved, now)) return blocked('AUDIT_INVALID')
    // An immutable, valid previous application takes precedence over changed
    // balances or later payment state. It can never replenish the reserve again.
    return { status: 200, body: response('already-applied', saved.appliedAt) }
  }
  if (!await paymentBinding(storage, approved)) return blocked('PAYMENT_BINDING_INVALID')
  const [reserve, points, held, billingHold] = await Promise.all([
    storage.get(RESERVE_KEY), storage.get('balance'), storage.get(HELD_KEY), storage.get('billingHold'),
  ])
  if (reserve !== 63 || points !== 1440 || held !== undefined && held !== 0 || billingHold !== undefined && billingHold !== false)
    return blocked('BASELINE_CHANGED')
  if (!apply) return { status: 200, body: response('preview', null) }
  const result = response('applied', now)
  const { status: _status, ...terms } = result
  const audit: Audit = { ...terms, ...approved, invoiceSha256: [...approved.invoiceSha256] }
  await storage.put(RESERVE_KEY, 175)
  await storage.put(OWNER_RESERVE_ADJUSTMENT_KEY, audit)
  return { status: 200, body: result }
}

async function validApplyRequest(request: Request): Promise<boolean> {
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('Content-Type') ?? '') ||
      Number(request.headers.get('Content-Length')) > 256) return false
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
    // Exact one-key JSON also rejects duplicate keys and coercible payloads.
    return /^\s*\{\s*"approvalId"\s*:\s*"owner-reserve-adjustment-20261007-v1"\s*\}\s*$/.test(text)
  } catch { await reader.cancel().catch(() => {}); return false }
}

export async function ownerReserveAdjustmentLedgerRoute(request: Request, storage: EntitlementStorage, env: EntitlementEnv,
  namespaceMatches: boolean, now = Date.now()): Promise<Response> {
  if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Use GET or POST.' }, 405)
  if (new URL(request.url).search) return json({ error: 'Query parameters are not supported.' }, 400)
  if (!namespaceMatches || env.ACCOUNT_LEDGER_MODE !== undefined && env.ACCOUNT_LEDGER_MODE !== 'live') return json(unavailable().body, 403)
  if (request.method === 'POST' && !await validApplyRequest(request)) return json({ error: 'Invalid adjustment request.' }, 400)
  const result = await storage.transaction(tx => evaluateOwnerReserveAdjustment(tx, request.headers.get('X-WORLDIFACT-Verified-Account'),
    request.method === 'POST', APPROVED_AUTHORITY, now))
  return json(result.body, result.status)
}

/** Authenticated self-service only; cookies are verified by the existing account
 * boundary. Client identity, amounts, internal headers and env grants have no role. */
export async function ownerReserveAdjustmentApi(request: Request, env: AccountEnv & EntitlementEnv, fetcher: typeof fetch = fetch): Promise<Response> {
  const url = new URL(request.url)
  if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Use GET or POST.' }, 405)
  if (url.search) return json({ error: 'Query parameters are not supported.' }, 400)
  if (request.headers.get('Sec-Fetch-Site') === 'cross-site' || request.headers.has('Origin') && request.headers.get('Origin') !== url.origin ||
      request.method === 'POST' && request.headers.get('Origin') !== url.origin)
    return json({ error: 'Same-origin account access required.' }, 403)
  try {
    const user = await getVerifiedAccount(request, env, fetcher)
    if (!user) return json({ error: 'Sign in to view your reserve adjustment.' }, 401)
    const limiter = env.ACCOUNT_LIMITER ?? env.GENERATION_LIMITER
    if (!limiter) return json({ error: 'Account protection is unavailable.' }, 503)
    if (!(await limiter.limit({ key: `account:owner-reserve-adjustment:${user.id.toLowerCase()}` })).success)
      return json({ error: 'Please wait before checking the adjustment again.' }, 429)
    if (!await approvedOwner(user.id, APPROVED_AUTHORITY) || env.ACCOUNT_LEDGER_MODE !== undefined && env.ACCOUNT_LEDGER_MODE !== 'live') return json(unavailable().body, 403)
    if (request.method === 'POST' && !await validApplyRequest(request)) return json({ error: 'Invalid adjustment request.' }, 400)
    if (!env.ACCOUNT_ENTITLEMENTS) throw new Error('No account storage')
    const account = user.id.toLowerCase()
    const object = env.ACCOUNT_ENTITLEMENTS.get(env.ACCOUNT_ENTITLEMENTS.idFromName(`account:v1:${account}`))
    const result = await object.fetch(new Request('https://entitlements.internal/owner-reserve-adjustment', {
      method: request.method, headers: { 'X-WORLDIFACT-Verified-Account': account, 'Content-Type': 'application/json' },
      ...(request.method === 'POST' ? { body: JSON.stringify({ approvalId: OWNER_RESERVE_ADJUSTMENT_APPROVAL }) } : {}), signal: AbortSignal.timeout(5000),
    }))
    const body = await result.json() as Record<string, unknown>
    if (result.status === 200) return json(readOwnerReserveAdjustmentResponse(body))
    if (result.status === 403) return json(unavailable().body, 403)
    if (result.status === 409 && body && Object.keys(body).length === 2 && body.error === 'Owner reserve adjustment cannot be applied.' &&
        ['BASELINE_CHANGED', 'PAYMENT_BINDING_INVALID', 'AUDIT_INVALID'].includes(body.code as string)) return json(blocked(body.code as BlockCode).body, 409)
    throw new Error('Unconfirmed adjustment result')
  } catch { return json({ error: 'The reserve adjustment is temporarily unavailable. Check its status before trying again.' }, 503) }
}
