import { useEffect, useRef, useState } from 'react'
import OracleModelPreview from './OracleModelPreview'
import { PUBLIC_MODELS, PUBLIC_FAVORITE_PREFIX, readPublicHearts, readPublicModel, writePublicHeart, type PublicModel } from '../lib/publicGallery'
import './PublicModelGallery.css'

function PublicModelCard({ model, hearted, onHeart }: { model: PublicModel; hearted: boolean; onHeart: () => void }) {
  const host = useRef<HTMLElement>(null)
  const [visible, setVisible] = useState(false)
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!host.current || typeof IntersectionObserver === 'undefined') { setVisible(true); return }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect() }
    }, { rootMargin: '160px' })
    observer.observe(host.current)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (!visible) return
    const controller = new AbortController()
    let objectUrl = ''
    void readPublicModel(model, controller.signal).then(blob => {
      if (controller.signal.aborted) return
      objectUrl = URL.createObjectURL(blob)
      setUrl(objectUrl)
    }).catch(cause => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'The public model could not be loaded.')
    })
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [model, visible, attempt])
  return <article ref={host} className={`public-model-card public-model-${model.id}`}>
    <div className="public-model-card-top"><span>{model.category}</span><button type="button" className={`public-model-heart${hearted ? ' is-hearted' : ''}`} aria-pressed={hearted} aria-label={`${hearted ? 'Remove' : 'Save'} ${model.name} ${hearted ? 'from' : 'to'} my hearts`} onClick={onHeart}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 4.8a5.4 5.4 0 0 0-7.6 0L12 5.7l-.9-.9a5.4 5.4 0 0 0-7.6 7.6L12 21l8.5-8.6a5.4 5.4 0 0 0 0-7.6Z" /></svg>
    </button></div>
    <div className="public-model-stage">
      {url ? <OracleModelPreview url={url} label={model.name} customerMode /> : <div className="public-model-loading" role={error ? 'alert' : 'status'}><span aria-hidden="true">◇</span><p>{error || 'Loading the real 3D model…'}</p>{error && <button type="button" onClick={() => { setError(''); setUrl(''); setAttempt(value => value + 1) }}>Try again</button>}</div>}
    </div>
    <div className="public-model-caption"><div><h3>{model.name}</h3><p>{model.description}</p></div><span className="public-model-format">3D · GLB</span></div>
    <small>{model.detail}</small>
  </article>
}

export default function PublicModelGallery() {
  const [hearts, setHearts] = useState<string[]>([])
  const currentHearts = useRef<string[]>([])
  const unsavedHearts = useRef(new Map<string, boolean>())
  const [persistent, setPersistent] = useState(true)
  const [message, setMessage] = useState('')
  const [onlyHearts, setOnlyHearts] = useState(false)
  useEffect(() => {
    const load = () => {
      try {
        const saved = new Set(readPublicHearts(window.localStorage))
        for (const [id, wanted] of unsavedHearts.current) {
          if (saved.has(id) === wanted) unsavedHearts.current.delete(id)
          if (wanted) saved.add(id); else saved.delete(id)
        }
        const next = [...saved]; currentHearts.current = next; setHearts(next); setPersistent(unsavedHearts.current.size === 0)
      }
      catch { setPersistent(false) }
    }
    load()
    const sync = (event: StorageEvent) => { if (event.key === null || event.key.startsWith(PUBLIC_FAVORITE_PREFIX)) load() }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])
  const toggle = (model: PublicModel) => {
    const wanted = !currentHearts.current.includes(model.id)
    const next = wanted ? [...currentHearts.current, model.id] : currentHearts.current.filter(id => id !== model.id)
    currentHearts.current = next; setHearts(next)
    try { writePublicHeart(window.localStorage, model.id, wanted); unsavedHearts.current.delete(model.id) }
    catch { unsavedHearts.current.set(model.id, wanted) }
    setPersistent(unsavedHearts.current.size === 0)
    setMessage(`${model.name} ${wanted ? 'added to' : 'removed from'} your hearts.`)
  }
  const shown = PUBLIC_MODELS.filter(model => !onlyHearts || hearts.includes(model.id))
  return <section className="public-model-gallery" aria-labelledby="public-model-gallery-title">
    <header className="public-model-gallery-heading"><div><span className="public-model-eyebrow">EXPLORE IN 3D</span><h2 id="public-model-gallery-title">Made in WORLDIFACT.</h2><p>A few of our public creations. Find your next spark.</p></div><div className="public-model-filters" role="group" aria-label="Filter public models"><button type="button" aria-pressed={!onlyHearts} onClick={() => setOnlyHearts(false)}>All models</button><button type="button" aria-pressed={onlyHearts} onClick={() => setOnlyHearts(true)}>My hearts{hearts.length ? ` · ${hearts.length}` : ''}</button></div></header>
    <div className="public-model-grid">{shown.map(model => <PublicModelCard key={model.id} model={model} hearted={hearts.includes(model.id)} onHeart={() => toggle(model)} />)}</div>
    {shown.length === 0 && <p className="public-model-empty">Nothing saved yet. Tap a heart on a model you like.</p>}
    <p className="public-model-footnote">{persistent ? 'Hearts are saved in this browser only; they are not account likes or public popularity counts.' : 'Some hearts could not be saved. They may last only in this open page.'} Public examples are unreviewed GAME assets, not manufacturing-approved products.</p>
    <p className="shop-visually-hidden" role="status" aria-live="polite">{message}</p>
  </section>
}
