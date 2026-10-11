import { useEffect, useRef, useState } from 'react'
import { readStudioModel, type StudioArchiveEntry } from '../lib/studioArchive'
import { readStudioLibraryModel, StudioLibraryAccountError } from '../lib/studioLibrary'
import type { StudioLibraryModel } from '../lib/studioProtocol'
import { enqueueThumbnail, THUMBNAIL_MAX_BYTES } from '../lib/studioThumbnail'

type Props = {
  owner: string; source: { origin: 'account'; model: StudioLibraryModel } | { origin: 'device'; model: StudioArchiveEntry }
  accountSignal?: AbortSignal; onAccountError: (owner: string, message: string) => void
}
export default function StudioModelThumbnail({ owner, source, accountSignal, onAccountError }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const [url, setUrl] = useState(''), [state, setState] = useState('Preview on scroll')
  const modelRef = useRef(source); modelRef.current = source
  const { origin, model: { id } } = source
  useEffect(() => {
    const controller = new AbortController()
    const signal = accountSignal ? AbortSignal.any([controller.signal, accountSignal]) : controller.signal
    let objectUrl = '', started = false
    setUrl(''); setState('Preview on scroll')
    const load = () => {
      if (started || signal.aborted) return
      const current = modelRef.current
      if (current.origin === 'account' && (!owner || !current.model.downloadAllowed)) { setState('Open model to check access'); return }
      started = true; setState('Loading preview…')
      void enqueueThumbnail(signal, async () => {
        const blob = current.origin === 'account'
          ? await readStudioLibraryModel(owner, current.model, signal, undefined, THUMBNAIL_MAX_BYTES)
          : await readStudioModel(current.model.id)
        signal.throwIfAborted()
        if (blob.size > THUMBNAIL_MAX_BYTES) throw new Error('Use the full preview for this model')
        const { modelThumbnail } = await import('../lib/modelThumbnail')
        signal.throwIfAborted()
        const snapshot = await modelThumbnail(blob, signal)
        signal.throwIfAborted()
        objectUrl = URL.createObjectURL(snapshot); setUrl(objectUrl); setState('')
      }).catch(error => {
        if (signal.aborted) return
        if (error instanceof StudioLibraryAccountError) onAccountError(owner, error.message)
        else setState('Use Preview 3D')
      })
    }
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { observer?.disconnect(); load() }
    }, { rootMargin: '80px' })
    if (observer && host.current) observer.observe(host.current)
    else load()
    return () => { controller.abort(); observer?.disconnect(); if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [owner, origin, id, accountSignal, onAccountError])
  return <div ref={host} className="studio-model-thumbnail">
    {url ? <img src={url} alt={`Model thumbnail: ${source.model.prompt}`} /> : <span role="status">{state}</span>}
    {url && <small>Simplified preview</small>}
  </div>
}
