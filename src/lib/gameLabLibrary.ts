export type GameLabArchiveEntry<T extends { id: string } = { id: string }> = T & { accountVerified: boolean }

/** Keep every GLB that actually exists in the browser archive.
 * Server ownership only adds a badge/privilege signal; it must never erase
 * local bytes that the user could import through the normal file picker.
 */
export function mergeGameLabArchive<T extends { id: string }>(archive: T[], verifiedIds: Iterable<string>): GameLabArchiveEntry<T>[] {
  const verified = new Set(verifiedIds)
  return archive.map(entry => ({ ...entry, accountVerified: verified.has(entry.id) }))
}
