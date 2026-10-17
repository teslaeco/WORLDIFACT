import { useEffect, useState } from 'react'
import OracleModelPreview from '../components/OracleModelPreview'
import { OWNER_MODELS, readOwnerModel, type OwnerModel } from '../lib/ownerShowcase'
import './OwnerModelsPage.css'

const SAVED_VIEWS = [
  { id: 'three_quarter', label: 'Whole model · 30°' },
  { id: 'front', label: 'Front' },
  { id: 'side', label: 'Side' },
  { id: 'back', label: 'Back' },
] as const

function SavedModelViews({ model }: { model: OwnerModel }) {
  const [view, setView] = useState<(typeof SAVED_VIEWS)[number]>(SAVED_VIEWS[0])
  return <div className="owner-saved-renders">
    <img className="owner-render-image" src={`/owner-model-renders/${model.id}-${view.id}.jpg`} alt={`${model.name} — ${view.label} — actual saved model render`} width="768" height="960" />
    <div className="scene-toolbar" aria-label="Saved model render views">{SAVED_VIEWS.map(item => <button key={item.id} aria-pressed={item.id === view.id} onClick={() => setView(item)}>{item.label}</button>)}</div>
    <p className="result-note">Saved render · {view.label} · The downloaded GLB retains its full geometry and textures.</p>
  </div>
}

function ModelSession({ model }: { model: OwnerModel }) {
  const [load3d, setLoad3d] = useState(false)
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!load3d) return
    const controller = new AbortController()
    let objectUrl = ''
    setError('')
    setUrl('')
    void readOwnerModel(model, controller.signal).then(blob => {
      if (controller.signal.aborted) return
      objectUrl = URL.createObjectURL(blob)
      setUrl(objectUrl)
    }).catch(cause => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'The model could not be loaded.')
    })
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [model, attempt, load3d])
  return <>
    <div className="owner-model-stage">
      {!load3d ? <SavedModelViews model={model} /> :
        url ? <OracleModelPreview url={url} label={model.name} customerMode renderedFallback={<SavedModelViews model={model} />} /> :
          <div className="owner-model-loading" role={error ? 'alert' : 'status'}>
            <span aria-hidden="true">◇</span>
            <p>{error || `Loading interactive 3D · ${(model.bytes / 1_000_000).toFixed(1)} MB…`}</p>
            {error && <button type="button" onClick={() => { setError(''); setAttempt(value => value + 1) }}>Retry 3D</button>}
            <button type="button" onClick={() => setLoad3d(false)}>Return to instant views</button>
          </div>}
    </div>
    <div className="owner-model-download">
      <span>{model.triangles.toLocaleString('en-US')} triangles · embedded textures</span>
      <div className="owner-model-actions">
        <button type="button" onClick={() => setLoad3d(value => !value)}>{load3d ? 'Show instant renders' : 'Load interactive 3D (18 MB)'}</button>
        <a href={`/owner-models/${model.id}.glb`} download={`${model.id}.glb`}>Download GLB ↓</a>
      </div>
    </div>
  </>
}

export default function OwnerModelsPage() {
  const [selected, setSelected] = useState<OwnerModel>(() => OWNER_MODELS.find(model => `#${model.id}` === window.location.hash) ?? OWNER_MODELS[0])
  useEffect(() => {
    const change = () => setSelected(OWNER_MODELS.find(model => `#${model.id}` === window.location.hash) ?? OWNER_MODELS[0])
    window.addEventListener('hashchange', change)
    return () => window.removeEventListener('hashchange', change)
  }, [])
  return <main className="owner-showcase">
    <header className="owner-showcase-nav"><a href="/world" className="owner-brand">WORLDIFACT<span>CREATION STUDIES</span></a><a href="/shop">Open AI Shop ↗</a></header>
    <div className="owner-showcase-intro"><span className="owner-eyebrow">TWO REAL 3D RESULTS</span><h1>Explore every angle.</h1><p>Explore the models in interactive 3D or saved rendered views, and download the same textured files.</p></div>
    <div className="owner-showcase-layout">
      <aside><nav className="owner-model-choice" aria-label="Choose a 3D model">{OWNER_MODELS.map((model, index) => <a key={model.id} href={`#${model.id}`} aria-current={selected.id === model.id ? 'true' : undefined}><span>0{index + 1} / {model.category}</span><strong>{model.name}</strong><small>{model.status}</small></a>)}</nav>
        <section className="owner-model-info" aria-labelledby="selected-model-title"><span className="owner-model-status">{selected.status}</span><h2 id="selected-model-title">{selected.name}</h2><p>{selected.description}</p><p className="owner-model-limit">{selected.limitation}</p></section>
      </aside>
      <section className="owner-model-panel" aria-label={`${selected.name} interactive 3D viewer`}><ModelSession key={selected.id} model={selected} /></section>
    </div>
    <details className="owner-model-notes"><summary>About these results and their level of detail</summary><p>Each model came from one image-conditioned TRELLIS.2 reconstruction. The export reduced a roughly seven-million-triangle mesh to a target of 200,000 triangles. The visible copies contain 186,328 and 193,638 triangles. A UV correction restored texture alignment without changing geometry or image pixels.</p><p>Halloween did not reconstruct the whole room. Missing geometry was already a reconstruction problem; increasing the polygon count alone will not restore it. These are unreviewed working models, without manufacturing approval. Opening, switching or downloading them starts no AI generation.</p></details>
    <footer>WORLDIFACT · Working copies · October 2026</footer>
  </main>
}
