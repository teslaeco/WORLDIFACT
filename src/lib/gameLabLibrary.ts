import type { StudioArchiveEntry } from './studioArchive'

export type GameLabArchiveEntry = StudioArchiveEntry & { accountVerified: boolean }

/** Keep every GLB that actually exists in the browser archive.
 * Server ownership only adds a badge/privilege signal; it must never erase
 * local bytes that the user could import through the normal file picker.
 */
export function mergeGameLabArchive(archive: StudioArchiveEntry[], verifiedIds: Iterable<string>): GameLabArchiveEntry[] {
  const verified = new Set(verifiedIds)
  return archive.map(entry => ({ ...entry, accountVerified: verified.has(entry.id) }))
}
