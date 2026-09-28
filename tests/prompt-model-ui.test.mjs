import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { renderShopMarkup } from './shop-render-helper.mjs'

test('model dropdown is visible and the price notice sits directly before prompt', async () => {
  const html = await renderShopMarkup()
  const picker = html.indexOf('class="shop-model-picker"')
  const select = html.indexOf('id="studio-mode"')
  const cost = html.indexOf('aria-label="Selected model and cost before generation"')
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
