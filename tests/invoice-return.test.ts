import { test } from 'node:test'
import assert from 'node:assert/strict'
import { invoiceFormAddress, invoiceReturnSearch, verifiedInvoiceReturn } from '../src/lib/invoicePayment.ts'

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
