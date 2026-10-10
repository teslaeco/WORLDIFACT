import { useEffect, useRef, useState } from 'react'
import { accountRequest } from '../lib/account'

/** Rendered inside account-keyed CreditsContent. Codes never enter URLs or storage. */
export default function PromotionRedemption({ accountId, onRedeemed }: { accountId: string | null; onRedeemed: () => Promise<unknown> }) {
  const [active, setActive] = useState(false), [code, setCode] = useState(''), [message, setMessage] = useState('Promo redemption is not activated. Prepared codes cannot add points yet.')
  const [busy, setBusy] = useState(false), mounted = useRef(true), lock = useRef(false)
  useEffect(() => {
    mounted.current = true
    let current = true
    if (accountId) void accountRequest('/api/account/promotions').then(value => {
      if (!current) return
      const enabled = value.active === true && value.kind === 'internal-points' && value.providerFunding === false
      setActive(enabled)
      if (enabled) setMessage('Account-bound tester codes add internal points only. They do not buy a subscription or fund provider costs.')
    }).catch(() => { /* Remain inactive without confirmed server availability. */ })
    return () => { current = false; mounted.current = false }
  }, [accountId])
  async function redeem() {
    if (!active || !accountId || lock.current || !/^[A-Za-z0-9_-]{12,128}$/.test(code)) return
    lock.current = true; setBusy(true)
    try {
      const value = await accountRequest('/api/account/promotions', { code })
      if (!mounted.current) return
      if (value.redeemed !== true || !Number.isSafeInteger(value.points) || value.points < 1 || value.points > 1000 || typeof value.repeated !== 'boolean') throw Error('Redemption could not be confirmed. Keep the same code for recovery.')
      setCode(''); setMessage(value.repeated ? 'This code was already applied to this account. No additional points were added.' : `${value.points} internal points added. Provider funding and membership are unchanged.`)
      await onRedeemed()
    } catch (error) { if (mounted.current) setMessage(error instanceof Error ? error.message : 'Redemption unconfirmed. Retry the same code.') }
    finally { lock.current = false; if (mounted.current) setBusy(false) }
  }
  return <details className="credit-tools-promo">
    <summary>{active ? 'Tester promo code' : 'Promo codes · not activated'}</summary>
    <p id="credit-promo-status" role="status">{message}</p>
    <fieldset disabled={!active || busy || !accountId} aria-describedby="credit-promo-status">
      <label htmlFor="credit-promo-code">Promotional code</label>
      <input id="credit-promo-code" type="password" autoComplete="off" maxLength={128} value={code} onChange={event => setCode(event.target.value)} />
      <button type="button" onClick={() => void redeem()} disabled={!/^[A-Za-z0-9_-]{12,128}$/.test(code)}>{busy ? 'Checking…' : active ? 'Redeem once' : 'Redeem code · unavailable'}</button>
    </fieldset>
    <p>No Stripe payment, membership change or model generation is started here.</p>
  </details>
}
