/**
 * Optional, server-only character geometry provider.
 * Does not replace the original user-selected Astra model. Geometry provider
 * is disclosed as Meshy 7.1 only after an actual verifiable task receipt.
 * Safe default: no paid submissions without an externally owned durable
 * idempotency/credit reservation (not yet implemented in this module).
 * Official contract: https://docs.meshy.ai/en/api/image-to-3d
 */
export const MESHY_IMAGE_PROVIDER = 'meshy-7.1' as const
export const MESHY_IMAGE_ROUTE = 'https://api.meshy.ai/openapi/v1/image-to-3d'
export type MeshyReferenceInput = {
  approvedImageUrl: string
  texturePrompt: string
  geometryResolution: '2k' | '4k'
}
export type MeshyProvenance = {
  geometryProvider: 'meshy-7.1'
  taskId: string
  outputFormat: 'glb'
  source: 'IMAGE_TO_3D'
  verifiedOutputSha256?: string
  directorModel?: string
}
const EXACT_REFERENCE = 'https://cdn.shopify.com/s/files/1/1035/0172/6043/files/worldifact-ecomech-v4-reference-20261015.png?v=1792019787'
export function buildMeshyImagePayload(input: MeshyReferenceInput) {
  if (input.approvedImageUrl !== EXACT_REFERENCE ||
      !['2k','4k'].includes(input.geometryResolution) ||
      !input.texturePrompt || input.texturePrompt.length>800)
    throw new Error('Invalid explicitly reviewed character reference request.')
  return {
    image_url: input.approvedImageUrl,
    ai_model: MESHY_IMAGE_PROVIDER,
    model_type: 'standard' as const,
    geometry_resolution: input.geometryResolution,
    image_enhancement: false,
    should_texture: true,
    enable_pbr: true,
    // Official Meshy 7.1 guidance: do not remesh when maximizing surface fidelity.
    // Mobile LOD/retopology is a separate downstream validated stage.
    should_remesh: false,
    texture_resolution: '4k',
    texture_prompt: input.texturePrompt,
    target_formats: ['glb','fbx','obj'] as const,
    moderation: true,
  }
}
/**
 * Prepare-only function; cannot submit a paid request. The eventual job
 * orchestrator must enforce durable idempotency, provider-credit reservation,
 * cost-before-submit approval, and user image-sharing consent independently.
 */
export function buildMeshyOfflinePreview(input: MeshyReferenceInput) {
 const payload=buildMeshyImagePayload(input)
 return {
  readiness:'PREPARED_NOT_SUBMITTED' as const,
  selectedGeometryProvider:MESHY_IMAGE_PROVIDER,
  providerTaskId:null,
  paidJobsSubmitted:0,
  invoiceUsd:null,
  clientPoints:null,
  apiKeyUsed:false,
  request:payload,
 }
}
export function verifyMeshyTaskIdentity(expectedId: string, input: unknown) {
  if (!expectedId || expectedId.length>128 || !input || typeof input!=='object' ||
      Array.isArray(input))throw new Error('Invalid provider task response.')
  const obj=input as Record<string, unknown>
  if (obj.id!==expectedId || obj.type!=='image-to-3d' ||
      !['SUCCEEDED','IN_PROGRESS','FAILED','PENDING','CANCELED'].includes(String(obj.status)))
    throw new Error('Provider response does not match the original task.')
  const models=obj.model_urls
  if(obj.status==='SUCCEEDED' &&
     (!models||typeof models!=='object'||typeof (models as Record<string,unknown>).glb!=='string'))
    throw new Error('Successful task has no real GLB output.')
  return { taskId: expectedId, state: String(obj.status), outputAvailable:obj.status==='SUCCEEDED' }
}
