import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PORTALS } from '../src/config/portals.ts'
import { REFERENCE_LINKS } from '../src/config/references.ts'
import { renderShopMarkup } from './shop-render-helper.mjs'

test('native Shop has a permanent parent return, all five worlds, prompt, photos and texture controls', async () => {
  const html = await renderShopMarkup()
  assert.match(html, /href="\/"[^>]*>← Back to WORLDIFACT/)
  for (const portal of PORTALS) assert.ok(html.includes(`href="${portal.route}"`))
  assert.match(html, /<form/)
  assert.match(html, /id="studio-prompt"/)
  assert.match(html, /id="studio-photos"/)
  assert.match(html, /id="studio-texture"/)
  assert.match(html, /Generate 3D model \+ materials/)
  assert.doesNotMatch(html, /<iframe|<object|<embed|Opening the original generator/)
})

test('old half-skull character is only an example; it cannot masquerade as the current generated result', async () => {
  const html = await renderShopMarkup()
  assert.match(html, /EXISTING FORGE CHARACTER · EXAMPLE ONLY/)
  assert.match(html, /assets\/model-front\.webp/)
  assert.match(html, /not a new generation/)
  assert.match(html, /only after its own job succeeds/)
  assert.doesNotMatch(html, /FORGE-projekt|Przygotuj zlecenie|LIVE VERIFIED/)
})

test('generation is disabled until server readiness; unavailable is not falsely labelled exhausted', async () => {
  const html = await renderShopMarkup()
  assert.match(html, /type="submit" disabled=""/)
  assert.match(html, /Generation not ready/)
  assert.match(html, /read-only check is required/)
  assert.doesNotMatch(html, /blocked by the exhausted pilot quota/)
  assert.match(html, /value="8192" disabled="">Up to 8K · coming soon/)
  assert.match(html, /Actual texture quality depends on the worker and source images/)
  assert.match(html, /manufacturing approval/)
})

test('original Studio is an optional safe external tab, never a replacement for the page', async () => {
  const html = await renderShopMarkup()
  const link = [...html.matchAll(/<a\b[^>]*>/g)].map(m => m[0]).find(a => a.includes(`href="${REFERENCE_LINKS.modelGenerator}"`))
  assert.ok(link)
  assert.match(link, /target="_blank"/)
  assert.match(link, /rel="noopener noreferrer"/)
  assert.doesNotMatch(html, /target="_(top|self|parent)"/)
  const source = await readFile(new URL('../src/pages/ShopPage.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /window\.location|document\.cookie|postMessage|<iframe/)
})

test('mobile controls come before the bounded preview and generated models have a device archive', async () => {
  const css = await readFile(new URL('../src/pages/ShopPage.css', import.meta.url), 'utf8')
  assert.match(css, /max-width:\s*760px/)
  assert.match(css, /\.native-shop-form\s*\{[^}]*order:\s*0/s)
  assert.match(css, /\.native-shop-preview\s*\{[^}]*order:\s*1/s)
  assert.doesNotMatch(css, /position:\s*(absolute|fixed)|webgl-fallback/)
  const html = await renderShopMarkup()
  assert.match(html, /Your models · device archive/)
  assert.match(html, /not automatically published to a store/)
})
