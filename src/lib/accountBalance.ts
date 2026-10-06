export type VisibleBalance = { credits: number; membershipActive: boolean; billingReview: boolean; fastRemaining: number; slowRemaining: number }
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)

/** Display only authenticated server values, never prices or URL-supplied credit counts. */
export function readAccountBalance(value: unknown): VisibleBalance {
  if (!record(value) || !Number.isSafeInteger(value.credits) || !record(value.subscription) ||
      typeof value.subscription.active !== 'boolean' || typeof value.billingReview !== 'boolean' || !record(value.free) ||
      !Number.isSafeInteger(value.free.fastRemaining) || Number(value.free.fastRemaining) < 0 ||
      !Number.isSafeInteger(value.free.slowRemaining) || Number(value.free.slowRemaining) < 0)
    throw new Error('Your credit balance could not be verified. Please refresh.')
  return { credits: Number(value.credits), membershipActive: value.subscription.active, billingReview: value.billingReview,
    fastRemaining: Number(value.free.fastRemaining), slowRemaining: Number(value.free.slowRemaining) }
}
export async function fetchAccountBalance(signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<VisibleBalance> {
  const response = await fetcher('/api/account/entitlements', { method: 'GET', credentials: 'same-origin', cache: 'no-store', signal })
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json'))
    throw new Error(response.status === 401 ? 'Sign in again to refresh your credits.' : 'Your credits are temporarily unavailable. Please refresh.')
  return readAccountBalance(await response.json())
}
/** Keep the existing provider return/settlement contract; only change its landing page. */
export function checkoutHomeDestination(pathname: string, search: string): string | null {
  const values = new URLSearchParams(search).getAll('billing')
  return pathname === '/account/credits' && values.length === 1 && values[0] === 'processing' ? '/?billing=processing' : null
}
export function checkoutReturnNotice(balance: VisibleBalance | null): { tone: 'success' | 'pending'; text: string } {
  if (balance?.billingReview) return { tone: 'pending', text: 'Thank you for choosing WORLDIFACT. Your billing status needs review. Please check your account before making another payment.' }
  if (balance?.membershipActive) return { tone: 'success', text: 'Thank you for supporting WORLDIFACT! Your membership is active. Have fun and enjoy creating amazing 3D models!' }
  return { tone: 'pending', text: 'Thank you for choosing WORLDIFACT! We are checking your membership and credits. Credits appear only after payment confirmation; please do not pay again while it is pending. We wish you many successful generations!' }
}
