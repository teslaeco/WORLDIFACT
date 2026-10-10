import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sameShopDraft, type ShopDraftSnapshot } from '../src/lib/studioDraft.ts'
import { readGenerationBalance } from '../src/lib/generationQuote.ts'

const draft: ShopDraftSnapshot = {
  prompt: 'Original MCC', purpose: 'object', textureLimit: 4096, profile: 'standard',
  cheapModel: 'sol', budgetTier: 'standard', deliverable: 'detailed-mesh', creationMode: 'model',
  photos: [], dimensions: { xMm: 100, yMm: 100, zMm: 100 }, dimensionsEnabled: false,
}
test('automatic clearing requires all submitted composer fields, not only a matching prompt', () => {
  assert.equal(sameShopDraft(draft, structuredClone(draft)), true)
  for (const change of [
    { prompt: 'Next globe' }, { purpose: 'terrain' }, { textureLimit: 2048 }, { profile: 'fast' },
    { cheapModel: 'luna' }, { budgetTier: 'extended' }, { deliverable: 'procedural-blueprint' },
    { creationMode: 'image' }, { dimensionsEnabled: true }, { dimensions: { xMm: 90, yMm: 100, zMm: 100 } },
    { photos: [{ name: 'new.png', view: 'front', dataUrl: 'data:image/png;base64,synthetic', textureMaxSize: 4096 }] },
  ]) assert.equal(sameShopDraft(draft, { ...draft, ...change }), false)
})
test('unchanged copied photo data matches; replaced image, label or image ceiling remains a new draft', () => {
  const photo = { name: 'a.png', view: 'front', dataUrl: 'data:image/png;base64,synthetic', textureMaxSize: 4096 }
  const saved = { ...draft, photos: [photo] }
  assert.equal(sameShopDraft(saved, structuredClone(saved)), true)
  for (const change of [{ name: 'b.png' }, { view: 'back' }, { dataUrl: 'data:image/png;base64,another' }, { textureMaxSize: 2048 }])
    assert.equal(sameShopDraft(saved, { ...saved, photos: [{ ...photo, ...change }] }), false)
})
test('blocked-account balance reports only internally consistent nonnegative whole-point amounts', () => {
  assert.deepEqual(readGenerationBalance({ credits: 1190, reservedCredits: 1000, availableCredits: 190 }), { total: 1190, held: 1000, available: 190 })
  assert.deepEqual(readGenerationBalance({ credits: 1190, reservedCredits: 0, availableCredits: 1190 }), { total: 1190, held: 0, available: 1190 })
  for (const account of [null, {}, { credits: 1190 },
    { credits: 1190, reservedCredits: 1000, availableCredits: 1190 },
    { credits: 1190, reservedCredits: 1250, availableCredits: -60 },
    { credits: '1190', reservedCredits: 1000, availableCredits: 190 },
    { credits: 1190, reservedCredits: 1000.5, availableCredits: 189.5 },
    { credits: NaN, reservedCredits: 0, availableCredits: NaN }]) assert.equal(readGenerationBalance(account), undefined)
})
