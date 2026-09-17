export type ClientMaterial = 'plastic' | 'metal' | 'wood' | 'stone'
export type ClientMachine = '3d-print' | 'laser' | 'cnc'
export type ClientColor = 'plain' | 'color'

export const CLIENT_MATERIALS: readonly { id: ClientMaterial; label: string }[] = [
  { id: 'plastic', label: 'Plastic' },
  { id: 'metal', label: 'Metal' },
  { id: 'wood', label: 'Wood' },
  { id: 'stone', label: 'Stone' },
]

export const CLIENT_MACHINES: readonly { id: ClientMachine; label: string }[] = [
  { id: '3d-print', label: '3D printer' },
  { id: 'laser', label: 'Laser' },
  { id: 'cnc', label: 'CNC' },
]

export const CLIENT_SIZES_MM = [50, 75, 100, 125, 150, 175, 200] as const

export type OfferEvidence = {
  label: string
  baselineUsd: number | null
  baselineSizeMm: number
  evidence: string
  status: 'ESTIMATE' | 'QUOTE REQUIRED'
  note: string
}

const OFFER_ROUTES: Record<string, OfferEvidence> = {
  'plastic:3d-print:plain': {
    label: 'Monochrome resin print',
    baselineUsd: 2.72,
    baselineSizeMm: 100,
    evidence: 'Observed calculator benchmark · 100 mm reference model · 14 Sep 2026',
    status: 'ESTIMATE',
    note: 'Screening estimate only. Exact geometry, hollowing, supports, finishing, tax and shipping require a fresh quote.',
  },
  'plastic:3d-print:color': {
    label: 'Full-texture color resin print',
    baselineUsd: 27.27,
    baselineSizeMm: 100,
    evidence: 'Observed calculator benchmark · 100 mm reference model · 14 Sep 2026',
    status: 'ESTIMATE',
    note: 'Requires a supported color package and supplier review. The displayed values are not binding offers.',
  },
  'metal:3d-print:plain': {
    label: '316L metal print',
    baselineUsd: 53.13,
    baselineSizeMm: 100,
    evidence: 'Observed calculator benchmark · 100 mm reference model · 14 Sep 2026',
    status: 'ESTIMATE',
    note: 'Support strategy and finishing can change price materially. Final engineering review is required.',
  },
}

export function clientOffer(material: ClientMaterial, machine: ClientMachine, color: ClientColor): OfferEvidence {
  const key = `${material}:${machine}:${color}`
  const route = OFFER_ROUTES[key]
  if (route) return route
  const compatibility =
    material === 'wood' && machine === 'laser' ? 'Laser-cut / engraved wood candidate' :
    material === 'wood' && machine === 'cnc' ? 'CNC-machined wood candidate' :
    material === 'stone' && machine === 'cnc' ? 'CNC-machined stone candidate' :
    material === 'metal' && machine === 'cnc' ? 'CNC-machined metal candidate' :
    material === 'plastic' && machine === 'cnc' ? 'CNC-machined plastic candidate' :
    'Selected material / machine route'
  return {
    label: compatibility,
    baselineUsd: null,
    baselineSizeMm: 100,
    evidence: 'No verified size-specific benchmark stored for this route.',
    status: 'QUOTE REQUIRED',
    note: 'WORLDIFACT will not invent a supplier price. A connected contractor quote is required for this combination.',
  }
}

export function scaledScreeningUsd(offer: OfferEvidence, sizeMm: number): number | null {
  if (offer.baselineUsd === null || !Number.isFinite(sizeMm) || sizeMm <= 0) return null
  return offer.baselineUsd * (sizeMm / offer.baselineSizeMm) ** 3
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

export const ISS_PRINT_PREP_PROMPT = `Prepare a manufacturing candidate of the International Space Station from the project-provided original-source ISS model. Preserve the recognizable ISS proportions, truss layout, modules and solar-array silhouette; do not redesign it into a generic spacecraft. This is a MAKE revision, not a claim of production approval.

Print-prep requirements:
- correct non-manifold/open geometry and self-intersections where found;
- reinforce fragile truss members and especially thin solar-array edges/supports that were flagged during supplier review;
- use a project wall target of at least 1.5 mm for resin-print candidates where the intended scale allows it, without visibly bloating the model;
- split fragile arrays/truss into sensible printable modules when one-piece printing would be unsafe;
- add practical keyed joints / assembly clearances for separated modules;
- keep units explicit and preserve the requested final largest dimension;
- preserve color/material regions for a full-color 3MF/OBJ path and also provide a paintable monochrome path;
- avoid unsupported needles, zero-thickness planes and decorative details that cannot survive printing;
- report every deliberate thickness or geometry change and any remaining blockers.

Label the result only as: "Original source + Astra-assisted print-prep revision · VALIDATION REQUIRED" until a real manufacturing review approves it.`
