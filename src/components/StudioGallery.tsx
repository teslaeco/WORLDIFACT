import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import OracleModelPreview from './OracleModelPreview'
import { listStudioModels, readStudioModel, type StudioArchiveEntry } from '../lib/studioArchive'
import { inspectGLB } from '../lib/glb'
import './StudioGallery.css'

type Props = { compact?: boolean }

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export default function StudioGallery({ compact = false }: Props) {
  const previewUrl = useRef('')
  const [entries, setEntries] = useState<StudioArchiveEntry[]>([])
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<StudioArchiveEntry | null>(null)
  const [url, setUrl] = useState('')
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try { setEntries(await listStudioModels()) }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not read the model gallery on this device.') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    void refresh()
    return () => {
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current)
    }
  }, [refresh])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const items = needle ? entries.filter(item => item.prompt.toLowerCase().includes(needle)) : entries
    return compact ? items.slice(0, 6) : items
  }, [entries, query, compact])

  async function preview(item: StudioArchiveEntry) {
    setBusyId(item.id)
    setError('')
    try {
      const blob = await readStudioModel(item.id)
      inspectGLB(await blob.arrayBuffer())
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current)
      const next = URL.createObjectURL(blob)
      previewUrl.current = next
      setSelected(item)
      setUrl(next)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'This saved GLB could not be previewed.')
    } finally { setBusyId('') }
  }

  async function download(item: StudioArchiveEntry) {
    setBusyId(item.id)
    setError('')
    try {
      const blob = await readStudioModel(item.id)
      inspectGLB(await blob.arrayBuffer())
      downloadBlob(blob, `WORLDIFACT-${item.id}.glb`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'This saved GLB could not be downloaded.')
    } finally { setBusyId('') }
  }

  return <section className={`studio-gallery ${compact ? 'studio-gallery-compact' : ''}`} aria-labelledby="studio-gallery-title">
    <div className="studio-gallery-heading">
      <div>
        <span className="studio-gallery-eyebrow">MY 3D MODELS</span>
        <h2 id="studio-gallery-title">Your model gallery</h2>
        <p>Preview or download completed GLB models saved in this browser. This is a device archive, not a cloud backup; keep your own file copies.</p>
      </div>
      <div className="studio-gallery-heading-actions">
        <button type="button" disabled={loading} onClick={() => void refresh()}>{loading ? 'Refreshing…' : 'Refresh'}</button>
        {compact && <Link to="/account/models">Open full gallery →</Link>}
      </div>
    </div>

    {selected && url && <div className="studio-gallery-preview">
      <div className="studio-gallery-preview-copy">
        <strong>{selected.prompt}</strong>
        <small>{(selected.byteLength / 1048576).toFixed(1)} MB · GLB · UNREVIEWED</small>
      </div>
      <OracleModelPreview url={url} label={selected.prompt} customerMode />
    </div>}

    <label className="studio-gallery-search">Find a saved model
      <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search descriptions" />
    </label>

    {error && <p className="studio-gallery-error" role="alert">{error}</p>}
    {!loading && entries.length === 0 && <p className="studio-gallery-empty">No completed models are saved in this browser yet. Open a finished SLOW result in AI Shop and it will be added here automatically.</p>}
    {!loading && entries.length > 0 && filtered.length === 0 && <p className="studio-gallery-empty">No saved models match this search.</p>}

    <div className="studio-gallery-grid">
      {filtered.map(item => <article key={item.id}>
        <strong>{item.prompt}</strong>
        <small>{new Date(item.savedAt).toLocaleString()} · {(item.byteLength / 1048576).toFixed(1)} MB</small>
        <div className="studio-gallery-actions">
          <button type="button" disabled={!!busyId} onClick={() => void preview(item)}>{busyId === item.id ? 'Opening…' : 'Preview 3D'}</button>
          <button type="button" disabled={!!busyId} onClick={() => void download(item)}>Download GLB</button>
        </div>
      </article>)}
    </div>
  </section>
}
