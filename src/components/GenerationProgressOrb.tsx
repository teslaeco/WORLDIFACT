import { useEffect, useId, useState } from 'react'
import GenerationSculpture from './GenerationSculpture'
import { generationProgressView, type GenerationProgressInput } from '../lib/generationProgressView'
import './GenerationProgressOrb.css'

export default function GenerationProgressOrb({ visualOnly = false, compact = false, ...input }: GenerationProgressInput & { visualOnly?: boolean; compact?: boolean }) {
  const view = generationProgressView(input)
  const descriptionId = useId()
  const progressExplanationId = useId()
  const [paused, setPaused] = useState(false)
  const [reduceMotion, setReduceMotion] = useState(true)
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    let closed = false
    const update = () => { if (!closed) setReduceMotion(query.matches || !!(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData) }
    queueMicrotask(update); query.addEventListener('change', update)
    return () => { closed = true; query.removeEventListener('change', update) }
  }, [])
  const estimated = view.percent !== null && view.percent < 100
  const animate = view.kind === 'active' && !reduceMotion && !paused
  return <section className={`generation-orb-panel${compact ? " generation-orb-compact" : ""}`} data-kind={view.kind} data-motion={animate} data-percent={view.percent ?? undefined} aria-label="Selected request progress">
    {estimated && <p className="generation-orb-estimate-label">Estimated stage progress</p>}
    <div className="generation-orb-visual" role="progressbar" aria-label={view.title} aria-describedby={`${descriptionId} ${progressExplanationId}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={view.percent ?? undefined} aria-valuetext={view.percent === 100 ? '100 percent. Validated model saved.' : estimated ? `${view.percent} percent estimated stage progress. ${view.percent! / 25} of 4 confirmed milestones, not processing or time completed. ${view.stage}.` : `${view.stage}. No numeric completion estimate is available.`}>
      <svg className="generation-orb-ring" viewBox="0 0 320 320" aria-hidden="true">
        <circle className="generation-orb-track" cx="160" cy="160" r="146" />
        <circle className="generation-orb-arc" cx="160" cy="160" r="146" pathLength="100" style={view.percent === null ? undefined : { strokeDasharray: `${view.percent} ${100 - view.percent}` }} />
      </svg>
      <GenerationSculpture key={animate ? "moving" : "still"} animate={animate} />
      <div className="generation-orb-numeral" aria-hidden="true">{view.percent !== null ? <><strong>{view.percent}<span>%</span></strong><small>{view.percent === 100 ? 'MODEL SAVED' : `${view.percent / 25} OF 4 CONFIRMED MILESTONES`}</small></> : view.elapsed && view.kind !== 'idle' ? <><strong>{view.elapsed}</strong><small>ELAPSED · INCLUDES WAITING</small></> : <><strong className="generation-orb-mark">◇</strong><small>{view.kind === 'idle' ? 'CREATE SOMETHING REAL' : 'NO COMPLETION ESTIMATE'}</small></>}</div>
    </div>
    {view.elapsed && view.percent !== null && <p className="generation-orb-elapsed">Elapsed <strong>{view.elapsed}</strong> · includes upload and waiting</p>}
    <div className="generation-orb-status" role="status" aria-live="polite" aria-atomic="true">
      <span className="generation-orb-stage">{view.stage}</span>
      {!visualOnly && <h2>{view.title}</h2>}
      <p id={descriptionId} className={visualOnly ? "generation-orb-accessible-time" : undefined}>{view.detail}</p>
    </div>
    <p id={progressExplanationId} className="generation-orb-honesty">{view.percent === 100 ? 'Completion confirms the file, not visual quality.' : estimated ? 'Four equal milestones: accepted, worker started, worker finished, validated model saved. This is an estimate of stage progress, not processing or time completed.' : view.kind === 'active' ? 'Awaiting confirmation. No percentage estimate is available.' : 'The saved request keeps its own status.'}</p>
    {view.elapsed && <span className="generation-orb-accessible-time">Elapsed since this request was tracked: {view.elapsed}. Includes upload and queue time; not recorded worker generation time.</span>}
    {view.kind === 'active' && !reduceMotion && <button type="button" className="generation-orb-pause" aria-pressed={paused} onClick={() => setPaused(value => !value)}>{paused ? 'Resume animation' : 'Pause animation'}</button>}
  </section>
}
