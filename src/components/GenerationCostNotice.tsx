import { Link } from 'react-router-dom'
import { type QuotedModel } from '../lib/generationQuote'
import { useGenerationQuote, type GenerationQuoteState } from '../lib/useGenerationQuote'
import './GenerationCostNotice.css'

type Props = { model: QuotedModel; busy?: boolean; detailed?: boolean; accountQuote?: GenerationQuoteState }
export default function GenerationCostNotice(props: Props) {
  // A controlled Shop notice renders the exact snapshot used by its Generate
  // button. Other consumers keep their standalone read-only quote.
  return props.accountQuote ? <CostNotice {...props} accountQuote={props.accountQuote} /> : <ConnectedCostNotice {...props} />
}
function ConnectedCostNotice(props: Props) {
  const accountQuote = useGenerationQuote(props.model, props.busy, props.detailed)
  return <CostNotice {...props} accountQuote={accountQuote} />
}
function CostNotice({ model, busy = false, detailed = false, accountQuote }: Props & { accountQuote: GenerationQuoteState }) {
  const { quote, checking, canRefresh, refresh } = accountQuote
  const rate = model === 'luna' ? 15 : model === 'sol' ? 50 : 250
  const fundingBlocked = quote.state === 'blocked' && quote.reason === 'PROVIDER_BUDGET_EXHAUSTED'
  return <section className="generation-cost-notice" aria-label="Selected model and cost before generation" aria-live="polite">
    <div><strong>{model === 'luna' ? 'GPT-6 LUNA' : model === 'sol' ? 'GPT-6 SOL' : 'GPT-6 ASTRA'}</strong><span>{rate} points / paid generation</span></div>
    <p><b>{checking || busy ? 'Checking current cost…' : quote.points === 0 ? 'This attempt: 0 points, subject to funded free capacity' : quote.points !== null ? `This attempt: ${quote.points} points` : 'Current cost: not yet verified'}</b>{quote.after !== null && !busy && <> · Balance after reservation: <strong>{quote.after} points</strong></>}</p>
    {['blocked', 'signin', 'pending'].includes(quote.state) && <p>{quote.message}{quote.state === 'signin' && <> <Link to="/account">Sign in →</Link></>}</p>}
    {fundingBlocked && <>
      <p><strong>Account funding review needed.</strong> Keep your description and reference images while availability is reviewed. This refusal is not an estimate of your model’s required cost.</p>
      <button type="button" disabled={!canRefresh} onClick={refresh}>Refresh availability</button>
    </>}
    <details><summary>Model details and billing</summary>
      {['free', 'credits'].includes(quote.state) && <p>{quote.message}</p>}
      <p>{detailed ? 'Astra works with the existing Blender worker to build an editable model. One job uses one points reservation even when it has several bounded AI/tool steps. All accepted reference views are included. Results require visual review; no procedural substitute or manufacturing approval.' : model !== 'astra' ? 'The selected model creates a validated specification with a lightweight procedural preview. It is not the detailed Oracle mesh workflow.' : 'ASTRA uses one bounded server-side call to create a validated blueprint/specification and a locally derived procedural GAME GLB. The separate multi-call Oracle/Blender mesh workflow remains beta. MAKE still requires validation.'}</p>
      <p>Use once from your points. No automatic batch, model upgrade or card charge. Failed attempts may return points. Only confirmed unused API funding can be restored; incurred or uncertain costs remain reserved.</p>
      {!fundingBlocked && <div><Link to="/account/credits">Plans & one-time prepaid credits →</Link><button type="button" disabled={!canRefresh} onClick={refresh}>Refresh points</button></div>}
    </details>
  </section>
}
