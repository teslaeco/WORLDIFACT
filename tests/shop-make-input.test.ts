import { test } from 'node:test'
import assert from 'node:assert/strict'
import { oracleStudioPayload, validateStudioInput } from '../src/lib/studioProtocol.ts'

const jpeg = Buffer.from([255,216,255,192,0,17,8,0,16,0,16,3,1,17,0,2,17,0,3,17,0,255,217])
const dataUrl = 'data:image/jpeg;base64,' + jpeg.toString('base64')
const base = {
  worldId: 'enchanted-ai-shop' as const,
  prompt: 'Prepare a small source-based display model for manufacturing review.',
  purpose: 'object' as const,
  textureMaxSize: 4096 as const,
  photos: [],
}
const photo = (index: number) => ({
  name: `reference-${index}.jpg`,
  view: (['front', 'side', 'back'] as const)[index] ?? 'other',
  dataUrl,
  textureMaxSize: 4096 as const,
})

test('Shop accepts three reference images and rejects a fourth before any provider request', () => {
  const three = validateStudioInput({ ...base, photos: [photo(0), photo(1), photo(2)] })
  assert.equal(three.photos.length, 3)
  assert.throws(
    () => validateStudioInput({ ...base, photos: [photo(0), photo(1), photo(2), { ...photo(2), name: 'fourth.jpg' }] }),
    /at most three reference photos/,
  )
})

test('STANDARD manufacturing payload carries print-safety guidance without claiming MAKE approval', () => {
  const input = validateStudioInput(base)
  const payload = oracleStudioPayload('00000000-0000-4000-8000-000000000001', input)
  assert.match(payload.prompt, /work in millimetres/)
  assert.match(payload.prompt, /minimum-wall and clearance target/)
  assert.match(payload.prompt, /fragile unsupported sheets\/struts/)
  assert.match(payload.prompt, /MAKE is unapproved/)
  assert.match(payload.prompt, /supplier engineering review/)
})
