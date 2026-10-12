import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

// The account gallery owns its authentication and signed model lookup. The Shop
// supplies only the immutable ID already settled for its selected receipt.
test('Shop reveals the exact successful owned model even outside the first cursor page', async () => {
  const [shop, gallery, api] = await Promise.all([
    readFile(new URL('../src/pages/ShopPage.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/StudioGallery.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../server/studio.ts', import.meta.url), 'utf8'),
  ])
  assert.match(shop, /<StudioGallery compact requestedModelId=\{saved && job\?\.state === 'succeeded' && job\.id === saved\.receipt\.id \? saved\.receipt\.id : ''\} \/>/)
  assert.match(gallery, /getStudioLibraryModel\(owner, requestedModelId, signal\)/)
  assert.match(gallery, /target\?\.owner === owner && target\.id === requestedModelId/)
  assert.match(api, /userStudioLibraryModel\(env, user\.id, id\)/)
  assert.match(api, /if \(!model\) throw new StudioError\('This saved model is not available in your account library\.'/)
  assert.doesNotMatch(shop, /<StudioGallery compact requestedModelId=\{saved\?\.receipt\.id/)
})
