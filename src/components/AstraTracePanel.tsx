import { useEffect, useState } from 'react'
import { readArchive } from '../lib/archive'
import type { GenerationResult } from '../lib/blueprint'

export default function AstraTracePanel() {
  const [result, setResult] = useState<GenerationResult | null>(() => readArchive()[0]?.result ?? null)
  useEffect(() => {
    const refresh = () => setResult(readArchive()[0]?.result ?? null)
    const timer = window.setInterval(refresh, 800)
    window.addEventListener('storage', refresh)
    return () => { window.clearInterval(timer); window.removeEventListener('storage', refresh) }
  }, [])
  const spec = result?.assetSpec
  return <section className="generation-evidence" aria-label="GPT-6 Astra result trace">
    <span className="eyebrow">P0 · VISIBLE ASTRA TRACE</span>
    <h2>PROMPT / IMAGE → GPT-6 ASTRA → WORLD BLUEPRINT → SCENE CHANGE → GAME / MAKE</h2>
    {!result ? <p>No generated result yet. Build a scene above to populate this trace.</p> : <>
      <p><strong>{result.mode}</strong> · {result.provenance} · {result.model ?? 'local DEMO'} · request {result.requestId.slice(0, 8)}…</p>
      <div className="workflow-pair">
        <article>
          <span className="eyebrow">GAME · {result.mode}</span>
          <h3>{spec?.name ?? result.blueprint.title}</h3>
          <p>{spec?.game.gameplayRole ?? 'Procedural preview scene; export is GAME-only.'}</p>
          {spec ? <ul>
            <li>Geometry: {spec.game.geometry}</li>
            <li>Materials: {spec.game.materialPlan}</li>
            <li>Animation: {spec.game.animationPlan}</li>
          </ul> : null}
        </article>
        <article>
          <span className="eyebrow">MAKE · {spec ? 'BLOCKED / VALIDATION REQUIRED' : 'NOT GENERATED'}</span>
          <h3>{spec?.make.materialCandidate ?? 'Production validation is separate'}</h3>
          {spec ? <>
            <p>Candidate process: {spec.make.processCandidate} · candidate size {spec.make.dimensionsMm.x} × {spec.make.dimensionsMm.y} × {spec.make.dimensionsMm.z} mm.</p>
            <ul>{spec.make.constraints.map(item => <li key={item}>{item}</li>)}</ul>
          </> : <p>No manufacturing-ready model, quote or order is claimed.</p>}
        </article>
      </div>
      <details>
        <summary>Inspect generated WorldBlueprint</summary>
        <pre>{JSON.stringify(result.blueprint, null, 2)}</pre>
      </details>
      <details>
        <summary>Inspect generated AssetSpec</summary>
        <pre>{JSON.stringify(spec ?? { status: 'not available for this archived result' }, null, 2)}</pre>
      </details>
      <p><small>{result.limitation}</small></p>
    </>}
  </section>
}
