import { useEffect, useRef } from 'react'
import { openChessEntry } from '../lib/chessEntry'

/** Enter the real full-screen game, without a launcher or nested mobile WebGL frame. */
export default function ChessPage() {
  const entered = useRef(false)
  useEffect(() => {
    if (entered.current) return
    entered.current = true
    openChessEntry(window.location)
  }, [])
  return <main className="chess-game-page" aria-label="Cube Chess 512 AI">
    <p role="status">Opening Cube Chess 512 AI…</p>
  </main>
}
