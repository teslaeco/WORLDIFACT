import type { BudgetNamespace } from './budget.ts'
import { getVerifiedAccount, type AccountEnv } from './accounts.ts'

export interface EntitlementEnv {
  ACCOUNT_ENTITLEMENTS?: BudgetNamespace
  ENFORCE_ACCOUNT_ENTITLEMENTS?: string
  ACCOUNT_LEDGER_MODE?: string
}
export interface EntitlementStorage {
  get<T>(key: string): Promise<T | undefined>
  put(key: string, value: unknown): Promise<void>
  transaction<T>(callback: (storage: EntitlementStorage) => Promise<T>): Promise<T>
}
export type GenerationKind = 'fast' | 'slow'
type Usage = { id: string; at: number }
type Subscription = { id: string; until: number; active: boolean; revision: number; grantId?: string; terminal?: boolean }
type Job = { profile: GenerationKind; at: number; cost: number; kind: 'free' | 'credits'; state: 'reserved' | 'completed' | 'failed' }
export type Reservation = { allowed: boolean; repeated?: boolean; cost?: number; kind?: 'free' | 'credits'; reason?: string }
export type JobAccess = { owned: boolean; downloadAllowed: boolean; previewOnly: boolean; profile?: GenerationKind; state?: Job['state'] }
type Grant = { credits: number; revoked: number; subscriptionId?: string }
type Checkout = { id: string; created: number; url?: string; expiresAt?: number; sessionId?: string }
type PayPalCheckout = { id: string; created: number; orderId?: string; url?: string }
export interface EntitlementStatus {
  credits: number
  generationCost: 50
  subscriptionGrant: 1500
  subscription: { active: boolean; expiresAt: string | null }
  free: { fastRemaining: number; fastResetAt: string | null; slowRemaining: number; slowResetAt: string }
  slowDownloadRequiresSubscription: true
  billingReview: boolean
}
export const ACCOUNT_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
const JOB_ID = ACCOUNT_ID
const DAY = 86_400_000
const stripeId = /^(?:cus|sub|evt|in|cs|pi|ch)_[A-Za-z0-9_]{1,180}$/
const paypalId = /^[A-Z0-9]{10,40}$/
const grantId = (value: unknown): value is string => typeof value === 'string' && (stripeId.test(value) || /^pp_[A-Z0-9]{10,40}$/.test(value))
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } })
const active = (subscription: Subscription | undefined, now: number) => !!subscription?.active && subscription.until > now
const validInteger = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value)
export class EntitlementError extends Error {
  status: number
  constructor(message: string, status = 503) { super(message); this.status = status }
}
async function balance(storage: EntitlementStorage) {
  const value = await storage.get<number>('balance') ?? 0
  if (!validInteger(value)) throw new Error('Invalid balance')
  return value
}
async function usage(storage: EntitlementStorage, now: number) {
  const value = await storage.get<{ fast: Usage[]; slow: Usage[] }>('usage') ?? { fast: [], slow: [] }
  return {
    fast: value.fast.filter(item => item.at > now - DAY),
    slow: value.slow.filter(item => Math.floor(item.at / DAY) === Math.floor(now / DAY)),
  }
}
async function status(storage: EntitlementStorage, now: number): Promise<EntitlementStatus> {
  const [credits, free, subscription, billingHold] = await Promise.all([balance(storage), usage(storage, now), storage.get<Subscription>('subscription'), storage.get<boolean>('billingHold')])
  return {
    credits, generationCost: 50, subscriptionGrant: 1500,
    subscription: { active: active(subscription, now), expiresAt: subscription?.until ? new Date(subscription.until).toISOString() : null },
    free: { fastRemaining: Math.max(0, 2 - free.fast.length), fastResetAt: free.fast.length ? new Date(Math.min(...free.fast.map(item => item.at)) + DAY).toISOString() : null,
      slowRemaining: Math.max(0, 1 - free.slow.length), slowResetAt: new Date((Math.floor(now / DAY) + 1) * DAY).toISOString() },
    slowDownloadRequiresSubscription: true, billingReview: credits < 0 || billingHold === true,
  }
}

/** One internal Durable Object per verified existing Chess account UUID. No passwords or identity database. */
export class AccountEntitlements {
  private storage: EntitlementStorage
  private now: () => number
  constructor(state: { storage: EntitlementStorage }, _env: unknown = {}, now = Date.now) { this.storage = state.storage; this.now = now }
  async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname, now = this.now()
    try {
      if (path === '/status' && request.method === 'GET') return json(await this.storage.transaction(storage => status(storage, now)))
      if (path === '/billing' && request.method === 'GET') return json({ customer: await this.storage.get<string>('customer') ?? null })
      if (request.method !== 'POST') return json({ error: 'Not found' }, 404)
      const raw = await request.text()
      if (raw.length > 4096) return json({ error: 'Invalid internal request' }, 400)
      const input = JSON.parse(raw) as Record<string, unknown>
      if (!input || typeof input !== 'object' || Array.isArray(input)) return json({ error: 'Invalid internal request' }, 400)
      if (path === '/reserve') {
        if (typeof input.id !== 'string' || !JOB_ID.test(input.id) || !['fast', 'slow'].includes(String(input.profile))) return json({ error: 'Invalid generation' }, 400)
        const id = input.id, profile = input.profile as GenerationKind
        const result = await this.storage.transaction(async storage => {
          const existing = await storage.get<Job>(`job:${id}`)
          if (existing) return existing.profile !== profile
            ? { allowed: false, reason: 'JOB_PROFILE_MISMATCH' }
            : { allowed: existing.state !== 'failed', repeated: true, cost: existing.cost, kind: existing.kind, ...(existing.state === 'failed' ? { reason: 'JOB_ALREADY_FAILED' } : {}) }
          const credits = await balance(storage), subscription = await storage.get<Subscription>('subscription')
          if (credits < 0 || await storage.get<boolean>('billingHold') === true) return { allowed: false, reason: 'BILLING_REVIEW_REQUIRED' }
          const paid = active(subscription, now) || credits > 0
          if (paid && credits < 50) return { allowed: false, reason: 'CREDITS_EXHAUSTED' }
          const free = await usage(storage, now)
          if (!paid && free[profile].length >= (profile === 'fast' ? 2 : 1)) return { allowed: false, reason: profile === 'fast' ? 'FAST_DAILY_LIMIT' : 'SLOW_DAILY_LIMIT' }
          const job: Job = { profile, at: now, cost: paid ? 50 : 0, kind: paid ? 'credits' : 'free', state: 'reserved' }
          if (paid) await storage.put('balance', credits - 50)
          else { free[profile].push({ id, at: now }); await storage.put('usage', free) }
          await storage.put(`job:${id}`, job)
          return { allowed: true, repeated: false, cost: job.cost, kind: job.kind }
        })
        return json(result, result.allowed ? 200 : 429)
      }
      if (path === '/settle' || path === '/job') {
        if (typeof input.id !== 'string' || !JOB_ID.test(input.id)) return json({ error: 'Invalid job' }, 400)
        const id = input.id
        if (path === '/job') {
          const job = await this.storage.get<Job>(`job:${id}`)
          if (!job) return json({ owned: false, downloadAllowed: false, previewOnly: false })
          const subscription = await this.storage.get<Subscription>('subscription')
          const allowed = job.state === 'completed' && (job.profile === 'fast' || active(subscription, now)) && await balance(this.storage) >= 0 && await this.storage.get<boolean>('billingHold') !== true
          return json({ owned: true, downloadAllowed: allowed, previewOnly: job.profile === 'slow' && !active(subscription, now), profile: job.profile, state: job.state })
        }
        if (!['completed', 'failed'].includes(String(input.state))) return json({ error: 'Invalid settlement' }, 400)
        const next = input.state as 'completed' | 'failed'
        return json(await this.storage.transaction(async storage => {
          const job = await storage.get<Job>(`job:${id}`)
          if (!job) return { settled: false, reason: 'NOT_OWNED' }
          // Terminal results are immutable. Transport uncertainty MUST NOT call /settle failed.
          if (job.state !== 'reserved') return { settled: true, repeated: true }
          if (next === 'failed') {
            if (job.cost) await storage.put('balance', await balance(storage) + job.cost)
            else { const free = await usage(storage, now); free[job.profile] = free[job.profile].filter(item => item.id !== id); await storage.put('usage', free) }
          }
          await storage.put(`job:${id}`, { ...job, state: next })
          return { settled: true, repeated: false }
        }))
      }
      if (path === '/customer') {
        if (typeof input.customer !== 'string' || !/^cus_[A-Za-z0-9]{1,180}$/.test(input.customer)) return json({ error: 'Invalid customer' }, 400)
        const customer = input.customer
        return json(await this.storage.transaction(async storage => {
          const existing = await storage.get<string>('customer')
          if (existing && existing !== customer) return { saved: false }
          await storage.put('customer', customer); return { saved: true }
        }))
      }
      if (path === '/grant') {
        if (!grantId(input.id) || !validInteger(input.credits) || (input.credits as number) < 1 || (input.credits as number) > 1_000_000) return json({ error: 'Invalid grant' }, 400)
        const id = input.id, credits = input.credits as number
        return json(await this.storage.transaction(async storage => {
          const prior = await storage.get<Grant>(`grant:${id}`)
          // A reversal received before its original grant is a tombstone, never a new credit grant.
          if (prior) return { granted: false, repeated: true, revoked: prior.revoked > 0 }
          const next = await balance(storage) + credits
          if (!Number.isSafeInteger(next)) throw new Error('Invalid balance')
          await storage.put('balance', next)
          await storage.put(`grant:${id}`, { credits, revoked: 0, ...(typeof input.subscriptionId === 'string' ? { subscriptionId: input.subscriptionId } : {}) })
          return { granted: true, repeated: false, revoked: false }
        }))
      }
      if (path === '/revoke') {
        if (!grantId(input.id) || !validInteger(input.credits) || (input.credits as number) < 1 || (input.credits as number) > 1_000_000) return json({ error: 'Invalid reversal' }, 400)
        const id = input.id, credits = input.credits as number
        return json(await this.storage.transaction(async storage => {
          const grant = await storage.get<Grant>(`grant:${id}`)
          if (input.review === true) await storage.put('billingHold', true)
          if (!grant) { await storage.put(`grant:${id}`, { credits: 0, revoked: credits }); return { revoked: true, repeated: false } }
          const target = Math.min(grant.credits, credits), difference = Math.max(0, target - grant.revoked)
          if (!difference) return { revoked: false, repeated: true }
          await storage.put('balance', await balance(storage) - difference)
          await storage.put(`grant:${id}`, { ...grant, revoked: target })
          if (grant.subscriptionId) {
            const subscription = await storage.get<Subscription>('subscription')
            if (subscription?.id === grant.subscriptionId && subscription.grantId === id) await storage.put('subscription', { ...subscription, active: false })
          }
          return { revoked: true, repeated: false }
        }))
      }
      if (path === '/subscription') {
        if (typeof input.id !== 'string' || !/^sub_[A-Za-z0-9]{1,180}$/.test(input.id) || !validInteger(input.until) || (input.until as number) < 0 || !validInteger(input.revision) || typeof input.active !== 'boolean') return json({ error: 'Invalid subscription' }, 400)
        const next: Subscription = { id: input.id, until: input.until as number, active: input.active, revision: input.revision as number, terminal: input.terminal === true, ...(typeof input.grantId === 'string' ? { grantId: input.grantId } : {}) }
        return json(await this.storage.transaction(async storage => {
          const previous = await storage.get<Subscription>('subscription')
          if (previous && previous.id !== next.id && !next.active) return { updated: false }
          if (next.active) {
            const grant = typeof input.grantId === 'string' ? await storage.get<Grant>(`grant:${input.grantId}`) : undefined
            if (!grant || grant.credits < 1 || grant.revoked > 0) return { updated: false }
          }
          // Stripe events have second precision. Pending -> paid can share a timestamp;
          // only a terminal cancellation (or a separately revoked grant) blocks activation.
          if (previous && (previous.revision > next.revision || (previous.id === next.id && previous.terminal && !next.terminal))) return { updated: false }
          await storage.put('subscription', next); return { updated: true }
        }))
      }
      if (path === '/paypal-reserve') {
        return json(await this.storage.transaction(async storage => {
          const previous = await storage.get<PayPalCheckout | null>('paypal:checkout')
          // Do not rotate an uncertain create/capture attempt just because time passed.
          // PayPal's idempotency window is shorter than our ownership record lifetime.
          if (previous) return { ...previous, repeated: true }
          const value: PayPalCheckout = { id: crypto.randomUUID(), created: now }
          await storage.put('paypal:checkout', value)
          return { ...value, repeated: false }
        }))
      }
      if (path === '/paypal-order') {
        if (typeof input.id !== 'string' || !ACCOUNT_ID.test(input.id) || typeof input.orderId !== 'string' || !paypalId.test(input.orderId) || typeof input.url !== 'string') return json({ error: 'Invalid PayPal order' }, 400)
        const url = new URL(input.url)
        if (url.protocol !== 'https:' || !['www.paypal.com', 'www.sandbox.paypal.com'].includes(url.hostname) || url.port || url.username || url.password || url.pathname !== '/checkoutnow' || url.searchParams.get('token') !== input.orderId) return json({ error: 'Invalid PayPal checkout address' }, 400)
        return json(await this.storage.transaction(async storage => {
          const previous = await storage.get<PayPalCheckout | null>('paypal:checkout')
          if (!previous || previous.id !== input.id || (previous.orderId && previous.orderId !== input.orderId)) return { saved: false }
          const historical = await storage.get<{ id: string }>(`paypal:order:${input.orderId}`)
          if (historical && historical.id !== input.id) return { saved: false }
          await storage.put(`paypal:order:${input.orderId}`, { id: input.id })
          await storage.put('paypal:checkout', { ...previous, orderId: input.orderId, url: input.url })
          return { saved: true }
        }))
      }
      if (path === '/paypal-get') {
        if (typeof input.orderId !== 'string' || !paypalId.test(input.orderId)) return json({ error: 'Invalid PayPal order' }, 400)
        const owned = await this.storage.get<{ id: string }>(`paypal:order:${input.orderId}`)
        return json(owned ? { owned: true, id: owned.id } : { owned: false })
      }
      if (path === '/paypal-clear') {
        if (typeof input.id !== 'string' || !ACCOUNT_ID.test(input.id)) return json({ error: 'Invalid PayPal checkout' }, 400)
        return json(await this.storage.transaction(async storage => {
          const previous = await storage.get<PayPalCheckout | null>('paypal:checkout')
          if (!previous || previous.id !== input.id) return { cleared: false }
          await storage.put('paypal:checkout', null)
          return { cleared: true }
        }))
      }
      if (path === '/checkout-reserve') {
        if (!['subscription', 'topup'].includes(String(input.kind))) return json({ error: 'Invalid checkout' }, 400)
        const kind = input.kind as string
        return json(await this.storage.transaction(async storage => {
          const previous = await storage.get<Checkout>(`checkout:${kind}`)
          if (previous && (previous.expiresAt ?? previous.created + DAY) > now) return { ...previous, repeated: true }
          const value = { id: crypto.randomUUID(), created: now }
          await storage.put(`checkout:${kind}`, value)
          return { ...value, repeated: false }
        }))
      }
      if (path === '/checkout-finish') {
        if (!['subscription', 'topup'].includes(String(input.kind)) || typeof input.id !== 'string' || typeof input.url !== 'string' || !/^https:\/\/checkout\.stripe\.com\//.test(input.url) || !validInteger(input.expiresAt) || (input.expiresAt as number) <= now || typeof input.sessionId !== 'string' || !/^cs_[A-Za-z0-9_]{1,180}$/.test(input.sessionId)) return json({ error: 'Invalid checkout' }, 400)
        return json(await this.storage.transaction(async storage => {
          const previous = await storage.get<Checkout>(`checkout:${input.kind}`)
          if (!previous || previous.id !== input.id) return { saved: false }
          await storage.put(`checkout:${input.kind}`, { ...previous, url: input.url, expiresAt: input.expiresAt, sessionId: input.sessionId }); return { saved: true }
        }))
      }
      if (path === '/checkout-clear') {
        if (!['subscription', 'topup'].includes(String(input.kind)) || typeof input.id !== 'string') return json({ error: 'Invalid checkout' }, 400)
        return json(await this.storage.transaction(async storage => {
          const previous = await storage.get<Checkout>(`checkout:${input.kind}`)
          if (!previous || previous.id !== input.id) return { cleared: false }
          await storage.put(`checkout:${input.kind}`, { ...previous, created: 0, expiresAt: 0 }); return { cleared: true }
        }))
      }
      return json({ error: 'Not found' }, 404)
    } catch { return json({ error: 'Account allowance unavailable' }, 503) }
  }
}

/** This helper is server-only. Never accept a uid from a request parameter or body. */
export async function entitlementCall<T>(env: EntitlementEnv, userId: string, path: string, body?: unknown): Promise<T> {
  if (!ACCOUNT_ID.test(userId)) throw new EntitlementError('A verified account is required.', 401)
  if (!env.ACCOUNT_ENTITLEMENTS) throw new EntitlementError('Account allowances are not configured.')
  if (env.ACCOUNT_LEDGER_MODE !== undefined && !['sandbox', 'live'].includes(env.ACCOUNT_LEDGER_MODE)) throw new EntitlementError('Account ledger mode is invalid.')
  // Sandbox balances, customers, captures and subscriptions can never become live
  // simply by switching provider API credentials. Preserve existing live IDs.
  const prefix = env.ACCOUNT_LEDGER_MODE === 'sandbox' ? 'account:sandbox:v1' : 'account:v1'
  const object = env.ACCOUNT_ENTITLEMENTS.get(env.ACCOUNT_ENTITLEMENTS.idFromName(`${prefix}:${userId.toLowerCase()}`))
  let response: Response
  try { response = await object.fetch(new Request(`https://entitlements.internal${path}`, { method: body === undefined ? 'GET' : 'POST', ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(5000) })) }
  catch { throw new EntitlementError('Account allowances are temporarily unavailable.') }
  if (!response.ok && !(path === '/reserve' && response.status === 429)) throw new EntitlementError('Account allowances are temporarily unavailable.')
  return response.json() as Promise<T>
}
export const entitlementStatus = (env: EntitlementEnv, userId: string) => entitlementCall<EntitlementStatus>(env, userId, '/status')
export const reserveUserGeneration = (env: EntitlementEnv, userId: string, jobId: string, profile: GenerationKind) => entitlementCall<Reservation>(env, userId, '/reserve', { id: jobId, profile })
export const settleUserGeneration = (env: EntitlementEnv, userId: string, jobId: string, state: 'completed' | 'failed') => entitlementCall<{ settled: boolean; repeated?: boolean }>(env, userId, '/settle', { id: jobId, state })
export const userJobAccess = (env: EntitlementEnv, userId: string, jobId: string) => entitlementCall<JobAccess>(env, userId, '/job', { id: jobId })
export async function entitlementApi(request: Request, env: AccountEnv & EntitlementEnv, fetcher: typeof fetch = fetch): Promise<Response | null> {
  if (new URL(request.url).pathname !== '/api/account/entitlements') return null
  if (request.method !== 'GET') return json({ error: 'Use GET.' }, 405)
  try {
    const user = await getVerifiedAccount(request, env, fetcher)
    if (!user) return json({ error: 'Sign in to view your allowance.' }, 401)
    return json(await entitlementStatus(env, user.id))
  } catch (error) { return json({ error: error instanceof EntitlementError ? error.message : 'Account allowances are unavailable.' }, error instanceof EntitlementError ? error.status : 503) }
}
