import type { SavedStudioJob } from './studioClient.ts'
import { archiveWriteDecision } from './studioView.ts'
import { FAST_DRAFT_PROFILE } from './studioProtocol.ts'
import { validateGenerationResult, type GenerationResult } from './blueprint.ts'

type ArchiveMetadata = { id: string; prompt: string; savedAt: string; byteLength: number; sha256: string; review: 'UNREVIEWED' }
// Missing source is a historical Studio entry. A blueprint identity is local
// provenance, never a signed Studio receipt or evidence of account ownership.
export type StudioArchiveEntry = ArchiveMetadata & (
  { source?: 'studio'; generationProfile?: typeof FAST_DRAFT_PROFILE; generation?: never } |
  { source: 'blueprint'; generation: GenerationResult; generationProfile?: never }
)
export const STUDIO_ARCHIVE_EVENT = 'worldifact:studio-archive-changed'
export const STUDIO_ARCHIVE_SIGNAL_KEY = 'worldifact-studio-archive-revision-v1'
function notifyStudioArchiveChanged(id: string) {
  if (typeof window === 'undefined') return
  try { window.dispatchEvent(new CustomEvent(STUDIO_ARCHIVE_EVENT, { detail: { id } })) } catch { /* Local archive stays valid even if UI notification fails. */ }
  try { window.localStorage.setItem(STUDIO_ARCHIVE_SIGNAL_KEY, `${Date.now()}:${id}`) } catch { /* Cross-tab notification is best-effort only. */ }
}
function openArchive(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('worldifact-studio-models', 1)
    let failed = false
    request.onupgradeneeded = () => {
      request.result.createObjectStore('metadata', { keyPath: 'id' })
      request.result.createObjectStore('models')
    }
    request.onsuccess = () => {
      if (failed) { request.result.close(); return }
      request.result.onversionchange = () => request.result.close()
      resolve(request.result)
    }
    request.onerror = () => { failed = true; reject(new Error('Device archive is unavailable. Download the original GLB to keep it.')) }
    request.onblocked = () => { failed = true; reject(new Error('Device archive is busy in another tab. Close that tab or download the GLB to keep it.')) }
  })
}
async function sha256(bytes: ArrayBuffer): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), v => v.toString(16).padStart(2, '0')).join('')
}
// Object-key order is not provider evidence. Compare its values without changing
// the original saved envelope, prompt, timestamps or file bytes on a retry.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`
  return JSON.stringify(value)
}
async function writeModel(entry: StudioArchiveEntry, blob: Blob, signal?: AbortSignal): Promise<StudioArchiveEntry> {
  signal?.throwIfAborted()
  const db = await openArchive()
  let stored = entry
  try {
    signal?.throwIfAborted()
    await new Promise<void>((resolve, reject) => {
      // One transaction serializes duplicate tabs/mounts and never overwrites a
      // conflicting original. Cancellation rolls back both metadata and bytes.
      const tx = db.transaction(['metadata', 'models'], 'readwrite')
      const metadata = tx.objectStore('metadata')
      const lookup = metadata.get(entry.id)
      let failure: unknown = null
      const abort = () => { failure = signal?.reason; tx.abort() }
      const cleanup = () => signal?.removeEventListener('abort', abort)
      signal?.addEventListener('abort', abort, { once: true })
      lookup.onsuccess = () => {
        try {
          signal?.throwIfAborted()
          const existing = lookup.result as StudioArchiveEntry | undefined
          if (existing && entry.source === 'blueprint' && (existing.source !== 'blueprint' || canonical(existing.generation) !== canonical(entry.generation))) {
            throw new Error('Different generation evidence is already saved for this request. The original was not overwritten. Download this GLB separately.')
          }
          if (archiveWriteDecision(existing, entry) === 'retain') { stored = existing!; return }
          metadata.add(entry)
          tx.objectStore('models').add(blob, entry.id)
        } catch (error) {
          failure = error instanceof Error ? error : new Error('Archive conflict. The original was not overwritten.')
          tx.abort()
        }
      }
      tx.oncomplete = () => { cleanup(); resolve() }
      tx.onabort = tx.onerror = () => { cleanup(); reject(failure || new Error('The model could not be saved on this device. Download the GLB; no older models were deleted.')) }
    })
  } finally { db.close() }
  notifyStudioArchiveChanged(stored.id)
  return stored
}
export async function saveStudioModel(saved: SavedStudioJob, blob: Blob): Promise<StudioArchiveEntry> {
  const entry: StudioArchiveEntry = { source: 'studio', id: saved.receipt.id, prompt: saved.prompt, savedAt: new Date().toISOString(), byteLength: blob.size,
    sha256: await sha256(await blob.arrayBuffer()), review: 'UNREVIEWED',
    ...(saved.generationProfile === FAST_DRAFT_PROFILE ? { generationProfile: FAST_DRAFT_PROFILE } : {}) }
  return writeModel(entry, blob)
}
/** Archive exactly the exported LIVE specification-derived GLB, locally only. */
export async function saveBlueprintModel(result: GenerationResult, prompt: string, blob: Blob, signal?: AbortSignal): Promise<StudioArchiveEntry> {
  signal?.throwIfAborted()
  const generation = structuredClone(validateGenerationResult(result))
  if (generation.mode !== 'LIVE' || generation.provenance !== 'GENERATED') throw new Error('Only a successful LIVE specification can be saved as a generated blueprint model.')
  if (!blob.size) throw new Error('The generated GLB is empty. No archive entry was created.')
  const [identity, hash] = await Promise.all([sha256(new TextEncoder().encode(generation.requestId).buffer), sha256(await blob.arrayBuffer())])
  return writeModel({ source: 'blueprint', id: `blueprint:${identity}`, prompt, savedAt: new Date().toISOString(), byteLength: blob.size,
    sha256: hash, review: 'UNREVIEWED', generation }, blob, signal)
}
export async function listStudioModels(): Promise<StudioArchiveEntry[]> {
  const db = await openArchive()
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction('metadata').objectStore('metadata').getAll()
      request.onsuccess = () => resolve((request.result as StudioArchiveEntry[]).sort((a, b) => b.savedAt.localeCompare(a.savedAt)))
      request.onerror = () => reject(new Error('Could not read the device archive.'))
    })
  } finally { db.close() }
}
export async function readStudioModel(id: string): Promise<Blob> {
  const db = await openArchive()
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction('models').objectStore('models').get(id)
      request.onsuccess = () => request.result instanceof Blob ? resolve(request.result) : reject(new Error('This model is not stored on this device.'))
      request.onerror = () => reject(new Error('Could not open the archived model.'))
    })
  } finally { db.close() }
}
