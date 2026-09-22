const stages = new Set(['price_read', 'customer_create', 'subscription_list', 'checkout_create', 'portal_create', 'other_read'])
const categories = new Set(['provider_http', 'provider_timeout', 'provider_transport', 'provider_response', 'mode_mismatch', 'checkout_validation'])
const codes = new Set(['parameter_missing', 'parameter_unknown', 'parameter_invalid_empty', 'parameter_invalid_integer', 'resource_missing', 'permission_denied', 'account_invalid', 'api_key_expired', 'idempotency_key_in_use'])
const parameters = new Set(['email', 'customer', 'configuration', 'mode', 'currency', 'line_items', 'line_items[0][price]', 'line_items[0][quantity]', 'payment_method_types', 'payment_method_types[0]', 'allow_promotion_codes', 'success_url', 'cancel_url', 'return_url', 'client_reference_id', 'metadata', 'subscription_data', 'subscription_data[metadata]', 'payment_intent_data', 'payment_intent_data[metadata]', 'status', 'limit'])
const fields = new Set(['url', 'id', 'expires_at', 'amount_total', 'currency', 'mode', 'customer', 'client_reference_id', 'metadata.worldifact_uid', 'metadata.worldifact_kind', 'metadata.worldifact_checkout_id'])

export class AccountServiceError extends Error {
  status: number
  paymentReference: string | null
  constructor(message: string, status: number, diagnostic: unknown) {
    super(message)
    this.status = status
    this.paymentReference = null
    if (!diagnostic || typeof diagnostic !== 'object' || Array.isArray(diagnostic)) return
    const value = diagnostic as Record<string, unknown>
    if (typeof value.stage !== 'string' || !stages.has(value.stage) || typeof value.category !== 'string' || !categories.has(value.category)) return
    const parts = [value.stage, value.category]
    if (Number.isInteger(value.httpStatus) && Number(value.httpStatus) >= 300 && Number(value.httpStatus) <= 599) parts.push(String(value.httpStatus))
    if (typeof value.type === 'string' && ['api_error', 'card_error', 'idempotency_error', 'invalid_request_error'].includes(value.type)) parts.push(value.type)
    if (typeof value.code === 'string' && codes.has(value.code)) parts.push(value.code)
    if (typeof value.parameter === 'string' && parameters.has(value.parameter)) parts.push(value.parameter)
    if (Array.isArray(value.fields)) parts.push(...value.fields.filter((field): field is string => typeof field === 'string' && fields.has(field)).slice(0, 11))
    this.paymentReference = parts.join('/')
  }
}

export function paymentErrorMessage(error: unknown): string {
  if (error instanceof AccountServiceError) {
    if (error.status === 401) return 'Your session has expired. Sign in again before purchasing.'
    if (error.status === 429) return 'Please wait a moment before trying to open checkout again.'
    if (error.status === 409) return 'An existing payment or subscription needs attention. Refresh your balance and check your payment history before trying again.'
    if (error.paymentReference) return `Secure checkout could not be opened. Please contact support with reference: ${error.paymentReference}.`
  }
  return 'Secure checkout could not be opened. Please try again later.'
}
