/** Immutable source-image gate for the already-consumed ECOMECH V4 one-shot.
 * Offline and side-effect-free. Does not authorize a second paid job.
 */
import { createHash } from 'node:crypto'

export const ECOMECH_V4_REFERENCE_SHA256 = '9f3b9a994315c0578859486a1c9dc17c8916316ba9e96300409772a1b8f5e053'
export const ECOMECH_V4_REFERENCE_WIDTH = 1122
export const ECOMECH_V4_REFERENCE_HEIGHT = 1402
export const ECOMECH_V4_REFERENCE_MAX_BYTES = 12 * 1024 * 1024
const PNG_MAGIC = [137, 80, 78, 71, 13, 10, 26, 10]

/** Pin the actual approved full-resolution photo, not a similarly named image.
 * Override the hash only in offline tests; the real runner uses the default.
 */
export function assertPinnedEcomechReference(bytes, expectedSha256 = ECOMECH_V4_REFERENCE_SHA256) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 40000 || bytes.length > ECOMECH_V4_REFERENCE_MAX_BYTES ||
      !PNG_MAGIC.every((part, i) => bytes[i] === part) ||
      bytes[8] !== 0 || bytes[9] !== 0 || bytes[10] !== 0 || bytes[11] !== 13 ||
      String.fromCharCode(...bytes.subarray(12, 16)) !== 'IHDR')
    throw Error('REFERENCE_PNG_INVALID')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint32(16, false) !== ECOMECH_V4_REFERENCE_WIDTH ||
      view.getUint32(20, false) !== ECOMECH_V4_REFERENCE_HEIGHT)
    throw Error('REFERENCE_IMAGE_DIMENSIONS_CHANGED')
  const digest = createHash('sha256').update(bytes).digest('hex')
  if (digest !== expectedSha256) throw Error('REFERENCE_SHA_MISMATCH_NO_PAID_CALL')
  return { bytes, sha256: digest }
}
