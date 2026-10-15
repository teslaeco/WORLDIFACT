/** Fixed same-origin entry: the game retains its real account and guest choices. */
export const CHESS_ENTRY_PATH = '/apps/chess/index.html' as const

export function openChessEntry(location: Pick<Location, 'replace'>): void {
  // Replace only the disposable portal route; Back still returns to WORLDIFACT.
  // This entry navigation is separate from the game's in-document Exit to menu.
  location.replace(CHESS_ENTRY_PATH)
}
