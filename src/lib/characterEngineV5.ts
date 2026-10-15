import { MODEL_CATALOG, type GenerationModel } from './modelCatalog.ts'

export type CreativeIntent = 'world' | 'reference-robot' | 'reference-person' | 'other-asset'
export type CharacterV5Plan = Readonly<{
  revision: 'character-v5-advisory-v1'
  intent: CreativeIntent
  recommendedModel: GenerationModel
  referenceCount: number
  estimatedPointCeiling: number
  maxProviderLiabilityUsdPerJob: number
  stages: readonly string[]
  rationale: string
  attribution: 'ROUTING_ADVICE_ONLY'
  modelChanged: false
  paidGenerationStarted: false
  requiresExplicitGenerate: true
  fidelityGuarantee: false
}>

const robotWords = /(?:^|[^\p{L}\p{N}_])(?:robots?|humanoid[-\s]+mechs?|humanoid[-\s]+guardians?|mechs?|androids?|cyborgs?|droids?|ecomech|exo[-\s]?suits?|exoskeletons?|robot\p{L}*|robota|roboty)(?=$|[^\p{L}\p{N}_])/iu
const personWords = /(?:^|[^\p{L}\p{N}_])(?:adult\s+(?:woman|man)|characters?|humans?|people|persons?|woman|women|men|man|girl|boy|portrait|figurine|posta[cć]\p{L}*|kobiet\p{L}*|m[eę][żz]czyzn\p{L}*|figur[kc]\p{L}*)(?=$|[^\p{L}\p{N}_])/iu
const worldWords = /(?:^|[^\p{L}\p{N}_])(?:worlds?|planets?|environments?|landscape|terrain|ecosystems?|game\s+level|cityscape|świat\p{L}*|planet\p{L}*|krajobraz\p{L}*|dolin\p{L}*)(?=$|[^\p{L}\p{N}_])/iu
const worldBuilder = /(?:create|build|generate|design|make|reconstruct|zbuduj|stw[oó]rz|wygeneruj|zaprojektuj|odtw[oó]rz)[^.!?\n]{0,55}(?:world|planet|environment|terrain|świat|planet\p{L}*|krajobraz)/iu

/** Pure task classification. Never change an immutable model, receipt or reservation. */
export function creativeIntent(input: {prompt: string; purpose?: string; worldId?: string; photos?: readonly unknown[]}): CreativeIntent {
  const text = input.prompt.normalize('NFKC')
  const hasPhoto = (input.photos?.length ?? 0) > 0
  if (input.purpose === 'terrain' || worldBuilder.test(text) || worldWords.test(text) && !robotWords.test(text) && !personWords.test(text))
    return 'world'
  if (robotWords.test(text) && (hasPhoto || /(?:^|[^\p{L}])(?:robot|mech|android|cyborg|ecomech|robota)(?=$|[^\p{L}])/iu.test(text)))
    return 'reference-robot'
  if (personWords.test(text)) return 'reference-person'
  return 'other-asset'
}

const STEPS = Object.freeze({
  character: Object.freeze(['reference/landmark verification', 'silhouette and major volumes', 'head/hands/feet anatomy', 'distinct real 3D materials and PBR', 'original GLB plus four-view review', 'manual fidelity acceptance; GAME only']),
  world: Object.freeze(['world blueprint and scale', 'terrain and portal scene layout', 'delegate character and props without changing their model', 'scene assembly', 'camera and performance QA']),
  other: Object.freeze(['asset specification', 'visible volume construction', 'UV/PBR review', 'real GLB and provenance QA']),
} as const)

/** Advisory only: customer must explicitly accept the displayed price and click Generate. */
export function characterRouteAdvice(input: {prompt: string; purpose?: string; worldId?: string; photos?: readonly unknown[]}): CharacterV5Plan {
  const intent = creativeIntent(input)
  const recommendedModel: GenerationModel = intent === 'world' ? 'astra' : 'sol'
  const row = MODEL_CATALOG[recommendedModel]
  return {
    revision: 'character-v5-advisory-v1', intent, referenceCount: input.photos?.length ?? 0,
    recommendedModel, estimatedPointCeiling: row.creditsPerGeneration,
    maxProviderLiabilityUsdPerJob: row.maxProviderCents / 100,
    stages: intent === 'world' ? STEPS.world : intent === 'other-asset' ? STEPS.other : STEPS.character,
    rationale: intent === 'world'
      ? 'Astra is the world-planning/orchestration candidate. A world is not photogrammetric geometry.'
      : intent === 'reference-robot' ? 'Sol is the lower-cost robot/character planning candidate. Likeness requires the actual rendered mesh.'
      : intent === 'reference-person' ? 'Sol is the lower-cost anatomy planning candidate. Face likeness needs human visual review.'
      : 'Sol is a lower-cost detailed asset candidate. A procedural GLB does not guarantee photorealism.',
    attribution: 'ROUTING_ADVICE_ONLY',
    modelChanged: false, paidGenerationStarted: false,
    requiresExplicitGenerate: true, fidelityGuarantee: false,
  }
}

/** Supplement existing selected-model Blender tools; no paid fallback or provider substitution. */
export const REFERENCE_ROBOT_V5_INSTRUCTIONS = [
  'WORLDIFACT CHARACTER ENGINE V5 — PHOTO-GROUNDED ROBOT:',
  '- Source images constrain a REAL 3D robot. Match helmet, cyan eye spacing, shoulder mass, raised arm, neck, torso taper, hips, limb length, five fingers, articulated feet and source prop BEFORE decorative details.',
  '- Mechanical cutaways need real depth: load-bearing frame, stators, copper coils, motor shafts, gear housings, contactors, pipes, joints and routed cables. A plane with cabinet texture is not 3D. This is a CHARACTER, not an MCC cabinet.',
  '- Preserve visible left armored region against exposed right mechanics, or mirror only if the image requires it. Source hero prop must have correct curvature and be held by a real hand.',
  '- FIRST build must contain a complete plausible head-to-foot silhouette. No generic mannequin, bolted cylinder grid, invisible subdivisions or thousands of copies to inflate triangles.',
  '- Inspect actual front, three-quarter, side and back renders. Compare the helmet, arms, legs, hip, grip and colored armor masses with the uploaded original before adding tiny grooves. Infer unseen surfaces conservatively.',
  '- Use real UV/PBR and name whether maps were AI-generated, hand-authored or procedural. Never claim photorealism, rigging, precise likeness or print approval based on triangle count or a shiny shader.',
  '- If visual mismatches remain or the provider budget stops, report accepted=false and preserve any authentic candidate if supported. No automatic retry, cap extension or silent model switch.',
].join('\n')
