/** Bounded, cancellable delivery of immutable public GAME assets. No generation/API calls. */
export type WorldAssetProgress = { phase: 'downloading' | 'verifying' | 'downloaded'; loaded: number; total: number }
export type WorldAssetRequest = { signal?: AbortSignal; onProgress?: (progress: WorldAssetProgress) => void; fetcher?: typeof fetch }
export type WorldAssetDescriptor = { url: string; gzipUrl?: string; bytes: number; sha256: string; label: string }
type Limits = { firstByteMs: number; stallMs: number; totalMs: number }
const DEFAULT_LIMITS: Limits = { firstByteMs: 45_000, stallMs: 20_000, totalMs: 150_000 }

/** Also bounds providers/decoders that fail to reject when their signal is aborted. */
export function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason)
    // Observe even an already-aborted operation, so a later decoder rejection is handled.
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
    if (signal.aborted) { reject(signal.reason); return }
    signal.addEventListener('abort', abort, { once: true })
  })
}

/** Transfer decoded resource ownership exactly once, including cancellation between promise microtasks. */
export async function abortableResource<T>(promise: Promise<T>, signal: AbortSignal, dispose: (value: T) => void): Promise<T> {
  let resource: T, available = false, cancelled = false, released = false
  const release = () => { if (available && !released) { released = true; dispose(resource) } }
  const observed = promise.then(value => {
    resource = value; available = true
    if (cancelled) release()
    return value
  })
  try {
    const value = await abortable(observed, signal)
    signal.throwIfAborted()
    return value
  } catch (error) {
    cancelled = true; release()
    throw error
  }
}

export class WorldAssetCompressionError extends Error {}

export function createVerifiedWorldAsset(descriptor: WorldAssetDescriptor, limits: Limits = DEFAULT_LIMITS) {
  let verified: ArrayBuffer | undefined
  let revalidate = false
  let compressionRejected = false
  type Entry = { controller: AbortController; promise: Promise<ArrayBuffer>; subscribers: Set<(value: WorldAssetProgress) => void>; progress: WorldAssetProgress }
  let pending: Entry | undefined

  async function download(entry: Entry, fetcher: typeof fetch) {
    const { signal } = entry.controller
    const timeout = () => entry.controller.abort(new DOMException(`${descriptor.label} download timed out. Please retry.`, 'TimeoutError'))
    let idle = setTimeout(timeout, limits.firstByteMs)
    const deadline = setTimeout(timeout, limits.totalMs)
    const activity = () => { clearTimeout(idle); idle = setTimeout(timeout, limits.stallMs) }
    const report = (phase: WorldAssetProgress['phase'], loaded: number) => {
      entry.progress = { phase, loaded, total: descriptor.bytes }
      for (const listener of entry.subscribers) listener(entry.progress)
    }
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
    const compressed = !!descriptor.gzipUrl && !compressionRejected && typeof DecompressionStream === 'function'
    try {
      signal.throwIfAborted()
      // Immutable job-specific URL + exact decoded SHA-256 make browser caching safe.
      const response = await abortable(fetcher(compressed ? descriptor.gzipUrl! : descriptor.url, {
        cache: revalidate ? 'reload' : 'force-cache', credentials: 'same-origin', redirect: 'error', signal,
      }), signal)
      if (!response.ok || !response.body || /text\/html/i.test(response.headers.get('content-type') ?? '')) {
        void response.body?.cancel().catch(() => {})
        if (compressed) { compressionRejected = true; throw new WorldAssetCompressionError(`${descriptor.label} compressed delivery unavailable. Loading the original file…`) }
        throw new Error(`${descriptor.label} asset unavailable (${response.status}). Please retry.`)
      }
      try {
        const stream = compressed ? response.body.pipeThrough(new DecompressionStream('gzip')) : response.body
        reader = stream.getReader()
      } catch (error) {
        if (compressed) { compressionRejected = true; throw new WorldAssetCompressionError(`${descriptor.label} compressed decoding unavailable. Loading the original file…`, { cause: error }) }
        throw error
      }
      const bytes = new Uint8Array(descriptor.bytes)
      let loaded = 0, shownPercent = -1
      activity()
      for (;;) {
        let chunk: Awaited<ReturnType<typeof reader.read>>
        try { chunk = await abortable(reader.read(), signal) }
        catch (error) {
          if (compressed && !signal.aborted) { compressionRejected = true; throw new WorldAssetCompressionError(`${descriptor.label} compressed decoding unavailable. Loading the original file…`, { cause: error }) }
          throw error
        }
        const { done, value } = chunk
        if (done) break
        if (loaded + value.byteLength > bytes.byteLength) throw new Error(`${descriptor.label} size mismatch.`)
        bytes.set(value, loaded); loaded += value.byteLength
        activity()
        const percent = Math.floor(loaded / bytes.byteLength * 100)
        if (percent !== shownPercent) { shownPercent = percent; report('downloading', loaded) }
      }
      if (loaded !== descriptor.bytes) throw new Error(`${descriptor.label} size mismatch (${loaded}).`)
      const header = new DataView(bytes.buffer)
      if (loaded < 20 || header.getUint32(0, true) !== 0x46546c67 || header.getUint32(4, true) !== 2 || header.getUint32(8, true) !== loaded)
        throw new Error(`${descriptor.label} GLB container invalid.`)
      report('verifying', loaded)
      if (!globalThis.crypto?.subtle) throw new Error('Browser SHA-256 unavailable.')
      const digest = await abortable(globalThis.crypto.subtle.digest('SHA-256', bytes), signal)
      const hash = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('')
      if (hash !== descriptor.sha256) throw new Error(`${descriptor.label} hash mismatch.`)
      signal.throwIfAborted()
      report('downloaded', loaded)
      verified = bytes.buffer
      return verified
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) revalidate = true
      // Do not wait for a stalled network/decoder to acknowledge cancellation.
      void reader?.cancel().catch(() => {})
      entry.controller.abort(error)
      throw error
    } finally {
      clearTimeout(idle); clearTimeout(deadline)
      reader?.releaseLock()
      if (pending === entry) pending = undefined
    }
  }

  return {
    load({ signal, onProgress, fetcher = fetch }: WorldAssetRequest = {}): Promise<ArrayBuffer> {
      if (signal?.aborted) return Promise.reject(signal.reason)
      if (verified) {
        onProgress?.({ phase: 'downloaded', loaded: verified.byteLength, total: descriptor.bytes })
        return Promise.resolve(verified)
      }
      let entry = pending
      if (!entry) {
        entry = { controller: new AbortController(), promise: Promise.resolve(new ArrayBuffer(0)), subscribers: new Set(), progress: { phase: 'downloading', loaded: 0, total: descriptor.bytes } }
        pending = entry
        const started = entry
        entry.promise = Promise.resolve().then(() => download(started, fetcher))
      }
      return new Promise<ArrayBuffer>((resolve, reject) => {
        const listener = (value: WorldAssetProgress) => onProgress?.(value)
        const cleanup = () => {
          signal?.removeEventListener('abort', abort)
          entry.subscribers.delete(listener)
          if (!entry.subscribers.size && pending === entry) {
            pending = undefined
            entry.controller.abort(new DOMException('World asset is no longer needed.', 'AbortError'))
          }
        }
        const abort = () => { cleanup(); reject(signal!.reason) }
        entry.subscribers.add(listener)
        signal?.addEventListener('abort', abort, { once: true })
        listener(entry.progress)
        entry.promise.then(value => { cleanup(); resolve(value) }, error => { cleanup(); reject(error) })
      })
    },
  }
}
