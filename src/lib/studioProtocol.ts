// WORLDIFACT adapter to the existing Froge /v1/jobs contract; no new AI provider.
// Reviewed reference: Froge-MPC-2-test @ d3f61b842dcfeda2ed794210caafc391919a75be.

const MANUFACTURING_HARD_RULES = `WORLDIFACT manufacturing hard rules for every generated asset:\n- keep explicit physical units and requested X/Y/Z dimensions; never silently change scale;\n- remove or report non-manifold edges, open shells, self-intersections, duplicate/degenerate faces and zero-thickness surfaces where a MAKE version is requested;\n- do not create decorative needles, unsupported slivers or fragile connections that cannot survive the intended process;\n- for resin-print candidates, target at least 1.5 mm walls at approximately 100 mm scale and increase conservatively for larger parts when needed; do not apply one thickness blindly if it destroys appearance/function;\n- use practical splits, keyed joints and process-appropriate clearances when a one-piece build is unsafe;\n- preserve UV/material regions and provide a paintable path where applicable;\n- record deliberate geometry/thickness changes and unresolved blockers;\n- never label a generated file safe, production-ready, manufacturable or approved until a real B2B manufacturing partner accepts that exact revision.`

export const REFERENCE_FIDELITY_INSTRUCTIONS = `WORLDIFACT REFERENCE-FIDELITY MODE:
- Treat every attached reference image as authoritative visual input, not decoration. Compare the actual images before the first build.
- First classify the subject. Apply portrait/anatomy/garment rules only when the subject is a person. For buildings, vehicles, objects or terrain, ignore portrait-specific heuristics that do not apply.
- Reconstruct the visible silhouette and large-scale geometry before adding materials or small details. Do not replace the subject with a generic procedural substitute.
- For architecture: preserve the reference height/width ratio, asymmetry, rotations, setbacks, stacked/offset volumes, roof massing, terraces, balconies, major recesses/projections and the approximate placement/rhythm of large window groups. Never regularize an intentionally irregular building into a repeated tower.
- Use real 3D geometry for defining recesses, projections, terraces and overhangs when they affect the silhouette.
- Use a review camera close to the primary reference framing. After the first render, compare silhouette and massing first and correct the largest mismatch before spending effort on textures.
- Additional reference views describe the same object and should constrain side/back geometry. If an unseen surface is not supported by a reference, infer it conservatively instead of redesigning the visible structure.
- Do not mark the visual result acceptable when the overall silhouette, proportions or defining arrangement are substantially different from the references.`

export const INDUSTRIAL_ELECTRICAL_PROFILE = 'industrial-electrical-cabinet-v1' as const
export const REFERENCE_CHARACTER_PROFILE = 'reference-character-v1' as const
export type StudioQualityProfile = 'standard' | typeof INDUSTRIAL_ELECTRICAL_PROFILE | typeof REFERENCE_CHARACTER_PROFILE

const STANDARD_COMPLETION_INSTRUCTIONS = `WORLDIFACT STANDARD BUILD AND COMPLETION CONTRACT:
- Use Code Mode exec with the fully qualified tools.mcp__blender__ names below. Await every call and inspect its returned result; a tool error is not a completed step. Stay within the existing per-job USD 1.75 guard and tool/build limits. Do not start another job, change limits or substitute another generator.
1. Call tools.mcp__blender__get_modeling_contract({}) once. Parse and retain the returned scene schema, geometry guide, reference mapping and current revision. Compare the actual reference images, then construct a complete scene using only supported fields and operations.
2. Call tools.mcp__blender__build_model({scene_json:JSON.stringify(scene),expected_revision:revision}), using the actual current revision (0 before the first successful build). This API takes scene JSON, not Python. Generate repeated parts compactly in Code Mode rather than hand-writing thousands of vertices. Read the returned revision and report; do not stop merely because a GLB candidate exists.
3. Call tools.mcp__blender__inspect_render({view,expected_revision:revision}) for front, side and back, plus face for a person/portrait and three-quarter for a cabinet. For each response, pass every image content block to image(block) so the actual rendered pixels are visible; reading text metadata or printing base64 is not visual inspection. Compare these images with the references and inspect depth, silhouette and physical detail.
4. Call tools.mcp__blender__get_current_model({section:'summary',expected_revision:revision}). Check its actual report, scene and inspected_views. If a needed section is not inline, read its documented revision/SHA-bound pages. Never invent measurements or claim an unreported check passed. If necessary and allowed by remaining limits, use tools.mcp__blender__edit_model with the supported Python edit contract or rebuild the complete scene, then inspect the new revision again.
5. Call tools.mcp__blender__finish_model({expected_revision:revision,accepted,issues,summary}) and await its successful result. Set accepted=true only after the current required views and structural checks pass with no unresolved issues; otherwise use accepted=false with specific issues and an honest draft summary. A build or textual final answer is not completion. Never claim success, finished review or final export without a successful finish_model result. If completion fails or the guard stops the run, report that failure rather than presenting the retained candidate as a finished model.`

export const INDUSTRIAL_ELECTRICAL_INSTRUCTIONS = `WORLDIFACT INDUSTRIAL ELECTRICAL CABINET — TRUE 3D MODE:
- Reconstruct the uploaded cabinet as a volumetric industrial assembly. Reference photos are geometry evidence, NEVER a texture to paste over a flat interior panel.
- Do not use a photographed cabinet/interior as a base-color image on a plane, box face, backplate, door or other large visible surface. Labels and tiny markings may use decals; breakers, relays, terminals, ducts, rails, displays and wires must be actual 3D geometry.
- Preserve the photographed enclosure proportions, open doors, frame depth, equipment positions and asymmetry. Keep front/side/detail views consistent.
- The FIRST build_model scene must already be a substantive, densely populated cabinet, not a coarse bootstrap, empty shell or collection of plain boxes expecting a later upgrade. Include the observed enclosure, populated equipment and routed wiring together in that first complete scene; later edits are for specific corrections, not for creating the missing subject.
- Build separate visible geometry for: enclosure shell and doors; mounting plates/vertical supports; DIN rails; slotted wiring ducts; terminal strips; breaker/protection rows; contactors/relays/interface modules; controller/display modules; top cable entries; grounding hardware; door fan/control devices; fasteners/brackets; routed cable/wire bundles. Model only the features supported by the references, with conservative unseen-surface inference.
- Components must project physically from mounting surfaces. Ducts need walls/depth, devices need bodies/terminals, and cable bundles need cylindrical/beveled 3D paths with visible stand-off from the backplate.
- Target a dense service-ready visual assembly: multiple populated equipment rows/columns, at least 20 distinct visible component groups and at least 8 real 3D cable/wire runs when supported by the references. These are visual reconstruction targets, not an electrical engineering design claim.
- Use realistic industrial spacing and routing: blue/brown/black/green-yellow conductors, terminal markers, gray ducts, metal rails, red/white/yellow protection hardware where visible. Do not invent dangerous functional ratings or claim the wiring is electrically commissioned.
- Use the actual modeling contract's tubes for bent conductors, extrusions/lofts for shaped channels and housings, lathes for round hardware and copies for repeated real components where appropriate. A single box may represent a plain panel, but cannot stand in for a populated device bank. Respect the contract's part/material limits; repeated source components can have many visible copies.
- Exact cabinet export gate, ALL required in the self-contained GLB: renderedTriangles >= 20000; meshCount >= 8 distinct mesh definitions; substantialMeshCount >= 6 distinct meshes each containing at least 24 triangles; primitiveCount >= 8; materialCount >= 3; nodeCount >= 8. Linked copies contribute to rendered triangles and nodes, but do not create new distinct mesh definitions. Retain genuinely different component-family meshes rather than merging everything into one mesh.
- Earn this detail through visible physical shapes: rounded terminals and fasteners, device recesses/projections, duct slots/walls, rail profiles and routed cylindrical wires. Never pad triangle counts with invisible/duplicate geometry, degenerate faces, gratuitous subdivision or relabelled copies; counts alone do not prove reference fidelity.
- Export ordinary bounded mesh nodes, not EXT_mesh_gpu_instancing; realize GPU instances in the GAME copy if needed. Keep unique and rendered triangles each <= 3000000, nodes <= 5000 and the self-contained GLB <= 50000000 bytes, with embedded buffers/textures and the requested texture ceiling.
- Before export, render a front-three-quarter review and verify that the interior still reads as hundreds of physical devices/wires, not a photo, decal or sparse cabinet shell. If it does not, repair geometry before export.
- If the requested fidelity cannot be built, fail honestly rather than returning a flat photo-card or empty enclosure.`

export const REFERENCE_CHARACTER_INSTRUCTIONS = `WORLDIFACT REFERENCE CHARACTER — REALISTIC 3D MODE:
- Reconstruct one consistent full-body adult character from all attached views. Never use a reference photo as a face/body/clothing texture on a flat plane or billboard.
- Prioritize believable 360-degree anatomy: skull/face volume, ears, neck/shoulders, five separated fingers, feet/shoes, hair volume and clean limb separation. No half-skeleton, fused limbs or missing back geometry.
- Build clothing as actual layered 3D garments with readable thickness, seams, hems, folds, belts/straps/hardware and separation from the body where visible. Preserve the reference silhouette and outfit design instead of replacing it with generic clothes.
- Use distinct PBR material regions for skin, hair, fabric, rubber/leather, metal/plastic and translucent/emissive details where supported. Do not bake photographed lighting or shadows into base color.
- Keep the result suitable for GAME/figurine review: clean topology, finite scale, grounded feet, neutral pose and conservative unseen-surface inference. A static mesh is preferable to a broken rig.
- For figurine intent, preserve important garment/hair detail while avoiding accidental zero-thickness sheets; this is still a generated concept and is NOT manufacturing-approved.
- Review front, side and back before export. If face, hands, clothing layers or silhouette collapse, repair them before returning the GLB.`

const ELECTRICAL_CABINET_REQUEST = /(electrical\s+(?:control\s+)?cabinet|switchgear|motor\s+control\s+cent(?:er|re)|\bmcc\b|distribution\s+panel|control\s+panel|din\s*rail|terminal\s+block|breaker|contactor|relay|rozdzieln|szaf.{0,24}(?:elektr|sterown)|bezpiecznik|stycznik|przeka[źz]nik|listw.{0,20}zacisk|okablowan)/iu
const CHARACTER_REQUEST = /(adult\s+(?:woman|man|female|male)|character|heroine|figurine|person|human|woman|girl|man|posta[cć]|kobiet|m[eę][żz]czyzn|figur[kc])/iu

export function studioQualityProfile(input: Pick<StudioInput, 'prompt' | 'photos' | 'purpose'>): StudioQualityProfile {
  if (input.photos.length > 0 && ELECTRICAL_CABINET_REQUEST.test(input.prompt)) return INDUSTRIAL_ELECTRICAL_PROFILE
  if (input.photos.length > 0 && ['figurine','game'].includes(input.purpose) && CHARACTER_REQUEST.test(input.prompt)) return REFERENCE_CHARACTER_PROFILE
  return 'standard'
}


export const STUDIO_BODY_LIMIT = 9 * 1024 * 1024
export const STUDIO_MODEL_LIMIT = 48 * 1024 * 1024
export const STUDIO_POLL_MS = 25_000
export const FAST_DRAFT_PROFILE = 'fast-draft-v1' as const
export type GenerationProfile = 'standard' | typeof FAST_DRAFT_PROFILE
export const PHOTO_VIEWS = ['front', 'three_quarter', 'side', 'left', 'right', 'back', 'detail', 'other'] as const
export type PhotoView = typeof PHOTO_VIEWS[number]
export type TextureLimit = 2048 | 4096 | 8192
export type StudioPhoto = { name: string; view: PhotoView; dataUrl: string; subject?: string; textureMaxSize: TextureLimit }
export type StudioInput = { worldId: 'enchanted-ai-shop' | 'ai-game-lab'; prompt: string; purpose: 'game' | 'figurine' | 'terrain' | 'object'; textureMaxSize: TextureLimit; photos: StudioPhoto[]; generationProfile?: typeof FAST_DRAFT_PROFILE }
export const STUDIO_PREPARE_VERSION = 'studio-prepare-v1' as const
// Allows the bounded full upload and admission checks to finish before an
// absent submission is atomically fenced against any late paid dispatch.
export const STUDIO_SUBMISSION_GRACE_MS = 5 * 60_000
export type StudioPrepareMetadata = Pick<StudioInput, 'worldId' | 'prompt' | 'purpose' | 'textureMaxSize' | 'generationProfile'> & { photoCount: number }
export type StudioPrepareManifest = StudioPrepareMetadata & { version: typeof STUDIO_PREPARE_VERSION; inputDigest: string }
export type StudioReceipt = { id: string; ticket: string; createdAt: string }
export const STUDIO_FAILURE_CODES = ['ASTRA_COST_LIMIT', 'INVALID_MODEL_OUTPUT', 'STUDIO_TIMEOUT', 'ORACLE_JOB_FAILED', 'ORACLE_JOB_INCOMPLETE', 'ORACLE_JOB_MISSING', 'MISSING_SUBMISSION', 'ORACLE_SUBMISSION_REJECTED', 'ORACLE_BUSY', 'RATE_LIMITED', 'STORAGE_FULL', 'JOB_CAPACITY', 'STUDIO_ALLOWANCE_UNAVAILABLE', 'ORACLE_CANCELLED'] as const
export type StudioFailureCode = typeof STUDIO_FAILURE_CODES[number]
export type StudioJob = { id: string; state: 'pending' | 'queued' | 'generating' | 'retrying' | 'building' | 'succeeded' | 'failed' | 'cancelled'; detail: string; failureCode?: StudioFailureCode; downloadAllowed?: boolean; previewOnly?: boolean; previewAvailable?: boolean; reconciliationRequired?: boolean }
export const STUDIO_FAILURE_DETAILS: Record<StudioFailureCode, string> = {
  ASTRA_COST_LIMIT: 'Astra stopped at this job’s cost limit. Reserved customer points were released; no automatic retry.',
  INVALID_MODEL_OUTPUT: 'The generated file did not meet the required structural 3D detail gate. Reserved customer points were released; no procedural replacement.',
  STUDIO_TIMEOUT: 'The cloud job exceeded the maximum recovery window. Reserved customer points were released; no automatic retry.',
  ORACLE_JOB_FAILED: 'The Astra/Blender worker reported that this job failed. Reserved customer points were released. Keep this job ID for diagnosis; no automatic retry.',
  ORACLE_JOB_INCOMPLETE: 'The generator stopped with an unfinished draft before completing model review and export. Reserved customer points were released; no automatic retry.',
  ORACLE_JOB_MISSING: 'The worker could not find this submitted job after the recovery window. Reserved customer points were released. Keep this job ID for diagnosis; no automatic retry.',
  MISSING_SUBMISSION: 'This prepared receipt has no matching account reservation or Oracle job after the recovery window. Model submission was not confirmed. Your draft is preserved; no automatic retry.',
  ORACLE_SUBMISSION_REJECTED: 'The worker rejected this submission before generation started. Reserved customer points were released; no automatic retry.',
  ORACLE_BUSY: 'The worker is still finishing another model and did not accept this submission. Reserved customer points were released; no automatic retry.',
  RATE_LIMITED: 'The worker temporarily rate-limited this submission before generation started. Reserved customer points were released; no automatic retry.',
  STORAGE_FULL: 'The worker has insufficient storage and did not accept this submission. Reserved customer points were released; no automatic retry.',
  JOB_CAPACITY: 'The worker has reached its stored-job capacity and did not accept this submission. Reserved customer points were released; no automatic retry.',
  STUDIO_ALLOWANCE_UNAVAILABLE: 'The generation allowance could not be reserved, so no Oracle generation was submitted. Reserved customer points were released; no automatic retry.',
  ORACLE_CANCELLED: 'The worker reported that this job was cancelled. Reserved customer points were released; no automatic retry.',
}
export type StudioStatus = { detailedReady?: boolean; detailedReferenceLimit?: number; costGuardReady?: boolean; outputPolicyReady?: boolean; accountRequired?: boolean; ready: boolean; publicPilot: boolean; reason: string; oracle: string; photoReady: boolean; fastReady?: boolean; fastBudgetReady?: boolean; promptMaxLength: number; allowance: { used: number; limit: number | null; remaining: number | null; enabled: boolean; expiresAt: string | null; unlimited?: boolean } | null }
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const keys = (value: Record<string, unknown>, names: string[]) => Object.keys(value).every(name => names.includes(name))

export function generationProfile(value: unknown): GenerationProfile {
  if (value === undefined || value === 'standard') return 'standard'
  if (value === FAST_DRAFT_PROFILE) return FAST_DRAFT_PROFILE
  throw new Error('Choose STANDARD or the supported FAST DRAFT revision.')
}
export function supportsFastDraft(value: unknown): boolean {
  return record(value) && value.ready === true && value.provider === 'openai' && value.model === 'gpt-6-astra' &&
    value.generationProfileRevision === 1 && Array.isArray(value.generationProfiles) && value.generationProfiles.includes(FAST_DRAFT_PROFILE)
}
export function jpegSize(bytes: Uint8Array): [number, number] {
  if (bytes.length < 20 || bytes[0] !== 255 || bytes[1] !== 216 || bytes.at(-2) !== 255 || bytes.at(-1) !== 217) throw new Error('Use a complete normalized JPEG reference.')
  let at = 2
  while (at + 9 < bytes.length) {
    if (bytes[at++] !== 255) break
    while (bytes[at] === 255) at++
    const marker = bytes[at++]
    if (marker === 218 || marker === 217) break
    const length = (bytes[at] << 8) | bytes[at + 1]
    if (length < 2 || at + length > bytes.length) break
    if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker)) {
      const h = (bytes[at + 3] << 8) | bytes[at + 4], w = (bytes[at + 5] << 8) | bytes[at + 6]
      if (length < 8 || !w || !h || w > 8192 || h > 8192) throw new Error('Reference dimensions must be 1–8192 pixels per side.')
      return [w, h]
    }
    at += length
  }
  throw new Error('Reference JPEG dimensions could not be read.')
}
export function validateStudioInput(value: unknown): StudioInput {
  if (!record(value) || !keys(value, ['worldId', 'prompt', 'purpose', 'textureMaxSize', 'photos', 'generationProfile']) ||
    typeof value.worldId !== 'string' || !['enchanted-ai-shop', 'ai-game-lab'].includes(value.worldId) ||
    typeof value.prompt !== 'string' || value.prompt.trim().length < 3 || value.prompt.length > 4000 ||
    typeof value.purpose !== 'string' || !['game', 'figurine', 'terrain', 'object'].includes(value.purpose) ||
    typeof value.textureMaxSize !== 'number' || ![2048, 4096, 8192].includes(value.textureMaxSize))
    throw new Error('Enter a 3–4000 character description, a supported purpose and a texture-size limit.')
  const profile = generationProfile(value.generationProfile)
  const source = value.photos === undefined ? [] : value.photos
  if (!Array.isArray(source) || source.length > 4) throw new Error('Use at most four reference photos.')
  if (profile === FAST_DRAFT_PROFILE && (source.length > 0 || value.textureMaxSize !== 2048 || value.purpose === 'terrain'))
    throw new Error('FAST v1 supports one text-only object and a 2K texture ceiling. Use STANDARD for photos, terrain or larger textures.')
  let totalBytes = 0, totalPixels = 0
  const photos = source.map((photo): StudioPhoto => {
    if (!record(photo) || !keys(photo, ['name', 'view', 'dataUrl', 'subject', 'textureMaxSize']) || typeof photo.name !== 'string' || !photo.name.trim() || photo.name.length > 120 ||
      !PHOTO_VIEWS.includes(photo.view as PhotoView) || typeof photo.dataUrl !== 'string' ||
      photo.textureMaxSize !== value.textureMaxSize || (photo.subject !== undefined && (typeof photo.subject !== 'string' || photo.subject.length > 160))) throw new Error('Invalid reference photo description.')
    const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(photo.dataUrl)
    if (!match || match[1].length % 4 !== 0 || match[1].length > Math.ceil(2 * 1024 * 1024 / 3) * 4) throw new Error('Each prepared JPEG must be at most 2 MB.')
    let raw: string
    try { raw = atob(match[1]) } catch { throw new Error('Invalid JPEG encoding.') }
    const bytes = Uint8Array.from(raw, char => char.charCodeAt(0))
    const [width, height] = jpegSize(bytes)
    totalBytes += bytes.byteLength; totalPixels += width * height
    if (bytes.byteLength > 2 * 1024 * 1024 || totalBytes > 6 * 1024 * 1024 || totalPixels > 80 * 1024 * 1024) throw new Error('References exceed the combined 6 MB / 80 megapixel limit.')
    return { name: photo.name.trim(), view: photo.view as PhotoView, dataUrl: photo.dataUrl,
      textureMaxSize: value.textureMaxSize as TextureLimit, ...(typeof photo.subject === 'string' && photo.subject.trim() ? { subject: photo.subject.trim() } : {}) }
  })
  // Missing/explicit STANDARD must keep old canonical bytes and receipt hashes.
  return { worldId: value.worldId as StudioInput['worldId'], prompt: value.prompt.trim(), purpose: value.purpose as StudioInput['purpose'], textureMaxSize: value.textureMaxSize as TextureLimit, photos,
    ...(profile === FAST_DRAFT_PROFILE ? { generationProfile: FAST_DRAFT_PROFILE } : {}) }
}
export function oracleStudioPayload(id: string, input: StudioInput) {
  if (input.generationProfile === FAST_DRAFT_PROFILE) return {
    id, generationProfile: FAST_DRAFT_PROFILE,
    prompt: input.prompt + '\n\nWORLDIFACT FAST DRAFT: one compact editable object, GLB with UV/PBR materials up to 2048px; never upscale. Preserve the requested silhouette. Return a structurally checked UNREVIEWED draft, not visual acceptance. No optional renders or full format export. MAKE is unapproved.\n\n' + MANUFACTURING_HARD_RULES,
  }
  const instruction = `\n\nWORLDIFACT: build the requested editable 3D ${input.purpose}, not a brief or generic proxy. Export model.glb as a self-contained GLB with UV/PBR. Texture ceiling ${input.textureMaxSize}px; no false upscaling. Use all attached views of the same subject. Prioritize silhouette, anatomy and original details; do not replace a character with a building. Use the supported scene JSON contract for the complete first build, inspect actual renders and successfully call finish_model before claiming completion. GAME is unreviewed. MAKE is unapproved: preserve units and dimensions; report open/non-manifold geometry, intersections, thin walls and fragile joints; never claim manufacturing approval.`
  // The installed v33 photo contract accepts `side`, not `left`/`right`.
  // Keep image bytes, names and subject identity intact; preserve exact side
  // labels in ordered agent metadata rather than sending a rejected enum.
  const photos = input.photos.map(photo => photo.view === 'left' || photo.view === 'right' ? { ...photo, view: 'side' as const } : photo)
  const viewLabels = input.photos.some(photo => photo.view === 'left' || photo.view === 'right')
    ? '\n\nOriginal reference view labels (in input order): ' + input.photos.map((photo, index) => `Reference ${index + 1}: ${photo.view}`).join('; ') + '. Side views still describe the same subject.' : ''
  const qualityProfile = studioQualityProfile(input)
  const qualityInstructions = qualityProfile === INDUSTRIAL_ELECTRICAL_PROFILE ? INDUSTRIAL_ELECTRICAL_INSTRUCTIONS
    : qualityProfile === REFERENCE_CHARACTER_PROFILE ? REFERENCE_CHARACTER_INSTRUCTIONS : ''
  return { id, prompt: input.prompt + instruction,
    agentInstructions: MANUFACTURING_HARD_RULES + '\n\n' + STANDARD_COMPLETION_INSTRUCTIONS + (input.photos.length ? '\n\n' + REFERENCE_FIDELITY_INSTRUCTIONS : '') + (qualityInstructions ? '\n\n' + qualityInstructions : '') + viewLabels,
    ...(photos.length ? { photos } : {}) }
}
export async function inputDigest(input: StudioInput): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(input)))
  return Array.from(new Uint8Array(bytes), v => v.toString(16).padStart(2, '0')).join('')
}
/** Preparation sends a bounded commitment, never a second copy of the images.
 * Its metadata is only for preflight; the full POST is independently validated
 * and must match this canonical input digest before anything is reserved. */
export async function prepareStudioInput(input: StudioInput): Promise<StudioPrepareManifest> {
  const canonical = validateStudioInput(input)
  const { photos, ...metadata } = canonical
  return { version: STUDIO_PREPARE_VERSION, inputDigest: await inputDigest(canonical), ...metadata, photoCount: photos.length }
}
export function validateStudioPrepareManifest(value: unknown): StudioPrepareManifest {
  if (!record(value) || !keys(value, ['version', 'inputDigest', 'worldId', 'prompt', 'purpose', 'textureMaxSize', 'photoCount', 'generationProfile']) ||
      value.version !== STUDIO_PREPARE_VERSION || typeof value.inputDigest !== 'string' || !/^[a-f0-9]{64}$/.test(value.inputDigest) ||
      !Number.isSafeInteger(value.photoCount) || Number(value.photoCount) < 0 || Number(value.photoCount) > 4)
    throw new Error('Invalid lightweight preparation manifest. No generation was submitted.')
  const { photos: _photos, ...metadata } = validateStudioInput({ worldId: value.worldId, prompt: value.prompt, purpose: value.purpose,
    textureMaxSize: value.textureMaxSize, generationProfile: value.generationProfile, photos: [] })
  if (metadata.generationProfile === FAST_DRAFT_PROFILE && value.photoCount !== 0) throw new Error('FAST v1 does not support reference photos.')
  return { version: STUDIO_PREPARE_VERSION, inputDigest: value.inputDigest, ...metadata, photoCount: Number(value.photoCount) }
}
export const JOB_DETAILS: Record<StudioJob['state'], string> = {
  pending: 'Checking whether the server accepted this same job. No replacement request is sent.',
  queued: 'The existing Oracle worker accepted the job and queued it.',
  generating: 'Astra is preparing the model instructions on the existing worker.',
  retrying: 'The existing worker is reviewing or repairing this job.',
  building: 'Blender is building or exporting the model and materials.',
  succeeded: 'The worker finished. The GLB still requires visual review.',
  failed: 'The worker could not finish this job. Your inputs are retained; no automatic paid retry.',
  cancelled: 'This job was cancelled. No replacement generation is started.',
}

export const STUDIO_RECONCILIATION_DETAIL = 'The worker has not confirmed this job. Your allowance or credits remain reserved while its status is reviewed. Recover this same job; do not generate a duplicate.'
