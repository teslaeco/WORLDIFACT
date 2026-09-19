import { test } from 'node:test'
import assert from 'node:assert/strict'
import { shopPreviewKind } from '../src/lib/shopPreviewKind.ts'

test('FAST procedural preview recognizes interior prompts before generic house/building prompts', () => {
  assert.equal(shopPreviewKind('Create a realistic bungalow living room interior'), 'interior')
  assert.equal(shopPreviewKind('Wnętrze salonu z jadalnią i lampą'), 'interior')
  assert.equal(shopPreviewKind('Dubai skyscraper tower'), 'tower')
  assert.equal(shopPreviewKind('futuristic rover vehicle'), 'vehicle')
})
