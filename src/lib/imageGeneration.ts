export const IMAGE_TERMS = Object.freeze({ revision: 'image-25-v1', points: 25, size: '1024x1024', quality: 'medium', format: 'png' } as const)
export const IMAGE_MODELS = ['gpt-image-2.5-flare', 'gpt-image-2.5-sunburst'] as const
export type ImageModel = typeof IMAGE_MODELS[number]
export const IMAGE_ID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/
export type ImageInput = { id: string; prompt: string; model: ImageModel; acceptedPoints: 25; revision: typeof IMAGE_TERMS.revision }
export type ImageJob = {
  id: string; prompt: string; model: ImageModel; at: number; updatedAt: number
  state: 'processing' | 'completed' | 'failed' | 'uncertain'
  points: 25; settlement: 'held' | 'charged' | 'released'
  fingerprint: string; bytes?: number; chunks?: number; sha256?: string; detail?: string
  providerRequestId?: string; usage?: { input_tokens: number; output_tokens: number; total_tokens: number }
}
export function parseImageInput(v: unknown): ImageInput {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('Invalid image request.')
  const p = v as Record<string, unknown>
  if (Object.keys(p).sort().join(',') !== 'acceptedPoints,id,model,prompt,revision' ||
      typeof p.id !== 'string' || !IMAGE_ID.test(p.id) || typeof p.prompt !== 'string' ||
      p.prompt.trim().length < 3 || p.prompt.length > 4000 || !IMAGE_MODELS.includes(p.model as ImageModel) ||
      p.acceptedPoints !== IMAGE_TERMS.points || p.revision !== IMAGE_TERMS.revision)
    throw new Error('Choose GPT Image 2.5, enter 3–4000 characters and accept 25 points.')
  return { ...p, prompt: p.prompt.trim() } as ImageInput
}
