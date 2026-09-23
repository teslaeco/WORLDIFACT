/** Only the two existing, server-authorized avatar GETs; never a generation call. */
export type AvatarAsset = 'queen' | 'rapper'
const urls: Record<AvatarAsset, string> = { queen: '/api/avatar/neptune-queen', rapper: '/api/avatar/rapper-la' }
const cache = new Map<AvatarAsset, { controller: AbortController; promise: Promise<ArrayBuffer> }>()
const MAX_BYTES = 48 * 1024 * 1024
export function clearAvatarAssets() {
  for (const item of cache.values()) item.controller.abort()
  cache.clear()
}
export function loadAvatarBytes(choice: AvatarAsset): Promise<ArrayBuffer> {
  const present = cache.get(choice)
  if (present) return present.promise
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30_000)
  const entry = { controller, promise: Promise.resolve(new ArrayBuffer(0)) }
  entry.promise = (async () => {
    const response = await fetch(urls[choice], { credentials: 'same-origin', signal: controller.signal, redirect: 'error' })
    if (!response.ok || !response.body) throw new Error('The original character is temporarily unavailable.')
    const chunks: Uint8Array[] = []; let length = 0
    const reader = response.body.getReader()
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        length += value.byteLength
        if (length > MAX_BYTES) { controller.abort(); throw new Error('The character exceeds the preview size limit.') }
        chunks.push(value)
      }
    } finally { reader.releaseLock() }
    const bytes = new Uint8Array(length); let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    const header = new DataView(bytes.buffer)
    if (length < 20 || header.getUint32(0, true) !== 0x46546c67 || header.getUint32(4, true) !== 2 || header.getUint32(8, true) !== length) throw new Error('The original character response is not a complete GLB.')
    return bytes.buffer
  })().catch(error => { if (cache.get(choice) === entry) cache.delete(choice); throw error }).finally(() => clearTimeout(timeout))
  cache.set(choice, entry)
  return entry.promise
}
