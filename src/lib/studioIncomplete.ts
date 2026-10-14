import { isStudioExecution, type StudioExecution } from './studioExecution.ts'
import { isStudioProviderEvidence, type StudioProviderEvidence } from './studioProviderEvidence.ts'

/** Durable *metadata only* for a real Oracle-retained, structurally inspected GLB.
 * The canonical account job remains FAILED with its original point settlement.
 * A candidate is not a reviewed model, manufactured asset or a paid continuation. */
export const STUDIO_INCOMPLETE_REVISION = 'studio-incomplete-candidate-v1' as const
export const STUDIO_INCOMPLETE_BACKUP_PROOF = 'r2-sha256-readback-v1' as const
export const STUDIO_INCOMPLETE_PREFIX = 'studio-incomplete-v1:' as const
export const STUDIO_INCOMPLETE_INDEX_KEY = 'studio-incomplete-index-v1' as const
export const STUDIO_INCOMPLETE_CAPACITY = 24
export const STUDIO_INCOMPLETE_REASONS = ['MODEL_BUDGET_EXCEEDED', 'ASTRA_COST_LIMIT', 'ORACLE_JOB_INCOMPLETE'] as const
export type StudioIncompleteReason = typeof STUDIO_INCOMPLETE_REASONS[number]
export type StudioIncompleteRecord = {
  revision: typeof STUDIO_INCOMPLETE_REVISION
  id: string
  modelSha256: string
  at: number
  failureCode: StudioIncompleteReason
  studioExecution: StudioExecution
  providerEvidence?: StudioProviderEvidence
  /** Verified at write/readback, not a promise that future storage never fails. */
  backupVerified?: typeof STUDIO_INCOMPLETE_BACKUP_PROOF
}
export type StudioIncompleteIndex = { revision: 'studio-incomplete-index-v1'; ids: string[] }
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/
const HASH = /^[a-f0-9]{64}$/
const obj = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
export const isStudioIncompleteReason = (value: unknown): value is StudioIncompleteReason =>
  typeof value === 'string' && (STUDIO_INCOMPLETE_REASONS as readonly string[]).includes(value)

export function readStudioIncompleteRecord(value: unknown): StudioIncompleteRecord | null {
  const keys = ['at', 'failureCode', 'id', 'modelSha256', 'revision', 'studioExecution',
    ...(obj(value) && value.providerEvidence !== undefined ? ['providerEvidence'] : []),
    ...(obj(value) && value.backupVerified !== undefined ? ['backupVerified'] : [])]
  if (!obj(value) || Object.keys(value).sort().join(',') !== keys.sort().join(',') ||
    value.revision !== STUDIO_INCOMPLETE_REVISION || typeof value.id !== 'string' || !UUID.test(value.id) ||
    typeof value.modelSha256 !== 'string' || !HASH.test(value.modelSha256) ||
    !Number.isSafeInteger(value.at) || Number(value.at) <= 0 ||
    !isStudioIncompleteReason(value.failureCode) || !isStudioExecution(value.studioExecution) ||
    (value.providerEvidence !== undefined && !isStudioProviderEvidence(value.providerEvidence, value.studioExecution)) ||
    (value.backupVerified !== undefined && value.backupVerified !== STUDIO_INCOMPLETE_BACKUP_PROOF))
    return null
  return {
    revision: STUDIO_INCOMPLETE_REVISION, id: value.id, modelSha256: value.modelSha256,
    at: Number(value.at), failureCode: value.failureCode, studioExecution: value.studioExecution,
    ...(value.providerEvidence !== undefined ? { providerEvidence: value.providerEvidence } : {}),
    ...(value.backupVerified === STUDIO_INCOMPLETE_BACKUP_PROOF ? { backupVerified: STUDIO_INCOMPLETE_BACKUP_PROOF } : {}),
  }
}
export function readStudioIncompleteIndex(value: unknown): StudioIncompleteIndex | null {
  if (value === undefined) return { revision: 'studio-incomplete-index-v1', ids: [] }
  if (!obj(value) || Object.keys(value).sort().join(',') !== 'ids,revision' ||
    value.revision !== 'studio-incomplete-index-v1' || !Array.isArray(value.ids) ||
    value.ids.length > STUDIO_INCOMPLETE_CAPACITY ||
    value.ids.some(id => typeof id !== 'string' || !UUID.test(id)) ||
    new Set(value.ids).size !== value.ids.length) return null
  return { revision: 'studio-incomplete-index-v1', ids: [...value.ids] }
}
export function addStudioIncompleteIndex(value: unknown, id: string): StudioIncompleteIndex | null {
  const existing = readStudioIncompleteIndex(value)
  if (!existing || !UUID.test(id)) return null
  return { revision: 'studio-incomplete-index-v1',
    ids: [id, ...existing.ids.filter(previous => previous !== id)].slice(0, STUDIO_INCOMPLETE_CAPACITY) }
}
