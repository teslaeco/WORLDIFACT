import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { onCachedBillingReturn, planPaymentAddress, planPaymentNotice } from '../src/lib/planPayment.ts'

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
  assert.match(page, /Points only; no membership/); assert.match(page, /visibleBalance.available.toLocaleString/)
})

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
  assert.match(source, /onCachedBillingReturn\(window/)
  assert.match(source, /actionVersion\.current\+\+/)
})
