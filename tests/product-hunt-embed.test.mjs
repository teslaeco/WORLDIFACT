import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('home page embeds the reviewed WORLDIFACT Product Hunt comments card', async () => {
  const source = await readFile(new URL('../src/pages/HomePage.tsx', import.meta.url), 'utf8')
  assert.match(source, /https:\/\/cards\.producthunt\.com\/cards\/comments\/5874571\?v=1/)
  assert.match(source, /https:\/\/www\.producthunt\.com\/posts\/worldifact/)
  assert.match(source, /WORLDIFACT community feedback/)
  assert.doesNotMatch(source, /please\s+upvote|vote\s+for\s+worldifact/i)
})
