"""Complete expiry recovery without voiding invoices or charging cards."""
from pathlib import Path
import subprocess
p = Path('server/billing.ts')
if subprocess.check_output(['git', 'hash-object', str(p)], text=True).strip() != 'a7d748ff599a73898a801e3f3e8b415ec1418c93':
    raise SystemExit('Billing source changed; review again.')
def once(text, old, new):
    if text.count(old) != 1:
        raise SystemExit('Missing or ambiguous patch anchor: ' + old[:100])
    return text.replace(old, new, 1)
s = p.read_text()
s = once(s, "  if (!open.length) return json({ state: 'none', canManage: true, canRetry: false })", """  if (!open.length) {
    // Reconcile terminal state too, so a delayed deletion/expiry webhook cannot leave
    // a phantom active membership blocking a legitimate new checkout.
    for (const terminal of array(subscriptions.data)) {
      if (terminal.livemode !== (env.STRIPE_MODE === 'live') || !resourceId(terminal.id, 'sub')
        || uidFor(terminal) !== user.id || idOf(terminal.customer) !== stored.customer) return review()
      await syncSubscription(env, terminal, Math.floor(Date.now() / 1000) * 1000, fetcher)
    }
    return json({ state: 'none', canManage: true, canRetry: false })
  }""")
s = once(s, "      if (!exactInvoice(env,invoice)||subscriptionOf(invoice)!==subscription.id) return json({error:'Settle the outstanding invoice before changing plan.'},409)", """      if (subscriptionOf(invoice)!==subscription.id || idOf(invoice.customer)!==stored.customer) return json({error:'The billing account could not be confirmed.'},409)
      const paidInvoice = exactInvoice(env, invoice)
      if (!paidInvoice || paidInvoice.plan !== source) {
        // Stripe voids an expired pending-upgrade invoice. It cannot be paid, and
        // must not permanently prevent a fresh, explicitly confirmed plan change.
        if (invoice.status !== 'void' || invoice.billing_reason !== 'subscription_update') return json({error:'Settle the outstanding invoice before changing plan.'},409)
        await syncSubscription(env, subscription, Math.floor(Date.now() / 1000) * 1000, fetcher)
        const recovered = await entitlementStatus(env, user.id)
        if (!recovered.subscription.active || recovered.subscription.plan !== source || recovered.billingReview) return json({error:'The current paid subscription period could not be verified.'},409)
      }""")
p.write_text(s)
p = Path('tests/billing-recovery.test.ts')
s = p.read_text()
s = once(s, "STRIPE_BILLING_PORTAL_CONFIGURATION_ID: 'bpc_Management',", "STRIPE_BILLING_PORTAL_CONFIGURATION_ID: 'bpc_Management', STRIPE_PLAN_CHANGE_CONFIGURATION_ID: 'bpc_Changes',")
s = once(s, "const call = (action = 'status', body: Json = { action }, origin = 'https://worldifact.test') => billingApi(new Request('https://worldifact.test/api/billing/recovery',", "const call = (action = 'status', body: Json = { action }, origin = 'https://worldifact.test', path = '/api/billing/recovery') => billingApi(new Request('https://worldifact.test' + path,")
s += r'''

test('an expired void upgrade can be reviewed again for the SAME paid subscription', async () => {
  const f = fixture(); f.invoice.status = 'void'; f.invoice.amount_remaining = 0; f.subscription.pending_update = null
  await f.call()
  const response = await f.call('status', { plan: 'pro' }, 'https://worldifact.test', '/api/billing/change-plan')
  assert.equal(response?.status, 200)
  const writes = f.calls.filter(c => c.method === 'POST')
  assert.equal(writes.length, 1); assert.match(writes[0].url, /billing_portal\/sessions$/)
  const body = new URLSearchParams(writes[0].body)
  assert.equal(body.get('flow_data[type]'), 'subscription_update_confirm')
  assert.equal(body.get('flow_data[subscription_update_confirm][subscription]'), subId)
  assert.equal(body.get('flow_data[subscription_update_confirm][items][0][price]'), 'price_Pro')
  assert.equal(f.map.get('balance'), 605)
})
test('an open unpaid upgrade still cannot open a second plan-change confirmation', async () => {
  const f = fixture(); await f.call(); f.subscription.pending_update = null
  const response = await f.call('status', { plan: 'pro' }, 'https://worldifact.test', '/api/billing/change-plan')
  assert.equal(response?.status, 409); assert.equal(f.calls.filter(c => c.method === 'POST').length, 0)
})
test('void invoice alone cannot authorize a plan change from a stale active ledger', async () => {
  const f = fixture(); f.invoice.status = 'void'; f.invoice.amount_remaining = 0; f.subscription.pending_update = null; f.state.history = []
  const previous = f.map.get('subscription') as Json
  f.map.set('subscription', { ...previous, active: true, grantId: 'in_Base' })
  const response = await f.call('status', { plan: 'pro' }, 'https://worldifact.test', '/api/billing/change-plan')
  assert.equal(response?.status, 409); assert.equal((await entitlementStatus(f.env, uid)).subscription.active, false)
  assert.equal(f.calls.filter(c => c.method === 'POST').length, 0)
})
test('terminal Stripe state clears a phantom active membership after a missed webhook', async () => {
  for (const status of ['canceled', 'incomplete_expired']) {
    const f = fixture(); f.subscription.status = status
    const previous = f.map.get('subscription') as Json
    f.map.set('subscription', { ...previous, active: true, grantId: 'in_Base' })
    const response = await f.call(); assert.equal(response?.status, 200)
    assert.equal((await entitlementStatus(f.env, uid)).subscription.active, false)
    assert.equal(f.map.get('balance'), 605); assert.equal(f.calls.filter(c => c.method === 'POST').length, 0)
  }
})
'''
p.write_text(s)
print('Prepared expiry recovery and four regression tests; no provider calls.')
