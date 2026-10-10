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

    assert.equal([...html.matchAll(/<article(?:\s[^>]*)?>/g)].length, 3, 'Only three subscription cards; extras are collapsed')
    assert.deepEqual([...new Set([...html.matchAll(/\$(\d+(?:\.\d{2})?)/g)].map(match => match[1]))].sort(), ['0', '149.99', '29.99', '99.99'])
    assert.match(html, /WORLDIFAKT/)
    assert.match(html, /Creator SOL/)
    assert.match(html, /Pro ASTRA/)
    assert.match(html, /Studio ASTRA/)
    assert.match(html, /1,500 extra credits/)
    assert.match(html, /Pay once with PayPal/)
    assert.match(html, /1,500 points \/ month/)
    assert.match(html, /4,500 points \/ month/)
    assert.match(html, /7,500 points \/ month/)
    assert.match(html, /role="tablist"/)
    assert.match(html, /Enter code/)
    assert.match(html, /id="credits-panel-code"[^>]*hidden=""/)
    assert.match(html, /<details class="credits-extra"><summary>More options<\/summary>/)
    assert.doesNotMatch(html, /Example point mix|These are examples|Sol for speed/)
    assert.match(html, /<button[^>]*disabled=""[^>]*>Select plan/)
    
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
