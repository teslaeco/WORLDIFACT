import { useEffect, useRef, useState } from 'react'
import { accountRequest } from '../lib/account'

/** Rendered inside account-keyed CreditsContent. Codes never enter URLs or storage. */
export default function PromotionRedemption({ accountId, onRedeemed }: { accountId: string | null; onRedeemed: () => Promise<unknown> }) {
  const [active, setActive] = useState(false), [code, setCode] = useState(''), [message, setMessage] = useState(accountId ? 'Checking code access…' : 'Sign in to use your code.')
  const [burst, setBurst] = useState<number | null>(null)
  const [busy, setBusy] = useState(false), mounted = useRef(true), lock = useRef(false)
  useEffect(() => {
    mounted.current = true
    let current = true
    if (accountId) void accountRequest('/api/account/promotions').then(value => {
      if (!current) return
      const enabled = value.active === true && value.kind === 'internal-points' && value.providerFunding === false
      setActive(enabled)
      setMessage(enabled ? 'Paste your private point code.' : 'No active codes for this account.')
    }).catch(() => { if (current) setMessage('Code access unavailable. Refresh to retry.') })
    return () => { current = false; mounted.current = false }
  }, [accountId])
  async function redeem() {
    if (!active || !accountId || lock.current || !/^[A-Za-z0-9_-]{12,128}$/.test(code)) return
    lock.current = true; setBusy(true); setBurst(null)
    try {
      const value = await accountRequest('/api/account/promotions', { code })
      if (!mounted.current) return
      if (value.redeemed !== true || !Number.isSafeInteger(value.points) || value.points < 1 || value.points > 1000 || typeof value.repeated !== 'boolean') throw Error('Redemption could not be confirmed. Keep the same code for recovery.')
      setCode(''); setMessage(value.repeated ? 'Already redeemed. No extra points added.' : `+${value.points} points added!`)
      if (!value.repeated) setBurst(value.points)
      await onRedeemed()
    } catch (error) { if (mounted.current) setMessage(error instanceof Error ? error.message : 'Redemption unconfirmed. Retry the same code.') }
    finally { lock.current = false; if (mounted.current) setBusy(false) }
  }
  return <div className="credit-tools-promo">
    {burst !== null && <div className="promo-burst" aria-hidden="true" onAnimationEnd={() => setBurst(null)}><strong>+{burst}</strong>{Array.from({ length: 12 }, (_, i) => <i key={i} style={{ transform: `rotate(${i * 30}deg)` }} />)}</div>}
    <p id="credit-promo-status" role="status">{message}</p>
    <fieldset disabled={!active || busy || !accountId} aria-describedby="credit-promo-status">
      <label htmlFor="credit-promo-code">Promotional code</label>
      <input id="credit-promo-code" type="password" autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={128} value={code} onChange={event => setCode(event.target.value)} />
      <button type="button" onClick={() => void redeem()} disabled={!/^[A-Za-z0-9_-]{12,128}$/.test(code)}>{busy ? 'Checking…' : active ? 'Add points' : 'Unavailable'}</button>
    </fieldset>
    <small>Points only · single use · no payment.</small>
  </div>
}
