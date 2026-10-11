import { useEffect, useState } from 'react'
import GenerationSculpture from './GenerationSculpture'
import './CreationProgress.css'

/** A waiting animation, never an elapsed-time estimate of provider completion. */
export default function CreationProgress({ active = false, label = 'Ready to create', percent = null }: {
  active?: boolean
  label?: string
  /** Confirmed workflow milestones only. Omit when the provider reports no progress. */
  percent?: number | null
}) {
  const [reduced, setReduced] = useState(true)
  const [paused, setPaused] = useState(false)
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(query.matches || !!(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData)
    update(); query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  const animate = !reduced && !paused
  return <div className="creation-progress" data-moving={animate} aria-busy={active}>
    <div className="creation-progress-sculpture"><GenerationSculpture animate={animate} /></div>
    <div className="creation-progress-status" role={active ? 'progressbar' : 'status'} aria-label={label}
      aria-valuemin={active ? 0 : undefined} aria-valuemax={active ? 100 : undefined}
      aria-valuenow={active && percent !== null ? percent : undefined}
      aria-valuetext={active ? percent !== null ? `${percent}% of workflow milestones confirmed; not time remaining` : 'In progress; completion percentage is unavailable' : undefined}>
      {active && <span className="creation-progress-dots" aria-hidden="true">{[0, 1, 2, 3, 4].map(i => <i key={i} style={{ animationDelay: `${i * .14}s` }} />)}</span>}
      {percent !== null && <strong className="creation-progress-percent">{percent}%</strong>}
      <span>{label}</span>
      {active && <small>{percent !== null ? 'Confirmed stages · not time remaining' : 'Working · completion time varies'}</small>}
    </div>
    {!reduced && <button type="button" className="creation-motion-toggle" aria-pressed={paused} aria-label={paused ? 'Resume animation' : 'Pause animation'} onClick={() => setPaused(value => !value)}>{paused ? '▷' : 'Ⅱ'}</button>}
  </div>
}
