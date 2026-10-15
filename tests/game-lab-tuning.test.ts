import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DEFAULT_GAME_TUNING, parseGameLabPrompt, validateGameTuning } from '../src/lib/gameLabTuning.ts'
test('game tuning validates settings and rejects unexpected fields', () => {
  assert.deepEqual(validateGameTuning(DEFAULT_GAME_TUNING), DEFAULT_GAME_TUNING)
  assert.throws(() => validateGameTuning({ ...DEFAULT_GAME_TUNING, speedKmh: 400 }))
  assert.throws(() => validateGameTuning({ ...DEFAULT_GAME_TUNING, evilScript: 'alert(1)' }))
  assert.throws(() => validateGameTuning({ ...DEFAULT_GAME_TUNING, steeringPercent: Number.NaN }))
})
test('bounded English and Polish local tuning prompts', () => {
  const r = parseGameLabPrompt('Increase speed to 220 km/h, steering 65%, render high quality and drive', { ...DEFAULT_GAME_TUNING })
  assert.equal(r.settings.speedKmh, 220)
  assert.equal(r.settings.steeringPercent, 65)
  assert.equal(r.settings.renderQuality, 'quality')
  assert.equal(r.settings.vehicleMode, true)
  const p = parseGameLabPrompt('Ustaw prędkość 120 km/h i sterowanie 55%, grafika niska', r.settings)
  assert.deepEqual([p.settings.speedKmh,p.settings.steeringPercent,p.settings.renderQuality],[120,55,'eco'])
  assert.throws(() => parseGameLabPrompt('speed 900 km/h', p.settings))
  assert.throws(() => parseGameLabPrompt('run arbitrary script', p.settings))
})
