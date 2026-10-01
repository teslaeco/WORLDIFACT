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

export const STUDIO_BODY_LIMIT = 9 * 1024 * 1024
export const STUDIO_MODEL_LIMIT = 48 * 1024 * 1024
export const STUDIO_POLL_MS = 25_000
export const STUDIO_RECOVERY_POLL_MS = 60_000
export const STUDIO_POLL_FAILURE_REVIEW_COUNT = 4
export const STUDIO_STALE_REVIEW_MS = 40 * 60_000
export const FAST_DRAFT_PROFILE = 'fast-draft-v1' as const
export type GenerationProfile = 'standard' | typeof FAST_DRAFT_PROFILE
export const PHOTO_VIEWS = ['front', 'three_quarter', 'side', 'left', 'right', 'back', 'detail', 'other'] as const
export type PhotoView = typeof PHOTO_VIEWS[number]
export type TextureLimit = 2048 | 4096 | 8192
export type StudioPhoto = { name: string; view: PhotoView; dataUrl: string; subject?: string; textureMaxSize: TextureLimit }
export type StudioInput = { worldId: 'enchanted-ai-shop' | 'ai-game-lab'; prompt: string; purpose: 'game' | 'figurine' | 'terrain' | 'object'; textureMaxSize: TextureLimit; photos: StudioPhoto[]; generationProfile?: typeof FAST_DRAFT_PROFILE }
export type StudioReceipt = { id: string; ticket: string; createdAt: string }
export type StudioJob = { id: string; state: 'pending' | 'queued' | 'generating' | 'retrying' | 'building' | 'succeeded' | 'failed' | 'cancelled'; detail: string; failureCode?: 'ASTRA_COST_LIMIT' | 'INVALID_MODEL_OUTPUT'; downloadAllowed?: boolean; previewOnly?: boolean; previewAvailable?: boolean; reconciliationRequired?: boolean }
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
  const instruction = `\n\nWORLDIFACT: build the requested editable 3D ${input.purpose}, not a brief or generic proxy. Export model.glb as a self-contained GLB with UV/PBR. Texture ceiling ${input.textureMaxSize}px; no false upscaling. Use all attached views of the same subject. Prioritize silhouette, anatomy and original details; do not replace a character with a building. Use a compact batched Blender script and verify the exported file. GAME is unreviewed. MAKE is unapproved: preserve units and dimensions; report open/non-manifold geometry, intersections, thin walls and fragile joints; never claim manufacturing approval.`
  // The installed v33 photo contract accepts `side`, not `left`/`right`.
  // Keep image bytes, names and subject identity intact; preserve exact side
  // labels in ordered agent metadata rather than sending a rejected enum.
  const photos = input.photos.map(photo => photo.view === 'left' || photo.view === 'right' ? { ...photo, view: 'side' as const } : photo)
  const viewLabels = input.photos.some(photo => photo.view === 'left' || photo.view === 'right')
    ? '\n\nOriginal reference view labels (in input order): ' + input.photos.map((photo, index) => `Reference ${index + 1}: ${photo.view}`).join('; ') + '. Side views still describe the same subject.' : ''
  return { id, prompt: input.prompt + instruction, agentInstructions: MANUFACTURING_HARD_RULES + (input.photos.length ? '\n\n' + REFERENCE_FIDELITY_INSTRUCTIONS : '') + viewLabels, ...(photos.length ? { photos } : {}) }
}
export async function inputDigest(input: StudioInput): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(input)))
  return Array.from(new Uint8Array(bytes), v => v.toString(16).padStart(2, '0')).join('')
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
