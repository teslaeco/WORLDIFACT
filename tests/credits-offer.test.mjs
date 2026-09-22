import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'

test('credit offer has one paid price, safe initial checkout and a preserved payment return', async () => {
  // Static React rendering only: no browser, listening server or provider request.
  const vite = await createServer({ server: { middlewareMode: true, watch: null, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' })
  try {
    const { default: CreditsPage } = await vite.ssrLoadModule('/src/pages/CreditsPage.tsx')
    const { default: InfoPage } = await vite.ssrLoadModule('/src/pages/InfoPage.tsx')
    const { AccountProvider } = await vite.ssrLoadModule('/src/lib/account.tsx')
    const html = renderToStaticMarkup(createElement(MemoryRouter, {
      initialEntries: ['/account/credits?paypal=return&token=ORDEREXAMPLE001'],
    }, createElement(AccountProvider, null, createElement(CreditsPage))))

    assert.equal([...html.matchAll(/<article(?:\s[^>]*)?>/g)].length, 2, 'Free and a single paid offer')
    assert.deepEqual([...new Set([...html.matchAll(/\$(\d+(?:\.\d{2})?)/g)].map(match => match[1]))].sort(), ['0', '29.99'])
    assert.match(html, /WORLDIFAKT/)
    assert.match(html, /Monthly membership/)
    assert.match(html, /One-time top-up/)
    assert.match(html, /PayPal supports one-time top-ups only/)
    assert.match(html, /<button[^>]*disabled=""[^>]*>Subscribe for \$29\.99/)
    assert.match(html, /<button[^>]*disabled=""[^>]*>Google Pay via checkout/)
    assert.match(html, /<button[^>]*disabled=""[^>]*>Check \$29\.99 USD PayPal payment/)
    assert.doesNotMatch(html, /Payment confirmed/)
    assert.match(html, /next=%2Faccount%2Fcredits%3Fpaypal%3Dreturn%26token%3DORDEREXAMPLE001/)

    const terms = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(InfoPage, { kind: 'terms' })))
    assert.doesNotMatch(terms, /\$30(?:\.00)?\b/)
    assert.match(terms, /same \$29\.99 USD price also applies to a one-time top-up/)
  } finally {
    await vite.close()
  }
})
