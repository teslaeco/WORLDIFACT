/** Fixed read-only status diagnostics. Never include a private value or identity. */
export const OVERNIGHT_TEST_DIAGNOSTICS = [
  'TEST_SIGN_IN_REQUIRED', 'TEST_AUTH_UNAVAILABLE', 'TEST_STATUS_RATE_LIMITED',
  'TEST_STATUS_PROTECTION_UNAVAILABLE', 'TEST_STATUS_TRANSPORT_FAILED', 'TEST_STATUS_RESPONSE_INVALID',
  'TEST_LEDGER_NOT_LIVE', 'TEST_POOL_BINDING_MISSING', 'TEST_ACCOUNT_NOT_APPROVED',
  'TEST_EXPLICIT_BINDING_TYPE', 'TEST_EXPLICIT_CONFIG_INVALID', 'TEST_SELECTOR_MISSING',
  'TEST_SELECTOR_BINDING_TYPE', 'TEST_SELECTOR_INVALID', 'TEST_WINDOW_NOT_STARTED',
  'TEST_POOL_NAMESPACE_MISMATCH', 'TEST_POOL_REQUEST_FAILED', 'TEST_POOL_READ_UNAVAILABLE',
  'TEST_POOL_STATE_INVALID', 'TEST_BROWSER_RECEIPT_STORAGE',
] as const
export type OvernightTestDiagnostic = typeof OVERNIGHT_TEST_DIAGNOSTICS[number]
export function isOvernightTestDiagnostic(value: unknown): value is OvernightTestDiagnostic {
  return typeof value === 'string' && (OVERNIGHT_TEST_DIAGNOSTICS as readonly string[]).includes(value)
}
export class OvernightTestStatusError extends Error {
  readonly diagnostic: OvernightTestDiagnostic
  constructor(diagnostic: OvernightTestDiagnostic) {
    super(`The temporary test status could not be verified. Diagnostic: ${diagnostic}.`)
    this.diagnostic = diagnostic
  }
}
export function overnightTestDiagnostic(error: unknown): OvernightTestDiagnostic {
  return error instanceof OvernightTestStatusError && isOvernightTestDiagnostic(error.diagnostic)
    ? error.diagnostic : 'TEST_STATUS_RESPONSE_INVALID'
}
