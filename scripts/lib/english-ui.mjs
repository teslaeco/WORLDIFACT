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

export async function assertEnglishFoundationOutput(root, entryNames = ['index.html']) {
  for (const entry of entryNames) {
    const html = await readFile(join(root, entry), 'utf8')
    assertEnglishDocument(html, `${root}/${entry}`)
  }

  async function scan(directory) {
    for (const item of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, item.name)
      if (item.isDirectory()) await scan(path)
      else if (/\.(?:html|js)$/i.test(item.name)) inspectEnglishUiText(await readFile(path, 'utf8'), path)
    }
  }
  await scan(root)
}
