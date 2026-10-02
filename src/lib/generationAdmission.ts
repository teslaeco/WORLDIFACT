/** Safe account refusals before generation admission. Never expose ledger values
 * or raw upstream errors, or describe an unreserved request as a refund. */
export const ADMISSION_FAILURE_CODES = [
  'BILLING_REVIEW_REQUIRED',
  'ASTRA_PLAN_REQUIRED',
  'CREATOR_ASTRA_PERIOD_LIMIT',
  'CREDITS_EXHAUSTED',
  'FREE_SOL_ONLY',
  'FAST_DAILY_LIMIT',
  'PROVIDER_BUDGET_EXHAUSTED',
  'ACCOUNT_REQUEST_CONFLICT',
  'ACCOUNT_ADMISSION_UNAVAILABLE',
] as const
export type AdmissionFailureCode = typeof ADMISSION_FAILURE_CODES[number]

const NOT_STARTED = ' No Oracle generation was submitted and no points were reserved for this request; no automatic retry.'
export const ADMISSION_FAILURE_DETAILS: Record<AdmissionFailureCode, string> = {
  BILLING_REVIEW_REQUIRED: 'Your account needs billing review before another generation.' + NOT_STARTED,
  ASTRA_PLAN_REQUIRED: 'ASTRA requires an eligible active plan and enabled ASTRA access. A top-up alone does not unlock ASTRA.' + NOT_STARTED,
  CREATOR_ASTRA_PERIOD_LIMIT: 'Your Creator plan’s ASTRA allowance for this billing period is used (up to six attempts).' + NOT_STARTED,
  CREDITS_EXHAUSTED: 'Not enough available points for this model. Points held for another job are not available to spend.' + NOT_STARTED,
  FREE_SOL_ONLY: 'The free allowance supports eligible SOL/LUNA drafts, not ASTRA.' + NOT_STARTED,
  FAST_DAILY_LIMIT: 'Your personal daily SOL/LUNA free allowance is used. Wait for its reset or use prepaid credits.' + NOT_STARTED,
  PROVIDER_BUDGET_EXHAUSTED: 'Your account’s provider funding limit has been reached for this model, even if points remain.' + NOT_STARTED,
  ACCOUNT_REQUEST_CONFLICT: 'This request conflicts with an existing account reservation. No new Oracle submission or points reservation was made. Recover the original request; it has not been changed. No automatic retry.',
  ACCOUNT_ADMISSION_UNAVAILABLE: 'Your account’s generation allowance could not be verified.' + NOT_STARTED,
}

export function isAdmissionFailureCode(value: unknown): value is AdmissionFailureCode {
  return typeof value === 'string' && ADMISSION_FAILURE_CODES.includes(value as AdmissionFailureCode)
}

/** The blueprint route calls its provider directly instead of the Oracle worker. */
export function blueprintAdmissionDetail(code: AdmissionFailureCode): string {
  return ADMISSION_FAILURE_DETAILS[code].replaceAll('Oracle', 'provider')
}
