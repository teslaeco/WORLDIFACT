import { OWNER_RESERVE_ADJUSTMENT_APPROVAL, readOwnerReserveAdjustmentResponse, type OwnerReserveAdjustmentResponse } from './ownerReserveAdjustment.ts'

const PATH = '/api/account/owner-reserve-adjustment'
const MAX_BYTES = 4096
/** Exactly one request. In particular, an uncertain POST is never retried. */
export async function requestOwnerReserveAdjustment(apply: boolean, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<OwnerReserveAdjustmentResponse> {
  const result = await fetcher(PATH, { method: apply ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal,
    ...(apply ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ approvalId: OWNER_RESERVE_ADJUSTMENT_APPROVAL }) } : {}) })
  if (!result.headers.get('content-type')?.includes('application/json') || Number(result.headers.get('content-length')) > MAX_BYTES)
    throw new Error('The adjustment response could not be verified. Read its status before any further action.')
  const reader = result.body?.getReader()
  if (!reader) throw new Error('The adjustment response is unavailable. Read its status before any further action.')
  let text = '', bytes = 0
  const decoder = new TextDecoder('utf-8', { fatal: true })
  for (;;) {
    const chunk = await reader.read()
    if (chunk.done) break
    bytes += chunk.value.byteLength
    if (bytes > MAX_BYTES) { await reader.cancel(); throw new Error('The adjustment response could not be verified. Read its status before any further action.') }
    text += decoder.decode(chunk.value, { stream: true })
  }
  text += decoder.decode()
  let value: unknown
  try { value = JSON.parse(text) } catch { throw new Error('The adjustment response could not be verified. Read its status before any further action.') }
  if (!result.ok) {
    if (result.status === 401) throw new Error('Sign in to the approved account to check this adjustment.')
    if (result.status === 403) throw new Error('This adjustment is unavailable for the current session.')
    if (result.status === 409) throw new Error('The account no longer matches the approved baseline or payment evidence. No automatic correction is allowed. Read the current funding and request review.')
    throw new Error('The adjustment result is unconfirmed. Read its status before any further action.')
  }
  const response = readOwnerReserveAdjustmentResponse(value)
  if (apply && response.status === 'preview') throw new Error('The adjustment was not confirmed. Read its status before any further action.')
  return response
}
