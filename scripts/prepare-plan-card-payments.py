"""Apply exact reviewed payment-flow changes. No network, secrets or billing writes."""
from pathlib import Path


def once(text, before, after):
    if text.count(before) != 1:
        raise RuntimeError('Expected exactly one source anchor: ' + before[:120])
    return text.replace(before, after, 1)


p = Path('server/billing.ts')
s = p.read_text()
anchor = "    if (url.pathname === '/api/billing/recovery') return await recoverBilling(request, env, user, fetcher)"
s = once(s, anchor, r'''    // One authenticated plan-card action, independent of stale frontend membership state.
    // Recover an existing payment first; never create a second subscription to bypass it.
    let planRecovery: Json | null = null
    if (url.pathname === '/api/billing/plan-payment') {
      if (!request.headers.get('Content-Type')?.startsWith('application/json')) return json({ error: 'Use application/json.' }, 415)
      const input = object(JSON.parse(await boundedText(request, 1024)))
      if (Object.keys(input).length !== 1 || !['creator', 'pro', 'studio'].includes(String(input.plan))) return json({ error: 'Choose a valid plan.' }, 400)
      const plan = input.plan as PlanId
      const recoveryRequest = new Request(request.url, { method: 'POST', headers: request.headers, body: JSON.stringify({ action: 'retry' }) })
      const recovered = await recoverBilling(recoveryRequest, env, user, fetcher)
      if (!recovered.ok) return recovered
      planRecovery = object(await recovered.json())
      if (planRecovery.state === 'review' || planRecovery.state === 'processing') return json({ state: planRecovery.state })
      if (planRecovery.state === 'payment_required' && planRecovery.plan === plan && planRecovery.canRetry === true) return json(planRecovery)
      if (planRecovery.activePlan === plan) {
        url.pathname = '/api/billing/portal'
        request = new Request(url, { method: 'POST', headers: request.headers, body: '{}' })
      } else if (planRecovery.state === 'none') {
        url.pathname = '/api/billing/checkout'
        request = new Request(url, { method: 'POST', headers: request.headers, body: JSON.stringify({ kind: 'subscription', plan }) })
      } else if (planRecovery.state === 'active' || planRecovery.state === 'payment_required' && planRecovery.pendingChange === true && planRecovery.activePlan) {
        url.pathname = '/api/billing/change-plan'
        request = new Request(url, { method: 'POST', headers: request.headers, body: JSON.stringify({ plan }) })
      } else {
        // An unpaid first purchase/renewal is not an optional upgrade that may be replaced.
        return json({ state: 'payment_required_other', outstandingPlan: planRecovery.plan, requestedPlan: plan })
      }
    }
''' + anchor)
s = once(s, "return json({ url: session.url })", "return json({ url: recoveryUrl(session.url, 'billing.stripe.com'), destination: 'portal' })")
old = "if (subscription.status!=='active'||uidFor(subscription)!==user.id||idOf(subscription.customer)!==stored.customer||items.length!==1||items[0].quantity!==1||!resourceId(items[0].id,'si')||subscription.pending_update||subscription.schedule||subscription.cancel_at_period_end===true)"
new = "if (subscription.status!=='active'||subscription.livemode!==(env.STRIPE_MODE==='live')||!resourceId(subscription.id,'sub')||uidFor(subscription)!==user.id||idOf(subscription.customer)!==stored.customer||items.length!==1||object(subscription.items).has_more===true||items[0].quantity!==1||!resourceId(items[0].id,'si')||(subscription.pending_update && !(planRecovery?.state==='payment_required' && planRecovery.pendingChange===true && planRecovery.activePlan===allowance.subscription.plan && planRecovery.plan!==plan))||subscription.schedule||subscription.cancel_at_period_end===true)"
s = once(s, old, new)
s = once(s, "      const paidInvoice = exactInvoice(env, invoice)\n      if (!paidInvoice || paidInvoice.plan !== source) {", r'''      const paidInvoice = exactInvoice(env, invoice)
      // A different pending target can be REVIEWED in Stripe. Session creation does not
      // modify it: Stripe applies/replaces the pending update only on customer confirmation.
      // Revalidate the latest invoice after the first recovery read to catch changed state.
      const pendingItems = array(object(subscription.pending_update).subscription_items)
      const pendingPrice = pendingItems.length === 1 && pendingItems[0].quantity === 1 ? idOf(pendingItems[0].price) : ''
      const pendingPlan = planForPrice(env, pendingPrice)
      const pendingLines = array(object(invoice.lines).data), pendingLine = pendingLines[0]
      const pendingAmount = pendingPlan ? subscriptionOffer(env, pendingPlan).amountCents : 0
      const replaceablePending = !!pendingPlan && pendingPlan !== plan && pendingPlan === planRecovery?.plan
        && planRecovery?.state === 'payment_required' && planRecovery.pendingChange === true
        && idOf(pendingItems[0]) === idOf(items[0]) && invoice.id === invoiceId
        && invoice.status === 'open' && invoice.paid === false && invoice.billing_reason === 'subscription_update'
        && invoice.currency === 'usd' && invoice.amount_paid === 0
        && invoice.total === pendingAmount && invoice.amount_due === pendingAmount && invoice.amount_remaining === pendingAmount
        && pendingLines.length === 1 && object(invoice.lines).has_more !== true
        && (idOf(pendingLine?.price) || idOf(object(object(pendingLine?.pricing).price_details).price)) === pendingPrice
        && pendingLine?.quantity === 1 && pendingLine.currency === 'usd' && pendingLine.amount === pendingAmount && pendingLine.proration !== true
      if (!paidInvoice || paidInvoice.plan !== source) {''')
s = once(s, "if (invoice.status !== 'void' || invoice.billing_reason !== 'subscription_update') return json({error:'Settle the outstanding invoice before changing plan.'},409)", "if (!replaceablePending && (invoice.status !== 'void' || invoice.billing_reason !== 'subscription_update')) return json({error:'Settle the outstanding invoice before changing plan.'},409)")
s = once(s, "return json({url:session.url,requiresConfirmation:true})", "return json({url:recoveryUrl(session.url, 'billing.stripe.com'),destination:'portal',requiresConfirmation:true})")
s = once(s, "if (attempt.url) return json({ url: attempt.url, mode: config.mode })", "if (attempt.url) return json({ url: attempt.url, destination: 'checkout', mode: config.mode })")
s = once(s, "return json({ url: session.url, mode: config.mode })", "return json({ url: session.url, destination: 'checkout', mode: config.mode })")
p.write_text(s)

Path('src/lib/planPayment.ts').write_text(r'''/** Provider destinations are allowlisted; a plan card only opens customer confirmation. */
export function planPaymentAddress(value: unknown, destination: unknown): string {
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
''')

p = Path('src/pages/CreditsPage.tsx')
s = p.read_text()
s = once(s, "import BillingRecovery from '../components/BillingRecovery'", "import BillingRecovery from '../components/BillingRecovery'\nimport { planPaymentAddress, planPaymentNotice } from '../lib/planPayment'")
s = once(s, "type PaymentAction = 'card'", "type PaymentAction = 'plan' | 'card'")
s = once(s, "  async function checkout(action:", r'''  function canOpenPlan(id: PlanId) {
    if (!user || !balance || checking || loading || busy) return false
    if (member && (balance.subscription.plan ?? 'creator') === id) return billing?.portalReady === true
    return !balance.billingReview && billing?.plans?.[id]?.checkoutReady === true
  }

  function openPlan(id: PlanId) {
    if (!canOpenPlan(id)) return
    setSelectedPlan(id)
    setPurchaseKind('subscription')
    void checkout('plan', { kind: 'subscription', plan: id })
  }

  async function checkout(action:''')
s = once(s, "(action === 'portal' ? !canManage : action === 'change'", "(action === 'plan' ? !canOpenPlan(checkoutPlan) : action === 'portal' ? !canManage : action === 'change'")
s = once(s, "accountRequest(action === 'paypal' ?", "accountRequest(action === 'plan' ? '/api/billing/plan-payment' : action === 'paypal' ?")
s = once(s, "action === 'change' ? { plan: checkoutPlan }", "action === 'change' || action === 'plan' ? { plan: checkoutPlan }")
s = once(s, "      window.location.assign(checkoutAddress(result.url,", r'''      if (action === 'plan') {
        const text = planPaymentNotice(result.state)
        if (text) {
          setNotice({ tone: 'pending', text })
          await refresh()
          if (version === actionVersion.current) { setBusy(null); actionLock.current = false }
          return
        }
        window.location.assign(planPaymentAddress(result.url, result.destination))
        return
      }
      window.location.assign(checkoutAddress(result.url,''')
s = once(s, "    <BillingRecovery enabled={!!user && !loading} onRefresh={refresh} />\n", "")
s = once(s, "    <section className=\"credits-trust\"", "    <BillingRecovery enabled={!!user && !loading} onRefresh={refresh} />\n    <section className=\"credits-trust\"")
s = once(s, "        tabIndex={0}\n        aria-label={`Select ${name} plan`}", "        tabIndex={canOpenPlan(id) ? 0 : -1}\n        aria-label={`Open secure billing for ${name}`}\n        aria-disabled={!canOpenPlan(id)}")
s = once(s, "          setSelectedPlan(id)\n          setPurchaseKind('subscription')\n        }}\n        onKeyDown", "          openPlan(id)\n        }}\n        onKeyDown")
s = once(s, "          setSelectedPlan(id)\n          setPurchaseKind('subscription')\n        }}\n      >", "          openPlan(id)\n        }}\n      >")
start = s.index('        <button className="credits-action" disabled={busy!==null')
end = s.index('\n      </article>)}', start)
s = s[:start] + '''        <p className="credits-method-note">Confirmed plan credits are added to your existing balance, never substituted for it. Opening payment does not add credits.</p>
        <button className="credits-action" disabled={!canOpenPlan(id)} onClick={() => openPlan(id)}>{busy === 'plan' && selectedPlan === id ? 'Opening secure payment…' : member && (balance?.subscription.plan??'creator')===id ? 'Manage current subscription ↗' : billing?.plans?.[id]?.checkoutReady===false ? 'Temporarily unavailable · no charge' : `Subscribe ${price} / month ↗`}</button>''' + s[end:]
p.write_text(s)

p = Path('src/components/BillingRecovery.tsx')
s = p.read_text().replace('>Payment recovery</h2>', '>Payment methods and billing</h2>').replace('You can choose a plan below.', 'You can choose a plan above.')
s = once(s, 'Add funds or change your card, then choose Retry payment. This continues the existing invoice, not a second subscription.', 'Choose the matching plan above to continue payment, or use Retry payment here. You can change your card below. This continues the existing invoice, not a second subscription.')
p.write_text(s)
p = Path('src/lib/paymentError.ts')
s = p.read_text().replace('Use Payment recovery above', 'Use Payment methods and billing below')
p.write_text(s)

p = Path('tests/billing-recovery.test.ts')
s = p.read_text()
s = once(s, "pending_update: { subscription_items: [{ quantity: 1, price: { id: 'price_Pro' } }] }", "pending_update: { subscription_items: [{ id: 'si_Recovery', quantity: 1, price: { id: 'price_Pro' } }] }")
s = once(s, "unit_amount: id === 'price_Creator' ? 2999 : 9999", "unit_amount: id === 'price_Creator' ? 2999 : id === 'price_Studio' ? 14999 : 9999")
s = once(s, "    if (url.endsWith('/v1/billing_portal/sessions'))", r'''    if (url.endsWith('/v1/checkout/sessions')) {
      const body = new URLSearchParams(String(init?.body)), plan = body.get('metadata[worldifact_plan]') ?? 'creator'
      return Response.json({ id: 'cs_Fresh', livemode: false, url: 'https://checkout.stripe.com/c/pay/fixture', status: 'open', payment_status: 'unpaid', expires_at: now + 3600,
        amount_total: plan === 'studio' ? 14999 : plan === 'pro' ? 9999 : 2999, currency: 'usd', mode: 'subscription', customer,
        client_reference_id: uid, metadata: { worldifact_uid: uid, worldifact_kind: 'subscription', worldifact_plan: plan, worldifact_checkout_id: body.get('metadata[worldifact_checkout_id]') } })
    }
    if (url.endsWith('/v1/billing_portal/sessions'))''')
s += r'''

const choosePlan = (f: ReturnType<typeof fixture>, plan: string) => f.call('status', { plan }, 'https://worldifact.test', '/api/billing/plan-payment')
test('plan card resumes the same failed Pro payment directly, including stale Free UI state', async () => {
  const f = fixture()
  for (let i = 0; i < 3; i++) {
    const r = await choosePlan(f, 'pro'), body = await r!.json() as Json
    assert.equal(r?.status, 200); assert.equal(body.destination, 'invoice'); assert.equal(body.url, f.invoice.hosted_invoice_url)
  }
  assert.equal(f.map.get('balance'), 605); assert.equal(f.calls.filter(c => c.method === 'POST').length, 0)
})
test('Studio card with a failed Pro upgrade opens Studio confirmation on the SAME subscription', async () => {
  const f = fixture(), beforeInvoice = structuredClone(f.invoice), beforePending = structuredClone(f.subscription.pending_update)
  const r = await choosePlan(f, 'studio'), body = await r!.json() as Json
  assert.equal(r?.status, 200); assert.equal(body.destination, 'portal'); assert.equal(body.requiresConfirmation, true)
  const writes = f.calls.filter(c => c.method === 'POST'); assert.equal(writes.length, 1)
  assert.match(writes[0].url, /billing_portal\/sessions$/)
  const params = new URLSearchParams(writes[0].body)
  assert.equal(params.get('flow_data[type]'), 'subscription_update_confirm')
  assert.equal(params.get('flow_data[subscription_update_confirm][subscription]'), subId)
  assert.equal(params.get('flow_data[subscription_update_confirm][items][0][price]'), 'price_Studio')
  assert.deepEqual(f.invoice, beforeInvoice); assert.deepEqual(f.subscription.pending_update, beforePending); assert.equal(f.map.get('balance'), 605)
})
test('Studio card retries a failed Studio invoice instead of presenting Pro payment', async () => {
  const f = fixture(); f.subscription.pending_update.subscription_items[0].price.id = 'price_Studio'
  f.invoice.lines.data[0].price = 'price_Studio'; f.invoice.lines.data[0].amount = 14999
  Object.assign(f.invoice, { total: 14999, amount_due: 14999, amount_remaining: 14999 })
  const r = await choosePlan(f, 'studio'), body = await r!.json() as Json
  assert.equal(r?.status, 200); assert.equal(body.destination, 'invoice'); assert.equal(body.amountCents, 14999)
  assert.equal(f.calls.filter(c => c.method === 'POST').length, 0)
})
test('Pro and Studio paid grants add to 605 once; revisiting the same plan never purchases again', async () => {
  for (const [plan, price, amount, credits] of [['pro', 'price_Pro', 9999, 4500], ['studio', 'price_Studio', 14999, 7500]] as const) {
    const f = fixture(); f.subscription.pending_update = null; f.subscription.items.data[0].price = price
    f.invoice.lines.data[0].price = price; f.invoice.lines.data[0].amount = amount
    Object.assign(f.invoice, { paid: true, status: 'paid', amount_paid: amount, total: amount, amount_due: amount, amount_remaining: 0 })
    for (let i = 0; i < 2; i++) {
      const r = await choosePlan(f, plan), body = await r!.json() as Json
      assert.equal(r?.status, 200); assert.equal(body.destination, 'portal')
      assert.equal((await entitlementStatus(f.env, uid)).credits, 605 + credits)
    }
    assert.equal(f.calls.filter(c => c.method === 'POST').every(c => c.url.endsWith('/billing_portal/sessions')), true)
  }
})
test('expired unpaid upgrade opens a fresh customer confirmation, not a stale invoice', async () => {
  const f = fixture(); f.subscription.pending_update = null; f.invoice.status = 'void'; f.invoice.amount_remaining = 0
  const r = await choosePlan(f, 'pro'), body = await r!.json() as Json
  assert.equal(r?.status, 200); assert.equal(body.destination, 'portal'); assert.equal(f.map.get('balance'), 605)
})
test('no open subscription opens and reuses a single new checkout for the requested plan', async () => {
  const f = fixture(); f.state.subscriptions = []; f.map.delete('subscription')
  for (let i = 0; i < 2; i++) {
    const r = await choosePlan(f, 'studio'), body = await r!.json() as Json
    assert.equal(r?.status, 200); assert.equal(body.destination, 'checkout'); assert.equal(body.url, 'https://checkout.stripe.com/c/pay/fixture')
  }
  const writes = f.calls.filter(c => c.method === 'POST'); assert.equal(writes.length, 1)
  assert.equal(new URLSearchParams(writes[0].body).get('line_items[0][price]'), 'price_Studio'); assert.equal(f.map.get('balance'), 605)
})
test('an incomplete first subscription resumes payment even without paid membership', async () => {
  const f = fixture(); f.subscription.status = 'incomplete'; f.subscription.pending_update = null
  f.subscription.items.data[0].price = 'price_Pro'; f.invoice.billing_reason = 'subscription_create'; f.state.history = []
  const r = await choosePlan(f, 'pro'), body = await r!.json() as Json
  assert.equal(r?.status, 200); assert.equal(body.destination, 'invoice'); assert.equal(f.map.get('balance'), 605)
  const other = await choosePlan(f, 'studio'), otherBody = await other!.json() as Json
  assert.equal(other?.status, 200); assert.equal(otherBody.state, 'payment_required_other'); assert.equal(otherBody.url, undefined)
  assert.equal(f.calls.filter(c => c.method === 'POST').length, 0)
})
test('billing hold, foreign ownership and duplicate subscriptions do not become new payments', async () => {
  for (const change of ['hold', 'foreign', 'multiple']) {
    const f = fixture()
    if (change === 'hold') f.map.set('billingHold', true)
    if (change === 'foreign') f.subscription.customer = 'cus_Other'
    if (change === 'multiple') f.state.subscriptions.push(structuredClone(f.subscription))
    const r = await choosePlan(f, 'pro'), body = await r!.json() as Json
    assert.equal(body.state, 'review'); assert.equal(body.url, undefined); assert.equal(f.calls.filter(c => c.method === 'POST').length, 0)
  }
})
test('changing a pending plan rejects partial payment, wrong item, proration and scheduled changes', async () => {
  for (const change of ['partial', 'item', 'proration', 'schedule', 'cancel']) {
    const f = fixture()
    if (change === 'partial') { f.invoice.amount_paid = 100; f.invoice.amount_remaining = 9899 }
    if (change === 'item') f.subscription.pending_update.subscription_items[0].id = 'si_Other'
    if (change === 'proration') f.invoice.lines.data[0].proration = true
    if (change === 'schedule') f.subscription.schedule = 'sub_sched_Fixture'
    if (change === 'cancel') f.subscription.cancel_at_period_end = true
    const r = await choosePlan(f, 'studio'), body = await r!.json() as Json
    assert.equal(body.url, undefined); assert.equal(f.calls.filter(c => c.method === 'POST').length, 0); assert.equal(f.map.get('balance'), 605)
  }
})
test('plan action validates identity, origin, target and body before Stripe operations', async () => {
  const f = fixture()
  assert.equal((await choosePlan(f, 'enterprise'))?.status, 400)
  assert.equal((await f.call('status', { plan: 'pro', customer: 'cus_Other' }, 'https://worldifact.test', '/api/billing/plan-payment'))?.status, 400)
  assert.equal((await f.call('status', { plan: 'pro' }, 'https://evil.test', '/api/billing/plan-payment'))?.status, 403)
  f.state.authenticated = false; assert.equal((await choosePlan(f, 'pro'))?.status, 401)
  assert.equal(f.calls.filter(c => c.url.includes('api.stripe.com')).length, 0)
})
'''
p.write_text(s)

Path('tests/plan-payment-ui.test.ts').write_text(r'''import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { planPaymentAddress, planPaymentNotice } from '../src/lib/planPayment.ts'

test('plan redirects require exact provider and destination agreement', () => {
  for (const [kind, host] of [['invoice', 'invoice.stripe.com'], ['portal', 'billing.stripe.com'], ['checkout', 'checkout.stripe.com']]) {
    assert.equal(planPaymentAddress(`https://${host}/fixture`, kind), `https://${host}/fixture`)
    for (const url of [`http://${host}/fixture`, `https://${host}.evil.test/fixture`, `https://user@${host}/fixture`, `https://${host}:8443/fixture`, `https://${host}/fixture#fragment`]) assert.throws(() => planPaymentAddress(url, kind))
  }
  assert.throws(() => planPaymentAddress('https://invoice.stripe.com/i/test', 'checkout'))
  assert.throws(() => planPaymentAddress('https://checkout.stripe.com/c/test', '__proto__'))
  assert.throws(() => planPaymentAddress('javascript:alert(1)', 'invoice'))
})
test('known outstanding states produce actionable notices, not purchase redirects', () => {
  for (const state of ['processing', 'review', 'payment_required_other']) assert.match(planPaymentNotice(state)!, /below/)
  assert.equal(planPaymentNotice('payment_required'), null); assert.equal(planPaymentNotice('unexpected'), null)
})
test('pricing grid precedes card management and card/button/keyboard share one action', () => {
  const page = readFileSync(new URL('../src/pages/CreditsPage.tsx', import.meta.url), 'utf8')
  assert.ok(page.indexOf('<BillingRecovery') > page.indexOf('aria-label="Generation plans"'))
  assert.ok(page.indexOf('<BillingRecovery') > page.indexOf('Buy $29.99 top-up'))
  assert.equal((page.match(/openPlan\(id\)/g) ?? []).length, 3)
  assert.match(page, /closest\('button,a'\)/); assert.match(page, /actionLock\.current = true/)
  assert.match(page, /\/api\/billing\/plan-payment/); assert.doesNotMatch(page, /type="radio"/)
  assert.match(page, /added to your existing balance/)
})
''')

p = Path('docs/CONTEST_STATUS.md')
s = p.read_text()
p.write_text('''# 29 September 2026 — direct plan-card payments (review branch)

The owner requested that the existing Creator/Pro/Studio cards open the appropriate payment directly and that card management move BELOW the unchanged pricing grid. The cards, keyboard activation and CTA now use one authenticated plan-payment resolver. It resumes a verified unpaid invoice for the selected plan, opens a new Checkout only when no subscription is outstanding, and opens Stripe confirmation on the existing subscription for a different upgrade. A different fully unpaid pending upgrade may be reviewed in Stripe only after revalidating ownership, item, price, full invoice and the paid base period. This code never pays, voids or cancels an invoice/subscription itself. Stripe retains final customer confirmation. Partial/ambiguous/renewal payments are not silently replaced or redirected to the wrong plan.

The ledger already adds verified invoice grants. Added regression cases explicitly cover 605 + 4,500 = 5,105 and 605 + 7,500 = 8,105, repeated refreshes, incomplete purchases, expired upgrades, reuse, holds, foreign ownership and invalid destinations. Credit/price/budget/generation configuration is unchanged. Existing paid base access is preserved. Payment methods and billing, including Change card, are below the offers.

Validation results belong to the exact-head preparation/PR checks. This source entry is NOT proof of publication. Production merge/deployment awaits owner confirmation; no real customer payment was executed. Separately, the connected Stripe API accepted creation of a Studio subscription_update_confirm session while Pro was pending; that proves session creation only, NOT a completed customer payment. No customer identifiers or session URLs are committed.

---

''' + s)
print('Applied plan-card payment changes; run npm run verify and npm run deploy:check before publication.')
