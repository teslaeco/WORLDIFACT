import { STUDIO_PRICING, type StudioBudgetTier } from '../lib/studioPricing'
import { Link } from 'react-router-dom'
import { MODEL_CATALOG } from '../lib/modelCatalog'
import { type QuotedModel } from '../lib/generationQuote'
import type { AdmissionFailureCode } from '../lib/generationAdmission'
import { useGenerationQuote, type GenerationQuoteState } from '../lib/useGenerationQuote'
import './GenerationCostNotice.css'

type Props = { model: QuotedModel; busy?: boolean; detailed?: boolean; budgetTier?: StudioBudgetTier; accountQuote?: GenerationQuoteState }
const NEXT_GENERATION_REFUSALS: Record<AdmissionFailureCode, string> = {
  BILLING_REVIEW_REQUIRED: 'Your account needs billing review before another generation.',
  ASTRA_PLAN_REQUIRED: 'ASTRA requires an eligible active plan and enabled ASTRA access. A top-up alone does not unlock ASTRA.',
  ASTRA_RUNTIME_DISABLED: 'ASTRA generation is temporarily unavailable while its runtime is inactive.',
  CREATOR_ASTRA_PERIOD_LIMIT: 'The server returned the previous Creator ASTRA period restriction. Refresh availability to check the current policy.',
  CREDITS_EXHAUSTED: 'Not enough available points for the next generation. Points held for another job are not available to spend.',
  FREE_SOL_ONLY: 'The free allowance supports eligible SOL/LUNA drafts, not ASTRA.',
  FAST_DAILY_LIMIT: 'Your personal daily SOL/LUNA free allowance is used. Wait for its reset or use prepaid credits.',
  PROVIDER_BUDGET_EXHAUSTED: 'Unreserved API funding is currently unavailable for the next generation. This is separate from your subscription plan and point balance.',
  ACCOUNT_REQUEST_CONFLICT: 'An existing account reservation prevents the next generation. Recover the original request to check its status.',
  ACCOUNT_ADMISSION_UNAVAILABLE: 'Your account’s generation allowance could not be verified.',
}
export function nextGenerationQuoteMessage(quote: GenerationQuoteState['quote']) {
  // Admission quotes describe a future request, not the outcome of a saved job.
  if (quote.state === 'blocked' && quote.reason) return `Next generation: ${NEXT_GENERATION_REFUSALS[quote.reason]} Reason: ${quote.reason}.`
  return quote.message.replace('; no generation has started.', '.').replace('Your points are unchanged.', 'This quote does not report charges for saved requests.')
}
export default function GenerationCostNotice(props: Props) {
  // A controlled Shop notice renders the exact snapshot used by its Generate
  // button. Other consumers keep their standalone read-only quote.
  return props.accountQuote ? <CostNotice {...props} accountQuote={props.accountQuote} /> : <ConnectedCostNotice {...props} />
}
function ConnectedCostNotice(props: Props) {
  const accountQuote = useGenerationQuote(props.model, props.busy, props.detailed, props.budgetTier)
  return <CostNotice {...props} accountQuote={accountQuote} />
}
function CostNotice({ model, busy = false, detailed = false, budgetTier, accountQuote }: Props & { accountQuote: GenerationQuoteState }) {
  const { quote, checking, canRefresh, refresh } = accountQuote
  const rate = detailed && model === 'astra' && budgetTier ? STUDIO_PRICING[budgetTier].points : model === 'luna' ? 15 : model === 'sol' ? 50 : 250
  const fundingBlocked = quote.state === 'blocked' && quote.reason === 'PROVIDER_BUDGET_EXHAUSTED'
  return <section className="generation-cost-notice" aria-label="Selected model and cost for the next generation" aria-live="polite">
    <div><strong>{MODEL_CATALOG[model].label}</strong><span>{rate} points / paid generation</span></div>
    <p><b>{(checking || busy) && !fundingBlocked ? 'Checking next generation cost…' : quote.points === 0 ? 'Next generation: 0 points, subject to funded free capacity' : quote.points !== null ? `Next generation: ${quote.points} points` : 'Next generation cost: not yet verified'}</b>{quote.after !== null && !busy && <> · Balance after reservation: <strong>{quote.after} points</strong></>}</p>
    <p>This quote is for the next generation only. It does not report the status or charges of a saved request.</p>
    {['blocked', 'signin', 'pending'].includes(quote.state) && <p>{nextGenerationQuoteMessage(quote)}{quote.state === 'signin' && <> <Link to="/account">Sign in →</Link></>}</p>}
    {fundingBlocked && <button type="button" disabled={!canRefresh} onClick={refresh}>{checking ? 'Checking availability…' : 'Refresh availability'}</button>}
    <details><summary>Model details and billing</summary>
      {fundingBlocked && <p><strong>Account funding unavailable.</strong> Keep your description and reference images while you refresh availability. This reads your current allowance; it does not check or return funding from earlier models. This refusal is not an estimate of your model’s required cost.</p>}
      {fundingBlocked && <p><a href="/account/generation-funding" target="_blank" rel="noopener noreferrer">Read-only funding details · opens in a new tab</a></p>}
      {['free', 'credits'].includes(quote.state) && <p>{quote.message}</p>}
      <p>{detailed ? 'Astra works with the existing Blender worker to build an editable model. One job uses one points reservation even when it has several bounded AI/tool steps. All accepted reference views are included. Results require visual review; no procedural substitute or manufacturing approval.' : model !== 'astra' ? 'The selected model creates a validated specification with a lightweight procedural preview. It is not the detailed Oracle mesh workflow.' : 'ASTRA uses one bounded server-side call to create a validated blueprint/specification and a locally derived procedural GAME GLB. The separate multi-call Oracle/Blender mesh workflow remains beta. MAKE still requires validation.'}</p>
      <p>Use once from your points. No automatic batch, model upgrade or card charge. Failed attempts may return points. Only confirmed unused API funding can be restored; incurred or uncertain costs remain reserved.</p>
      {!fundingBlocked && <div><Link to="/account/credits">Plans & one-time prepaid credits →</Link><button type="button" disabled={!canRefresh} onClick={refresh}>Refresh points</button></div>}
    </details>
  </section>
}
