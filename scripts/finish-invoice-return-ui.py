from pathlib import Path

def once(s, before, after):
    if s.count(before) != 1:
        raise RuntimeError('Expected one anchor: ' + before[:100])
    return s.replace(before, after, 1)

p=Path('server/billing.ts'); s=p.read_text()
s=once(s,"const response = { invoiceId, state: 'payment_required'", "const response = { invoiceId, subscriptionId: subscription.id, state: 'payment_required'")
s=once(s,"if (invoice.id !== recovery.invoiceId || idOf(invoice.customer)","if (invoice.id !== recovery.invoiceId || subscriptionOf(invoice) !== recovery.subscriptionId || idOf(invoice.customer)")
p.write_text(s)
p=Path('src/lib/accountDestination.ts'); s=p.read_text(); s="import { invoiceReturnSearch } from './invoicePayment.ts'\n"+s
s=once(s,"    if (url.pathname !== '/account/credits')", "    if (url.pathname === '/account/payment') {\n      const target = invoiceReturnSearch(url.search)\n      return target ? '/account/payment' + target.cleanSearch : '/account/credits'\n    }\n    if (url.pathname !== '/account/credits')"); p.write_text(s)
p=Path('src/lib/invoicePayment.ts'); s=p.read_text()
s+=r'''
/** Bounded read-only settlement polling. It never calls Stripe confirmation or grants credits. */
export async function waitForInvoiceConfirmation(read: () => Promise<Record<string, unknown>>, plan: InvoicePlan, invoiceId: string,
  alive: () => boolean, wait: () => Promise<void> = () => new Promise(resolve => setTimeout(resolve, 3000))): Promise<boolean> {
  for (let attempt = 0; attempt < 6 && alive(); attempt++) {
    if (attempt) { await wait(); if (!alive()) return false }
    const result = await read()
    if (!alive()) return false
    if (verifiedInvoiceReturn(result, plan, invoiceId)) return true
  }
  return false
}
'''; p.write_text(s)
p=Path('src/pages/InvoicePaymentPage.tsx'); s=p.read_text()
s=once(s,'invoiceReturnSearch, verifiedInvoiceReturn','invoiceReturnSearch, verifiedInvoiceReturn, waitForInvoiceConfirmation')
s=once(s,"    if (target) window.history.replaceState(null, '', '/account/payment' + target.cleanSearch)", "    window.history.replaceState(null, '', '/account/payment' + (target?.cleanSearch ?? ''))")
s=once(s,"        if (result.phase !== 'payment_required') {", "        if (target.invoiceId && result.phase !== 'payment_required') {\n          const confirmed = await waitForInvoiceConfirmation(() => accountRequest('/api/billing/invoice-payment', { plan: target.plan, action: 'status', invoiceId: target.invoiceId }), target.plan, target.invoiceId, () => !disposed)\n          if (disposed) return\n          if (confirmed) { window.location.replace('/?billing=processing'); return }\n        }\n        if (result.phase !== 'payment_required') {")
s=once(s,"      const confirmed = await accountRequest('/api/billing/invoice-payment', { plan: target.plan, action: 'status', invoiceId: current.invoiceId })", "      setReady(false); setMessage('Payment submitted. Checking confirmation before returning to WORLDIFACT…')\n      const confirmed = await waitForInvoiceConfirmation(() => accountRequest('/api/billing/invoice-payment', { plan: target.plan, action: 'status', invoiceId: current.invoiceId }), target.plan, current.invoiceId, () => alive.current)")
s=once(s,"      if (verifiedInvoiceReturn(confirmed, target.plan, current.invoiceId))", "      if (confirmed)")
p.write_text(s)
p=Path('tests/invoice-return.test.ts'); s=p.read_text()
s=once(s,'invoiceReturnSearch, verifiedInvoiceReturn','invoiceReturnSearch, verifiedInvoiceReturn, waitForInvoiceConfirmation')
s="import { safeAccountDestination } from '../src/lib/accountDestination.ts'\n"+s
s+=r'''
test('sign-in preserves only the intended invoice return, never a client secret or external redirect', () => {
  assert.equal(safeAccountDestination('/account/payment?plan=pro&invoice=in_Owned&payment_intent_client_secret=private&next=https://evil.test'), '/account/payment?plan=pro&invoice=in_Owned')
  assert.equal(safeAccountDestination('/account/payment?plan=invalid'), '/account/credits')
})
test('settlement polling waits for the matching invoice and stops after six reads', async () => {
  let calls = 0
  assert.equal(await waitForInvoiceConfirmation(async () => ++calls === 3 ? { phase: 'confirmed', plan: 'pro', invoiceId: 'in_Owned' } : { phase: 'processing' }, 'pro', 'in_Owned', () => true, async () => {}), true)
  assert.equal(calls, 3); calls = 0
  assert.equal(await waitForInvoiceConfirmation(async () => { calls++; return { phase: 'confirmed', plan: 'studio', invoiceId: 'in_Other' } }, 'pro', 'in_Owned', () => true, async () => {}), false)
  assert.equal(calls, 6)
})
test('leaving the payment screen discards a late settlement and stops polling', async () => {
  let active = true, calls = 0
  assert.equal(await waitForInvoiceConfirmation(async () => { calls++; active = false; return { phase: 'confirmed', plan: 'pro', invoiceId: 'in_Owned' } }, 'pro', 'in_Owned', () => active, async () => {}), false)
  assert.equal(calls, 1)
})
'''; p.write_text(s)
p=Path('tests/billing-recovery.test.ts'); s=p.read_text()
s+=r'''
test('invoice preparation rejects a changed subscription parent on the second authoritative read', async () => {
  const f = formFixture(); let reads = 0
  Object.defineProperty(f.invoice, 'subscription', { get() { return ++reads > 3 ? 'sub_Other' : subId }, configurable: true })
  const body = await (await form(f))!.json() as Json
  assert.equal(body.clientSecret, undefined); assert.equal(f.calls.filter(c => c.method === 'POST').length, 0)
})
'''; p.write_text(s)
p=Path('docs/CONTEST_STATUS.md'); s=p.read_text()
s=once(s,'Tests are synthetic; real bank authorization is NOT tested here.', 'Bounded read-only settlement polling handles delayed confirmation and stops on unmount. Sign-in preserves only the chosen plan and invoice reference; client secrets and arbitrary redirect targets are stripped. Tests are synthetic; real bank authorization is NOT tested here.')
p.write_text(s)
