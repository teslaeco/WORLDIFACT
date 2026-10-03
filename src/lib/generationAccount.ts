export type GenerationAccountSnapshot = { account: unknown; billing: unknown; authenticationRequired: boolean }

/** A single read-only snapshot feeds both the displayed quote and admission UI. */
export async function readGenerationAccount(fetcher: typeof fetch, signal: AbortSignal): Promise<GenerationAccountSnapshot> {
  const read = async (path: string) => {
    const response = await fetcher(path, { credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal })
    if (!response.ok) return { value: null, authenticationRequired: response.status === 401 }
    if (!response.headers.get('content-type')?.includes('application/json')) return { value: null, authenticationRequired: false }
    const text = await response.text()
    if (text.length > 16384) return { value: null, authenticationRequired: false }
    try { return { value: JSON.parse(text) as unknown, authenticationRequired: false } }
    catch { return { value: null, authenticationRequired: false } }
  }
  const [account, billing] = await Promise.all([read('/api/account/entitlements'), read('/api/billing/status')])
  signal.throwIfAborted()
  return { account: account.value, billing: billing.value, authenticationRequired: account.authenticationRequired }
}
