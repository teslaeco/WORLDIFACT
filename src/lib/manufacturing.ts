export interface CostInput {
  baseMassG: number;
  baseSizeMm: number;
  sizeMm: number;
  quantity: number;
  ratePerKg: number;
  setup: number;
  finishPerPart: number;
  shipping: number;
  wastePercent: number;
}
export function estimateCost(v: CostInput) {
  if (
    Object.values(v).some((n) => !Number.isFinite(n) || n < 0) ||
    v.baseSizeMm <= 0 ||
    v.sizeMm <= 0 ||
    v.quantity < 1 ||
    !Number.isInteger(v.quantity) ||
    v.wastePercent > 200
  )
    throw new Error("Invalid cost inputs");
  const scale = v.sizeMm / v.baseSizeMm,
    massG = v.baseMassG * scale ** 3,
    billableKg = ((massG * v.quantity) / 1000) * (1 + v.wastePercent / 100);
  const total =
    billableKg * v.ratePerKg +
    v.setup +
    v.finishPerPart * v.quantity +
    v.shipping;
  if (![scale, massG, billableKg, total].every(Number.isFinite))
    throw new Error("Cost inputs exceed supported arithmetic limits");
  return { scale, massG, billableKg, total, unit: total / v.quantity };
}
export const OBSERVED_BATCH_QUOTES = [
  { model: "Legacy Queen · 100 mm", process: "SLA 9600 · white · general sanding", quantity: 1, totalUsd: 2.72, evidence: "Calculator · 14 September 2026" },
  { model: "Legacy Queen · 100 mm", process: "SLA 9600 · white · general sanding", quantity: 2, totalUsd: 5.44, evidence: "Unsaved specification quote · 15 September 2026" },
  { model: "Legacy Queen · 100 mm", process: "SLA 9600 · white · general sanding", quantity: 10, totalUsd: 27.20, evidence: "Unsaved specification quote · 15 September 2026" },
  { model: "ISS · nominal 370 mm", process: "WJP full-color resin · oil spraying", quantity: 1, totalUsd: 213.53, evidence: "Saved supplier screenshot · 14 September 2026 · thin walls flagged" },
] as const;
export const SUPPLIERS = [
  {
    name: "JLC3DP",
    url: "https://jlc3dp.com/3d-printing-quote?queryMaterialTechnicsId=1",
    status:
      "Qualification reply received; calculator tested on legacy Queen; production review pending",
    materials: "SLA resin, nylon, WJP full color, PLA, 316L, titanium",
    note: "Prices are per model; no repeat-production kg tariff is offered. WJP requires a supported color package such as OBJ + MTL + PNG or 3MF. Use a process- and size-specific engineering review.",
  },
  {
    name: "Sculpteo",
    url: "https://www.sculpteo.com/en/materials/",
    status:
      "Qualification reply received; model quote blocked by human verification",
    materials: "SLS/MJF nylon, resins, selected metals, dyeing and painting",
    note: "Pricing depends on geometry and process, not a fixed kg tariff. The qualification reply describes monochrome small series. Full texture-color availability and model price remain unconfirmed.",
  },
];

// Observed supplier-calculator outputs on 2026-09-14 UTC, not binding offers.
// One legacy Queen geometry-only STL, largest dimension 100 mm, quantity 1.
export const OBSERVED_QUOTES = [
  {
    process: "SLA · 9600 Resin",
    color: "White",
    finish: "General sanding",
    usd: 2.72,
  },
  {
    process: "SLA · Black Resin",
    color: "Grayish black",
    finish: "General sanding",
    usd: 7.3,
  },
  {
    process: "WJP · Full Color Resin",
    color: "Multicolor*",
    finish: "Oil spraying",
    usd: 27.27,
  },
  {
    process: "SLM · 316L steel",
    color: "Metal",
    finish: "Supplier default",
    usd: 53.13,
  },
  {
    process: "SLM · Titanium TC4",
    color: "Silver gray",
    finish: "Supplier default",
    usd: 63.75,
  },
];

export interface ProductionProfile {
  supplier: "JLC3DP" | "Sculpteo";
  process: string;
  color: string;
  referenceSizeMm: number;
  wallTarget: string;
  detailTarget: string;
  assemblyClearance: string;
  suitability: string;
  observedUsd: number | null;
  quoteStatus: "OBSERVED" | "UNKNOWN/BLOCKED";
  sourceUrl: string;
}

// Supplier documentation is process-specific. These are screening profiles,
// not automatic manufacturing approval or substitutes for engineering review.
export const PRODUCTION_PROFILES: readonly ProductionProfile[] = [
  {
    supplier: "JLC3DP",
    process: "SLA · 9600 Resin",
    color: "Matte white",
    referenceSizeMm: 100,
    wallTarget: "1.5 mm project target (>0.8 mm material minimum)",
    detailTarget: "0.8 mm embossed / engraved",
    assemblyClearance: "0.2 mm; moving 0.5 mm",
    suitability: "Shape prototype / appearance review; protect from sun and UV",
    observedUsd: 2.72,
    quoteStatus: "OBSERVED",
    sourceUrl: "https://jlc3dp.com/help/article/photosensitive-9600-resin",
  },
  {
    supplier: "JLC3DP",
    process: "SLA · Black Resin",
    color: "Grayish black",
    referenceSizeMm: 100,
    wallTarget: "1.5 mm project target",
    detailTarget: "0.8 mm embossed / engraved",
    assemblyClearance: "0.2 mm; moving 0.5 mm",
    suitability: "Appearance candidate; exact model still needs review",
    observedUsd: 7.3,
    quoteStatus: "OBSERVED",
    sourceUrl: "https://jlc3dp.com/help/article/3d-printing-design-guideline",
  },
  {
    supplier: "JLC3DP",
    process: "WJP · Full Color Resin",
    color: "Texture color",
    referenceSizeMm: 100,
    wallTarget: ">1.0 mm material recommendation",
    detailTarget: "UNKNOWN for this exact process",
    assemblyClearance: "UNKNOWN for WJP",
    suitability: "Display figures; color sample and texture approval required",
    observedUsd: 27.27,
    quoteStatus: "OBSERVED",
    sourceUrl: "https://jlc3dp.com/help/article/full-color-resin",
  },
  {
    supplier: "JLC3DP",
    process: "SLM · 316L steel",
    color: "Metal",
    referenceSizeMm: 100,
    wallTarget: "2.0 mm project target",
    detailTarget: "1.0 mm embossed / engraved",
    assemblyClearance: "0.5 mm; moving 1.0 mm",
    suitability: "Premium metal candidate; support and finish review required",
    observedUsd: 53.13,
    quoteStatus: "OBSERVED",
    sourceUrl: "https://jlc3dp.com/help/article/3d-printing-design-guideline",
  },
  {
    supplier: "JLC3DP",
    process: "SLM · Titanium TC4",
    color: "Silver gray",
    referenceSizeMm: 100,
    wallTarget: "2.0 mm project target",
    detailTarget: "1.0 mm embossed / engraved",
    assemblyClearance: "0.5 mm; moving 1.0 mm",
    suitability: "Premium lightweight metal candidate; engineering review required",
    observedUsd: 63.75,
    quoteStatus: "OBSERVED",
    sourceUrl: "https://jlc3dp.com/help/article/3d-printing-design-guideline",
  },
  {
    supplier: "Sculpteo",
    process: "MJF · PA12",
    color: "Raw gray or dyed black",
    referenceSizeMm: 100,
    wallTarget: "0.8 mm flexible; 2.0 mm rigid",
    detailTarget: "0.2 mm detail; stems 0.7/0.9 mm supported/unsupported",
    assemblyClearance: "0.5 mm minimum; increase for large parts",
    suitability: "Durable prototype / production candidate",
    observedUsd: null,
    quoteStatus: "UNKNOWN/BLOCKED",
    sourceUrl:
      "https://www.sculpteo.com/en/materials/jet-fusion-material/jet-fusion-solid-black-plastic/",
  },
  {
    supplier: "Sculpteo",
    process: "SLA · Prototyping Resin",
    color: "Supplier material color",
    referenceSizeMm: 100,
    wallTarget: "0.8 mm with 1:6 ratio",
    detailTarget: "0.5 mm embossed / engraved",
    assemblyClearance: "Assembly not supported",
    suitability: "Not recommended by supplier for production or functional prototypes",
    observedUsd: null,
    quoteStatus: "UNKNOWN/BLOCKED",
    sourceUrl:
      "https://www.sculpteo.com/en/materials/stereolithography/prototyping-resin/",
  },
];
