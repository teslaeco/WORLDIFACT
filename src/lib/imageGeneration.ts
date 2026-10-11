import { validateStudioInput, type StudioPhoto } from './studioProtocol.ts'
export const IMAGE_TERMS = Object.freeze({ revision: 'image-5-v2', points: 5, size: '1024x1024', quality: 'medium', format: 'png' } as const)
export const IMAGE_MODELS = ['gpt-image-2.5-flare', 'gpt-image-2.5-sunburst'] as const
export type ImageModel = typeof IMAGE_MODELS[number]
export const IMAGE_ID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/
export const IMAGE_REQUEST_MAX_BYTES = 9 * 1024 * 1024
export type ImageInput = { references?: StudioPhoto[]; id: string; prompt: string; model: ImageModel; acceptedPoints: 5 | 25; revision: typeof IMAGE_TERMS.revision | 'image-25-v1' }
export type ImageJob = {
  id: string; prompt: string; model: ImageModel; at: number; updatedAt: number
  state: 'processing' | 'completed' | 'failed' | 'uncertain'
  points: 5 | 25; settlement: 'held' | 'charged' | 'released'
  fingerprint: string; bytes?: number; chunks?: number; sha256?: string; detail?: string
  transportRevision?: 'image-manual-v1'
  diagnostic?: { stage: 'transport' | 'response' | 'decode' | 'storage'; status?: number }
  recovery?: 'legacy-redirect-before-dispatch'
  providerRequestId?: string; usage?: { input_tokens: number; output_tokens: number; total_tokens: number }
}
export function parseImageInput(v: unknown, allowLegacyRecovery = false): ImageInput {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('Invalid image request.')
  const p = v as Record<string, unknown>
  if (!['acceptedPoints,id,model,prompt,revision', 'acceptedPoints,id,model,prompt,references,revision'].includes(Object.keys(p).sort().join(',')) ||
      typeof p.id !== 'string' || !IMAGE_ID.test(p.id) || typeof p.prompt !== 'string' ||
      p.prompt.trim().length < 3 || p.prompt.length > 4000 || !IMAGE_MODELS.includes(p.model as ImageModel) ||
      !(p.acceptedPoints === IMAGE_TERMS.points && p.revision === IMAGE_TERMS.revision ||
        allowLegacyRecovery && p.acceptedPoints === 25 && p.revision === 'image-25-v1'))
    throw new Error('Choose GPT Image 2.5, enter 3–4000 characters and accept 5 points.')
  const references = p.references === undefined ? undefined : validateStudioInput({ worldId: 'enchanted-ai-shop', prompt: p.prompt,
    purpose: 'object', textureMaxSize: 4096, photos: p.references }).photos
  if (references && (references.length === 0 || p.revision !== IMAGE_TERMS.revision)) throw new Error('Use 1–4 image references with current pricing.')
  // Preserve the historical field order used by existing request fingerprints.
  return { ...p, prompt: p.prompt.trim(), ...(references ? { references } : {}) } as ImageInput
}
