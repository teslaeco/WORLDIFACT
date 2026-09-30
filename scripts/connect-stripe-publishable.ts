import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { uploadBillingSecrets, type BillingSecrets } from './connect-billing.ts'

const EXPECTED_ACCOUNT = 'acct_1UIG9ABrIVB6dkxN'
const API_VERSION = '2024-06-20' // Matches server/billing.ts invoice reads.
type Json = Record<string, any>
class PublishableSetupError extends Error {}
function requireCheck(value: unknown, message: string): asserts value {
  if (!value) throw new PublishableSetupError(message)
}
function id(value: unknown): string { return typeof value === 'string' ? value : value && typeof value === 'object' && 'id' in value && typeof value.id === 'string' ? value.id : '' }
export function publishableSetupError(error: unknown): string {
  return error instanceof PublishableSetupError ? error.message : 'Stripe public-key verification failed. No payment was requested; sensitive details suppressed.'
}

/** Uses GET only. Existing owner-paid invoice is a key-pair test, never a new purchase. */
export async function verifyStripePublishable(env: NodeJS.ProcessEnv, fetcher: typeof fetch = fetch) {
  const publicKey = env.STRIPE_PUBLISHABLE_KEY?.trim() ?? ''
  requireCheck(/^pk_live_[A-Za-z0-9_]{12,200}$/.test(publicKey), 'STRIPE_PUBLISHABLE_KEY must contain the live publishable key; never a secret or test key.')
  const secret = env.STRIPE_SECRET_KEY?.trim() ?? ''
  requireCheck(/^(sk|rk)_live_[A-Za-z0-9_]{16,256}$/.test(secret), 'The existing Stripe backend credential is required for the read-only account match.')
  async function read(path: string, key = secret): Promise<Json> {
    let response: Response
    try {
      response = await fetcher('https://api.stripe.com/v1' + path, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15_000), headers: { Authorization: `Bearer ${key}`, 'Stripe-Version': API_VERSION } })
    } catch { throw new PublishableSetupError('Stripe verification could not connect. No settings or payments changed.') }
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) {
      await response.body?.cancel().catch(() => {})
      throw new PublishableSetupError('Stripe rejected a read-only verification request. Check the public key belongs to this account.')
    }
    requireCheck(Number(response.headers.get('content-length') ?? 0) <= 262144, 'Stripe verification response exceeded its limit.')
    const reader = response.body?.getReader()
    requireCheck(reader, 'Stripe verification returned no body.')
    let length = 0
    const chunks: Uint8Array[] = []
    try {
      for (;;) {
        const next = await reader.read(); if (next.done) break
        length += next.value.byteLength
        requireCheck(length <= 262144, 'Stripe verification response exceeded its limit.')
        chunks.push(next.value)
      }
      const bytes = new Uint8Array(length); let offset = 0
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
      const result = JSON.parse(new TextDecoder().decode(bytes))
      requireCheck(result && typeof result === 'object' && !Array.isArray(result), 'Stripe verification returned an invalid object.')
      return result
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
  }
  const account = await read('/account')
  requireCheck(account.id === EXPECTED_ACCOUNT && account.country === 'PL' && account.charges_enabled === true, 'Stripe account identity or payment capability did not match WORLDIFACT.')
  requireCheck(typeof account.email === 'string' && account.email.length < 255, 'Owner account email is unavailable for the read-only check.')
  const customers = await read('/customers?' + new URLSearchParams({ email: account.email, limit: '10' }))
  requireCheck(customers.has_more === false && Array.isArray(customers.data) && customers.data.length === 1, 'Owner billing account is ambiguous; do not change production settings.')
  const customer = customers.data[0]
  requireCheck(/^cus_[A-Za-z0-9]+$/.test(id(customer)) && customer.livemode === true, 'Owner billing account could not be verified.')
  const invoices = await read('/invoices?' + new URLSearchParams({ customer: customer.id, status: 'paid', limit: '10' }))
  requireCheck(Array.isArray(invoices.data), 'Paid invoice evidence was not available.')
  const invoice = invoices.data.find((entry: Json) => entry.livemode === true && id(entry.customer) === customer.id && entry.status === 'paid' && entry.paid === true && entry.amount_paid === 9999 && entry.amount_remaining === 0 && entry.currency === 'usd' && entry.billing_reason === 'subscription_update' && /^in_[A-Za-z0-9]+$/.test(id(entry)))
  requireCheck(invoice, 'No existing paid Pro upgrade was found for a no-charge key verification.')
  const expanded = await read(`/invoices/${invoice.id}?expand[]=payment_intent`)
  const pi = expanded.payment_intent
  requireCheck(expanded.id === invoice.id && expanded.livemode === true && expanded.status === 'paid' && expanded.paid === true && expanded.amount_remaining === 0 && id(expanded.customer) === customer.id && pi && typeof pi === 'object', 'The paid invoice or original PaymentIntent could not be verified using the application API version.')
  requireCheck(/^pi_[A-Za-z0-9]+$/.test(id(pi)) && pi.livemode === true && pi.status === 'succeeded' && id(pi.customer) === customer.id && pi.amount === 9999 && pi.currency === 'usd' && typeof pi.client_secret === 'string' && pi.client_secret.startsWith(`${pi.id}_secret_`) && pi.client_secret.length <= 300, 'The original paid PaymentIntent did not match the verified account and amount.')
  // Stripe explicitly supports this scoped client-secret GET with a public key.
  // It is never printed, stored, returned, or used to confirm the PaymentIntent.
  const publicRead = await read(`/payment_intents/${pi.id}?` + new URLSearchParams({ client_secret: pi.client_secret }), publicKey)
  requireCheck(publicRead.id === pi.id && publicRead.livemode === true && publicRead.status === 'succeeded' && publicRead.amount === pi.amount && publicRead.currency === pi.currency, 'Public and private Stripe credentials did not resolve the same paid PaymentIntent.')
  return { status: 'PUBLISHABLE_KEY_VERIFIED_READ_ONLY', accountMatched: true, existingPaidIntentMatched: true, invoiceApiCompatible: true, paymentRequested: false } as const
}

/** Called only by the owner-approved main release, not the review workflow. */
export async function syncStripePublishable(env: NodeJS.ProcessEnv, fetcher: typeof fetch = fetch, upload: (payload: BillingSecrets, env: NodeJS.ProcessEnv) => void = (payload, safeEnv) => uploadBillingSecrets(payload, undefined, safeEnv)) {
  const verification = await verifyStripePublishable(env, fetcher)
  const childEnv = { ...env }; delete childEnv.STRIPE_PUBLISHABLE_KEY
  upload({ STRIPE_PUBLISHABLE_KEY: env.STRIPE_PUBLISHABLE_KEY!.trim() }, childEnv)
  return { ...verification, status: 'PUBLISHABLE_KEY_SYNCED', otherWorkerSecretsChanged: false }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const command = process.argv[2]
    requireCheck(command === 'verify' || command === 'sync', 'Choose verify (read only) or sync (approved deployment only).')
    console.log(JSON.stringify(command === 'verify' ? await verifyStripePublishable(process.env) : await syncStripePublishable(process.env)))
  } catch (error) { console.error(publishableSetupError(error)); process.exitCode = 1 }
}
