import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'

test('credit page exposes three profitable plans, safe checkout and preserved payment return', async () => {
  // Static React rendering only: no browser, listening server or provider request.
  const vite = await createServer({ server: { middlewareMode: true, watch: null, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' })
  try {
    const { default: CreditsPage } = await vite.ssrLoadModule('/src/pages/CreditsPage.tsx')
    const { default: InfoPage } = await vite.ssrLoadModule('/src/pages/InfoPage.tsx')
    const { AccountProvider } = await vite.ssrLoadModule('/src/lib/account.tsx')
    const html = renderToStaticMarkup(createElement(MemoryRouter, {
      initialEntries: ['/account/credits?paypal=return&token=ORDEREXAMPLE001'],
    }, createElement(AccountProvider, null, createElement(CreditsPage))))

    assert.equal([...html.matchAll(/<article(?:\s[^>]*)?>/g)].length, 5, 'Free, three subscriptions and one top-up')
    assert.deepEqual([...new Set([...html.matchAll(/\$(\d+(?:\.\d{2})?)/g)].map(match => match[1]))].sort(), ['0', '149.99', '29.99', '99.99'])
    assert.match(html, /WORLDIFAKT/)
    assert.match(html, /Creator SOL/)
    assert.match(html, /Pro ASTRA/)
    assert.match(html, /Studio ASTRA/)
    assert.match(html, /1,500 extra credits/)
    assert.match(html, /Pay once with PayPal/)
    assert.match(html, /without an additional monthly attempt quota/)
    const planCards = [...html.matchAll(/<article(?:\s[^>]*)?>[\s\S]*?<\/article>/g)].map(match => match[0])
    const creator = planCards.find(card => /<h2>Creator SOL<\/h2>/.test(card))
    assert.ok(creator)
    assert.match(creator, /Example point mix: 2 standard ASTRA \+ 20 SOL, or 6 standard ASTRA attempts/)
    assert.match(creator, /These are examples, not fixed generation-count quotas/)
    assert.match(creator, /1,500 credits every confirmed paid month/)
    assert.match(html, /Active paid Creator, Pro and Studio members can request models while enough points are available for each request/)
    assert.match(html, /Per-job API cost limits, account billing checks and runtime availability still apply/)
    assert.match(html, /Active paid members can keep requesting models while enough points remain available/)
    assert.match(html, /<b>2 shared SOL \/ LUNA draft attempts<\/b> in every rolling 24 hours when funded SOL capacity is available/)
    assert.match(html, /4,500 credits every confirmed paid month/)
    assert.match(html, /7,500 credits every confirmed paid month/)
    assert.doesNotMatch(html, /API funding required|available provider funding|subject to remaining API funding/)
    assert.match(html, /Standard describes one model&#x27;s budget, not your membership plan/)
    assert.doesNotMatch(html, /Free and Creator use|maximum six Astra|limited to six attempts|Pro and Studio unlock/)
    assert.match(html, /<button[^>]*disabled=""[^>]*>Subscribe \$29\.99 \/ month/)
    
    assert.match(html, /<button[^>]*disabled=""[^>]*>Check \$29\.99 USD PayPal payment/)
    assert.doesNotMatch(html, /Payment confirmed/)
    assert.match(html, /next=%2Faccount%2Fcredits%3Fpaypal%3Dreturn%26token%3DORDEREXAMPLE001/)

    const terms = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(InfoPage, { kind: 'terms' })))
    assert.doesNotMatch(terms, /\$30(?:\.00)?\b/)
    assert.match(terms, /Creator SOL costs \$29\.99 USD per month/)
    assert.match(terms, /Pro ASTRA costs \$99\.99 per month/)
    assert.match(terms, /Studio ASTRA costs \$149\.99 per month/)
    assert.match(terms, /reserve the full displayed point price before provider dispatch/)
    assert.match(terms, /proved pre-dispatch or zero-cost failure releases the full hold/)
    assert.match(terms, /positive or unknown API cost retain their points as a hold/)
    assert.match(terms, /Manual review may be required if that proof is unavailable/)
    assert.match(terms, /Earlier jobs keep their original settlement terms and are not charged again/)
    assert.match(terms, /up to two GPT-6\.1 Sol FAST drafts in a rolling 24-hour period/)
    assert.doesNotMatch(terms, /Failed confirmed generations restore their reserved credits|attempt counts remain subject to available provider funding/)
  } finally {
    await vite.close()
  }
})
