import { TEST_ACCOUNT_CONTRACT, OVERNIGHT_PANEL_EXPIRES, OVERNIGHT_PANEL_SLOTS, type OvernightPanelRow, type OvernightPanelSlot, type OvernightPanelStatus } from './overnightTestClient.ts'
import type { GenerationQuote } from './generationQuote.ts'

export const SHOP_TEST_APPROVAL = 'api-tests-20261006-044444-usd4'
export const shopTestSelectionKey = (owner: string) => `worldifact:shop-test-selection:v1:${SHOP_TEST_APPROVAL}:${owner}`
export const testSlot = (value: unknown): OvernightPanelSlot | null => typeof value === 'string' && OVERNIGHT_PANEL_SLOTS.some(slot => slot.id === value) ? value as OvernightPanelSlot : null
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const integer = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0

export function testRowsUncertain(rows: OvernightPanelRow[], status?: OvernightPanelStatus | null): boolean {
  if (rows.some(row => row.state === 'pending' || row.uncertain || row.job?.reconciliationRequired)) return true
  // A committed slot absent from this browser may still be running elsewhere.
  // Missing history is not permission to allocate another request.
  return !!status && status.commitments.some(commitment => !rows.some(row => row.commitmentId === commitment.jobId && OVERNIGHT_PANEL_SLOTS.find(slot => slot.id === row.slot)?.workflow === commitment.workflow))
}
export function testInputProblem(slot: OvernightPanelSlot, model: string, detailed: boolean, references: number, budgetTier: string): string | null {
  if (slot.startsWith('astra-')) return model !== 'astra' || !detailed ? 'This slot funds Detailed Astra + Blender only. Choose that delivery and model explicitly.' : budgetTier !== 'standard' ? 'This slot uses the standard 250-point / USD 1.75 limit only. Choose Standard explicitly.' : null
  return model !== slot || detailed || references > 0 ? `This slot funds the matching text-only ${slot.toUpperCase()} procedural blueprint. Your references and delivery choice have not been changed.` : null
}
export function testFundingQuote(slot: OvernightPanelSlot, status: OvernightPanelStatus | null, rows: OvernightPanelRow[], account: unknown, now: number): GenerationQuote {
  const terms = OVERNIGHT_PANEL_SLOTS.find(value => value.id === slot)!
  const blocked = (message: string): GenerationQuote => ({ state: 'blocked', points: terms.points, after: null, message })
  if (!status) return { state: 'pending', points: null, after: null, message: 'Verify the same approved test pool and account before generating.' }
  if (!status.available || now >= Date.parse(OVERNIGHT_PANEL_EXPIRES) || now >= Date.parse(status.expiresAt) || status.remainingCents < terms.capCents ||
      status.attempts[terms.workflow] >= (terms.workflow === 'detailed-astra' ? 2 : 1)) return blocked('This approved test workflow is unavailable, expired or fully committed. No ordinary funding fallback.')
  if (testRowsUncertain(rows, status)) return blocked('Recover the pending or unverified same-account test request before allocating another slot.')
  if (rows.find(row => row.slot === slot)?.state !== 'empty') return blocked('This test slot already has a receipt. Recover it; it cannot be reset or replaced.')
  const value = object(account), costs = object(value.generationCosts), subscription = object(value.subscription)
  if (!integer(value.credits) || !integer(value.availableCredits ?? value.credits) || typeof subscription.active !== 'boolean' || costs.astra !== 250 || costs.sol !== 50 || costs.luna !== 15 || typeof value.billingReview !== 'boolean')
    return { state: 'pending', points: null, after: null, message: 'The signed-in account points could not be verified.' }
  if (value.billingReview) return blocked('Account billing review is required. The test pool does not bypass it.')
  const balance = Number(value.availableCredits ?? value.credits)
  if (balance < terms.points) return blocked('Not enough available account points for this explicit test. The USD 4 pool funds provider usage only.')
  return { state: 'credits', points: terms.points, after: balance - terms.points, message: `One explicit ${terms.points}-point attempt, using this existing test slot with a maximum USD ${(terms.capCents / 100).toFixed(2)} provider commitment. No recycled or ordinary funding.` }
}

export async function readTestAccount(fetcher: typeof fetch, owner: string): Promise<unknown> {
  const response = await fetcher('/api/account/entitlements', { credentials: 'same-origin', redirect: 'error', cache: 'no-store', headers: { 'X-WORLDIFACT-Expected-Account': owner, 'X-WORLDIFACT-Test-Contract': TEST_ACCOUNT_CONTRACT }, signal: AbortSignal.timeout(40_000) })
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json') || response.redirected) throw new Error('The signed-in test account could not be verified.')
  const text = await response.text()
  if (text.length > 32768) throw new Error('The signed-in test account response is too large.')
  const value = object(JSON.parse(text))
  if (value.accountContract !== TEST_ACCOUNT_CONTRACT) throw new Error('Refresh the app: this server has not verified the expected test account.')
  return value
}

export async function readTestCurrent(fetcher: typeof fetch, owner: string): Promise<Record<string, unknown> | null> {
  const response = await fetcher('/api/studio/current', { credentials: 'same-origin', redirect: 'error', cache: 'no-store', headers: { 'X-WORLDIFACT-Expected-Account': owner, 'X-WORLDIFACT-Test-Contract': TEST_ACCOUNT_CONTRACT }, signal: AbortSignal.timeout(40_000) })
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error('Current account work could not be verified.')
  const text = await response.text()
  if (text.length > 32768) throw new Error('Current account work could not be verified.')
  const value = object(JSON.parse(text))
  if (value.accountContract !== TEST_ACCOUNT_CONTRACT || !Object.hasOwn(value, 'current')) throw new Error('The expected account was not confirmed for current work.')
  return value.current === null ? null : object(value.current)
}

export { assertOrdinaryRequestsSettled } from './overnightTestClient.ts'

/** Keep an owned cloud test receipt out of the ordinary receipt namespace. */
export function shopCloudRecoveryFetch(fetcher: typeof fetch, owner: () => string | null): typeof fetch {
  return async (url, init = {}) => {
    if (url !== '/api/studio/current' || (init.method ?? 'GET').toUpperCase() !== 'GET') return fetcher(url, init)
    const expected = owner()
    if (!expected) throw new Error('Sign in before recovering current account work.')
    const headers = new Headers(init.headers)
    headers.set('X-WORLDIFACT-Expected-Account', expected); headers.set('X-WORLDIFACT-Test-Contract', TEST_ACCOUNT_CONTRACT)
    const response = await fetcher(url, { ...init, headers, credentials: 'same-origin', redirect: 'error' })
    if (!response.ok) return response
    const text = await response.clone().text()
    if (owner() !== expected || text.length > 32768) throw new Error('The current account changed or its recovery response is invalid.')
    const value = object(JSON.parse(text))
    if (value.accountContract !== TEST_ACCOUNT_CONTRACT) throw new Error('Refresh this page after the account-safe recovery update. No receipt was replaced.')
    if (value.current !== null && object(value.current).fundingSource === SHOP_TEST_APPROVAL && ['completed', 'failed'].includes(String(object(value.current).financialState)))
      return Response.json({ accountContract: TEST_ACCOUNT_CONTRACT, current: null })
    if (value.current !== null && object(value.current).fundingSource !== 'ordinary')
      throw new Error('The current cloud request belongs to separate test funding or its source is unverified. Recover its original approved test slot; ordinary receipts were preserved.')
    return response
  }
}
