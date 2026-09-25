/** Existing, read-only avatar assets; never a generation call. */
export type AvatarAsset = 'queen' | 'rapper'
export type AvatarProgress = { phase: 'waiting' | 'downloading' | 'retrying' | 'downloaded'; loaded: number; total: number; attempt: number }

const QUEEN_TOTAL_BYTES = 27_676_800
const QUEEN_PART_MAX_BYTES = 14 * 1024 * 1024
const QUEEN_STATIC_PARTS = [
  '/game-assets/queen-1bbc9311605543b459318f212e791d05fbfa5450820e3433c4145d885ee948ba.glb.part-00.bin',
  '/game-assets/queen-1bbc9311605543b459318f212e791d05fbfa5450820e3433c4145d885ee948ba.glb.part-01.bin',
] as const
const RAPPER_URL = '/api/avatar/rapper-la'
const MAX_BYTES = 48 * 1024 * 1024
const FIRST_BYTE_MS = 90_000, STALL_MS = 30_000, MAX_DOWNLOAD_MS = 180_000
const cache = new Map<AvatarAsset, { controller: AbortController; promise: Promise<ArrayBuffer> }>()
const progress = new Map<AvatarAsset, AvatarProgress>()
const listeners = new Map<AvatarAsset, Set<(value: AvatarProgress) => void>>()

function report(choice: AvatarAsset, value: AvatarProgress) {
  const previous = progress.get(choice)
  progress.set(choice, value)
  if (previous && avatarProgressLabel(previous) === avatarProgressLabel(value)) return
  listeners.get(choice)?.forEach(listener => listener(value))
}
export function subscribeAvatarProgress(choice: AvatarAsset, listener: (value: AvatarProgress) => void) {
  let set = listeners.get(choice)
  if (!set) { set = new Set(); listeners.set(choice, set) }
  set.add(listener)
  listener(progress.get(choice) ?? { phase: 'waiting', loaded: 0, total: 0, attempt: 1 })
  return () => { set.delete(listener); if (!set.size) listeners.delete(choice) }
}
export function avatarProgressLabel(value: AvatarProgress | null) {
  if (value?.phase === 'retrying') return 'Connection interrupted. Retrying the original character…'
  if (value?.phase === 'downloaded') return 'Preparing the original character and animation…'
  if (value?.phase === 'downloading' && value.total > 0) return `Loading the original detailed character… ${Math.min(100, Math.floor(value.loaded / value.total * 100))}%`
  return 'Loading the original detailed character…'
}
export function clearAvatarAssets() {
  for (const item of cache.values()) item.controller.abort()
  cache.clear(); progress.clear()
}
class AvatarDownloadError extends Error {
  retryable: boolean
  constructor(message: string, retryable = false) { super(message); this.retryable = retryable }
}
function retryDelay(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return }
    const abort = () => { clearTimeout(timer); reject(signal.reason) }
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve() }, 800)
    signal.addEventListener('abort', abort, { once: true })
  })
}
function validateGlb(bytes: Uint8Array, expectedLength: number, message: string, retryable = false) {
  if (bytes.byteLength !== expectedLength || bytes.byteLength < 20) throw new AvatarDownloadError(message, retryable)
  const header = new DataView(bytes.buffer, bytes.byteOffset, 12)
  if (header.getUint32(0, true) !== 0x46546c67 || header.getUint32(4, true) !== 2 || header.getUint32(8, true) !== bytes.byteLength)
    throw new AvatarDownloadError(message, retryable)
}

async function downloadQueenStatic(parent: AbortSignal, attempt: number) {
  parent.throwIfAborted()
  const controller = new AbortController()
  const abort = () => controller.abort(parent.reason)
  parent.addEventListener('abort', abort, { once: true })
  const timedOut = () => controller.abort(new DOMException('Character download timed out.', 'TimeoutError'))
  let idle = setTimeout(timedOut, FIRST_BYTE_MS)
  const deadline = setTimeout(timedOut, MAX_DOWNLOAD_MS)
  const resetIdle = (ms: number) => { clearTimeout(idle); idle = setTimeout(timedOut, ms) }
  const target = new Uint8Array(QUEEN_TOTAL_BYTES)
  let offset = 0
  report('queen', { phase: 'waiting', loaded: 0, total: QUEEN_TOTAL_BYTES, attempt })
  try {
    for (const partUrl of QUEEN_STATIC_PARTS) {
      resetIdle(FIRST_BYTE_MS)
      const init: RequestInit & { priority: 'high' } = { credentials: 'same-origin', signal: controller.signal, redirect: 'error', priority: 'high', cache: 'force-cache' }
      const response = await fetch(partUrl, init)
      if (!response.ok || !response.body) {
        await response.body?.cancel()
        throw new AvatarDownloadError('The original character static part is temporarily unavailable.', [404, 408, 500, 502, 503, 504].includes(response.status))
      }
      const declared = Number(response.headers.get('content-length') || 0)
      if (!Number.isSafeInteger(declared) || declared < 0 || declared > QUEEN_PART_MAX_BYTES || offset + declared > QUEEN_TOTAL_BYTES) {
        await response.body.cancel()
        throw new AvatarDownloadError('The original character static part has an invalid size.', true)
      }
      const reader = response.body.getReader()
      let partBytes = 0
      resetIdle(STALL_MS)
      try {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          controller.signal.throwIfAborted()
          if (partBytes + value.byteLength > QUEEN_PART_MAX_BYTES || offset + value.byteLength > QUEEN_TOTAL_BYTES)
            throw new AvatarDownloadError('The original character exceeds the preview size limit.')
          target.set(value, offset)
          offset += value.byteLength
          partBytes += value.byteLength
          resetIdle(STALL_MS)
          report('queen', { phase: 'downloading', loaded: offset, total: QUEEN_TOTAL_BYTES, attempt })
        }
      } catch (error) { await reader.cancel().catch(() => {}); throw error }
      finally { reader.releaseLock() }
      if (!partBytes || (declared && declared !== partBytes)) throw new AvatarDownloadError('The original character static part was incomplete.', true)
    }
    controller.signal.throwIfAborted()
    validateGlb(target, QUEEN_TOTAL_BYTES, 'The original character response is not a complete GLB.', true)
    report('queen', { phase: 'downloaded', loaded: QUEEN_TOTAL_BYTES, total: QUEEN_TOTAL_BYTES, attempt })
    return target.buffer
  } finally {
    clearTimeout(idle); clearTimeout(deadline); parent.removeEventListener('abort', abort)
  }
}

async function downloadRapper(parent: AbortSignal, attempt: number) {
  parent.throwIfAborted()
  const controller = new AbortController()
  const abort = () => controller.abort(parent.reason)
  parent.addEventListener('abort', abort, { once: true })
  const timedOut = () => controller.abort(new DOMException('Character download timed out.', 'TimeoutError'))
  let idle = setTimeout(timedOut, FIRST_BYTE_MS)
  const deadline = setTimeout(timedOut, MAX_DOWNLOAD_MS)
  const activity = () => { clearTimeout(idle); idle = setTimeout(timedOut, STALL_MS) }
  report('rapper', { phase: 'waiting', loaded: 0, total: 0, attempt })
  try {
    const init: RequestInit & { priority: 'high' } = { credentials: 'same-origin', signal: controller.signal, redirect: 'error', priority: 'high' }
    const response = await fetch(RAPPER_URL, init)
    if (!response.ok || !response.body) {
      await response.body?.cancel()
      throw new AvatarDownloadError('The original character is temporarily unavailable.', [408, 500, 502, 503, 504].includes(response.status))
    }
    const declared = Number(response.headers.get('X-WORLDIFACT-GLB-Length') || (!response.headers.get('content-encoding') ? response.headers.get('content-length') : '') || 0)
    if (!Number.isSafeInteger(declared) || declared < 0 || (declared > 0 && declared < 20) || declared > MAX_BYTES) {
      await response.body.cancel(); throw new AvatarDownloadError('The character exceeds the preview size limit.')
    }
    const target = declared ? new Uint8Array(declared) : null
    const chunks: Uint8Array[] = []; let length = 0
    const reader = response.body.getReader()
    activity()
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        controller.signal.throwIfAborted()
        if (length + value.byteLength > (declared || MAX_BYTES)) throw new AvatarDownloadError('The character exceeds the preview size limit.')
        if (target) target.set(value, length); else chunks.push(value)
        length += value.byteLength
        activity()
        report('rapper', { phase: 'downloading', loaded: length, total: declared, attempt })
      }
    } catch (error) { await reader.cancel().catch(() => {}); throw error }
    finally { reader.releaseLock() }
    controller.signal.throwIfAborted()
    const bytes = target ?? new Uint8Array(length); let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    validateGlb(bytes, length, 'The original character response is not a complete GLB.')
    report('rapper', { phase: 'downloaded', loaded: length, total: length, attempt })
    return bytes.buffer
  } finally {
    clearTimeout(idle); clearTimeout(deadline); parent.removeEventListener('abort', abort)
  }
}

async function download(choice: AvatarAsset, parent: AbortSignal, attempt: number) {
  return choice === 'queen' ? downloadQueenStatic(parent, attempt) : downloadRapper(parent, attempt)
}

export function loadAvatarBytes(choice: AvatarAsset): Promise<ArrayBuffer> {
  const present = cache.get(choice)
  if (present) return present.promise
  const controller = new AbortController()
  const entry = { controller, promise: Promise.resolve(new ArrayBuffer(0)) }
  entry.promise = (async () => {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try { return await download(choice, controller.signal, attempt) }
      catch (error) {
        controller.signal.throwIfAborted()
        const transient = error instanceof AvatarDownloadError ? error.retryable : error instanceof TypeError || (error instanceof DOMException && ['AbortError', 'TimeoutError'].includes(error.name))
        if (!transient || attempt === 3) throw error
        report(choice, { phase: 'retrying', loaded: 0, total: choice === 'queen' ? QUEEN_TOTAL_BYTES : 0, attempt: attempt + 1 })
        await retryDelay(controller.signal)
      }
    }
    throw new Error('The original character could not be loaded.')
  })().catch(error => { if (cache.get(choice) === entry) cache.delete(choice); throw error })
  cache.set(choice, entry)
  return entry.promise
}
