/** Public incident terms only. Account/job/approval commitments stay server-side. */
export const FAILED_HOLD_WAIVER_APPROVAL = 'failed-hold-waiver-20261009-v1' as const
export const FAILED_HOLD_WAIVER_REVISION = FAILED_HOLD_WAIVER_APPROVAL
export type FailedHoldWaiverResponse = {
  revision: typeof FAILED_HOLD_WAIVER_REVISION
  status: 'preview' | 'applied' | 'already-applied'
  approvalId: typeof FAILED_HOLD_WAIVER_APPROVAL
  releasedPoints: 1000
  before: { balance: 1190; held: 1000; available: 190 }
  after: { balance: 1190; held: 0; available: 1190 }
  providerLiabilityCents: 324
  preservesProviderLiability: true
  generationStarted: false
  appliedAt: number | null
}
function record(value: unknown, keys: string[]): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && Object.keys(value).every(key => keys.includes(key))
}
export function readFailedHoldWaiverResponse(value: unknown): FailedHoldWaiverResponse {
  if (!record(value, ['revision', 'status', 'approvalId', 'releasedPoints', 'before', 'after', 'providerLiabilityCents', 'preservesProviderLiability', 'generationStarted', 'appliedAt']) ||
      value.revision !== FAILED_HOLD_WAIVER_REVISION || value.approvalId !== FAILED_HOLD_WAIVER_APPROVAL ||
      !['preview', 'applied', 'already-applied'].includes(value.status as string) || value.releasedPoints !== 1000 ||
      value.providerLiabilityCents !== 324 || value.preservesProviderLiability !== true || value.generationStarted !== false ||
      !record(value.before, ['balance', 'held', 'available']) || value.before.balance !== 1190 || value.before.held !== 1000 || value.before.available !== 190 ||
      !record(value.after, ['balance', 'held', 'available']) || value.after.balance !== 1190 || value.after.held !== 0 || value.after.available !== 1190 ||
      (value.status === 'preview' ? value.appliedAt !== null : !Number.isSafeInteger(value.appliedAt) || Number(value.appliedAt) <= 0))
    throw new Error('The failed-hold waiver returned an unrecognized response.')
  return value as FailedHoldWaiverResponse
}
/** Exactly one request. An uncertain POST must be checked with GET, never retried automatically. */
export async function requestFailedHoldWaiver(apply: boolean, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<FailedHoldWaiverResponse> {
  const result = await fetcher('/api/account/failed-hold-waiver', { method: apply ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal,
    ...(apply ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ approvalId: FAILED_HOLD_WAIVER_APPROVAL }) } : {}) })
  const unconfirmed = () => new Error('The waiver result could not be verified. Read its status before any further action.')
  if (!result.headers.get('content-type')?.includes('application/json') || Number(result.headers.get('content-length')) > 4096) throw unconfirmed()
  const reader = result.body?.getReader()
  if (!reader) throw unconfirmed()
  let text = '', bytes = 0
  const decoder = new TextDecoder('utf-8', { fatal: true })
  try {
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) break
      bytes += chunk.value.byteLength
      if (bytes > 4096) { await reader.cancel(); throw unconfirmed() }
      text += decoder.decode(chunk.value, { stream: true })
    }
    text += decoder.decode()
  } catch { await reader.cancel().catch(() => {}); throw unconfirmed() }
  let value: unknown
  try { value = JSON.parse(text) } catch { throw unconfirmed() }
  if (!result.ok) {
    if (result.status === 401) throw new Error('Sign in to the approved account to check this waiver.')
    if (result.status === 403) throw new Error('This waiver is unavailable for the current session.')
    if (result.status === 409) throw new Error('The account or incident evidence no longer matches the approved correction. No change was made. Request review.')
    throw unconfirmed()
  }
  const response = readFailedHoldWaiverResponse(value)
  if (apply && response.status === 'preview') throw unconfirmed()
  return response
}
