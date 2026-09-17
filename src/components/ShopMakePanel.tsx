import { useMemo, useState } from 'react'
import { OBSERVED_BATCH_QUOTES, OBSERVED_QUOTES } from '../lib/manufacturing'
import './ShopMakePanel.css'

export const ISS_PRINT_PRESET = `Create an International Space Station collectible as a MAKE candidate for additive manufacturing, based on the provided historical NASA VTAD source geometry rather than inventing a new station configuration. Preserve the recognizable modules, truss and solar-array layout. Work in millimetres. Repair degenerate or loose fragments where safe, avoid zero-thickness surfaces, and keep connected solids or explicit assembly joints. The previous supplier review flagged thin-wall risk around the solar arrays: add structural backing or otherwise thicken fragile panel sheets and thin truss/strut features to the selected process target without erasing the recognizable ISS silhouette. For SLA-style screening use a 1.5 mm project wall target unless a stricter process/size target is supplied. Keep source provenance metadata. Do not call the output manufacturing-approved: report remaining open/non-manifold geometry, support/orientation needs, clearances and color-package limitations. Return an editable GLB with materials for review; MAKE remains VALIDATION REQUIRED until slicer and supplier engineering review pass.`

type Material = 'plastic' | 'metal' | 'wood' | 'stone'
type Process = '3d-print' | 'laser' | 'cnc'
type ColorMode = 'plain' | 'full-color'

const SIZES_CM = [5, 10, 15, 20] as const
const MATERIALS: readonly { id: Material; label: string }[] = [
  { id: 'plastic', label: 'Plastic' },
  { id: 'metal', label: 'Metal' },
  { id: 'wood', label: 'Wood' },
  { id: 'stone', label: 'Stone' },
]
const PROCESSES: readonly { id: Process; label: string }[] = [
  { id: '3d-print', label: '3D printer' },
  { id: 'laser', label: 'Laser' },
  { id: 'cnc', label: 'CNC' },
]

const observed = (needle: string) => OBSERVED_QUOTES.find(item => item.process.includes(needle))?.usd ?? null
const plainPlastic100 = observed('9600 Resin')
const colorPlastic100 = observed('Full Color Resin')
const metal100 = observed('316L steel')
const iss370 = OBSERVED_BATCH_QUOTES.find(item => item.model.startsWith('ISS'))

function modelledPrice(material: Material, process: Process, color: ColorMode, sizeCm: number) {
  if (process !== '3d-print') return null
  let base: number | null = null
  if (material === 'plastic') base = color === 'full-color' ? colorPlastic100 : plainPlastic100
  if (material === 'metal' && color === 'plain') base = metal100
  if (base === null) return null
  return base * Math.pow(sizeCm / 10, 3)
}

function money(value: number | null) {
  return value === null ? 'Quote required' : `~$${value.toFixed(2)}`
}

export default function ShopMakePanel({ onUseIssPreset, disabled = false }: { onUseIssPreset: () => void; disabled?: boolean }) {
  const [material, setMaterial] = useState<Material>('plastic')
  const [process, setProcess] = useState<Process>('3d-print')
  const [color, setColor] = useState<ColorMode>('plain')
  const [sizeCm, setSizeCm] = useState<(typeof SIZES_CM)[number]>(10)
  const offer = useMemo(() => modelledPrice(material, process, color, sizeCm), [material, process, color, sizeCm])
  const evidence = offer === null ? 'No verified calculator observation exists for this material/process combination yet.' : sizeCm === 10 ? '10 cm uses an observed calculator comparison for a different reviewed model.' : 'Modelled from the recorded 10 cm comparison using cubic solid-volume scaling; this is not a live supplier quote.'

  return <section className="shop-make" aria-labelledby="shop-make-title">
    <div className="shop-make-heading">
      <div><span className="eyebrow">MAKE · CUSTOMER PREVIEW</span><h2 id="shop-make-title">Choose how the object could be made.</h2></div>
      <span className="shop-make-status">VALIDATION REQUIRED</span>
    </div>
    <p>Existing manufacturing evidence is reused here without exposing contractor identities. Prices below are preliminary comparisons only; final geometry upload, engineering review, shipping and tax can change them.</p>

    <div className="shop-make-controls">
      <label>Material<select value={material} onChange={e => setMaterial(e.target.value as Material)}>{MATERIALS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      <label>Machine / process<select value={process} onChange={e => setProcess(e.target.value as Process)}>{PROCESSES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      <label>Finish<select value={color} onChange={e => setColor(e.target.value as ColorMode)}><option value="plain">Without full color</option><option value="full-color">Full color</option></select></label>
      <label>Largest size<select value={sizeCm} onChange={e => setSizeCm(Number(e.target.value) as (typeof SIZES_CM)[number])}>{SIZES_CM.map(size => <option key={size} value={size}>{size} cm</option>)}</select></label>
    </div>

    <article className="shop-promoted-offer">
      <span className="eyebrow">PROMOTED MATCH FOR THIS SELECTION</span>
      <strong>{money(offer)}</strong>
      <p>{material} · {process === '3d-print' ? '3D printer' : process.toUpperCase()} · {color === 'full-color' ? 'full color' : 'without full color'} · {sizeCm} cm</p>
      <small>{evidence} No manufacturer name is shown to the customer.</small>
    </article>

    <div className="shop-price-table" role="region" aria-label="Preliminary 3D printed plastic price comparison by size">
      <h3>3D-printed plastic · size comparison</h3>
      <table><thead><tr><th>Size</th><th>Without full color</th><th>Full color</th><th>Evidence</th></tr></thead><tbody>
        {SIZES_CM.map(size => <tr key={size}><td>{size} cm</td><td>{money(modelledPrice('plastic', '3d-print', 'plain', size))}</td><td>{money(modelledPrice('plastic', '3d-print', 'full-color', size))}</td><td>{size === 10 ? 'OBSERVED 100 mm comparison*' : 'ESTIMATE from 100 mm reference*'}</td></tr>)}
      </tbody></table>
      <small>*The recorded 100 mm observations were $2.72 for white SLA resin and $27.27 for WJP full-color resin on a legacy Queen model. Solid volume scales with size cubed, but supplier price does not necessarily do so; 5/15/20 cm values are modelling estimates, not binding quotes.</small>
    </div>

    <article className="iss-make-card">
      <div className="iss-mark" aria-hidden="true"><span /><i /><b /></div>
      <div>
        <span className="eyebrow">ISS · SOURCE-BASED MAKE CANDIDATE</span><h3>International Space Station · 5–20 cm</h3>
        <p><strong>Source geometry:</strong> historical NASA Visualization Technology Applications and Development (VTAD) configuration. The uploaded 3MF identifies FORGE print preparation and still says supplier engineering review / physical prototype are pending.</p>
        <p><strong>Thin-wall repair target:</strong> reinforce solar-array sheets and fragile truss/strut features; avoid zero-thickness surfaces; use process-specific wall, clearance, support and assembly checks.</p>
        <p><strong>Recorded evidence:</strong> the prior 370 mm full-color WJP calculator result was ${iss370?.totalUsd.toFixed(2) ?? '213.53'} and explicitly flagged thin walls. It is not a quote for the 5–20 cm variants.</p>
        <p><strong>Astra provenance:</strong> the uploaded files do not contain a verifiable Astra job receipt. An Astra-assisted print-prep label must appear only after a real job succeeds and its receipt is recorded.</p>
        <button type="button" disabled={disabled} onClick={onUseIssPreset}>Load ISS 3D-print preset into the generator</button>
      </div>
    </article>
  </section>
}
