import { useState } from 'react'
import PlanetsDemo from './PlanetsDemo'
import { PLANET_CAMPAIGN } from '../lib/planetCampaign'
import { REFERENCE_LINKS } from '../config/references'

export default function PlanetsWorld() {
  const [tab, setTab] = useState<'world' | 'mini'>('world')
  const [selected, setSelected] = useState(0)
  const planet = PLANET_CAMPAIGN[selected]

  return <section className="planets-world" aria-label="8 Planets in 8 Days">
    <nav className="world-tabs" aria-label="8 Planets views">
      <button type="button" className={tab === 'world' ? 'active' : ''} aria-pressed={tab === 'world'} onClick={() => setTab('world')}>Original WORLDIFACT view</button>
      <button type="button" className={tab === 'mini' ? 'active' : ''} aria-pressed={tab === 'mini'} onClick={() => setTab('mini')}>Mini test</button>
      <a href={REFERENCE_LINKS.planetsOriginal} target="_blank" rel="noreferrer">Original FORGE prototype ↗</a>
    </nav>

    {tab === 'mini' ? <PlanetsDemo /> : <>
      <div className="studio-heading planets-heading">
        <div><span className="eyebrow">8 PLANETS IN 8 DAYS · WORLD #3</span><h1>Eight worlds. Eight days. One expedition.</h1></div>
        <span className="pill">DEMO VIEW · FULL CAMPAIGN PLANNED</span>
      </div>
      <p className="result-note">The main WORLDIFACT expedition view stays first. The lightweight interaction test is available in the Mini test tab; the older FORGE prototype opens separately because its embedded frame is unreliable on Android.</p>

      <div className="planet-expedition">
        <div className="planet-route" role="list" aria-label="Eight-day planetary route">
          {PLANET_CAMPAIGN.map((item, index) => <button key={item.id} type="button" role="listitem"
            className={index === selected ? 'selected' : ''}
            aria-current={index === selected ? 'step' : undefined}
            onClick={() => setSelected(index)}>
            <span>{item.day}</span><strong>{item.name}</strong><small>{item.hazard}</small>
          </button>)}
        </div>

        <article className="planet-mission-card">
          <span className="eyebrow">DAY {planet.day} · {planet.name.toUpperCase()}</span>
          <h2>{planet.mission}</h2>
          <p><strong>Hazard:</strong> {planet.hazard}</p>
          <div className="planet-visual" aria-hidden="true">
            <span className={`planet-sphere planet-${planet.id}`} />
            {planet.id === 'saturn' && <span className="planet-saturn-rings" />}
            <span className="planet-flight-line" />
            <span className="planet-rover">▲</span>
          </div>
          <small className="planet-texture-credit">Planet maps: <a href="https://www.solarsystemscope.com/textures/" target="_blank" rel="noopener noreferrer">Solar System Scope</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>. Artistic lighting and map projection.</small>
          <div className="scene-toolbar">
            <button type="button" className="primary" onClick={() => setTab('mini')}>Play Mini test</button>
            <button type="button" disabled>Start full level · PLANNED</button>
          </div>
          <small>GAME: concept route and interaction preview. Full platforming, per-planet physics and campaign progression remain PLANNED.</small>
        </article>
      </div>
    </>}
  </section>
}
