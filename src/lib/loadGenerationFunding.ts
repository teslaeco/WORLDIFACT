import { readGenerationFundingSnapshot, type GenerationFundingSnapshot } from './generationFunding.ts'

/** This endpoint only reads the signed-in account. It never reconciles funding. */
export async function loadGenerationFunding(signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<GenerationFundingSnapshot> {
  const response = await fetcher('/api/account/generation-funding', {
    method: 'GET', credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal,
  })
  if (!response.ok) {
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
    return readGenerationFundingSnapshot(JSON.parse(text + decoder.decode()))
  } catch {
    await reader.cancel().catch(() => {})
    throw new Error('The funding response could not be verified.')
  } finally { reader.releaseLock() }
}
