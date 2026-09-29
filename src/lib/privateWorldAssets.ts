import { WORLD_ID } from './privateWorld.ts'
import { inspectGLB } from './glb.ts'
export type WorldAsset = { id: string; owner: string; name: string; bytes: number; sha256: string }
const validOwner = (owner: string) => { if (!WORLD_ID.test(owner)) throw new Error('A verified account is required for this library.') }
const key = (owner: string, id: string) => `${owner.toLowerCase()}:${id.toLowerCase()}`
async function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('worldifact-private-world-assets', 1)
    r.onupgradeneeded = () => { r.result.createObjectStore('assets', { keyPath: 'key' }); r.result.createObjectStore('blobs') }
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(new Error('Local model storage is unavailable.'))
    r.onblocked = () => reject(new Error('Close another library tab and retry.'))
  })
}
export async function listWorldAssets(owner: string): Promise<WorldAsset[]> {
  validOwner(owner); const db = await open()
  try {
    return await new Promise((resolve, reject) => {
      const r = db.transaction('assets').objectStore('assets').getAll()
      r.onsuccess = () => resolve((r.result as WorldAsset[]).filter(v => v.owner === owner.toLowerCase()).map(({ id, owner, name, bytes, sha256 }) => ({ id, owner, name, bytes, sha256 })))
      r.onerror = () => reject(new Error('Library could not be read.'))
    })
  } finally { db.close() }
}
export async function storeWorldAsset(owner: string, name: string, blob: Blob): Promise<WorldAsset> {
  validOwner(owner)
  if (blob.size > 50_000_000 || blob.size < 20) throw new Error('Use an embedded GLB up to 50 MB.')
  const bytes = await blob.arrayBuffer(); inspectGLB(bytes)
  const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('')
  const item: WorldAsset = { id: crypto.randomUUID(), owner: owner.toLowerCase(), name: name.slice(0, 100) || 'Imported model', bytes: blob.size, sha256 }
  const db = await open(); let stored = item
  try {
    await new Promise<void>((resolve, reject) => {
      // Count, deduplicate and insert atomically, including parallel browser tabs.
      const tx = db.transaction(['assets', 'blobs'], 'readwrite'), metadata = tx.objectStore('assets')
      const read = metadata.getAll(); let failure: Error | null = null
      read.onsuccess = () => {
        const owned = (read.result as WorldAsset[]).filter(v => v.owner === owner.toLowerCase())
        const previous = owned.find(v => v.sha256 === sha256)
        if (previous) { stored = previous; return }
        if (owned.reduce((n, e) => n + e.bytes, 0) + blob.size > 350_000_000) {
          failure = new Error('This device library reached its 350 MB storage budget. No per-model count limit; originals remain in your gallery.'); tx.abort(); return
        }
        metadata.add({ ...item, key: key(owner, item.id) }); tx.objectStore('blobs').add(blob, key(owner, item.id))
      }
      tx.oncomplete = () => resolve()
      tx.onabort = tx.onerror = () => reject(failure || new Error('Model could not be stored; no original was changed.'))
    })
  } finally { db.close() }
  window.dispatchEvent(new Event('worldifact-private-library')); return stored
}
export async function loadWorldAsset(owner: string, id: string): Promise<Blob> {
  validOwner(owner); if (!WORLD_ID.test(id)) throw new Error('Invalid model.')
  const db = await open()
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(['assets', 'blobs'])
      const m = tx.objectStore('assets').get(key(owner, id)), b = tx.objectStore('blobs').get(key(owner, id))
      tx.oncomplete = () => { if (m.result?.owner === owner.toLowerCase() && b.result instanceof Blob) resolve(b.result); else reject(new Error('This model is not in your device library. Import its GLB on this device.')) }
      tx.onerror = () => reject(new Error('Cannot read your model.'))
    })
  } finally { db.close() }
}
