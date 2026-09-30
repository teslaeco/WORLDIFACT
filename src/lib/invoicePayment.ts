export type InvoicePlan = 'creator' | 'pro' | 'studio'
export function invoiceFormAddress(value: unknown, destination: unknown): string | null {
  if (destination !== 'worldifact') return null
  if (typeof value !== 'string' || !/^\/account\/payment\?plan=(creator|pro|studio)$/.test(value)) throw new Error('Unverified invoice form address')
  return value
}
export function invoiceReturnSearch(search: string): { plan: InvoicePlan; invoiceId?: string; cleanSearch: string } | null {
  const values = new URLSearchParams(search), plan = values.get('plan'), invoice = values.get('invoice')
  if (values.getAll('plan').length !== 1 || !['creator', 'pro', 'studio'].includes(plan ?? '') || values.getAll('invoice').length > 1
    || invoice !== null && !/^in_[A-Za-z0-9_]{1,180}$/.test(invoice)) return null
  const clean = new URLSearchParams({ plan: plan! }); if (invoice) clean.set('invoice', invoice)
  return { plan: plan as InvoicePlan, ...(invoice ? { invoiceId: invoice } : {}), cleanSearch: '?' + clean }
}
export function verifiedInvoiceReturn(result: Record<string, unknown>, plan: InvoicePlan, invoiceId?: string): boolean {
  return result.phase === 'confirmed' && result.plan === plan && typeof result.invoiceId === 'string'
    && /^in_[A-Za-z0-9_]{1,180}$/.test(result.invoiceId) && (!invoiceId || result.invoiceId === invoiceId)
}

/** Bounded read-only settlement polling. It never calls Stripe confirmation or grants credits. */
export async function waitForInvoiceConfirmation(read: () => Promise<Record<string, unknown>>, plan: InvoicePlan, invoiceId: string,
  alive: () => boolean, wait: () => Promise<void> = () => new Promise(resolve => setTimeout(resolve, 3000))): Promise<boolean> {
  for (let attempt = 0; attempt < 6 && alive(); attempt++) {
    if (attempt) { await wait(); if (!alive()) return false }
    const result = await read()
    if (!alive()) return false
    if (verifiedInvoiceReturn(result, plan, invoiceId)) return true
  }
  return false
}
