import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SHOP_SESSION_DRAFT_KEY, clearShopSessionDraft, readShopSessionDraft, reconcileShopSessionAccount, saveShopSessionDraft, type ShopSessionDraft } from '../src/lib/shopSessionDraft.ts'

const draft: ShopSessionDraft = { prompt: 'Detailed planet Earth', profile: 'standard', cheapModel: 'sol', deliverable: 'detailed-mesh', purpose: 'object', textureLimit: 4096, budgetTier: 'extended', referenceCount: 2 }
function fixture() {
  const data = new Map<string, string>()
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value) }, removeItem: (key: string) => { data.delete(key) } }
  return { data, storage }
}

test('session draft stores only editable fields and reference count, with an exact verified account', () => {
  const { data, storage } = fixture()
  assert.equal(saveShopSessionDraft(storage, 'owner-a', { ...draft, ticket: 'secret', photos: ['private photo'], acceptedPoints: 500 } as ShopSessionDraft), true)
  assert.deepEqual(readShopSessionDraft(storage, 'owner-a').draft, draft)
  assert.doesNotMatch(data.get(SHOP_SESSION_DRAFT_KEY)!, /secret|private photo|acceptedPoints|ticket|photos/)
  assert.equal(readShopSessionDraft(storage, 'owner-b').draft, null)
  assert.equal(data.size, 0)
})

test('malformed, future, oversized and unexpected session records cannot supply generation state', () => {
  for (const raw of ['{', JSON.stringify({ version: 2, accountOwner: 'owner-a', draft }), JSON.stringify({ version: 1, accountOwner: 'owner-a', draft: { ...draft, referenceCount: 5 } }), JSON.stringify({ version: 1, accountOwner: 'owner-a', draft: { ...draft, prompt: 'x'.repeat(100_001) } }), JSON.stringify({ version: 1, accountOwner: 'owner-a', draft: { ...draft, acceptedPoints: 500 } })]) {
    const { data, storage } = fixture(); data.set(SHOP_SESSION_DRAFT_KEY, raw)
    assert.equal(readShopSessionDraft(storage, 'owner-a').draft, null)
    assert.equal(data.size, 0)
  }
})

test('empty reset and over-limit editable prompts survive without storing financial acceptance', () => {
  const { storage } = fixture()
  for (const prompt of ['', 'x'.repeat(5000)]) {
    assert.equal(saveShopSessionDraft(storage, 'owner-a', { ...draft, prompt, referenceCount: 0 }), true)
    assert.equal(readShopSessionDraft(storage, 'owner-a').draft?.prompt, prompt)
  }
})

test('verified logout clears a session draft and account change cannot retrieve another owner', () => {
  const { data, storage } = fixture()
  saveShopSessionDraft(storage, 'owner-a', draft)
  reconcileShopSessionAccount(storage, 'owner-a'); assert.equal(data.size, 1)
  reconcileShopSessionAccount(storage, null); assert.equal(data.size, 0)
  saveShopSessionDraft(storage, 'owner-a', draft)
  reconcileShopSessionAccount(storage, 'owner-b'); assert.equal(data.size, 0)
})

test('unavailable reads and failed writes never throw or retain a stale readable record', () => {
  assert.equal(readShopSessionDraft(null, 'owner-a').unavailable, true)
  assert.equal(saveShopSessionDraft(null, 'owner-a', draft), false)
  const { data, storage } = fixture(); saveShopSessionDraft(storage, 'owner-a', draft)
  const full = { ...storage, setItem() { throw new Error('Full') } }
  assert.equal(saveShopSessionDraft(full, 'owner-a', { ...draft, prompt: 'New' }), false)
  assert.equal(data.size, 0)
  const denied = { getItem() { throw new Error('Denied') }, setItem() { throw new Error('Denied') }, removeItem() { throw new Error('Denied') } }
  assert.equal(readShopSessionDraft(denied, 'owner-a').unavailable, true)
  assert.equal(clearShopSessionDraft(denied), false)
  assert.equal(saveShopSessionDraft(denied, 'owner-a', draft), false)
})
