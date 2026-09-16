import { useMemo, useState } from 'react'
import './PlanetsDemo.css'
import { PLANET_CAMPAIGN } from '../lib/planetCampaign'
import { REFERENCE_LINKS } from '../config/references'

export default function PlanetsDemo() {
  const [index, setIndex] = useState(0)
  const [distance, setDistance] = useState(0)
  const [jumps, setJumps] = useState(0)
  const planet = PLANET_CAMPAIGN[index]
  const progress = useMemo(() => Math.min(100, distance * 10), [distance])

  const move = () => setDistance(v => Math.min(10, v + 1))
  const jump = () => {
    setJumps(v => v + 1)
    setDistance(v => Math.min(10, v + 1))
  }
  const next = () => {
    setIndex(v => (v + 1) % PLANET_CAMPAIGN.length)
    setDistance(0)
    setJumps(0)
  }

  return <section className="planets-demo" aria-label="8 Planets in 8 Days playable mini test">
    <div className="studio-heading">
      <div><span className="eyebrow">8 PLANETS IN 8 DAYS · MINI TEST</span><h1>Day {planet.day}: {planet.name}</h1></div>
      <span className="pill">DEMO · MOCK GAMEPLAY</span>
    </div>
    <p className="result-note">Local no-login interaction test. It proves simple movement and progression only; the full campaign remains PLANNED.</p>
    <div className="planet-stage">
      <div>
        <span className="eyebrow">MISSION</span>
        <h2>{planet.mission}</h2>
        <p><strong>Hazard:</strong> {planet.hazard}</p>
      </div>
      <div className="planet-track" aria-label={`${planet.name} course progress ${progress}%`}>
        <div className="planet-runner" style={{ left: `calc(${progress}% - 18px)` }} aria-hidden="true">🚀</div>
        <div className="planet-finish" aria-hidden="true">🏁</div>
      </div>
      <div className="scene-toolbar">
        <button onClick={move}>Move</button>
        <button onClick={jump}>Jump</button>
        <button onClick={() => setDistance(0)}>Reset stage</button>
        <button className="primary" disabled={distance < 10} onClick={next}>{distance < 10 ? `Reach finish · ${progress}%` : 'Next planet →'}</button>
      </div>
      <small>Jumps: {jumps}. This lightweight level is a test surface, not the finished eight-level game.</small>
    </div>
    <ol className="planet-list">
      {PLANET_CAMPAIGN.map((item, i) => <li key={item.name}>
        <span>{item.day}</span>
        <div><strong>{item.name}</strong><small>{item.hazard}</small></div>
        <button aria-current={i === index ? 'step' : undefined} onClick={() => { setIndex(i); setDistance(0); setJumps(0) }}>Open</button>
      </li>)}
    </ol>
    <p><a className="button-link" href={REFERENCE_LINKS.planetsOriginal} target="_blank" rel="noreferrer">Open original FORGE prototype ↗</a></p>
  </section>
}
