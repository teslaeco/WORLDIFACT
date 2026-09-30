// Read-only, owner-scoped diagnosis. Never log invoice URLs, IDs, email or credentials.
const origin = 'https://worldifact.xodobrox.workers.dev'
let stage = 'configuration'
async function read(url, authenticated = true) {
  const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(12000), headers: authenticated ? { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY?.trim()}`, 'Stripe-Version': '2026-08-26.dahlia' } : {} })
  if (!response.ok && !(response.status >= 300 && response.status < 400)) throw new Error(`HTTP_${response.status}`)
  const text = await response.text()
  if (text.length > 2000000) throw new Error('RESPONSE_TOO_LARGE')
  return { response, text }
}
try {
  if (!/^(sk|rk)_live_/.test(process.env.STRIPE_SECRET_KEY?.trim() ?? '')) throw new Error('LIVE_KEY_REQUIRED')
  stage = 'account_read'
  const account = JSON.parse((await read('https://api.stripe.com/v1/account')).text)
  if (account.id !== 'acct_1UIG9ABrIVB6dkxN' || account.country !== 'PL' || !account.email) throw new Error('ACCOUNT_MISMATCH')
  console.log(JSON.stringify({ stage, businessName: account.business_profile?.name, defaultAccountTaxIdsConfigured: !!account.settings?.invoices?.default_account_tax_ids?.length, invoiceSettingNames: Object.keys(account.settings?.invoices ?? {}), addressNotChanged: true }))
  stage = 'merchant_tax_ids_read'
  const taxResponse = await read('https://api.stripe.com/v1/tax_ids?limit=100')
  const taxIds = JSON.parse(taxResponse.text)
  console.log(JSON.stringify({ stage, complete: taxIds.has_more === false, count: taxIds.data?.length, ownerNipExists: taxIds.data?.some(t => t.owner?.type === 'self' && t.type === 'pl_nip' && t.value === '5811866931') }))
  stage = 'owner_customer_read'
  const customers = JSON.parse((await read('https://api.stripe.com/v1/customers?' + new URLSearchParams({ email: account.email, limit: '10' }))).text)
  if (customers.has_more || customers.data?.length !== 1) throw new Error('OWNER_CUSTOMER_AMBIGUOUS')
  const customer = customers.data[0]
  stage = 'owner_paid_invoice_read'
  const invoices = JSON.parse((await read('https://api.stripe.com/v1/invoices?' + new URLSearchParams({ customer: customer.id, status: 'paid', limit: '5' }))).text)
  const invoice = invoices.data?.find(i => i.billing_reason === 'subscription_update' && i.amount_paid === 9999 && i.amount_remaining === 0 && i.livemode === true)
  if (!invoice?.hosted_invoice_url) throw new Error('PAID_INVOICE_NOT_FOUND')
  const address = new URL(invoice.hosted_invoice_url)
  if (address.origin !== 'https://invoice.stripe.com' || address.username || address.password) throw new Error('INVOICE_HOST_MISMATCH')
  stage = 'paid_hosted_page_read'
  const base = await read(address, false)
  address.searchParams.set('return_url', origin + '/?billing=processing')
  const requested = await read(address, false)
  const allowedLabels = /return_url|returnUrl|success_url|successUrl|redirect_url|redirectUrl|after_payment|afterPayment|publishable_key|publishableKey/g
  console.log(JSON.stringify({ stage, invoicePaid: true, originalStatus: base.response.status, requestedStatus: requested.response.status, redirectsToWorldifact: (requested.response.headers.get('location') ?? '').startsWith(origin + '/'), returnParameterNamesInOriginal: [...new Set(base.text.match(allowedLabels) ?? [])], returnParameterNamesInRequested: [...new Set(requested.text.match(allowedLabels) ?? [])], requestedReturnPresentInHtml: requested.text.includes(origin + '/?billing=processing'), publicStripeKeyInHtml: /pk_live_[a-zA-Z0-9]+/.test(base.text), autoReturnVerified: false }))
  console.log('READ_ONLY_COMPLETE: no invoice, subscription, charge, credit or account setting was modified. HTML echoes do not prove browser redirect support.')
} catch (error) {
  const code = error instanceof Error && /^(HTTP_\d{3}|[A-Z_]+)$/.test(error.message) ? error.message : 'READ_FAILED'
  console.log(JSON.stringify({ status: 'BLOCKED', stage, code, paidRequest: false, writes: false }))
  process.exitCode = 1
}
