import type { ReactNode } from 'react'
import { readGenerationBalance } from '../lib/generationQuote'
import './CreditToolsPanel.css'

/** Display only. No grant, refund, coupon submission, or account mutation. */
export default function CreditToolsPanel({ account, checking, signedIn, promotionTools }: {
  account: unknown; checking: boolean; signedIn: boolean; promotionTools?: ReactNode
}) {
  const balance = signedIn && !checking ? readGenerationBalance(account) : undefined
  return <section className="credit-tools" aria-labelledby="credit-tools-heading" id="credit-tools">
    <h2 id="credit-tools-heading">Points and promo codes</h2>
    <details open className="credit-tools-review">
      <summary>Available points and held requests</summary>
      {balance ? <>
        <dl aria-label="Confirmed point breakdown">
          <div><dt>Available to use</dt><dd>{balance.available.toLocaleString()}</dd></div>
          <div><dt>Held for requests</dt><dd>{balance.held.toLocaleString()}</dd></div>
          <div><dt>Total balance</dt><dd>{balance.total.toLocaleString()}</dd></div>
        </dl>
        {balance.held > 0 && <p>Held points are not available for another request. A past waiver receipt is not a new refund. Review the existing requests before buying more points.</p>}
      </> : <p role="status">{!signedIn ? 'Sign in to see your current point balance.' : checking ? 'Checking the current account balance…' : 'A complete current balance is not confirmed. Refresh the balance before generating.'}</p>}
      {signedIn && <a href="/account/generation-funding">Review existing requests · no generation</a>}
      <p>Clearing the generator form does not remove a point hold or erase a saved model.</p>
    </details>
    {promotionTools ?? <details className="credit-tools-promo">
      <summary>Promo codes · not activated</summary>
      <p id="credit-promo-status" role="status">Promo redemption is not activated. Prepared codes cannot add points yet. Do not enter or share your codes here.</p>
      <fieldset disabled aria-describedby="credit-promo-status">
        <label htmlFor="credit-promo-code">Promotional code</label>
        <input id="credit-promo-code" type="text" autoComplete="off" placeholder="Not activated" />
        <button type="button">Redeem code · unavailable</button>
      </fieldset>
      <p>This section does not create a Stripe payment, change your membership, or start a model.</p>
    </details>}
  </section>
}
