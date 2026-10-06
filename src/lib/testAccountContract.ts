/** Public protocol acknowledgement; neither an access token nor spending authority. */
export const TEST_ACCOUNT_CONTRACT = 'approved-test-account-v1' as const
export const TEST_ACCOUNT_HEADER = 'X-WORLDIFACT-Expected-Account'
export const TEST_CONTRACT_HEADER = 'X-WORLDIFACT-Test-Contract'
const accountPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/
export function hasTestAccountHeaders(headers: Headers): boolean {
  return headers.has(TEST_ACCOUNT_HEADER) || headers.has(TEST_CONTRACT_HEADER)
}
export function testAccountMatches(headers: Headers, authenticatedAccount: unknown): boolean {
  const expected = headers.get(TEST_ACCOUNT_HEADER)
  return headers.get(TEST_CONTRACT_HEADER) === TEST_ACCOUNT_CONTRACT && typeof expected === 'string' && accountPattern.test(expected) &&
    typeof authenticatedAccount === 'string' && expected === authenticatedAccount.toLowerCase()
}
/** Checks the wire envelope only. Callers must also match the authenticated
 * account before reservation, preparation or recovery of any owned data. */
export function readTestInputEnvelope(value: unknown, headers: Headers): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const item = value as Record<string, unknown>
  if (Object.keys(item).length !== 3 || !Object.keys(item).every(key => ['testContract', 'expectedAccountId', 'input'].includes(key)) ||
      item.testContract !== TEST_ACCOUNT_CONTRACT || !testAccountMatches(headers, item.expectedAccountId) ||
      !item.input || typeof item.input !== 'object' || Array.isArray(item.input)) return null
  return item.input as Record<string, unknown>
}
