import { useMemo, useState } from 'react'

const PLANETS = [
  { name: 'Mercury', day: 1, hazard: 'Solar heat', mission: 'Cross the sunlit ridge and cool the rover.' },
  { name: 'Venus', day: 2, hazard: 'Pressure + clouds', mission: 'Reach the protected research beacon.' },
  { name: 'Earth', day: 3, hazard: 'Flooded valley', mission: 'Restore a bridge between two habitats.' },
  { name: 'Mars', day: 4, hazard: 'Dust storm', mission: 'Power the outpost before visibility drops.' },
  { name: 'Jupiter', day: 5, hazard: 'Radiation', mission: 'Navigate a protected orbital platform.' },
  { name: 'Saturn', day: 6, hazard: 'Ring debris', mission: 'Thread a safe route through the ring station.' },
  { name: 'Uranus', day: 7, hazard: 'Extreme cold', mission: 'Restart the thermal grid.' },
  { name: 'Neptune', day: 8, hazard: 'High winds', mission: 'Reach the final storm beacon.' },
] as const

export default function PlanetsDemo() {
  const [index, setIndex] = useState(0)
  const [distance, setDistance] = useState(0)
  const [jumps, setJumps] = useState(0)
  const planet = PLANETS[index]
  const progress = useMemo(() => Math.min(100, distance * 10), [distance])

  const move = () => setDistance(v => Math.min(10, v + 1))
  const jump = () => {
    setJumps(v => v + 1)
    setDistance(v => Math.min(10, v + 1))
  }
  const next = () => {
    setIndex(v => (v + 1) % PLANETS.length)
    setDistance(0)
    setJumps(0)
  }

  return <section className="planets-demo" aria-label="8 Planets in 8 Days playable demo">
    <div className="studio-heading">
      <div><span className="eyebrow">8 PLANETS IN 8 DAYS · DEMO</span><h1>Day {planet.day}: {planet.name}</h1></div>
      <span className="pill">DEMO · MOCK GAMEPLAY</span>
    </div>
    <p className="result-note">Local no-login fallback. The original FORGE World Builder remains a separate prototype and may require ChatGPT sign-in.</p>
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
      <small>Jumps: {jumps}. This lightweight level proves navigation and interaction only; the full eight-level campaign remains PLANNED.</small>
    </div>
    <ol className="planet-list">
      {PLANETS.map((item, i) => <li key={item.name}>
        <span>{item.day}</span>
        <div><strong>{item.name}</strong><small>{item.hazard}</small></div>
        <button aria-current={i === index ? 'step' : undefined} onClick={() => { setIndex(i); setDistance(0); setJumps(0) }}>Open</button>
      </li>)}
    </ol>
    <p><a className="button-link" href="https://forge-world-builder.terraformingplanet.chatgpt.site/" target="_blank" rel="noreferrer">Open original FORGE prototype ↗</a></p>
  </section>
}
