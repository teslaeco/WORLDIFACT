"""One-shot, exact-source billing recovery patch; isolated review branch only."""
from pathlib import Path
import subprocess

expected = {
    'server/billing.ts': '177813284921a05a621f93a36507d0fa43ed4719',
    'src/pages/CreditsPage.tsx': '637e4f2752a8240a4dc1fae86bd5dae16531a79d',
}
for name, sha in expected.items():
    actual = subprocess.check_output(['git', 'hash-object', name], text=True).strip()
    if actual != sha:
        raise SystemExit('Source changed; review before applying: ' + name)

def replace_once(text, old, new):
    if text.count(old) != 1:
        raise SystemExit('Patch anchor missing or ambiguous: ' + old[:100])
    return text.replace(old, new, 1)

path = Path('server/billing.ts')
s = path.read_text()
s = replace_once(s, "    const invoice = await stripe(env, `/invoices/${invoiceId}`, fetcher)\n    const verified = exactInvoice(env, invoice)\n    paid = !!verified && verified.plan === plan && subscriptionOf(invoice) === subscription.id", r'''    let invoice = await stripe(env, `/invoices/${invoiceId}`, fetcher)
    // A failed pending upgrade replaces latest_invoice, not the already-paid base period.
    // Recover only exact, authoritative payment evidence for the CURRENT plan and period.
    const latest = exactInvoice(env, invoice)
    if ((!latest || latest.plan !== plan) && (subscription.pending_update || invoice.billing_reason === 'subscription_update') && Number.isSafeInteger(end) && end > Date.now()) {
      const history = await stripe(env, `/invoices?subscription=${subscription.id}&status=paid&limit=100`, fetcher)
      const candidates = array(history.data).filter(candidate => {
        const verified = exactInvoice(env, candidate)
        const line = array(object(candidate.lines).data)[0]
        const start = Number(object(line?.period).start) * 1000
        return candidate.livemode === (env.STRIPE_MODE === 'live') && resourceId(candidate.id, 'in')
          && idOf(candidate.customer) === idOf(subscription.customer) && subscriptionOf(candidate) === subscription.id
          && verified?.plan === plan && Number(object(line?.period).end) * 1000 === end
          && Number.isSafeInteger(start) && start <= Date.now() && start < end
      })
      if (history.has_more !== true && candidates.length === 1) invoice = candidates[0]
    }
    const verified = exactInvoice(env, invoice)
    paid = !!verified && verified.plan === plan && subscriptionOf(invoice) === subscription.id''')
s = replace_once(s, "      grantId = invoiceId\n      const grant = await entitlementCall<{ granted: boolean }>(env, uid, '/grant', { id: invoiceId, credits: verified.credits, subscriptionId: subscription.id })\n      if (grant.granted) await adjustFreeSolPromo(env, invoiceId, planEconomics(plan).fundedFreeSolJobs)", "      grantId = idOf(invoice)\n      const grant = await entitlementCall<{ granted: boolean }>(env, uid, '/grant', { id: grantId, credits: verified.credits, subscriptionId: subscription.id })\n      if (grant.granted) await adjustFreeSolPromo(env, grantId, planEconomics(plan).fundedFreeSolJobs)")
helper = r'''
function recoveryUrl(value: unknown, host: 'billing.stripe.com' | 'invoice.stripe.com') {
  if (typeof value !== 'string') throw new EntitlementError('Secure payment address was not confirmed.')
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.hostname !== host || url.username || url.password || url.port || url.hash)
    throw new EntitlementError('Secure payment address was not confirmed.')
  return url.href
}

/** No customer-supplied IDs and no automatic charge, subscription creation or cancellation. */
async function recoverBilling(request: Request, env: BillingEnv, user: AccountUser, fetcher: typeof fetch) {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) return json({ error: 'Use application/json.' }, 415)
  const input = object(JSON.parse(await boundedText(request, 1024)))
  const action = input.action ?? 'status'
  if (Object.keys(input).some(key => key !== 'action') || !['status', 'retry', 'card', 'manage'].includes(String(action)))
    return json({ error: 'Choose a supported payment recovery action.' }, 400)
  const config = billingConfig(env)
  const stored = await entitlementCall<{ customer: string | null }>(env, user.id, '/billing')
  if (!stored.customer) return json({ state: 'none', canManage: false, canRetry: false })
  if (!resourceId(stored.customer, 'cus')) throw new EntitlementError('Billing account requires review.', 409)

  if (action === 'card' || action === 'manage') {
    const configuration = env.STRIPE_BILLING_PORTAL_CONFIGURATION_ID
    if (!resourceId(configuration, 'bpc')) throw new EntitlementError('Billing management is temporarily unavailable.')
    const returnUrl = `${config.origin}/account/credits?billing=returned`
    const params = new URLSearchParams({ customer: stored.customer, configuration: configuration!, return_url: returnUrl })
    if (action === 'card') {
      params.set('flow_data[type]', 'payment_method_update')
      params.set('flow_data[after_completion][type]', 'redirect')
      params.set('flow_data[after_completion][redirect][return_url]', returnUrl)
    }
    const portal = await stripe(env, '/billing_portal/sessions', fetcher, params)
    if (idOf(portal.customer) !== stored.customer || idOf(portal.configuration) !== configuration)
      throw new EntitlementError('Billing management could not be verified.')
    return json({ url: recoveryUrl(portal.url, 'billing.stripe.com'), destination: 'portal', requiresConfirmation: true })
  }

  const subscriptions = await stripe(env, `/subscriptions?customer=${stored.customer}&status=all&limit=100`, fetcher)
  const open = array(subscriptions.data).filter(item => !['canceled', 'incomplete_expired'].includes(String(item.status)))
  const review = () => json({ state: 'review', canManage: true, canRetry: false })
  if (subscriptions.has_more === true || open.length > 1) return review()
  if (!open.length) return json({ state: 'none', canManage: true, canRetry: false })
  const subscription = open[0], items = array(object(subscription.items).data)
  const currentPlan = planForPrice(env, idOf(items[0]?.price))
  if (subscription.livemode !== (env.STRIPE_MODE === 'live') || !resourceId(subscription.id, 'sub')
    || uidFor(subscription) !== user.id || idOf(subscription.customer) !== stored.customer
    || !currentPlan || items.length !== 1 || items[0].quantity !== 1 || object(subscription.items).has_more === true) return review()

  const invoiceId = idOf(subscription.latest_invoice)
  if (!resourceId(invoiceId, 'in')) return review()
  const invoice = await stripe(env, `/invoices/${invoiceId}`, fetcher)
  if (idOf(invoice) !== invoiceId || idOf(invoice.customer) !== stored.customer || subscriptionOf(invoice) !== subscription.id) return review()
  // Status refresh repairs the local ledger from Stripe payment evidence, not from URL flags.
  await syncSubscription(env, subscription, Math.floor(Date.now() / 1000) * 1000, fetcher)
  const allowance = await entitlementStatus(env, user.id)
  if (allowance.billingReview) return review()
  const lines = array(object(invoice.lines).data), line = lines[0]
  const invoicePrice = idOf(line?.price) || idOf(object(object(line?.pricing).price_details).price)
  const invoicePlan = planForPrice(env, invoicePrice)
  const pendingItems = array(object(subscription.pending_update).subscription_items)
  const pendingPrice = pendingItems.length === 1 && pendingItems[0].quantity === 1 ? idOf(pendingItems[0].price) : ''
  const intendedPrice = invoicePrice === idOf(items[0].price) || invoicePrice === pendingPrice
  if (invoice.status === 'open' && Number(invoice.amount_remaining) > 0) {
    if (!invoicePlan || !intendedPrice || lines.length !== 1 || object(invoice.lines).has_more === true
      || line.quantity !== 1 || line.currency !== 'usd' || invoice.currency !== 'usd'
      || !['subscription_create', 'subscription_cycle', 'subscription_update'].includes(String(invoice.billing_reason))) return review()
    const amount = subscriptionOffer(env, invoicePlan).amountCents
    if (line.amount !== amount || invoice.total !== amount || invoice.amount_due !== amount
      || !Number.isSafeInteger(invoice.amount_remaining) || Number(invoice.amount_remaining) > amount
      || !Number.isSafeInteger(invoice.amount_paid) || Number(invoice.amount_paid) < 0 || Number(invoice.amount_paid) >= amount) return review()
    // Validate before displaying a retry action; re-read all state on the eventual button click.
    const address = recoveryUrl(invoice.hosted_invoice_url, 'invoice.stripe.com')
    const response = { state: 'payment_required', canManage: true, canRetry: true, amountCents: invoice.amount_remaining,
      currency: 'USD', plan: invoicePlan, pendingChange: !!subscription.pending_update, activePlan: allowance.subscription.active ? allowance.subscription.plan : null }
    if (action === 'retry') return json({ ...response, url: address, destination: 'invoice', requiresConfirmation: true })
    return json(response)
  }
  // Paid, void, expired and processing invoices never open another charge or a stale link.
  return json({ state: allowance.subscription.active ? 'active' : 'processing', canManage: true, canRetry: false,
    activePlan: allowance.subscription.active ? allowance.subscription.plan : null })
}

'''
s = replace_once(s, 'export async function billingApi(', helper + 'export async function billingApi(')
s = replace_once(s, "    if (url.pathname === '/api/billing/portal') {", "    if (url.pathname === '/api/billing/recovery') return await recoverBilling(request, env, user, fetcher)\n    if (url.pathname === '/api/billing/portal') {")
path.write_text(s)
path = Path('src/pages/CreditsPage.tsx')
s = path.read_text()
s = replace_once(s, "import './CreditsPage.css'", "import BillingRecovery from '../components/BillingRecovery'\nimport './CreditsPage.css'")
s = replace_once(s, '    {!loading && !user && <div className="credits-signin">', '    <BillingRecovery enabled={!!user && !loading} onRefresh={refresh} />\n    {!loading && !user && <div className="credits-signin">')
path.write_text(s)
path = Path('src/lib/paymentError.ts')
s = path.read_text()
s = replace_once(s, 'An existing payment or subscription needs attention. Refresh your balance and check your payment history before trying again.', 'An existing payment or subscription needs attention. Use Payment recovery above to retry the existing payment, change your card, or manage your subscription. Do not start a second purchase.')
path.write_text(s)
path = Path('docs/CONTEST_STATUS.md')
s = path.read_text()
path.write_text('''# 29 September 2026 — payment recovery review

The owner requested recovery after a card-funds failure and self-service card changes. This patch adds an authenticated, same-origin recovery panel and endpoint. Retry opens the existing verified Stripe-hosted invoice; card changes use the existing configured Stripe portal. No new subscription or direct card charge is created by recovery. Pending upgrades preserve only a verified, already-paid current-plan period. Grant IDs remain idempotent and reversal checks remain effective.

Validation and publication status are recorded in the payment-recovery pull request and its exact-head Actions runs. This source edit alone is NOT deployment evidence. Tests use synthetic accounts and provider fixtures; customer invoice URLs, emails, IDs and payment details are not published. Existing prices, credit rates, provider budgets and generator activation are unchanged.

---

''' + s)
print('Applied exact reviewed payment-recovery patch; no provider requests made.')
