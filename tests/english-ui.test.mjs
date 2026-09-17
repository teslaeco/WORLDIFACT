import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assertEnglishDocument, inspectEnglishUiText } from '../scripts/lib/english-ui.mjs'

test('English UI guard accepts explicit English documents and neutral technical data', () => {
  assert.doesNotThrow(() => assertEnglishDocument('<!doctype html><html lang="en"><body>Save model</body></html>', 'fixture'))
  assert.doesNotThrow(() => inspectEnglishUiText('data_poczatkowa=2026-01-01; jobId=abc; provenance=REAL', 'data contract'))
})

test('English UI guard rejects missing language declarations', () => {
  assert.throws(() => assertEnglishDocument('<html><body>Save</body></html>', 'fixture'), /declare an English document language/)
  assert.throws(() => assertEnglishDocument('<html lang="pl"><body>Save</body></html>', 'fixture'), /declare an English document language/)
})

test('English UI guard rejects high-signal Polish interface strings', () => {
  for (const phrase of ['Zaloguj', 'Załóż konto', 'Zagraj jako gość', 'Wczytaj', 'Ustawienia', 'Błąd']) {
    assert.throws(() => inspectEnglishUiText(`prefix ${phrase} suffix`, 'fixture'), new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
})
