import { invoiceFormAddress } from './invoicePayment.ts'
/** Provider destinations are allowlisted; a plan card only opens customer confirmation. */
export function planPaymentAddress(value: unknown, destination: unknown): string {
  const local = invoiceFormAddress(value, destination); if (local) return local
  const hosts: Record<string, string> = { invoice: 'invoice.stripe.com', portal: 'billing.stripe.com', checkout: 'checkout.stripe.com' }
  if (typeof value !== 'string' || typeof destination !== 'string' || !Object.hasOwn(hosts, destination)) throw new Error('Unverified payment destination.')
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.hostname !== hosts[destination] || url.username || url.password || url.port || url.hash) throw new Error('Unverified payment destination.')
  return url.href
}

export function planPaymentNotice(state: unknown): string | null {
  if (state === 'processing') return 'Your previous payment is still being confirmed. Your existing credits are safe. Check payment status in Payment methods and billing below.'
  if (state === 'review') return 'Your billing history needs a review before another purchase. Use Manage billing in Payment methods and billing below; no new charge was started.'
  if (state === 'payment_required_other') return 'A payment for a different plan is still outstanding. Review that payment in Payment methods and billing below before switching plans. No payment for the wrong plan was opened.'
  return null
}

/** Browser Back may restore the page with a stale opening-payment lock. No payment is retried. */
export function onCachedBillingReturn(target: EventTarget, resetAndRefresh: () => void): () => void {
  const returned = (event: Event) => {
    if ('persisted' in event && event.persisted === true) resetAndRefresh()
  }
  target.addEventListener('pageshow', returned)
  return () => target.removeEventListener('pageshow', returned)
}
