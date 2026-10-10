import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { CreditToolsPanel } from './credit-tools-helper.mjs'

const held = { credits: 1190, reservedCredits: 1000, availableCredits: 190 }
const render = props => renderToStaticMarkup(React.createElement(CreditToolsPanel, { account: held, signedIn: true, checking: false, ...props }))

test('point review distinguishes available, held and total; it cannot submit a refund or generate', () => {
  const html = render()
  assert.match(html, /Available to use<\/dt><dd>190<\/dd>/)
  assert.match(html, /Held for requests<\/dt><dd>1,000<\/dd>/)
  assert.match(html, /Total balance<\/dt><dd>1,190<\/dd>/)
  assert.match(html, /href="\/account\/generation-funding"/)
  assert.match(html, /A past waiver receipt is not a new refund/)
  assert.doesNotMatch(html, /<form|failed-hold-waiver|Payment confirmed|Points added|Redeemed successfully/)
})

test('signed-out, pending and inconsistent snapshots never show the old available balance', () => {
  for (const props of [{ signedIn: false }, { checking: true }, { account: null },
    { account: { ...held, availableCredits: 1190 } }, { account: { credits: 1190 } }]) {
    const html = render(props)
    assert.doesNotMatch(html, /<dd>/)
    assert.match(html, /role="status"/)
  }
  assert.doesNotMatch(render({ signedIn: false }), /href="\/account\/generation-funding"/)
})

test('unactivated coupon UI is explicitly disabled and does not contain a redeem request path', () => {
  const html = render()
  assert.match(html, /Promo codes · not activated/)
  assert.match(html, /<fieldset disabled="" aria-describedby="credit-promo-status">/)
  assert.match(html, /type="button">Redeem code · unavailable/)
  assert.doesNotMatch(html, /type="submit"|value="WF|\/api\/.*promo|action=/)
  assert.match(html, /Prepared codes cannot add points yet/)
})

test('zero holds remain visible as zero without asserting any refund', () => {
  const html = render({ account: { credits: 1190, reservedCredits: 0, availableCredits: 1190 } })
  assert.match(html, /Available to use<\/dt><dd>1,190<\/dd>/)
  assert.match(html, /Held for requests<\/dt><dd>0<\/dd>/)
  assert.doesNotMatch(html, /A past waiver receipt|waiver recorded|funds restored/)
})
