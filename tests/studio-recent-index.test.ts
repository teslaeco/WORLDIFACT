import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  STUDIO_RECENT_CAPACITY, STUDIO_RECENT_KEY, STUDIO_RECENT_READ_LIMIT,
  readRecentStudioIndex, upsertRecentStudioIndex,
} from '../src/lib/studioRecentIndex.ts'

const id = (n: number) => `${n.toString(16).padStart(8, '0')}-1111-4111-8111-111111111111`

test('bounded owner-scoped recent index retains only the latest 32 canonical finished UUID hints', () => {
  let value: unknown = undefined
  for (let i = 1; i <= 100; i++) value = upsertRecentStudioIndex(value, id(i), 1800000000000 + i)
  const parsed = readRecentStudioIndex(value)
  assert.equal(STUDIO_RECENT_KEY, 'studio-library-recent:v1')
  assert.ok(STUDIO_RECENT_READ_LIMIT <= STUDIO_RECENT_CAPACITY)
  assert.equal(parsed?.entries.length, STUDIO_RECENT_CAPACITY)
  assert.equal(parsed?.entries[0].id, id(100))
  assert.equal(parsed?.entries.at(-1)?.id, id(69))
  assert.equal(parsed?.entries.some(x => x.id === id(68)), false)
  const repeated = upsertRecentStudioIndex(value, id(100), 1800000000200)
  assert.equal(repeated?.entries.length, STUDIO_RECENT_CAPACITY)
  assert.equal(repeated?.entries[0].completedAt, 1800000000200)
  assert.equal(upsertRecentStudioIndex(value, 'different-user-id', 1800000000200), null)
})

test('recent discovery rejects malformed, duplicate, unsorted, or mutated hints', () => {
  const good = upsertRecentStudioIndex(undefined, id(1), 1800000000000)
  assert.equal(readRecentStudioIndex(undefined)?.entries.length, 0)
  for (const bad of [
    null, 'legacy', { revision: 'studio-library-recent-v1', entries: [], forged: 1 },
    { revision: 'studio-library-recent-v1', entries: [{ id: id(1), completedAt: 3 }, { id: id(1), completedAt: 2 }] },
    { revision: 'studio-library-recent-v1', entries: [{ id: id(1), completedAt: 2 }, { id: id(2), completedAt: 3 }] },
    { revision: 'studio-library-recent-v1', entries: [{ id: id(1), completedAt: '3' }] },
    { revision: 'studio-library-recent-v1', entries: [{ id: id(1), completedAt: 2, account: 'other' }] },
  ]) {
    assert.equal(readRecentStudioIndex(bad), null)
    assert.equal(upsertRecentStudioIndex(bad, id(3), 1800000000000), null)
  }
  assert.deepEqual(readRecentStudioIndex(good)?.entries, [{ id: id(1), completedAt: 1800000000000 }])
})
