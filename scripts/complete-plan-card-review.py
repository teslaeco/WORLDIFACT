"""Complete review changes after the main plan-card patch, without external calls."""
from pathlib import Path


def once(text, before, after):
    if text.count(before) != 1:
        raise RuntimeError('Expected one anchor: ' + before[:100])
    return text.replace(before, after, 1)


p = Path('tests/editor-polish-billing.test.ts')
s = p.read_text()
s = once(s, "const subscription={id:subscriptionId,customer,status:'active'", "const subscription={id:subscriptionId,customer,livemode:false,status:'active'")
p.write_text(s)
p = Path('tests/entitlements.test.ts')
s = p.read_text()
s = once(s, "assert.deepEqual(await response!.json(), { url: 'https://checkout.stripe.com/c/pay/new_fixture', mode: 'test' })", "assert.deepEqual(await response!.json(), { url: 'https://checkout.stripe.com/c/pay/new_fixture', destination: 'checkout', mode: 'test' })")
p.write_text(s)

p = Path('src/lib/planPayment.ts')
s = p.read_text()
s += '''
/** Browser Back may restore the page with a stale opening-payment lock. No payment is retried. */
export function onCachedBillingReturn(target: EventTarget, resetAndRefresh: () => void): () => void {
  const returned = (event: Event) => {
    if ('persisted' in event && event.persisted === true) resetAndRefresh()
  }
  target.addEventListener('pageshow', returned)
  return () => target.removeEventListener('pageshow', returned)
}
'''
p.write_text(s)
p = Path('src/pages/CreditsPage.tsx')
s = p.read_text()
s = once(s, "import { planPaymentAddress, planPaymentNotice }", "import { onCachedBillingReturn, planPaymentAddress, planPaymentNotice }")
s = once(s, "  const member = balance?.subscription.active === true", '''  useEffect(() => onCachedBillingReturn(window, () => {
    actionVersion.current++
    actionLock.current = false
    setBusy(null)
    setError('')
    setChecking(true)
    void refresh()
  }), [refresh])

  const member = balance?.subscription.active === true''')
p.write_text(s)

p = Path('tests/plan-payment-ui.test.ts')
s = p.read_text()
s = once(s, 'import { planPaymentAddress, planPaymentNotice }', 'import { onCachedBillingReturn, planPaymentAddress, planPaymentNotice }')
s += '''
test('browser Back recovery resets stale UI only for a persisted page and removes its listener', () => {
  const target = new EventTarget(), state = { locked: true, version: 1, refreshes: 0 }
  const dispose = onCachedBillingReturn(target, () => { state.locked = false; state.version++; state.refreshes++ })
  target.dispatchEvent(new Event('pageshow'))
  assert.equal(state.locked, true); assert.equal(state.refreshes, 0)
  const persisted = new Event('pageshow'); Object.defineProperty(persisted, 'persisted', { value: true })
  target.dispatchEvent(persisted)
  assert.deepEqual(state, { locked: false, version: 2, refreshes: 1 })
  dispose(); target.dispatchEvent(persisted); assert.equal(state.refreshes, 1)
  const source = readFileSync(new URL('../src/pages/CreditsPage.tsx', import.meta.url), 'utf8')
  assert.match(source, /onCachedBillingReturn\\(window/)
  assert.match(source, /actionVersion\\.current\\+\\+/)
})
'''
p.write_text(s)
p = Path('docs/CONTEST_STATUS.md')
s = p.read_text()
s = once(s, 'Validation results belong to the exact-head preparation/PR checks.', 'Browser Back from a cached Stripe navigation clears only the stale UI action lock and refreshes account state; it does not repeat a payment request. A listener test covers this lifecycle and cleanup. Two existing fixture assertions were aligned with explicit Stripe livemode and the added destination field; their payment safety assertions remain unchanged. Validation results belong to the exact-head preparation/PR checks.')
p.write_text(s)
