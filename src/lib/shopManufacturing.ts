export type ClientMaterial = 'plastic' | 'metal' | 'wood' | 'stone'
export type ClientMachine = '3d-print' | 'laser' | 'cnc'
export type ClientColor = 'plain' | 'color'
export type ClientDimensions = { xMm: number; yMm: number; zMm: number }

export const CLIENT_MATERIALS: readonly { id: ClientMaterial; label: string }[] = [
  { id: 'plastic', label: 'Plastic' },
  { id: 'metal', label: 'Metal' },
  { id: 'wood', label: 'Wood' },
  { id: 'stone', label: 'Stone' },
]

export const CLIENT_MACHINES: readonly { id: ClientMachine; label: string }[] = [
  { id: '3d-print', label: '3D printing' },
  { id: 'laser', label: 'Laser manufacturing' },
  { id: 'cnc', label: 'CNC machining' },
]

export const CLIENT_SIZES_MM = [50, 75, 100, 125, 150, 175, 200] as const
export const DEFAULT_DIMENSIONS_MM: ClientDimensions = { xMm: 100, yMm: 100, zMm: 100 }

export function sanitizeDimensions(value: ClientDimensions): ClientDimensions {
  const safe = (n: number) => Number.isFinite(n) ? Math.min(1000, Math.max(5, Math.round(n * 10) / 10)) : 100
  return { xMm: safe(value.xMm), yMm: safe(value.yMm), zMm: safe(value.zMm) }
}

export function largestDimensionMm(value: ClientDimensions) {
  const size = sanitizeDimensions(value)
  return Math.max(size.xMm, size.yMm, size.zMm)
}

export type VerifiedSupplierQuote = {
  id: string
  productId: 'iss-source-370'
  material: ClientMaterial
  machine: ClientMachine
  color: ClientColor
  maximumDimensionMm: number
  printUsd: number
  observedShippingUsd: number | null
  quotedAt: string
  source: string
  supplierAcceptedGeometry: boolean
  finalPriceVerified: boolean
  note: string
}

// Real recorded supplier calculator evidence. This is deliberately not exposed as a
// checkout price until the exact repaired file is accepted and a current final total
// (including delivery/tax for the customer's address) is confirmed.
export const ISS_RECORDED_QUOTE: VerifiedSupplierQuote = {
  id: 'iss-wjp-370-2026-09-14',
  productId: 'iss-source-370',
  material: 'plastic',
  machine: '3d-print',
  color: 'color',
  maximumDimensionMm: 370,
  printUsd: 213.53,
  observedShippingUsd: 55.72,
  quotedAt: '2026-09-14',
  source: 'Recorded JLC3DP 3MF calculator/order screenshot',
  supplierAcceptedGeometry: false,
  finalPriceVerified: false,
  note: 'Thin walls were flagged. The quoted 3MF dimensions must be reconciled with the audited source before a sellable final price can be published.',
}

export type CustomerPrice = {
  status: 'VERIFIED' | 'PENDING_VERIFIED_QUOTE'
  amountUsd: number | null
  shippingUsd: number | null
  orderable: boolean
  customerMessage: string
}

export function customerPriceForSelection(
  material: ClientMaterial,
  machine: ClientMachine,
  color: ClientColor,
  dimensions: ClientDimensions,
  exactApprovedQuote?: VerifiedSupplierQuote | null,
): CustomerPrice {
  const quote = exactApprovedQuote ?? null
  const largest = largestDimensionMm(dimensions)
  const exact = quote && quote.supplierAcceptedGeometry && quote.finalPriceVerified &&
    quote.material === material && quote.machine === machine && quote.color === color &&
    Math.abs(quote.maximumDimensionMm - largest) < 0.05
  if (exact) return {
    status: 'VERIFIED', amountUsd: quote.printUsd, shippingUsd: quote.observedShippingUsd, orderable: true,
    customerMessage: 'Verified manufacturing price for this exact approved file and configuration.',
  }
  return {
    status: 'PENDING_VERIFIED_QUOTE', amountUsd: null, shippingUsd: null, orderable: false,
    customerMessage: 'Final price will appear only after a manufacturing partner verifies this exact model, size and finish.',
  }
}

export const ISS_SOURCE = {
  label: 'ISS · original-source manufacturing candidate',
  nominalMm: [370, 227.2624, 194.0854] as const,
  triangles: 469_984,
  files: ['OBJ + textures', '3MF full color', 'STL paintable'] as const,
  sourceStatus: 'ORIGINAL SOURCE',
  astraStatus: 'PRINT-PREP PASS REQUIRED',
  validationStatus: 'VALIDATION REQUIRED',
  warning: 'Supplier review flagged thin walls around solar-array / fragile structural areas. Scaling this source down can make those features even weaker.',
} as const

export const MANUFACTURING_HARD_RULES = `WORLDIFACT manufacturing hard rules for every generated asset:\n- keep explicit physical units and requested X/Y/Z dimensions; never silently change scale;\n- remove or report non-manifold edges, open shells, self-intersections, duplicate/degenerate faces and zero-thickness surfaces where a MAKE version is requested;\n- do not create decorative needles, unsupported slivers or fragile connections that cannot survive the intended process;\n- for resin-print candidates, target at least 1.5 mm walls at approximately 100 mm scale and increase conservatively for larger parts when needed; do not apply one thickness blindly if it destroys appearance/function;\n- use practical splits, keyed joints and process-appropriate clearances when a one-piece build is unsafe;\n- preserve UV/material regions and provide a paintable path where applicable;\n- record deliberate geometry/thickness changes and unresolved blockers;\n- never label a generated file safe, production-ready, manufacturable or approved until a real B2B manufacturing partner accepts that exact revision.`

export const ISS_PRINT_PREP_PROMPT = `Prepare the next manufacturing-safety revision of the International Space Station from the project-provided original-source ISS model. Preserve the recognizable ISS proportions, truss layout, modules and solar-array silhouette; do not redesign it into a generic spacecraft. Treat the recorded thin-wall supplier warning as a hard blocker that must be addressed, but do not claim supplier approval until the exact revised file is reviewed again.\n\n${MANUFACTURING_HARD_RULES}\n\nISS-specific requirements:\n- reinforce fragile truss members and especially thin solar-array edges/supports that were flagged during supplier review;\n- split fragile arrays/truss into sensible printable modules when one-piece printing would be unsafe;\n- preserve the full-color path and a paintable monochrome path;\n- compare the revised dimensions against the intended final X/Y/Z dimensions and report every change;\n- output a new revision for another B2B safety review, not a production approval.\n\nInternal label only: "ISS print-prep revision · B2B VALIDATION REQUIRED".`
