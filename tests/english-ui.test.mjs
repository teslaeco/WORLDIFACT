import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { assertEnglishDocument, assertEnglishLocaleSource, assertRuntimeTranslationPairs, inspectEnglishUiText } from '../scripts/lib/english-ui.mjs'

const FIRST_PARTY_UI = [
  '../src/pages/HomePage.tsx',
  '../src/pages/PortalPage.tsx',
  '../src/pages/ShopPage.tsx',
  '../src/pages/WorkbenchPage.tsx',
  '../src/pages/ControlPage.tsx',
  '../src/components/P0GameLab.tsx',
  '../src/config/portals.ts',
]

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

test('locale source may keep optional translations but must have a clean English catalog and fallback', () => {
  const valid = `
    export const ENGLISH_CATALOG = Object.freeze({ save: "Save", settings: "Settings" });
    export const POLISH_CATALOG = Object.freeze({ save: "Zapisz", settings: "Ustawienia" });
    function resolveLocale(value) { if (value === "pl") return "pl"; return "en"; }
    function getCatalog(locale) { const resolved = resolveLocale(locale); if (resolved === "en") return ENGLISH_CATALOG; return POLISH_CATALOG; }
  `
  assert.doesNotThrow(() => assertEnglishLocaleSource(valid, 'fixture locales'))
  assert.throws(() => assertEnglishLocaleSource(valid.replace('save: "Save"', 'save: "Zapisz"'), 'fixture locales'), /English catalog contains Polish UI copy/)
  assert.throws(() => assertEnglishLocaleSource(valid.replace('return "en";', 'return "pl";'), 'fixture locales'), /English fallback/)
})

test('reviewed runtime translator must contain each required source-to-English pair', () => {
  const source = `const pairs = [['Zapisz', 'Save'], ['Błąd', 'Error']]`
  assert.doesNotThrow(() => assertRuntimeTranslationPairs(source, [['Zapisz', 'Save'], ['Błąd', 'Error']], 'fixture runtime'))
  assert.throws(() => assertRuntimeTranslationPairs(source, [['Otwórz', 'Open']], 'fixture runtime'), /missing the reviewed translation/)
})

test('native WORLDIFACT shell and AI Game Lab stay English at source', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8')
  assertEnglishDocument(html, 'WORLDIFACT index.html')
  for (const relative of FIRST_PARTY_UI) {
    const url = new URL(relative, import.meta.url)
    inspectEnglishUiText(await readFile(url, 'utf8'), relative)
  }
})
