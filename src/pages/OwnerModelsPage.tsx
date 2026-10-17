import { useEffect, useState } from 'react'
import OracleModelPreview from '../components/OracleModelPreview'
import { OWNER_MODELS, readOwnerModel, type OwnerModel } from '../lib/ownerShowcase'
import './OwnerModelsPage.css'

function ModelSession({ model }: { model: OwnerModel }) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    let objectUrl = ''
    void readOwnerModel(model, controller.signal).then(blob => {
      if (controller.signal.aborted) return
      objectUrl = URL.createObjectURL(blob)
      setUrl(objectUrl)
    }).catch(cause => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'The model could not be loaded.')
    })
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [model, attempt])
  return <>
    <div className="owner-model-stage">
      {url ? <OracleModelPreview url={url} label={model.name} customerMode /> : <div className="owner-model-loading" role={error ? 'alert' : 'status'}>
        <span aria-hidden="true">◇</span><p>{error || `Loading ${model.name} · ${(model.bytes / 1_000_000).toFixed(1)} MB…`}</p>
        {error && <button onClick={() => { setError(''); setAttempt(value => value + 1) }}>Retry download</button>}
      </div>}
    </div>
    <div className="owner-model-download"><span>{model.triangles.toLocaleString('en-US')} triangles · embedded textures</span>{url && <a href={url} download={`${model.id}.glb`}>Download this GLB ↓</a>}</div>
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
    <div className="owner-showcase-intro"><span className="owner-eyebrow">TWO REAL 3D RESULTS</span><h1>Explore every angle.</h1><p>Rotate the saved models, inspect their surfaces, and download the same textured files.</p></div>
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
