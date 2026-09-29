import { useEffect, useState } from 'react'
import OracleModelPreview from './OracleModelPreview'
import { exportBlueprintGlb } from '../lib/blueprintExport'
import type { GenerationResult } from '../lib/blueprint'

type Preview = { result: GenerationResult; url: string; error: string }
export default function LiveSolPreview({ result, prompt }: { result: GenerationResult; prompt: string }) {
  const [preview, setPreview] = useState<Preview | null>(null)
  useEffect(() => {
    let closed = false, url = ''
    exportBlueprintGlb(result.blueprint).then(buffer => {
      if (closed) return
      url = URL.createObjectURL(new Blob([buffer], { type: 'model/gltf-binary' }))
      setPreview({ result, url, error: '' })
    }).catch(() => {
      if (!closed) setPreview({ result, url: '', error: 'The AI specification is saved, but this browser could not export its GLB. No new AI request was sent.' })
    })
    return () => { closed = true; if (url) URL.revokeObjectURL(url) }
  }, [result])
  const current = preview?.result === result ? preview : null
  const name = result.model === 'gpt-6-luna' ? 'LUNA' : 'SOL'
  return <div className="live-sol-preview" aria-label={`${name} generated blueprint preview`}>
    {current?.url ? <OracleModelPreview url={current.url} label={`${name} blueprint-derived 3D model`} customerMode />
      : <p role="status">{current?.error || `Building the 3D preview from the returned ${name} specification…`}</p>}
    <p><strong>LIVE {name} specification · procedural GAME geometry</strong></p>
    <p>{result.assetSpec?.summary || result.blueprint.title}</p>
    <small>The preview and downloaded GLB use the same AI-returned objects, colors and placements. This is not a detailed Oracle mesh or a manufacturing-approved file.</small>
    {current?.url && <a className="native-shop-back" href={current.url} download={`WORLDIFACT-${name}-generated-blueprint.glb`}>Download this {name} model · GLB</a>}
    <details><summary>Submitted description</summary><p>{prompt}</p></details>
  </div>
}
