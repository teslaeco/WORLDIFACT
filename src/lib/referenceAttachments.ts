export const REFERENCE_FILE_LIMIT = 4
export const REFERENCE_TOTAL_BYTES = 40 * 1024 * 1024
export const REFERENCE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
/** Original file limits are checked before decoding, including consecutive selections. */
export function validateReferenceSelection(existing: readonly { size: number }[], added: readonly { size: number; type: string }[]) {
  const files = [...existing, ...added]
  if (files.length > REFERENCE_FILE_LIMIT) throw new Error('Add up to 4 reference images.')
  if (added.some(file => !REFERENCE_TYPES.includes(file.type as typeof REFERENCE_TYPES[number]) || !Number.isSafeInteger(file.size) || file.size <= 0))
    throw new Error('Choose a JPG, PNG or WebP image.')
  if (files.reduce((sum, file) => sum + file.size, 0) > REFERENCE_TOTAL_BYTES) throw new Error('Attachments must total 40 MB or less.')
}
