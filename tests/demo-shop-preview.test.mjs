import { test } from 'node:test'
import assert from 'node:assert/strict'
import { demoShopKind } from '../src/components/DemoShopPreview.tsx'

test('FAST procedural preview recognizes interior prompts before generic house/building prompts', () => {
  assert.equal(demoShopKind('Create a realistic bungalow living room interior'), 'interior')
  assert.equal(demoShopKind('Wnętrze salonu z jadalnią i lampą'), 'interior')
  assert.equal(demoShopKind('Dubai skyscraper tower'), 'tower')
  assert.equal(demoShopKind('futuristic rover vehicle'), 'vehicle')
})
