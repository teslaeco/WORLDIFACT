import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import OracleModelPreview from './OracleModelPreview'
import { useAccount } from '../lib/account'
import { listStudioModels, readStudioModel, STUDIO_ARCHIVE_EVENT, STUDIO_ARCHIVE_SIGNAL_KEY, type StudioArchiveEntry } from '../lib/studioArchive'
import { getStudioLibraryModel, isStudioLibraryTemporaryError, isStudioLibraryId, listStudioLibrary, readStudioLibraryModel, StudioLibraryAccountError } from '../lib/studioLibrary'
import { formatStudioGenerationDuration, type StudioLibraryModel } from '../lib/studioProtocol'
import { inspectGLB } from '../lib/glb'
import { previewFileName } from '../lib/studioView'
import './StudioGallery.css'

type Props = { compact?: boolean; requestedModelId?: string }
type Row = { key: string; origin: 'account'; model: StudioLibraryModel } | { key: string; origin: 'device'; model: StudioArchiveEntry }
type CloudState = { owner: string; models: StudioLibraryModel[]; cursor: string | null; loading: boolean; error: string }
type CloudScope = { owner: string; controller: AbortController; page: AbortController | null; version: number; models: StudioLibraryModel[]; cursor: string | null; loading: boolean }
const emptyCloud = (owner = ''): CloudState => ({ owner, models: [], cursor: null, loading: false, error: '' })

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export default function StudioGallery({ compact = false, requestedModelId = '' }: Props) {
  const { user, loading: accountLoading, refresh: refreshAccount } = useAccount()
  const owner = !accountLoading ? user?.id || '' : ''
  const currentOwner = useRef(owner)
  currentOwner.current = owner
  const scope = useRef<CloudScope | null>(null)
  const previewUrl = useRef('')
  const previewRegion = useRef<HTMLDivElement>(null)
  const previewTrigger = useRef<HTMLButtonElement | null>(null)
  const returnPreviewFocus = useRef(false)
  const operation = useRef<{ owner: string; controller: AbortController } | null>(null)
  const refreshVersion = useRef({ value: 0 })
  const [entries, setEntries] = useState<StudioArchiveEntry[]>([])
  const [cloud, setCloud] = useState<CloudState>(emptyCloud)
  const [target, setTarget] = useState<{ owner: string; id: string; model?: StudioLibraryModel; error?: string } | null>(null)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<{ owner: string; row: Row; url: string; byteLength: number } | null>(null)
  const [activity, setActivity] = useState({ owner: '', busyId: '', error: '' })
  const [localError, setLocalError] = useState('')
  const [loading, setLoading] = useState(true)

  const invalidateAccount = useCallback((activeOwner: string, message: string) => {
    const active = scope.current
    if (!active || active.owner !== activeOwner || currentOwner.current !== activeOwner) return
    active.controller.abort(); active.page?.abort(); active.version++
    active.controller = new AbortController(); active.page = null
    active.models = []; active.cursor = null; active.loading = false
    operation.current?.controller.abort(); operation.current = null
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current)
    previewUrl.current = ''
    setSelected(null); setTarget(null)
    setActivity({ owner: activeOwner, busyId: '', error: '' })
    setCloud({ ...emptyCloud(activeOwner), error: message })
    void refreshAccount()
  }, [refreshAccount])

  const refreshLocal = useCallback(async () => {
    const version = ++refreshVersion.current.value
    setLoading(true)
    setLocalError('')
    try {
      const models = await listStudioModels()
      if (version === refreshVersion.current.value) setEntries(models)
    } catch (e) { if (version === refreshVersion.current.value) setLocalError(e instanceof Error ? e.message : 'Could not read the model gallery on this device.') }
    finally { if (version === refreshVersion.current.value) setLoading(false) }
  }, [])

  const loadAccountPage = useCallback(async (replace = false) => {
    const active = scope.current
    if (!active || active.owner !== currentOwner.current || active.controller.signal.aborted || (!replace && active.loading)) return
    active.page?.abort()
    const page = new AbortController(), version = ++active.version
    active.page = page; active.loading = true
    const valid = () => scope.current === active && currentOwner.current === active.owner && active.version === version && !page.signal.aborted && !active.controller.signal.aborted
    setCloud({ owner: active.owner, models: active.models, cursor: active.cursor, loading: true, error: '' })
    try {
      const result = await listStudioLibrary(active.owner, replace ? null : active.cursor, AbortSignal.any([active.controller.signal, page.signal]))
      if (!valid()) return
      const models = new Map((replace ? [] : active.models).map(model => [model.id, model]))
      for (const model of result.models) {
        const timing = model.generationTiming ?? active.models.find(entry => entry.id === model.id)?.generationTiming
        models.set(model.id, timing ? { ...model, generationTiming: timing } : model)
      }
      active.models = [...models.values()]
      active.cursor = result.nextCursor
      setCloud({ owner: active.owner, models: active.models, cursor: active.cursor, loading: false, error: '' })
    } catch (e) {
      if (valid()) {
        if (e instanceof StudioLibraryAccountError) invalidateAccount(active.owner, e.message)
        else setCloud({ owner: active.owner, models: active.models, cursor: active.cursor, loading: false,
          error: e instanceof Error ? e.message : 'Account models are temporarily unavailable. Device copies are still available.' })
      }
    } finally { if (valid()) active.loading = false }
  }, [invalidateAccount])

  useEffect(() => {
    const active: CloudScope | null = owner ? { owner, controller: new AbortController(), page: null, version: 0, models: [], cursor: null, loading: false } : null
    scope.current = active
    setCloud(emptyCloud(owner))
    setSelected(null)
    setActivity({ owner, busyId: '', error: '' })
    if (active) void loadAccountPage(true)
    return () => {
      active?.controller.abort()
      active?.page?.abort()
      if (scope.current === active) scope.current = null
      operation.current?.controller.abort()
      operation.current = null
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current)
      previewUrl.current = ''
    }
  }, [owner, loadAccountPage])

  useEffect(() => {
    setTarget(null)
    if (!owner || !requestedModelId) return
    if (!isStudioLibraryId(requestedModelId)) {
      setTarget({ owner, id: requestedModelId, error: 'This account model link is invalid.' })
      return
    }
    const controller = new AbortController()
    const signal = scope.current?.owner === owner ? AbortSignal.any([controller.signal, scope.current.controller.signal]) : controller.signal
    void getStudioLibraryModel(owner, requestedModelId, signal).then(model => {
      if (!signal.aborted && currentOwner.current === owner) setTarget({ owner, id: requestedModelId, model })
    }).catch(e => {
      if (!signal.aborted && currentOwner.current === owner) {
        if (e instanceof StudioLibraryAccountError) invalidateAccount(owner, e.message)
        else setTarget({ owner, id: requestedModelId, error: e instanceof Error ? e.message : 'This account model is unavailable.' })
      }
    })
    return () => controller.abort()
  }, [owner, requestedModelId, invalidateAccount])

  useEffect(() => {
    const refreshState = refreshVersion.current
    const update = () => { void refreshLocal(); void loadAccountPage(true) }
    const storage = (event: StorageEvent) => { if (event.key === STUDIO_ARCHIVE_SIGNAL_KEY) update() }
    void refreshLocal()
    window.addEventListener(STUDIO_ARCHIVE_EVENT, update)
    window.addEventListener('storage', storage)
    return () => {
      refreshState.value++
      window.removeEventListener(STUDIO_ARCHIVE_EVENT, update)
      window.removeEventListener('storage', storage)
    }
  }, [refreshLocal, loadAccountPage])

  const accountModels = useMemo(() => {
    const models = new Map((owner && cloud.owner === owner ? cloud.models : []).map(model => [model.id, model]))
    if (owner && target?.owner === owner && target.id === requestedModelId && target.model) models.set(target.model.id, target.model)
    return [...models.values()].sort((a, b) => Number(b.id === requestedModelId) - Number(a.id === requestedModelId) || b.completedAt.localeCompare(a.completedAt) || a.id.localeCompare(b.id))
  }, [owner, cloud, target, requestedModelId])
  const rows = useMemo<Row[]>(() => [
    ...accountModels.map(model => ({ key: `account:${owner}:${model.id}`, origin: 'account' as const, model })),
    ...entries.map(model => ({ key: `device:${model.id}`, origin: 'device' as const, model })),
  ], [owner, accountModels, entries])
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const items = needle ? rows.filter(item => item.model.prompt.toLowerCase().includes(needle)) : rows
    return compact ? items.slice(0, 6) : items
  }, [rows, query, compact])
  const cloudVisible = !!owner && cloud.owner === owner
  const busyId = activity.owner === owner ? activity.busyId : ''
  const currentSelection = selected?.owner === owner ? selected : null
  const error = [localError, cloudVisible ? cloud.error : '', activity.owner === owner ? activity.error : '',
    owner && target?.owner === owner && target.id === requestedModelId ? target.error : ''].filter(Boolean).join(' ')

  const selectedPreviewUrl = currentSelection?.url
  useEffect(() => {
    if (selectedPreviewUrl) {
      previewRegion.current?.focus({ preventScroll: true })
      previewRegion.current?.scrollIntoView({ block: 'start', behavior: 'instant' })
    } else if (returnPreviewFocus.current) {
      returnPreviewFocus.current = false
      previewTrigger.current?.focus()
    }
  }, [selectedPreviewUrl])

  function closePreview() {
    operation.current?.controller.abort()
    operation.current = null
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current)
    previewUrl.current = ''
    returnPreviewFocus.current = true
    setSelected(null)
    setActivity({ owner, busyId: '', error: '' })
  }

  async function open(item: Row, download: boolean, trigger?: HTMLButtonElement) {
    const activeOwner = owner
    if (currentOwner.current !== activeOwner || (item.origin === 'account' && !activeOwner)) return
    if (!download) previewTrigger.current = trigger ?? null
    operation.current?.controller.abort()
    const active = { owner: activeOwner, controller: new AbortController() }
    operation.current = active
    const valid = () => operation.current === active && currentOwner.current === activeOwner && !active.controller.signal.aborted
    setActivity({ owner: activeOwner, busyId: item.key, error: '' })
    try {
      let selectedItem = item
      if (item.origin === 'account') {
        // Detail is requested only for this explicitly opened model. Listing
        // the library never fans out into historical worker status reads.
        try {
          const model = await getStudioLibraryModel(activeOwner, item.model.id, active.controller.signal)
          if (!valid()) return
          selectedItem = { ...item, model }
          const account = scope.current
          if (account?.owner === activeOwner) {
            account.models = account.models.map(entry => entry.id === model.id ? model : entry)
            setCloud(previous => previous.owner === activeOwner ? { ...previous, models: account.models } : previous)
          }
          setTarget(previous => previous?.owner === activeOwner && previous.id === model.id ? { ...previous, model } : previous)
        } catch (e) {
          if (!valid()) return
          if (e instanceof StudioLibraryAccountError) {
            invalidateAccount(activeOwner, e instanceof Error ? e.message : 'Sign in again to open your account models.')
            return
          }
          if (!isStudioLibraryTemporaryError(e)) throw e
          // Optional timing cannot disable a valid saved file. This receipt's
          // ownership/expiry is still checked by the existing artifact GET.
        }
      }
      const blob = selectedItem.origin === 'account'
        ? await readStudioLibraryModel(activeOwner, selectedItem.model, active.controller.signal)
        : await readStudioModel(selectedItem.model.id)
      if (!valid()) return
      const data = await blob.arrayBuffer()
      if (!valid()) return
      inspectGLB(data)
      if (download) downloadBlob(blob, previewFileName({ id: item.model.id, origin: 'archive', label: item.model.prompt }))
      else {
        if (previewUrl.current) URL.revokeObjectURL(previewUrl.current)
        const url = URL.createObjectURL(blob)
        previewUrl.current = url
        setSelected({ owner: activeOwner, row: selectedItem, url, byteLength: blob.size })
      }
    } catch (e) {
      if (valid()) {
        if (e instanceof StudioLibraryAccountError) invalidateAccount(activeOwner, e.message)
        else setActivity({ owner: activeOwner, busyId: '', error: e instanceof Error ? e.message : 'This model could not be opened.' })
      }
    } finally {
      if (valid()) {
        operation.current = null
        setActivity(previous => ({ ...previous, busyId: '' }))
      }
    }
  }

  return <section className={`studio-gallery ${compact ? 'studio-gallery-compact' : ''}`} aria-labelledby="studio-gallery-title">
    <div className="studio-gallery-heading">
      <div>
        <span className="studio-gallery-eyebrow">MY 3D MODELS</span>
        <h2 id="studio-gallery-title">Your model gallery</h2>
        <p>Completed Studio models on your account appear across devices. Device copies, including procedural blueprint models, stay in this browser. The device archive is not a cloud backup; keep your own file copies.</p>
      </div>
      <div className="studio-gallery-heading-actions">
        <button type="button" disabled={loading || (cloudVisible && cloud.loading)} onClick={() => { void refreshLocal(); void loadAccountPage(true) }}>{loading || (cloudVisible && cloud.loading) ? 'Refreshing…' : 'Refresh'}</button>
        {compact && <Link to="/account/models">Open full gallery →</Link>}
      </div>
    </div>

    {currentSelection && <div className="studio-gallery-preview" ref={previewRegion} tabIndex={-1} role="region" aria-label="Selected model preview">
      <div className="studio-gallery-preview-copy">
        <strong>{currentSelection.row.model.prompt}</strong>
        <small>Recorded worker generation time: {formatStudioGenerationDuration(currentSelection.row.origin === 'account' ? currentSelection.row.model.generationTiming : undefined)} · Excludes upload and queue time.</small>
        <small>{(currentSelection.byteLength / 1048576).toFixed(1)} MB · GLB · UNREVIEWED · {currentSelection.row.origin === 'account' ? 'Account model' : 'Device copy'}</small>
      </div>
      <div className="studio-gallery-actions">
        <button type="button" disabled={!!busyId} onClick={() => void open(currentSelection.row, true)}>Download original GLB</button>
        <button type="button" onClick={closePreview}>Close preview</button>
      </div>
      <OracleModelPreview url={currentSelection.url} label={currentSelection.row.model.prompt} customerMode />
    </div>}

    <label className="studio-gallery-search">Find a saved model
      <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search descriptions" />
    </label>

    {error && <p className="studio-gallery-error" role="alert">{error}</p>}
    {!owner && <p>Sign in to see completed Studio models on your account. Device copies below have no verified account ownership.</p>}
    {cloudVisible && cloud.loading && <p role="status">Loading account model records…</p>}
    {!loading && !(cloudVisible && cloud.loading) && !error && rows.length === 0 && <p className="studio-gallery-empty">No completed models were found here yet. Completed Studio models appear on your account automatically. Local Studio and procedural blueprint files saved in this browser also appear here.</p>}
    {!loading && rows.length > 0 && filtered.length === 0 && <p className="studio-gallery-empty">No saved models match this search.</p>}

    <div className="studio-gallery-grid">
      {filtered.map(item => <article key={item.key} aria-label={item.origin === 'account' && item.model.id === requestedModelId ? 'Requested account model' : undefined}>
        <strong>{item.model.prompt}</strong>
        <small>{item.origin === 'account' ? 'Account model · Studio · UNREVIEWED' : item.model.source === 'blueprint' ? `Device copy · Procedural blueprint · ${item.model.generation.model} · UNREVIEWED` : 'Device copy · Studio · UNREVIEWED'}</small>
        {item.origin === 'account' ? <>
          {item.model.id === requestedModelId && <small>Requested model</small>}
          <small>Completed: {new Date(item.model.completedAt).toLocaleString()} · GLB fetched when opened</small>
          <small>Recorded worker generation time: {formatStudioGenerationDuration(item.model.generationTiming)}{!item.model.generationTiming && ' · Open this model to check its recorded duration.'}</small>
          {!item.model.downloadAllowed && <small>This model is preserved on your account. Eligible account access is required to open its cloud file.</small>}
        </> : <>
          <small>{new Date(item.model.savedAt).toLocaleString()} · {(item.model.byteLength / 1048576).toFixed(1)} MB</small>
          <small>Recorded worker generation time: {formatStudioGenerationDuration()}.</small>
          <small>Stored only in this browser; account ownership is unverified.</small>
        </>}
        <div className="studio-gallery-actions">
          <button type="button" disabled={!!busyId} onClick={event => void open(item, false, event.currentTarget)}>{busyId === item.key ? 'Opening…' : 'Preview 3D'}</button>
          <button type="button" disabled={!!busyId} onClick={() => void open(item, true)}>Download GLB</button>
        </div>
      </article>)}
    </div>
    {cloudVisible && cloud.cursor && !compact && <button type="button" disabled={cloud.loading} onClick={() => void loadAccountPage()}>{cloud.loading ? 'Loading…' : 'Load more account models'}</button>}
  </section>
}
