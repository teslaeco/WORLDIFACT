import { useMemo, useState } from 'react'
import {
  CLIENT_MACHINES,
  CLIENT_MATERIALS,
  CLIENT_SIZES_MM,
  ISS_PRINT_PREP_PROMPT,
  customerPriceForSelection,
  largestDimensionMm,
  optionalDimensions,
  sanitizeDimensions,
  type ClientColor,
  type ClientDimensions,
  type ClientMachine,
  type ClientMaterial,
} from '../lib/shopManufacturing'

type Props = {
  dimensions: ClientDimensions
  dimensionsEnabled: boolean
  hasGeneratedModel: boolean
  onDimensionsChange: (next: ClientDimensions) => void
  onDimensionsEnabledChange: (enabled: boolean) => void
  onPrepareIssDraft: (prompt: string) => void
}

type CartLine = {
  id: string
  material: ClientMaterial
  machine: ClientMachine
  color: ClientColor
  dimensions: ClientDimensions | null
}

export default function ShopManufacturingOptions({ dimensions, dimensionsEnabled, hasGeneratedModel, onDimensionsChange, onDimensionsEnabledChange, onPrepareIssDraft }: Props) {
  const [material, setMaterial] = useState<ClientMaterial>('plastic')
  const [machine, setMachine] = useState<ClientMachine>('3d-print')
  const [color, setColor] = useState<ClientColor>('plain')
  const [cart, setCart] = useState<CartLine[]>([])
  const [riskAccepted, setRiskAccepted] = useState(false)
  const [deliveryAccepted, setDeliveryAccepted] = useState(false)
  const selectedDimensions = useMemo(() => optionalDimensions(dimensionsEnabled, dimensions), [dimensionsEnabled, dimensions])
  const price = useMemo(() => customerPriceForSelection(material, machine, color, selectedDimensions), [material, machine, color, selectedDimensions])
  const largest = dimensionsEnabled ? largestDimensionMm(dimensions) : 0

  const setAxis = (axis: keyof ClientDimensions, raw: number) => {
    onDimensionsChange(sanitizeDimensions({ ...dimensions, [axis]: raw }))
  }
  const setLargest = (nextLargest: number) => {
    const current = sanitizeDimensions(dimensions)
    const currentLargest = largestDimensionMm(current)
    const factor = currentLargest > 0 ? nextLargest / currentLargest : 1
    onDimensionsChange(sanitizeDimensions({ xMm: current.xMm * factor, yMm: current.yMm * factor, zMm: current.zMm * factor }))
  }
  const addToCart = () => {
    if (!hasGeneratedModel) return
    setCart([{ id: 'custom-model', material, machine, color, dimensions: optionalDimensions(dimensionsEnabled, dimensions) }])
  }
  const checkoutReady = price.orderable && cart.length > 0 && riskAccepted && deliveryAccepted

  return <section className="shop-make shop-customer-purchase" aria-labelledby="shop-make-title">
    <div className="section-heading">
      <div><span className="eyebrow">CUSTOMIZE & ORDER</span><h2 id="shop-make-title">Choose how your model should be made</h2></div>
      <span className="pill">EXPERIMENTAL BETA</span>
    </div>
    <p>Generation follows your account allowance and credit plan. Manufacturing is priced only after a real production partner checks the exact file, dimensions, material and finish. WORLDIFACT does not show guessed prices.</p>

    <label className="shop-consent shop-size-toggle"><input type="checkbox" checked={dimensionsEnabled} onChange={e => onDimensionsEnabledChange(e.target.checked)} /> Specify model dimensions (optional)</label>
    <small>Leave this unchecked to keep the generated model's own proportions. Turn it on only when you want a specific physical target size.</small>

    <div className="shop-make-controls">
      <label>Material<select value={material} onChange={e => setMaterial(e.target.value as ClientMaterial)}>{CLIENT_MATERIALS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      <label>Process<select value={machine} onChange={e => setMachine(e.target.value as ClientMachine)}>{CLIENT_MACHINES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      <label>Finish<select value={color} onChange={e => setColor(e.target.value as ClientColor)}><option value="plain">Material color / unpainted</option><option value="color">Full color</option></select></label>
      {dimensionsEnabled && <label>Quick largest size<select value={CLIENT_SIZES_MM.includes(Math.round(largest) as typeof CLIENT_SIZES_MM[number]) ? Math.round(largest) : ''} onChange={e => e.target.value && setLargest(Number(e.target.value))}><option value="">Custom</option>{CLIENT_SIZES_MM.map(size => <option key={size} value={size}>{size / 10} cm</option>)}</select></label>}
    </div>

    {dimensionsEnabled && <>
      <div className="shop-dimensions" aria-label="Custom dimensions in millimetres">
        <label>X width (mm)<input type="number" min="5" max="1000" step="0.1" value={dimensions.xMm} onChange={e => setAxis('xMm', Number(e.target.value))} /></label>
        <label>Y height (mm)<input type="number" min="5" max="1000" step="0.1" value={dimensions.yMm} onChange={e => setAxis('yMm', Number(e.target.value))} /></label>
        <label>Z depth (mm)<input type="number" min="5" max="1000" step="0.1" value={dimensions.zMm} onChange={e => setAxis('zMm', Number(e.target.value))} /></label>
      </div>
      <p className="shop-dimension-note">Target proportions: <b>{dimensions.xMm.toFixed(1)} × {dimensions.yMm.toFixed(1)} × {dimensions.zMm.toFixed(1)} mm</b>. Changing X/Y/Z affects only the optional target size, not your saved source.</p>
    </>}

    <article className="shop-customer-price" aria-live="polite">
      <span className="eyebrow">PRICE</span>
      <h3>{price.status === 'VERIFIED' ? `$${price.amountUsd!.toFixed(2)}` : 'Waiting for a verified manufacturing price'}</h3>
      <p>{price.customerMessage}</p>
      {price.status === 'VERIFIED' && price.shippingUsd !== null ? <small>Verified delivery: ${price.shippingUsd.toFixed(2)}</small> : <small>Delivery is shown only after the actual destination and production file are accepted by the manufacturing partner.</small>}
    </article>

    <button className="shop-add-cart" type="button" disabled={!hasGeneratedModel} onClick={addToCart}>{hasGeneratedModel ? 'Add this model to cart' : 'Generate your model to add it to cart'}</button>

    <section className="shop-cart" aria-labelledby="shop-cart-title">
      <div className="section-heading"><h3 id="shop-cart-title">Cart</h3><span className="pill">{cart.length} item{cart.length === 1 ? '' : 's'}</span></div>
      {cart.length ? cart.map(item => <article key={item.id} className="shop-cart-line"><strong>Custom 3D product</strong><span>{item.dimensions ? `${item.dimensions.xMm.toFixed(1)} × ${item.dimensions.yMm.toFixed(1)} × ${item.dimensions.zMm.toFixed(1)} mm` : 'Dimensions not specified · optional'}</span><span>{CLIENT_MATERIALS.find(v => v.id === item.material)?.label} · {CLIENT_MACHINES.find(v => v.id === item.machine)?.label} · {item.color === 'color' ? 'Full color' : 'Material color / unpainted'}</span><b>{price.status === 'VERIFIED' ? `$${price.amountUsd!.toFixed(2)}` : 'Price pending verified quote'}</b><button type="button" onClick={() => setCart([])}>Remove</button></article>) : <p>Your cart is empty.</p>}
      <label className="shop-consent"><input type="checkbox" checked={riskAccepted} onChange={e => setRiskAccepted(e.target.checked)} /> I understand this is an experimental beta order and I place it at my own risk. The model may require another manufacturing review before production.</label>
      <label className="shop-consent"><input type="checkbox" checked={deliveryAccepted} onChange={e => setDeliveryAccepted(e.target.checked)} /> I understand production and delivery may take longer if the manufacturing partner requests additional validation or geometry changes.</label>
      <button type="button" className="shop-checkout" disabled={!checkoutReady}>Proceed to payment</button>
      <small>Payment is not connected yet. The secure checkout will be activated only after a payment provider is integrated and the final manufacturing price, delivery and file revision are verified.</small>
      <p><strong>Digital 3D file:</strong> Completed owned GAME files can be downloaded for transfer to a downstream/B2B reviewer. Manufacturing checkout is a separate process and never grants an unverified production approval.</p>
    </section>

    <button className="shop-internal-only" hidden type="button" onClick={() => onPrepareIssDraft(ISS_PRINT_PREP_PROMPT)}>Prepare internal ISS manufacturing repair draft</button>
  </section>
}
