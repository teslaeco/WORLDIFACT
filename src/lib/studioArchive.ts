import type { SavedStudioJob } from './studioClient.ts'
import { archiveWriteDecision } from './studioView.ts'

export type StudioArchiveEntry = { id: string; prompt: string; savedAt: string; byteLength: number; sha256: string; review: 'UNREVIEWED' }
function openArchive(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('worldifact-studio-models', 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore('metadata', { keyPath: 'id' })
      request.result.createObjectStore('models')
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(new Error('Device archive is unavailable. Download the original GLB to keep it.'))
    request.onblocked = () => reject(new Error('Device archive is busy in another tab. Download the GLB to keep it.'))
  })
}
export async function saveStudioModel(saved: SavedStudioJob, blob: Blob): Promise<StudioArchiveEntry> {
  const hash = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  const entry: StudioArchiveEntry = { id: saved.receipt.id, prompt: saved.prompt, savedAt: new Date().toISOString(), byteLength: blob.size,
    sha256: Array.from(new Uint8Array(hash), v => v.toString(16).padStart(2, '0')).join(''), review: 'UNREVIEWED' }
  const db = await openArchive()
  let stored = entry
  try {
    await new Promise<void>((resolve, reject) => {
      // Read/compare/write within one transaction: another tab cannot replace
      // original bytes between the comparison and commit.
      const tx = db.transaction(['metadata', 'models'], 'readwrite')
      const metadata = tx.objectStore('metadata')
      const lookup = metadata.get(entry.id)
      let failure: Error | null = null
      lookup.onsuccess = () => {
        try {
          const existing = lookup.result as StudioArchiveEntry | undefined
          if (archiveWriteDecision(existing, entry) === 'retain') { stored = existing!; return }
          metadata.add(entry)
          tx.objectStore('models').add(blob, entry.id)
        } catch (error) {
          failure = error instanceof Error ? error : new Error('Archive conflict. The original was not overwritten.')
          tx.abort()
        }
      }
      tx.oncomplete = () => resolve()
      tx.onabort = tx.onerror = () => reject(failure || new Error('The model could not be saved on this device. Download the GLB; no older models were deleted.'))
    })
  } finally { db.close() }
  return stored
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
