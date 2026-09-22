import test from 'node:test'
import assert from 'node:assert/strict'
import { AccountServiceError, paymentErrorMessage } from '../src/lib/paymentError.ts'

test('checkout errors provide fixed support references without rendering provider values', () => {
  const secret = 'sk_live_do_not_display'
  const error = new AccountServiceError(secret, 502, { stage: 'customer_create', category: 'provider_http', httpStatus: 403, message: secret, code: secret, parameter: secret, fields: ['amount_total', secret] })
  assert.equal(error.paymentReference, 'customer_create/provider_http/403/amount_total')
  assert.match(paymentErrorMessage(error), /customer_create\/provider_http\/403/)
  assert.ok(!paymentErrorMessage(error).includes(secret))
  for (const diagnostic of [{ stage: secret, category: 'provider_http' }, { stage: 'checkout_create', category: secret }, null]) {
    assert.ok(!paymentErrorMessage(new AccountServiceError(secret, 503, diagnostic)).includes(secret))
  }
})

test('checkout errors distinguish sign-in expiry, throttling and existing payments without suggesting another purchase', () => {
  assert.match(paymentErrorMessage(new AccountServiceError('', 401, null)), /Sign in again/)
  assert.match(paymentErrorMessage(new AccountServiceError('', 429, null)), /wait a moment/)
  assert.match(paymentErrorMessage(new AccountServiceError('', 409, null)), /existing payment or subscription/)
})
