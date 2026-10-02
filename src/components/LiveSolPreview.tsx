import { useEffect, useState } from 'react'
import OracleModelPreview from './OracleModelPreview'
import { exportBlueprintGlb } from '../lib/blueprintExport'
import type { GenerationResult } from '../lib/blueprint'
import { saveBlueprintModel } from '../lib/studioArchive'

type Preview = { result: GenerationResult; prompt: string; url: string; error: string; archive?: 'saving' | 'saved' | 'failed'; archiveError?: string; retryArchive?: () => void }
export default function LiveSolPreview({ result, prompt }: { result: GenerationResult; prompt: string }) {
  const [preview, setPreview] = useState<Preview | null>(null)
  useEffect(() => {
    let closed = false, url = '', saving = false
    exportBlueprintGlb(result.blueprint).then(buffer => {
      const blob = new Blob([buffer], { type: 'model/gltf-binary' })
      let previewError = ''
      if (!closed) {
        try { url = URL.createObjectURL(blob) }
        catch { previewError = 'The GLB was exported, but this browser could not open its preview.' }
      }
      // The download, preview and archive share the same original emitted bytes.
      // Retrying storage never exports again or starts an AI/provider request.
      const save = async () => {
        if (saving) return
        saving = true
        const update = (archive: 'saving' | 'saved' | 'failed', archiveError = '') => {
          if (!closed) setPreview({ result, prompt, url, error: previewError, archive, archiveError, retryArchive: () => { if (!closed) void save() } })
        }
        update('saving')
        try { await saveBlueprintModel(result, prompt, blob); update('saved') }
        catch (error) { update('failed', error instanceof Error ? error.message : 'Device storage is unavailable.') }
        finally { saving = false }
      }
      // Navigation only releases the preview. A completed original must still
      // reach Game Lab when the user immediately leaves Shop for their world.
      void save()
    }).catch(() => {
      if (!closed) setPreview({ result, prompt, url: '', error: 'The AI specification is saved, but this browser could not export its GLB. No new AI request was sent.' })
    })
    return () => { closed = true; if (url) URL.revokeObjectURL(url) }
  }, [result, prompt])
  const current = preview?.result === result && preview.prompt === prompt ? preview : null
  const name = result.model === 'gpt-6-luna' ? 'LUNA' : result.model === 'gpt-6-astra' ? 'ASTRA' : 'SOL'
  return <div className="live-sol-preview" aria-label={`${name} generated blueprint preview`}>
    {current?.url ? <OracleModelPreview url={current.url} label={`${name} blueprint-derived 3D model`} customerMode />
      : <p role="status">{current?.error || `Building the 3D preview from the returned ${name} specification…`}</p>}
    <p><strong>LIVE {name} specification · procedural GAME geometry</strong></p>
    <p>{result.assetSpec?.summary || result.blueprint.title}</p>
    <dl><dt>Provider / model</dt><dd>OpenAI / {result.model}</dd><dt>Request</dt><dd>{result.requestId}</dd><dt>References sent</dt><dd>{result.delivery?.referenceCount ?? 'Not recorded for this historical result'}</dd><dt>Deliverable</dt><dd>Procedural specification; local GAME geometry. Not a detailed mesh.</dd><dt>Provider evidence</dt><dd>{result.evidence?.providerResponseId ?? 'Not recorded'}</dd></dl>
    <small>The preview and downloaded GLB use the same AI-returned objects, colors and placements. ASTRA here is a bounded single-call blueprint/spec path; this is not the separate detailed Oracle mesh workflow or a manufacturing-approved file.</small>
    {current?.url && <a className="native-shop-back" href={current.url} download={`WORLDIFACT-${name}-generated-blueprint.glb`}>Download procedural blueprint · GLB</a>}
    {current?.archive === 'saving' && <p role="status">Saving this procedural GLB to the device library for AI Game Lab…</p>}
    {current?.archive === 'saved' && <p role="status">Saved on this device · available in AI Game Lab. Keep a downloaded copy; this is not a cloud backup.</p>}
    {current?.archive === 'failed' && <div role="alert"><p>This GLB was not saved to the device library. {current.archiveError} Download it now or retry saving. No new AI request is needed.</p><button type="button" onClick={current.retryArchive}>Retry saving to device library</button></div>}
    <details><summary>Submitted description</summary><p>{prompt}</p></details>
  </div>
}
