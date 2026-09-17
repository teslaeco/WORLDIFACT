import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

// High-signal UI copy that appeared in earlier Polish builds. Keep this list
// limited to interface phrases: scientific field names, place names, prompts,
// user data and provenance are intentionally not language-normalized.
export const BLOCKED_POLISH_UI = [
  'Zaloguj',
  'Załóż konto',
  'Zresetuj hasło',
  'Nazwa gracza',
  'Hasło',
  'Nie pamiętam hasła',
  'Zagraj jako gość',
  'Więcej opcji',
  'Wczytaj',
  'Zapisz',
  'Ustawienia',
  'Wróć',
  'Powrót',
  'Anuluj',
  'Ładowanie',
  'Błąd',
  'Otwórz',
  'Zamknij',
  'Następny',
  'Poprzedni',
]

export function inspectEnglishUiText(text, label = 'asset') {
  const matches = BLOCKED_POLISH_UI.filter(phrase => text.includes(phrase))
  if (matches.length) throw new Error(`${label} contains Polish UI copy: ${matches.join(', ')}`)
}

export function assertEnglishDocument(html, label = 'HTML') {
  if (!/<html\b[^>]*\blang=["']en(?:-[A-Za-z0-9-]+)?["']/i.test(html)) {
    throw new Error(`${label} must declare an English document language`)
  }
  inspectEnglishUiText(html, label)
}

export function assertEnglishLocaleSource(text, label = 'locale source') {
  if (!/export\s+const\s+ENGLISH_CATALOG\b/.test(text)) throw new Error(`${label} is missing the English catalog`)
  if (!/if\s*\(resolved\s*===\s*["']en["']\)\s*return\s+ENGLISH_CATALOG/.test(text)) {
    throw new Error(`${label} does not route the English locale to the English catalog`)
  }
  if (!/return\s+["']en["']\s*;/.test(text)) throw new Error(`${label} is missing an English fallback`)
  const englishBlock = text.match(/export\s+const\s+ENGLISH_CATALOG\s*=\s*Object\.freeze\(\{([\s\S]*?)\}\);/)
  if (!englishBlock) throw new Error(`${label} English catalog could not be bounded`)
  inspectEnglishUiText(englishBlock[1], `${label} English catalog`)
}

export async function assertEnglishFoundationOutput(root, entryNames = ['index.html'], { scanJavaScript = true } = {}) {
  for (const entry of entryNames) {
    const html = await readFile(join(root, entry), 'utf8')
    assertEnglishDocument(html, `${root}/${entry}`)
  }

  async function scan(directory) {
    for (const item of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, item.name)
      if (item.isDirectory()) await scan(path)
      else if (/\.html$/i.test(item.name) || (scanJavaScript && /\.js$/i.test(item.name))) {
        inspectEnglishUiText(await readFile(path, 'utf8'), path)
      }
    }
  }
  await scan(root)
}
