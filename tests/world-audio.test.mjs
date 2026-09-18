import { test } from 'node:test'
import assert from 'node:assert/strict'
import { WORLD_AUDIO_LOOP_SECONDS, worldAudioTheme } from '../src/lib/worldAudio.ts'

test('WORLDIFACT ambient music uses a 30-second loop', () => {
  assert.equal(WORLD_AUDIO_LOOP_SECONDS, 30)
})

test('each primary world selects a distinct calm audio theme', () => {
  const themes = [
    worldAudioTheme(),
    worldAudioTheme('chess-cube-512-ai'),
    worldAudioTheme('terra-fix-iss'),
    worldAudioTheme('8-planets-in-8-days'),
    worldAudioTheme('enchanted-ai-shop'),
    worldAudioTheme('ai-game-lab'),
  ]
  assert.deepEqual(themes, ['meadow', 'chess', 'iss', 'planets', 'shop', 'lab'])
  assert.equal(new Set(themes).size, themes.length)
})
