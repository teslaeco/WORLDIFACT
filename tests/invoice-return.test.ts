import { safeAccountDestination } from '../src/lib/accountDestination.ts'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { invoiceFormAddress, invoiceReturnSearch, verifiedInvoiceReturn, waitForInvoiceConfirmation } from '../src/lib/invoicePayment.ts'

test('invoice form accepts only a fixed same-origin route and known plan', () => {
  assert.equal(invoiceFormAddress('/account/payment?plan=pro', 'worldifact'), '/account/payment?plan=pro')
  for (const value of ['https://evil.test/account/payment?plan=pro', '//evil.test', '/account/payment?plan=pro&next=https://evil.test', '/account/payment?plan=unknown', '/account/payment?plan=pro#x']) assert.throws(() => invoiceFormAddress(value, 'worldifact'))
})
test('bank return drops client secrets, return targets and claimed credit counts', () => {
  const result = invoiceReturnSearch('?plan=pro&invoice=in_Owned&payment_intent_client_secret=do-not-keep&credits=999999&next=https://evil.test')
  assert.deepEqual(result, { plan: 'pro', invoiceId: 'in_Owned', cleanSearch: '?plan=pro&invoice=in_Owned' })
  for (const search of ['?plan=pro&plan=studio', '?plan=wrong', '?plan=pro&invoice=in_A&invoice=in_B', '?plan=pro&invoice=../foreign']) assert.equal(invoiceReturnSearch(search), null)
})
test('only a server-confirmed matching invoice authorizes the automatic home return', () => {
  const paid = { phase: 'confirmed', plan: 'pro', invoiceId: 'in_Owned' }
  assert.equal(verifiedInvoiceReturn(paid, 'pro', 'in_Owned'), true)
  for (const change of [{ phase: 'payment_required' }, { phase: 'processing' }, { plan: 'studio' }, { invoiceId: 'in_Other' }, { invoiceId: null }]) assert.equal(verifiedInvoiceReturn({ ...paid, ...change }, 'pro', 'in_Owned'), false)
})

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
