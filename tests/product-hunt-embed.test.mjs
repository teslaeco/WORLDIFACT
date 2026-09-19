import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('home page embeds the reviewed WORLDIFACT Product Hunt surfaces', async () => {
  const source = await readFile(new URL('../src/pages/HomePage.tsx', import.meta.url), 'utf8')
  assert.match(source, /cards\.producthunt\.com\/cards\/comments\/5874571\?v=1/)
  assert.match(source, /featured\.svg\?post_id=1254175/)
  assert.match(source, /product_review\.svg\?product_id=1321124/)
  assert.match(source, /www\.producthunt\.com\/products\/worldifact/)
  assert.match(source, /WORLDIFACT community feedback/)
  assert.doesNotMatch(source, /please\s+upvote|vote\s+for\s+worldifact/i)
})
