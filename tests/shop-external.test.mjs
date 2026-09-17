import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PORTALS } from '../src/config/portals.ts'
import { REFERENCE_LINKS } from '../src/config/references.ts'
import { renderShopMarkup } from './shop-render-helper.mjs'

test('native Shop presents a customer creation flow with cart and no visible engineering controls', async () => {
  const html = await renderShopMarkup()
  assert.match(html, /href="\/"[^>]*>← Back to WORLDIFACT/)
  for (const portal of PORTALS) assert.ok(html.includes(`href="${portal.route}"`))
  assert.match(html, /id="studio-prompt"/)
  assert.match(html, /id="studio-photos"/)
  assert.match(html, /Generate 3D model \+ materials · free/)
  assert.match(html, /CUSTOMIZE &amp; ORDER/)
  assert.match(html, /Cart/)
  assert.match(html, /X width \(mm\)/)
  assert.match(html, /Y height \(mm\)/)
  assert.match(html, /Z depth \(mm\)/)
  assert.match(html, /shop-internal-only" hidden/)
  assert.doesNotMatch(html, /<iframe|<object|<embed|Opening the original generator/)
})

test('example model is clearly an example and customer view has no pre-purchase download button', async () => {
  const html = await renderShopMarkup()
  assert.match(html, /assets\/model-front\.webp/)
  assert.match(html, /Example only/)
  assert.doesNotMatch(html, />Download GLB \+ embedded materials/)
  assert.doesNotMatch(html, /Model ID:/)
})

test('unavailable generation is customer-friendly and does not expose quota diagnostics', async () => {
  const html = await renderShopMarkup()
  assert.match(html, /type="submit" disabled=""/)
  assert.match(html, /Generation temporarily unavailable/)
  assert.match(html, /No payment is taken when you create a model/)
  assert.match(html, /Experimental beta/)
  assert.doesNotMatch(html, /blocked by the exhausted pilot quota/)
})

test('original Studio remains isolated and hidden from the customer storefront', async () => {
  const html = await renderShopMarkup()
  const link = [...html.matchAll(/<a\b[^>]*>/g)].map(m => m[0]).find(a => a.includes(`href="${REFERENCE_LINKS.modelGenerator}"`))
  assert.ok(link)
  assert.match(link, /hidden=""/)
  assert.match(link, /target="_blank"/)
  assert.match(link, /rel="noopener noreferrer"/)
  const source = await readFile(new URL('../src/pages/ShopPage.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /window\.location|document\.cookie|postMessage|<iframe/)
})

test('mobile layout keeps creation controls first and internal archive out of sight', async () => {
  const css = await readFile(new URL('../src/pages/ShopPage.css', import.meta.url), 'utf8')
  assert.match(css, /max-width:\s*760px/)
  assert.match(css, /\.native-shop-form\s*\{[^}]*order:\s*0/s)
  assert.match(css, /\.native-shop-preview\s*\{[^}]*order:\s*1/s)
  assert.match(css, /\.shop-internal-only\s*\{[^}]*display:\s*none/s)
  assert.doesNotMatch(css, /position:\s*(absolute|fixed)|webgl-fallback/)
  const html = await renderShopMarkup()
  assert.match(html, /<section class="shop-internal-only" hidden="" aria-labelledby="studio-archive-title">/)
  assert.match(html, /Digital 3D file:/)
  assert.match(html, /successful payment confirmation/)
})
