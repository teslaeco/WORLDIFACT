/** Owner-approved public working copies. Private sources and Blender originals are not published. */
export const OWNER_MODELS = [
  {
    id: 'ecomech-v4', name: 'ECOMECH V4', category: 'CHARACTER STUDY',
    description: 'An asymmetric green-and-blue machine, holding a green pepper.',
    status: 'Working model · reduced detail',
    limitation: 'The full body is present. Small mechanical parts, lights and facial details do not yet match the reference.',
    triangles: 186328, bytes: 18063228,
    path: '/owner-models/ecomech-v4-b8532d8c.glb',
    sha256: 'b8532d8ca7c90e5f4eac0798811b54d4d9447508f4398d325933dd3cca472d54',
  },
  {
    id: 'halloween-music-room', name: 'Halloween Music Room', category: 'SCENE STUDY',
    description: 'A Halloween performer at a red keyboard, with fragments of the surrounding scene.',
    status: 'Incomplete reconstruction',
    limitation: 'This is not a complete room. Clothing, arms and background have holes; several decorations and instruments are missing or flattened.',
    triangles: 193638, bytes: 18085924,
    path: '/owner-models/halloween-music-room-d9f01fa8.glb',
    sha256: 'd9f01fa8ce21ca1759ee6a76ccbb08a27b65749dd25e04810e532e75c69ec197',
  },
] as const
export type OwnerModel = typeof OWNER_MODELS[number]

/** A public, same-origin GET; fixed size/hash, no account credentials or provider requests. */
export async function readOwnerModel(model: OwnerModel, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<Blob> {
  if (!OWNER_MODELS.includes(model)) throw Error('Unknown showcase model.')
  signal = AbortSignal.any([signal, AbortSignal.timeout(90_000)])
  signal.throwIfAborted()
  const response = await fetcher(model.path, { credentials: 'omit', redirect: 'error', signal, method: 'GET' })
  if (!response.ok || !response.body) throw Error('This saved model is temporarily unavailable.')
  const reader = response.body.getReader(), chunks: Uint8Array[] = []
  let length = 0
  try {
    const advertised = response.headers.get('content-length')
    if (advertised !== null && !response.headers.get('content-encoding') && Number(advertised) !== model.bytes) throw Error('The model size could not be verified.')
    for (;;) {
      signal.throwIfAborted()
      const next = await reader.read()
      signal.throwIfAborted()
      if (next.done) break
      length += next.value.byteLength
      if (length > model.bytes) throw Error('The model exceeds its verified size.')
      chunks.push(next.value)
    }
    if (length !== model.bytes) throw Error('The model download was incomplete.')
    const bytes = new Uint8Array(length)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), value => value.toString(16).padStart(2, '0')).join('')
    signal.throwIfAborted()
    if (hash !== model.sha256) throw Error('The model fingerprint could not be verified.')
    return new Blob([bytes], { type: 'model/gltf-binary' })
  } catch (error) { await reader.cancel().catch(() => {}); throw error }
  finally { reader.releaseLock() }
}
