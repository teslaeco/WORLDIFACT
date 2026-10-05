import { STUDIO_PRICING } from '../src/lib/studioPricing.ts'
import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'
import { quoteGeneration } from '../src/lib/generationQuote.ts'

test('funding refusal offers a read-only refresh without a credits upsell or invented model estimate', async () => {
  const vite = await createServer({ server: { middlewareMode: true, watch: null, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' })
  try {
    const { default: Notice } = await vite.ssrLoadModule('/src/components/GenerationCostNotice.tsx')
    const account = { credits: 2755, generationCosts: { sol: 50, astra: 250 }, subscription: { active: true, plan: 'pro' }, billingReview: false }
    const billing = { plans: { pro: { checkoutReady: true } } }
    let refreshes = 0
    const refresh = () => { refreshes++ }
    const render = (quote, canRefresh = true, budgetTier) => renderToStaticMarkup(createElement(MemoryRouter, null, createElement(Notice, { model: 'astra', detailed: true, budgetTier, accountQuote: { quote, checking: false, canRefresh, refresh } })))
    const funding = quoteGeneration('astra', { ...account, generationAdmission: { astra: { allowed: false, reason: 'PROVIDER_BUDGET_EXHAUSTED', detail: 'PRIVATE_LEDGER' } } }, billing, true)
    assert.equal(funding.state, 'blocked')
    const html = render(funding)
    assert.match(html, /Account funding unavailable/)
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
    assert.match(extendedHtml, /This attempt: 500 points/)
    assert.match(extendedHtml, /2255 points/)
    assert.doesNotMatch(extendedHtml, /250 points \/ paid generation/)
  } finally { await vite.close() }
})
