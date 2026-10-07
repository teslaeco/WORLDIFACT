/** Reviewed public GAME examples, independent of the signed-in account library. */
export const PUBLIC_MODELS = [
  { id: 'mars-solar-landship', name: 'Mars Solar Landship', category: 'EXPLORATION',
    description: 'A solar-powered explorer for another world.',
    detail: 'Public GAME model · optimized base-color materials',
    path: '/gallery-assets/mars-solar-landship.glb', bytes: 1_291_820,
    sha256: '7f27b281103325aa6f2aa58fcc396be7cf319bc683a91c4798ca374d592d70c3' },
  { id: 'led-polyhedron', name: 'LED Polyhedron', category: 'OBJECTS & LIGHT',
    description: 'An open-frame sculpture, built around light.',
    detail: 'Public GAME model · original geometry, LED materials',
    path: '/gallery-assets/led-polyhedron.glb', bytes: 185_860,
    sha256: '8f1c2e923d654a03159baf36b711abdb8f94d04ae6843634bd8fe343750e2681' },
] as const
export type PublicModel = (typeof PUBLIC_MODELS)[number]
export const PUBLIC_FAVORITE_PREFIX = 'worldifact:public-model-heart:v1:'
type HeartStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
export function readPublicHearts(storage: HeartStorage): string[] {
  return PUBLIC_MODELS.filter(model => storage.getItem(PUBLIC_FAVORITE_PREFIX + model.id) === '1').map(model => model.id)
}
export function writePublicHeart(storage: HeartStorage, id: string, wanted: boolean) {
  if (!PUBLIC_MODELS.some(model => model.id === id)) throw Error('Unknown public model.')
  if (wanted) storage.setItem(PUBLIC_FAVORITE_PREFIX + id, '1')
  else storage.removeItem(PUBLIC_FAVORITE_PREFIX + id)
}
/** Only pinned same-origin public bytes, without account cookies or redirects. */
export async function readPublicModel(model: PublicModel, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<Blob> {
  if (!PUBLIC_MODELS.includes(model)) throw Error('Unknown public model.')
  signal = AbortSignal.any([signal, AbortSignal.timeout(20_000)])
  signal.throwIfAborted()
  const response = await fetcher(model.path, { method: 'GET', credentials: 'omit', redirect: 'error', signal })
  if (!response.ok || !response.body) throw Error('The public model is temporarily unavailable.')
  const reader = response.body.getReader(), chunks: Uint8Array[] = []
  let length = 0
  try {
    const advertised = response.headers.get('content-length')
    if (advertised !== null && Number(advertised) !== model.bytes) throw Error('The public model size could not be verified.')
    for (;;) {
      signal.throwIfAborted()
      const next = await reader.read()
      signal.throwIfAborted()
      if (next.done) break
      length += next.value.byteLength
      if (length > model.bytes) throw Error('The public model exceeds its reviewed size.')
      chunks.push(next.value)
    }
    if (length !== model.bytes) throw Error('The public model download was incomplete.')
    const data = new Uint8Array(length)
    let offset = 0
    for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength }
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data)), byte => byte.toString(16).padStart(2, '0')).join('')
    signal.throwIfAborted()
    if (digest !== model.sha256) throw Error('The public model fingerprint could not be verified.')
    return new Blob([data], { type: 'model/gltf-binary' })
  } catch (error) { await reader.cancel().catch(() => {}); throw error }
  finally { reader.releaseLock() }
}
