import { isStoredInvoiceReference, readGenerationFundingSnapshot, type GenerationFundingSnapshot } from './generationFunding.ts'

export type FundingReadOptions = { storedEvidence: true; invoiceReferences: string[]; pendingAfter?: string }
export function fundingReadPath(options?: FundingReadOptions): string {
  const path = '/api/account/generation-funding'
  if (options === undefined) return path
  if (!options || Object.keys(options).some(key => !['storedEvidence', 'invoiceReferences', 'pendingAfter'].includes(key)) || options.storedEvidence !== true ||
      !Array.isArray(options.invoiceReferences) || options.invoiceReferences.length > 2 || new Set(options.invoiceReferences).size !== options.invoiceReferences.length ||
      !options.invoiceReferences.every(isStoredInvoiceReference) || Object.hasOwn(options, 'pendingAfter') &&
      (typeof options.pendingAfter !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(options.pendingAfter)))
    throw new Error('Enter at most two distinct Stripe invoice IDs beginning with in_.')
  const query = new URLSearchParams({ evidence: 'stored-v1' })
  for (const reference of options.invoiceReferences) query.append('invoice', reference)
  if (options.pendingAfter) query.set('pendingAfter', options.pendingAfter)
  return `${path}?${query}`
}

async function unsupportedEvidenceQuery(response: Response, signal: AbortSignal): Promise<boolean> {
  if (response.status !== 400 || !response.headers.get('content-type')?.toLowerCase().startsWith('application/json') ||
      Number(response.headers.get('content-length') ?? 0) > 1024) return false
  const reader = response.body?.getReader()
  if (!reader) return false
  let text = '', size = 0
  const decoder = new TextDecoder()
  try {
    for (;;) {
      const next = await reader.read()
      if (next.done) break
      size += next.value.byteLength
      if (size > 1024) return false
      text += decoder.decode(next.value, { stream: true })
    }
    signal.throwIfAborted()
    const value = JSON.parse(text + decoder.decode())
    return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 1 &&
      value.error === 'Query parameters are not supported.'
  } catch { return false }
  finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
}

/** This endpoint only reads the signed-in account. It never reconciles funding. */
export async function loadGenerationFunding(signal: AbortSignal, fetcher: typeof fetch = fetch, options?: FundingReadOptions): Promise<GenerationFundingSnapshot> {
  const response = await fetcher(fundingReadPath(options), {
    method: 'GET', credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal,
  })
  if (!response.ok) {
    // A mixed deployment may still serve the original query-free endpoint.
    // Retry only its exact old schema rejection, once, using the same session
    // and abort signal. This never treats unavailable invoice evidence as missing.
    if (options && !options.pendingAfter && await unsupportedEvidenceQuery(response, signal)) {
      signal.throwIfAborted()
      return loadGenerationFunding(signal, fetcher)
    }
    await response.body?.cancel()
    throw new Error(response.status === 401 ? 'Sign in through the normal account page, then return here.' : 'The read-only funding snapshot is unavailable. No recovery or generation was requested.')
  }
  if (!response.headers.get('content-type')?.toLowerCase().startsWith('application/json') || Number(response.headers.get('content-length') ?? 0) > 32_768) {
    await response.body?.cancel(); throw new Error('The funding response could not be verified.')
  }
  const reader = response.body?.getReader()
  if (!reader) throw new Error('The funding response could not be verified.')
  let size = 0, text = ''; const decoder = new TextDecoder()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 32_768) throw new Error('The funding response could not be verified.')
      text += decoder.decode(value, { stream: true })
    }
    signal.throwIfAborted()
    const snapshot = readGenerationFundingSnapshot(JSON.parse(text + decoder.decode()))
    if (snapshot.storedEvidence && (!options ||
        JSON.stringify(snapshot.storedEvidence.requestedInvoices.map(record => record.invoiceReference)) !== JSON.stringify(options.invoiceReferences)))
      throw new Error('The returned invoice records do not match this read request.')
    if (options?.pendingAfter && (!snapshot.pendingCostReviews || snapshot.pendingCostReviews.items.some(item => item.id <= options.pendingAfter!) ||
        snapshot.pendingCostReviews.nextCursor !== null && snapshot.pendingCostReviews.nextCursor <= options.pendingAfter))
      throw new Error('The pending cost review page did not advance safely.')
    return snapshot
  } catch {
    await reader.cancel().catch(() => {})
    throw new Error('The funding response could not be verified.')
  } finally { reader.releaseLock() }
}
