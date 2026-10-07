import { STUDIO_PRICING } from '../src/lib/studioPricing.ts'
import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'
import { quoteGeneration } from '../src/lib/generationQuote.ts'
import { ADMISSION_FAILURE_CODES, ADMISSION_FAILURE_DETAILS } from '../src/lib/generationAdmission.ts'
import { PAID_POINTS_POLICY, PAID_POINTS_FUNDING } from '../src/lib/paidPointsFunding.ts'

test('funding refusal offers a read-only refresh without a credits upsell or invented model estimate', async () => {
  const vite = await createServer({ server: { middlewareMode: true, watch: null, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' })
  try {
    const { default: Notice } = await vite.ssrLoadModule('/src/components/GenerationCostNotice.tsx')
    const account = { credits: 2755, generationCosts: { sol: 50, astra: 250 }, subscription: { active: true, plan: 'pro' }, billingReview: false }
    const billing = { plans: { pro: { checkoutReady: true } } }
    let refreshes = 0
    const refresh = () => { refreshes++ }
    const render = (quote, canRefresh = true, budgetTier, model = 'astra', detailed = true) => renderToStaticMarkup(createElement(MemoryRouter, null, createElement(Notice, { model, detailed, budgetTier, accountQuote: { quote, checking: false, canRefresh, refresh } })))
    const funding = quoteGeneration('astra', { ...account, generationAdmission: { astra: { allowed: false, reason: 'PROVIDER_BUDGET_EXHAUSTED', detail: 'PRIVATE_LEDGER' } } }, billing, true)
    assert.equal(funding.state, 'blocked')
    const html = render(funding)
    assert.match(html, /Account funding unavailable/)
    assert.match(html, /Next generation: 250 points/)
    assert.match(html, /Reason: PROVIDER_BUDGET_EXHAUSTED/)
    assert.match(html, /does not report the status or charges of a saved request/)
    assert.doesNotMatch(html, /No Oracle generation was submitted|no points were reserved/)
    assert.match(html, /not an estimate of your model/)
    assert.match(html, /reads your current allowance; it does not check or return funding from earlier models/)
    assert.doesNotMatch(html, /Earlier models were checked|No eligible earlier model reservations|unused funding was (?:confirmed|returned)/i)
    assert.match(html, /<button type="button">Refresh availability<\/button>/)
    assert.ok(html.indexOf('Refresh availability') < html.indexOf('<details>'), 'availability refresh action is visible without opening billing details')
    assert.doesNotMatch(html, /href="\/account\/credits"|prepaid credits|500 points|\$[0-9]|PRIVATE_LEDGER|model (?:is )?too (?:large|complex)/i)
    assert.match(render(funding, false), /<button type="button" disabled="">Refresh availability<\/button>/)
    assert.equal(refreshes, 0, 'rendering a refusal cannot refresh or submit anything automatically')

    const credits = quoteGeneration('astra', { ...account, credits: 100, generationAdmission: { astra: { allowed: false, reason: 'CREDITS_EXHAUSTED' } } }, billing, true)
    const creditHtml = render(credits)
    assert.match(creditHtml, /Not enough available points/)
    assert.match(creditHtml, /href="\/account\/credits"/)
    assert.doesNotMatch(creditHtml, /Account funding unavailable/)
    const allowed = render(quoteGeneration('astra', account, billing, true))
    assert.match(allowed, /Balance after reservation/)
    assert.doesNotMatch(allowed, /Account funding unavailable/)
    const extended = quoteGeneration('astra', { ...account, studioAdmission: { tiers: { extended: { allowed: true, pricing: STUDIO_PRICING.extended } } } }, billing, true, true, 'extended')
    const extendedHtml = render(extended, true, 'extended')
    assert.match(extendedHtml, /500 points \/ paid generation/)
    assert.match(extendedHtml, /Next generation: 500 points/)
    assert.match(extendedHtml, /2255 points/)
    assert.doesNotMatch(extendedHtml, /250 points \/ paid generation/)

    const pointsFunded = quoteGeneration('astra', { ...account, paidGenerationPolicy: PAID_POINTS_POLICY,
      credits: 1190, availableCredits: 940, reservedCredits: 250,
      studioAdmission: { tiers: { standard: { allowed: true, pricing: STUDIO_PRICING.standard } } } }, null, true, true, 'standard')
    assert.equal(pointsFunded.fundingSource, PAID_POINTS_FUNDING)
    const pointsHtml = render(pointsFunded, true, 'standard')
    assert.match(pointsHtml, /Next generation: 250 points/)
    assert.match(pointsHtml, /690 points/)
    assert.match(pointsHtml, /250 points are already reserved/)
    assert.match(pointsHtml, /without a separate account API reserve/)
    assert.match(pointsHtml, /API cost limit and service readiness checks still apply/)
    assert.match(pointsHtml, /Earlier jobs keep their original funding terms/)
    assert.match(pointsHtml, /We hold 250 points before dispatch\. Success costs 250 points/)
    assert.match(pointsHtml, /proved pre-dispatch or zero-cost failure releases the hold/)
    assert.match(pointsHtml, /manual review may be required/)
    assert.ok(pointsHtml.indexOf('We hold 250 points') < pointsHtml.indexOf('<details>'), 'failure-cost hold terms must be visible before clicking Generate')
    assert.match(pointsHtml, /API limit for this request is USD 2\.00/)
    for (const [model, tier, points, cents] of [['astra', undefined, 250, 175], ['astra', 'extended', 500, 400], ['sol', undefined, 50, 35], ['luna', undefined, 15, 10]]) {
      const html = render({ state: 'credits', points, after: 1190 - points, message: 'Verified fixture', fundingSource: PAID_POINTS_FUNDING }, true, tier, model, model === 'astra')
      assert.match(html, new RegExp(`We hold ${points} points before dispatch\\. Success costs ${points} points`))
      assert.ok(html.includes(`API limit for this request is USD ${(cents / 100).toFixed(2)}`))
    }
    assert.doesNotMatch(pointsHtml, /Account funding unavailable|incurred or uncertain costs remain reserved|funding details/)
    assert.doesNotMatch(allowed, /without a separate account API reserve/, 'legacy quotes cannot advertise new funding semantics')
    assert.equal(refreshes, 0, 'a paid-points quote never starts a request or returns old reserve')

    for (const reason of ADMISSION_FAILURE_CODES) {
      const refusal = render({ state: 'blocked', points: 250, after: null, reason, message: ADMISSION_FAILURE_DETAILS[reason] })
      assert.match(refusal, new RegExp('Reason: ' + reason))
      assert.doesNotMatch(refusal, /No (?:new )?Oracle (?:generation|submission)|no points were reserved|points reservation was made|generation has (?:not )?started/i)
    }
  } finally { await vite.close() }
})
