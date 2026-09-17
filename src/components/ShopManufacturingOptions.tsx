import { useMemo, useState } from 'react'
import {
  CLIENT_MACHINES,
  CLIENT_MATERIALS,
  CLIENT_SIZES_MM,
  ISS_PRINT_PREP_PROMPT,
  ISS_SOURCE,
  clientOffer,
  scaledScreeningUsd,
  type ClientColor,
  type ClientMachine,
  type ClientMaterial,
} from '../lib/shopManufacturing'

type Props = {
  onPrepareIssDraft: (prompt: string) => void
}

export default function ShopManufacturingOptions({ onPrepareIssDraft }: Props) {
  const [material, setMaterial] = useState<ClientMaterial>('plastic')
  const [machine, setMachine] = useState<ClientMachine>('3d-print')
  const [color, setColor] = useState<ClientColor>('plain')
  const [sizeMm, setSizeMm] = useState<number>(100)
  const offer = useMemo(() => clientOffer(material, machine, color), [material, machine, color])
  const promotedUsd = scaledScreeningUsd(offer, sizeMm)

  return <section className="shop-make" aria-labelledby="shop-make-title">
    <div className="section-heading">
      <div><span className="eyebrow">MAKE · CLIENT OPTIONS</span><h2 id="shop-make-title">Choose material, machine and size</h2></div>
      <span className="pill">ESTIMATES · FINAL QUOTE REQUIRED</span>
    </div>
    <p>Connected contractor evidence is reused here without exposing contractor names. Choose a route and WORLDIFACT shows the best matching verified benchmark or clearly says that a fresh quote is required.</p>

    <div className="shop-make-controls">
      <label>Material<select value={material} onChange={e => setMaterial(e.target.value as ClientMaterial)}>{CLIENT_MATERIALS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      <label>Machine<select value={machine} onChange={e => setMachine(e.target.value as ClientMachine)}>{CLIENT_MACHINES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      <label>Finish<select value={color} onChange={e => setColor(e.target.value as ClientColor)}><option value="plain">Without color / material color</option><option value="color">Full color</option></select></label>
      <label>Largest dimension<select value={sizeMm} onChange={e => setSizeMm(Number(e.target.value))}>{CLIENT_SIZES_MM.map(size => <option key={size} value={size}>{size / 10} cm</option>)}</select></label>
    </div>

    <article className="shop-promoted-offer" aria-live="polite">
      <span className="eyebrow">PROMOTED MATCH FOR THIS SELECTION</span>
      <h3>{offer.label}</h3>
      <p className="shop-price">{promotedUsd === null ? 'Quote required' : `≈ $${promotedUsd.toFixed(2)} screening estimate`}</p>
      <small>{offer.evidence}</small><small>{offer.note}</small>
    </article>

    <div className="table-wrap"><table className="shop-price-grid">
      <thead><tr><th>Size</th><th>Without color</th><th>Full color</th></tr></thead>
      <tbody>{CLIENT_SIZES_MM.map(size => {
        const plain = scaledScreeningUsd(clientOffer('plastic', '3d-print', 'plain'), size)
        const full = scaledScreeningUsd(clientOffer('plastic', '3d-print', 'color'), size)
        return <tr key={size}><td>{size / 10} cm</td><td>≈ ${plain!.toFixed(2)}*</td><td>≈ ${full!.toFixed(2)}*</td></tr>
      })}</tbody>
    </table></div>
    <small>*Screening values scale the stored 100 mm benchmark by solid volume (size³). They are not live supplier quotes and can be wrong for hollowing, supports, fragile geometry, finishing, shipping, tax or minimum charges. Exact client price requires a fresh model-specific quote.</small>

    <article className="shop-iss-card">
      <div><span className="eyebrow">ISS · MAKE CANDIDATE</span><h3>{ISS_SOURCE.label}</h3></div>
      <p><b>{ISS_SOURCE.sourceStatus}</b> · project-provided OBJ/textures, full-color 3MF and paintable STL. Nominal source bounds: {ISS_SOURCE.nominalMm[0]} × {ISS_SOURCE.nominalMm[1].toFixed(1)} × {ISS_SOURCE.nominalMm[2].toFixed(1)} mm; STL: {ISS_SOURCE.triangles.toLocaleString('en-US')} triangles.</p>
      <p>{ISS_SOURCE.warning}</p>
      <p><b>Astra status:</b> {ISS_SOURCE.astraStatus}. A corrected revision must not be called print-ready until the actual generated file is checked. After a real Astra repair pass, label it “Original source + Astra-assisted print-prep revision · VALIDATION REQUIRED”.</p>
      <button type="button" onClick={() => onPrepareIssDraft(ISS_PRINT_PREP_PROMPT)}>Prepare ISS print-repair draft · no generation</button>
      <small>This only fills the STANDARD generator instructions. It does not spend credits, submit a contractor order or claim manufacturing approval.</small>
    </article>
  </section>
}
