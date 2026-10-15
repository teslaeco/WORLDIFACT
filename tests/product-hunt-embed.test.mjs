import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('the removed Product Hunt panel stays absent while the small resource link and ISS petition remain', async () => {
  const home = await readFile(new URL('../src/pages/HomePage.tsx', import.meta.url), 'utf8')
  const showcase = await readFile(new URL('../src/components/BrandShowcase.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(home, /cards\.producthunt\.com|api\.producthunt\.com|featured\.svg|product_review\.svg|WORLDIFACT community feedback|product-hunt-panel|ProductHuntLaunchCard/)
  assert.equal(home.split('<BrandShowcase').length - 1, 1)
  assert.doesNotMatch(home, /PortalCardsNav|accessibility-panel/)
  assert.match(showcase, /name: 'Product Hunt', url: 'https:\/\/www\.producthunt\.com\/products\/worldifact'/)
  assert.match(showcase, /className="resource-marquee"/)
  assert.match(showcase, /className="iss-petition"/)
  assert.match(showcase, /Sign the petition/)
  assert.doesNotMatch(home + showcase, /please\s+upvote|vote\s+for\s+worldifact/i)
})
