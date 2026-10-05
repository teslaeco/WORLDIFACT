import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { renderShopMarkup } from './shop-render-helper.mjs'
import { loadCostNotice } from './shop-render-helper.mjs'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'

test('model dropdown is visible and the price notice sits directly before prompt', async () => {
  const html = await renderShopMarkup()
  const picker = html.indexOf('class="shop-model-picker"')
  const select = html.indexOf('id="studio-mode"')
  const cost = html.indexOf('aria-label="Selected model and cost for the next generation"')
  const prompt = html.indexOf('id="studio-prompt"')
  assert.ok(picker >= 0 && select > picker && cost > select && prompt > cost)
  assert.doesNotMatch(html.slice(picker, select), /\bhidden(?:=|>|\s)/)
  assert.match(html, /AI model · Model AI/)
  assert.match(html, /GPT-6 ASTRA — 250 points/)
  assert.match(html, /GPT-6 SOL — 50 points/)
})
test('cost notice has readable light text on an explicit dark surface', async () => {
  const css = await readFile(new URL('../src/components/GenerationCostNotice.css', import.meta.url), 'utf8')
  function lum(hex) { const a = hex.match(/../g).map(v => parseInt(v,16)/255).map(v => v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4); return a[0]*.2126+a[1]*.7152+a[2]*.0722 }
  assert.ok((lum('f4fbff')+.05)/(lum('18333f')+.05) > 7)
  assert.match(css, /background:#18333f;color:#f4fbff/)
  assert.match(css, /max-width:1024px/)
})

test('compact funding notice keeps exact refusal and price visible with read-only availability details in native details', async () => {
  const CostNotice = (await loadCostNotice()).default
  const refusal = 'Not enough unreserved API funding for this model. No Oracle generation was submitted.'
  const accountQuote = { quote: { state: 'blocked', reason: 'PROVIDER_BUDGET_EXHAUSTED', message: refusal, points: 250, after: null }, checking: false, canRefresh: true, refresh() { throw new Error('Rendering must not refresh') } }
  const html = renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(CostNotice, { model: 'astra', detailed: true, accountQuote })))
  const [visible, disclosure] = html.split('<details>')
  assert.match(visible, /Next generation: 250 points/)
  assert.match(visible, /Unreserved API funding is currently unavailable for the next generation/)
  assert.match(visible, /Reason: PROVIDER_BUDGET_EXHAUSTED/, 'The exact refusal reason stays above the closed disclosure')
  assert.doesNotMatch(visible, /No Oracle generation was submitted/)
  assert.doesNotMatch(visible, /Account funding unavailable|No eligible earlier model reservations/)
  assert.match(visible, /type="button"[^>]*>Refresh availability/)
  assert.match(disclosure, /<summary>Model details and billing<\/summary>/)
  assert.match(disclosure, /reads your current allowance; it does not check or return funding from earlier models/)
  assert.doesNotMatch(html, /Earlier models were checked|No eligible earlier model reservations|unused funding was (?:confirmed|returned)/i)
  assert.match(disclosure, /incurred or uncertain costs remain reserved/)
  assert.match(disclosure, /existing Blender worker/)
  assert.match(disclosure, /<a href="\/account\/generation-funding" target="_blank" rel="noopener noreferrer">Read-only funding details · opens in a new tab<\/a>/, 'The standalone page bypasses normal account hooks while a new tab preserves the in-memory Shop draft')
})

test('detailed model selection is an explicit native button rather than a paid submit or changed default', async () => {
  const html = await renderShopMarkup()
  assert.match(html, /<option value="procedural-blueprint" selected=""/)
  assert.match(html, /<button type="button" data-testid="choose-detailed-model"/)
  assert.match(html, /This only changes your draft; review the cost and press Generate separately/)
  assert.match(html, /<select id="studio-deliverable"/)
})
