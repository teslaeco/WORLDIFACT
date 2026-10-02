import { PREVIEW_LIMIT } from './previewBudget.ts'

type Options<T> = {
  read: (id: string) => Promise<Blob>
  decode: (bytes: ArrayBuffer) => Promise<T>
  release: (value: T) => void
  onLoaded: (id: string) => void
  onError: (id: string, error: Error) => void
  isCurrent?: () => boolean
  byteLimit?: number
}

/** One editor world's render cache. Failures require an explicit recovery signal. */
export function createPrivateWorldPreviewAssets<T>(options: Options<T>) {
  type Entry = { id: string; promise: Promise<T | null>; resolve: (value: T | null) => void }
  const cache = new Map<string, { value: T; bytes: number }>(), pending = new Map<string, Entry>(), failed = new Set<string>()
  const queue: Entry[] = []
  const byteLimit = options.byteLimit ?? PREVIEW_LIMIT.bytes
  let closed = false, active = 0, loadedBytes = 0, reservedBytes = 0
  let retained: Set<string> | null = null
  const needed = (id: string) => !closed && (options.isCurrent?.() ?? true) && (retained === null || retained.has(id))

  function pump() {
    while (!closed && active < 2 && queue.length) {
      const entry = queue.shift()!
      if (!needed(entry.id)) { pending.delete(entry.id); entry.resolve(null); continue }
      active++
      void load(entry)
    }
  }
  async function load(entry: Entry) {
    let reserved = 0, result: T | null = null
    try {
      const blob = await options.read(entry.id)
      if (!needed(entry.id)) return
      if (loadedBytes + reservedBytes + blob.size > byteLimit)
        throw new Error('Loaded model files reached the 96 MB interactive budget. Remove unused models or open another world, then retry previews; originals are preserved.')
      reserved = blob.size
      reservedBytes += reserved
      const bytes = await blob.arrayBuffer()
      if (!needed(entry.id)) return
      const decoded = await options.decode(bytes)
      if (!needed(entry.id)) { options.release(decoded); return }
      cache.set(entry.id, { value: decoded, bytes: reserved })
      loadedBytes += reserved
      // Transfer this allocation from in-flight to cached before onLoaded can queue work.
      reservedBytes -= reserved
      reserved = 0
      result = decoded
      options.onLoaded(entry.id)
    } catch (error) {
      if (needed(entry.id)) {
        // A scene subscriber can fail after decoding succeeded. Keep the valid
        // source cached rather than mislabelling it as a failed file load.
        if (!cache.has(entry.id)) failed.add(entry.id)
        options.onError(entry.id, error instanceof Error ? error : new Error('Model preview unavailable. The original and placement remain.'))
      }
    } finally {
      reservedBytes -= reserved
      active--
      pending.delete(entry.id)
      entry.resolve(result)
      pump()
    }
  }
  function request(id: string): Promise<T | null> {
    if (!needed(id)) return Promise.resolve(null)
    const existing = cache.get(id)
    if (existing !== undefined) return Promise.resolve(existing.value)
    const underway = pending.get(id)
    if (underway) return underway.promise
    if (failed.has(id)) return Promise.resolve(null)
    let resolve!: (value: T | null) => void
    const promise = new Promise<T | null>(done => { resolve = done })
    const entry = { id, promise, resolve }
    pending.set(id, entry)
    queue.push(entry)
    pump()
    return promise
  }
  function retryFailed() {
    const ids = [...failed]
    failed.clear()
    return Promise.all(ids.map(request))
  }
  function retain(ids: Iterable<string>) {
    retained = new Set(ids)
    for (const [id, item] of cache) if (!retained.has(id)) {
      cache.delete(id)
      loadedBytes -= item.bytes
      options.release(item.value)
    }
    for (const id of failed) if (!retained.has(id)) failed.delete(id)
    for (let i = queue.length - 1; i >= 0; i--) if (!retained.has(queue[i].id)) {
      const [entry] = queue.splice(i, 1)
      pending.delete(entry.id)
      entry.resolve(null)
    }
  }
  function dispose() {
    if (closed) return
    closed = true
    for (const entry of queue.splice(0)) { pending.delete(entry.id); entry.resolve(null) }
    failed.clear()
    cache.forEach(item => options.release(item.value))
    cache.clear()
    loadedBytes = 0
  }
  return { get: (id: string) => cache.get(id)?.value, request, retryFailed, retain, dispose, failedCount: () => failed.size }
}
