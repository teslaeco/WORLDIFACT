export type StudioArtifactFormat = 'model' | 'fbx' | 'blend' | 'pbr'
export const ARTIFACT_PROBE_BYTES = 1024

/** Bounded content sniffing, not a claim of model quality or complete decoding.
 * In particular compressed Blender envelopes still need Blender validation.
 * Never accept an HTML/JSON error just because its response status is 200.
 */
export function hasStudioArtifactHeader(format: StudioArtifactFormat, bytes: Uint8Array, size: number): boolean {
  if (!Number.isSafeInteger(size) || size <= 0 || bytes.length > size) return false
  const starts = (...prefix: number[]) => bytes.length >= prefix.length && prefix.every((n, i) => bytes[i] === n)
  const text = new TextDecoder().decode(bytes.subarray(0, ARTIFACT_PROBE_BYTES))
  if (format === 'model') {
    if (bytes.length < 12 || size < 20) return false
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    return view.getUint32(0, true) === 0x46546c67 && view.getUint32(4, true) === 2 && view.getUint32(8, true) === size
  }
  if (format === 'fbx') {
    if (text.startsWith('Kaydara FBX Binary  \0\x1a\0') && bytes.length >= 27 && size > 27) {
      const version = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(23, true)
      return version >= 6000 && version < 8000
    }
    return /^;\s*FBX\s+\d+\.\d+/.test(text) && /FBXHeaderExtension\s*:\s*\{/.test(text)
  }
  if (format === 'blend') return size > 12 && (/^BLENDER[_-][vV]\d{3}/.test(text) ||
    // Blender supports gzip and Zstandard compressed project files.
    size > 18 && (starts(0x1f, 0x8b, 8) || starts(0x28, 0xb5, 0x2f, 0xfd)))
  return size >= 30 && starts(0x50, 0x4b, 3, 4)
}

export async function validateStudioArtifactHeader(format: StudioArtifactFormat, blob: Blob): Promise<void> {
  const bytes = new Uint8Array(await blob.slice(0, ARTIFACT_PROBE_BYTES).arrayBuffer())
  if (!hasStudioArtifactHeader(format, bytes, blob.size))
    throw new Error('The downloaded file does not match its requested format. Retry this artifact, not generation.')
}
