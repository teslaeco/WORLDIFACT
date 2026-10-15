import { useState } from 'react'

/** Open the actual same-origin game, including its account/guest welcome screen. */
export default function ChessPage() {
  const [loaded, setLoaded] = useState(false)
  return <main className="chess-game-page" aria-label="Cube Chess 512 AI" style={{ position: 'relative' }}>
    {!loaded && <p role="status" style={{ position: 'absolute', top: 12, left: 16, pointerEvents: 'none' }}>Opening Cube Chess 512 AI…</p>}
    <iframe
      src="/apps/chess/index.html"
      title="Cube Chess 512 AI"
      allow="fullscreen; clipboard-write"
      allowFullScreen
      onLoad={() => setLoaded(true)}
      style={{ display: 'block', width: '100%', height: 'calc(100dvh - 64px)', minHeight: 480, border: 0 }}
    />
  </main>
}
