import { invoiceFormAddress } from '../lib/invoicePayment.ts'
import { useCallback, useEffect, useRef, useState } from 'react'
import { accountRequest } from '../lib/account'
import './BillingRecovery.css'

type Recovery = { state: 'none' | 'review' | 'payment_required' | 'active' | 'processing'; canManage: boolean; canRetry: boolean; amountCents?: number; currency?: string; plan?: string; activePlan?: string | null; pendingChange?: boolean }
type Action = 'status' | 'retry' | 'card' | 'manage'

export function recoveryAddress(value: unknown, destination: unknown) {
  const local = invoiceFormAddress(value, destination); if (local) return local
  if (typeof value !== 'string' || !['invoice', 'portal'].includes(String(destination))) throw new Error('Unverified billing destination')
  const url = new URL(value), host = destination === 'invoice' ? 'invoice.stripe.com' : 'billing.stripe.com'
  if (url.protocol !== 'https:' || url.hostname !== host || url.username || url.password || url.port || url.hash) throw new Error('Unverified billing destination')
  return url.href
}

export default function BillingRecovery({ enabled, onRefresh }: { enabled: boolean; onRefresh: () => Promise<void> }) {
  const [recovery, setRecovery] = useState<Recovery | null>(null)
  const [busy, setBusy] = useState<Action | null>(null)
  const [error, setError] = useState('')
  const version = useRef(0), locked = useRef(false), refreshedAt = useRef(0)
  const run = useCallback(async (action: Action) => {
    if (!enabled || locked.current) return
    locked.current = true
    const current = ++version.current
    setBusy(action); setError('')
    try {
      const result = await accountRequest('/api/billing/recovery', { action })
      if (current !== version.current) return
      if (action !== 'status' && result.url) {
        window.location.assign(recoveryAddress(result.url, result.destination))
        return
      }
      if (!['none', 'review', 'payment_required', 'active', 'processing'].includes(String(result.state)) || typeof result.canManage !== 'boolean' || typeof result.canRetry !== 'boolean') throw new Error('Unverified billing response')
      setRecovery(result as Recovery)
      refreshedAt.current = Date.now()
      await onRefresh()
    } catch {
      if (current === version.current) setError('Payment status could not be checked. Try Check payment status again. Do not make another purchase while the previous payment is unresolved.')
    } finally {
      if (current === version.current) { locked.current = false; setBusy(null) }
    }
  }, [enabled, onRefresh])

  useEffect(() => {
    void run('status')
    const returned = () => { if (document.visibilityState === 'visible' && Date.now() - refreshedAt.current > 10_000) void run('status') }
    window.addEventListener('focus', returned)
    document.addEventListener('visibilitychange', returned)
    return () => { version.current++; locked.current = false; window.removeEventListener('focus', returned); document.removeEventListener('visibilitychange', returned) }
  }, [run])

  if (!enabled || recovery?.state === 'none' && !recovery.canManage) return null
  const amount = Number.isSafeInteger(recovery?.amountCents) && (recovery?.amountCents ?? 0) > 0
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(recovery!.amountCents! / 100) + ' USD' : ''
  return <section className="billing-recovery" aria-labelledby="billing-recovery-title" aria-busy={busy !== null}>
    <h2 id="billing-recovery-title">Payment methods and billing</h2>
    <div role="status" aria-live="polite">
      {recovery?.state === 'payment_required' ? <><p><strong>{recovery.pendingChange ? 'Your plan change is waiting for payment.' : 'An earlier subscription payment needs attention.'}</strong> {amount && `Amount remaining: ${amount}.`}</p><p>Choose the matching plan above to continue payment, or use Retry payment here. You can change your card below. This continues the existing invoice, not a second subscription.</p>{recovery.activePlan && <p>Your paid {recovery.activePlan.toUpperCase()} period remains available. The new plan and its credits activate only after verified payment.</p>}</> : recovery?.state === 'active' ? <p>Your current paid plan is active. No payable invoice was found for this subscription.</p> : recovery?.state === 'none' ? <p>No outstanding subscription was found. You can choose a plan above.</p> : recovery?.state === 'review' ? <p>Your billing history needs attention. Open Manage billing to review it; no new purchase has been started.</p> : recovery?.state === 'processing' ? <p>Payment confirmation or subscription activation is still pending. Check the status again instead of starting a second purchase.</p> : <p>Checking for an earlier payment…</p>}
    </div>
    {error && <p className="billing-recovery-error" role="alert">{error}</p>}
    <div className="billing-recovery-actions">
      {recovery?.canRetry && <button className="billing-recovery-primary" disabled={busy !== null} onClick={() => void run('retry')}>{busy === 'retry' ? 'Opening existing payment…' : `Retry payment${amount ? ` · ${amount}` : ''}`} ↗</button>}
      {recovery?.canManage && <><button disabled={busy !== null} onClick={() => void run('card')}>{busy === 'card' ? 'Opening Stripe…' : 'Change card'} ↗</button><button disabled={busy !== null} onClick={() => void run('manage')}>Manage billing ↗</button></>}
      <button disabled={busy !== null} onClick={() => void run('status')}>{busy === 'status' ? 'Checking…' : 'Check payment status'}</button>
    </div>
    {recovery?.canManage && <small>Card details are entered only in Stripe. Updating a card is not proof of payment; check the invoice status after returning.</small>}
  </section>
}
