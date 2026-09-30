/** Shared limits and honest deliverable checks for the bounded blueprint path. */
export const BLUEPRINT_PROMPT_LIMIT = 4000
export const BLUEPRINT_REFERENCE_LIMIT = 6
export const BLUEPRINT_REFERENCE_BYTES = 6 * 1024 * 1024
export const BLUEPRINT_REFERENCE_VIEWS = ['front', 'left', 'right', 'back', 'detail', 'other', 'side', 'three_quarter'] as const
export type BlueprintReference = { dataUrl: string; view: typeof BLUEPRINT_REFERENCE_VIEWS[number] }
export type BlueprintDelivery = 'procedural-blueprint' | 'detailed-mesh'
export const DETAILED_MESH_BLOCKED = 'Detailed character/reference reconstruction is not available on this generator. No points were reserved and no AI generation was started. A procedural blueprint is not a realistic character mesh.'

function imageBytes(value: unknown): number {
  if (typeof value !== 'string') throw new Error('Invalid reference image.')
  const m = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value)
  if (!m || m[2].length % 4 || m[2].length > Math.ceil(BLUEPRINT_REFERENCE_BYTES / 3) * 4) throw new Error('Use PNG, JPEG or WebP references within the 6 MB combined limit.')
  const size = m[2].length * 3 / 4 - (m[2].endsWith('==') ? 2 : m[2].endsWith('=') ? 1 : 0)
  const start = atob(m[2].slice(0, 32))
  if (!(m[1] === 'png' ? start.startsWith('\x89PNG\r\n\x1a\n') : m[1] === 'jpeg' ? start.startsWith('\xff\xd8\xff') : start.startsWith('RIFF') && start.slice(8, 12) === 'WEBP')) throw new Error('The reference contents do not match the image type.')
  return size
}
export function blueprintReferences(input: { image?: unknown; references?: unknown }): BlueprintReference[] {
  if (input.image != null && input.references !== undefined) throw new Error('Use references or the legacy image field, not both.')
  const source = input.references ?? (input.image == null ? [] : [{ dataUrl: input.image, view: 'front' }])
  if (!Array.isArray(source) || source.length > BLUEPRINT_REFERENCE_LIMIT) throw new Error('Use up to six reference images. Four views are supported, not required.')
  let total = 0
  return source.map(value => {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !['dataUrl', 'view'].includes(k)) || !BLUEPRINT_REFERENCE_VIEWS.includes(value.view)) throw new Error('Each reference needs an image and a supported view label.')
    total += imageBytes(value.dataUrl)
    if (total > BLUEPRINT_REFERENCE_BYTES) throw new Error('Reference images exceed the combined 6 MB limit. Remove or compress an image; none will be silently omitted.')
    return { dataUrl: value.dataUrl as string, view: value.view as BlueprintReference['view'] }
  })
}
/** Conservative text safety guard, not a visual similarity or quality score. */
export function requiresDetailedMesh(prompt: string): boolean {
  const p = prompt.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  return /\b(character|heroine|woman|women|girl|female|human|person|portrait|anatomy|photorealis\w*|rigged|full.body|posta[cć]\w*|bohater\w*|kobiet\w*|dziewczyn\w*|twarz\w*|anatom\w*|fotorealis\w*)\b/.test(p) || /\b(faithful|exact|1:1|wiernie|wierny|oryginal\w*)\b.*\b(reconstruct\w*|reference\w*|model\w*|odtworz\w*)\b/.test(p)
}
export function blueprintDelivery(input: { prompt: string; deliverable?: unknown }, count: number): BlueprintDelivery {
  if (input.deliverable !== undefined && (typeof input.deliverable !== 'string' || !['procedural-blueprint', 'detailed-mesh'].includes(input.deliverable))) throw new Error('Choose a supported deliverable.')
  // Legacy reference submissions did not consent to a procedural substitute.
  return input.deliverable === 'detailed-mesh' || requiresDetailedMesh(input.prompt) || (count > 0 && input.deliverable === undefined) ? 'detailed-mesh' : 'procedural-blueprint'
}
export async function blueprintFingerprint(value: unknown): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)))), b => b.toString(16).padStart(2, '0')).join('')
}
export async function blueprintRequestId(seed: string): Promise<string> {
  const hash = await blueprintFingerprintString('worldifact-blueprint-v1:' + seed.toLowerCase())
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`
}
async function blueprintFingerprintString(value: string): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2, '0')).join('')
}
