import { inspectRetainedStudioGLB } from '../src/lib/studioGlbIntegrity.ts'

/** Private account-bound R2 backup: never configure a public bucket endpoint. */
export const MAX_INCOMPLETE_R2_GLB_BYTES = 16 * 1024 * 1024
export const INCOMPLETE_R2_REVISION = 'worldifact-incomplete-glb-r2-v1' as const
export const INCOMPLETE_R2_ATTESTATION = 'r2-sha256-readback-v1' as const

export interface IncompleteGlbR2Object {
  size: number
  customMetadata: Record<string, string>
  arrayBuffer(): Promise<ArrayBuffer>
}
export interface IncompleteGlbR2Bucket {
  get(key: string): Promise<IncompleteGlbR2Object | null>
  put(key: string, value: ArrayBuffer, options: {
    httpMetadata: { contentType: string }
    customMetadata: Record<string, string>
    sha256: string
  }): Promise<{ size: number } | null>
}
export interface IncompleteGlbR2Env {
  ENABLE_INCOMPLETE_R2_BACKUP?: string
  INCOMPLETE_GLB_BACKUP?: IncompleteGlbR2Bucket
}
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/
const HASH = /^[a-f0-9]{64}$/

function backupKey(owner: string, job: string, sha256: string) {
  if (!UUID.test(owner) || !UUID.test(job) || !HASH.test(sha256))
    throw new Error('Invalid owner, job or immutable GLB checksum.')
  return `incomplete-glb-v1/${owner}/${job}/${sha256}.glb`
}
const hex = (buffer: ArrayBuffer) => [...new Uint8Array(buffer)].map(byte => byte.toString(16).padStart(2, '0')).join('')
async function sha(buffer: ArrayBuffer) { return hex(await crypto.subtle.digest('SHA-256', buffer)) }
const metadata = (owner: string, job: string, sha256: string) => ({
  revision: INCOMPLETE_R2_REVISION, owner, job, sha256,
})
function matchMetadata(data: Record<string, string> | undefined, owner: string, job: string, sha256: string): boolean {
  return !!data && data.revision === INCOMPLETE_R2_REVISION &&
    data.owner === owner && data.job === job && data.sha256 === sha256
}
export function incompleteBackupEnabled(env: IncompleteGlbR2Env): boolean {
  return env.ENABLE_INCOMPLETE_R2_BACKUP === 'true' && !!env.INCOMPLETE_GLB_BACKUP
}

/** No R2 access occurs without both the explicit switch and private binding. */
export async function readRetainedIncompleteBackup(env: IncompleteGlbR2Env,
  owner: string, job: string, sha256: string): Promise<ArrayBuffer | null> {
  if (!incompleteBackupEnabled(env)) return null
  const key = backupKey(owner, job, sha256)
  const object = await env.INCOMPLETE_GLB_BACKUP!.get(key)
  if (!object) return null
  if (!Number.isSafeInteger(object.size) || object.size < 20 ||
      object.size > MAX_INCOMPLETE_R2_GLB_BYTES ||
      !matchMetadata(object.customMetadata, owner, job, sha256))
    throw new Error('Private GLB backup metadata does not match the account and original job.')
  const buffer = await object.arrayBuffer()
  if (buffer.byteLength !== object.size || await sha(buffer) !== sha256)
    throw new Error('Private GLB backup bytes do not match the original SHA-256.')
  inspectRetainedStudioGLB(buffer)
  return buffer
}

/**
 * Opt-in same-job backup, with verified immutable readback BEFORE an account
 * record can state R2-backed. No paid provider call or billing mutation.
 * Missing configuration / oversized models return false (Oracle-only).
 */
export async function preserveRetainedIncompleteBackup(env: IncompleteGlbR2Env,
  owner: string, job: string, sha256: string, buffer: ArrayBuffer): Promise<boolean> {
  if (!incompleteBackupEnabled(env) || buffer.byteLength > MAX_INCOMPLETE_R2_GLB_BYTES)
    return false
  const key = backupKey(owner, job, sha256)
  if (await sha(buffer) !== sha256) throw new Error('The source GLB SHA-256 changed before backup.')
  inspectRetainedStudioGLB(buffer)
  const existing = await readRetainedIncompleteBackup(env, owner, job, sha256)
  if (existing) return true
  const result = await env.INCOMPLETE_GLB_BACKUP!.put(key, buffer, {
    httpMetadata: { contentType: 'model/gltf-binary' },
    customMetadata: metadata(owner, job, sha256),
    sha256,
  })
  if (!result || result.size !== buffer.byteLength)
    throw new Error('Private GLB backup write could not be confirmed.')
  const verified = await readRetainedIncompleteBackup(env, owner, job, sha256)
  if (!verified) throw new Error('Private GLB backup readback was unavailable.')
  return true
}
