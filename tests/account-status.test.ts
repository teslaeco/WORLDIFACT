import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkoutHomeDestination, checkoutReturnNotice, fetchAccountBalance, readAccountBalance } from '../src/lib/accountBalance.ts'
const account = (active = false, credits = 0) => ({ credits, subscription: { active, expiresAt: null }, billingReview: false, free: { fastRemaining: 2, slowRemaining: 1 } })

test('visible balance preserves real zero, free allowances and server membership', () => {
  assert.deepEqual(readAccountBalance(account()), { credits: 0, membershipActive: false, billingReview: false, fastRemaining: 2, slowRemaining: 1 })
  assert.equal(readAccountBalance(account(true, 1450)).credits, 1450)
  assert.equal(readAccountBalance(account(true, 1450)).membershipActive, true)
})
test('a malformed or unavailable balance never becomes invented credits', () => {
  for (const value of [null, {}, { ...account(), credits: '1500' }, { ...account(), credits: NaN }, { ...account(), credits: Number.MAX_SAFE_INTEGER + 1 }, { ...account(), free: { fastRemaining: -1, slowRemaining: 1 } }, { ...account(), subscription: { active: 'true' } }])
    assert.throws(() => readAccountBalance(value), /could not be verified/)
})
test('checkout returns home, dropping untrusted redirect and credit parameters', () => {
  assert.equal(checkoutHomeDestination('/account/credits', '?billing=processing&next=https://example.invalid&credits=999999'), '/?billing=processing')
  for (const search of ['', '?billing=cancelled', '?paypal=return&token=ANY', '?billing=processing&billing=cancelled']) assert.equal(checkoutHomeDestination('/account/credits', search), null)
  assert.equal(checkoutHomeDestination('/', '?billing=processing'), null, 'no redirect loop')
})
test('a checkout URL alone does not confirm payment, membership or credits', () => {
  assert.equal(checkoutReturnNotice(null).tone, 'pending')
  assert.equal(checkoutReturnNotice(readAccountBalance(account(false, 1500))).tone, 'pending', 'a top-up is not membership')
  assert.equal(checkoutReturnNotice(readAccountBalance(account(true, 1500))).tone, 'success')
  assert.equal(checkoutReturnNotice(readAccountBalance({ ...account(true, 1500), billingReview: true })).tone, 'pending')
  assert.match(checkoutReturnNotice(null).text, /do not pay again/)
})
test('balance refresh uses a same-origin no-store GET, not a payment or generation request', async () => {
  const signal = new AbortController().signal
  let count = 0
  const result = await fetchAccountBalance(signal, (async (url, options) => {
    count++; assert.equal(url, '/api/account/entitlements'); assert.equal(options?.method, 'GET')
    assert.equal(options?.credentials, 'same-origin'); assert.equal(options?.cache, 'no-store'); assert.equal(options?.signal, signal)
    return Response.json(account(true, 1400))
  }) as typeof fetch)
  assert.equal(count, 1); assert.equal(result.credits, 1400)
})
test('failed requests and HTML login pages never expose stale balances as current', async () => {
  for (const response of [Response.json(account(true, 9999), { status: 401 }), new Response('<html>login</html>', { headers: { 'content-type': 'text/html' } })])
    await assert.rejects(fetchAccountBalance(new AbortController().signal, (async () => response) as typeof fetch))
})
