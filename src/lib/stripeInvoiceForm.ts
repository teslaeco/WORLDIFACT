// Stripe.js is loaded from Stripe, never bundled or proxied by WORLDIFACT.
type PaymentElement = { mount: (node: HTMLElement) => void; destroy: () => void; on: (name: 'ready', cb: () => void) => void }
type Elements = { create: (name: 'payment') => PaymentElement }
type Result = { error?: unknown; paymentIntent?: { status?: string } }
export type StripeInstance = { elements: (options: { clientSecret: string }) => Elements; confirmPayment: (options: { elements: Elements; confirmParams: { return_url: string }; redirect: 'if_required' }) => Promise<Result> }
type StripeFactory = (key: string) => StripeInstance | null
let loaded: Promise<StripeFactory> | null = null
export function loadInvoiceStripe(): Promise<StripeFactory> {
  const factory = () => (window as Window & { Stripe?: StripeFactory }).Stripe
  if (factory()) return Promise.resolve(factory()!)
  if (loaded) return loaded
  loaded = new Promise((resolve, reject) => {
    const script = document.createElement('script'); script.src = 'https://js.stripe.com/v3/'; script.async = true
    const timer = setTimeout(() => { script.remove(); loaded = null; reject(new Error('Stripe loading timed out')) }, 15000)
    script.onload = () => { clearTimeout(timer); const value = factory(); if (value) resolve(value); else { loaded = null; reject(new Error('Stripe unavailable')) } }
    script.onerror = () => { clearTimeout(timer); script.remove(); loaded = null; reject(new Error('Stripe unavailable')) }
    document.head.appendChild(script)
  })
  return loaded
}
