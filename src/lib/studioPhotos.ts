import { REFERENCE_TOTAL_BYTES, REFERENCE_TYPES } from './referenceAttachments.ts'
import type { StudioPhoto, TextureLimit, PhotoView } from './studioProtocol.ts'

/** Normalize original images only after explicit file selection. No AI/network. */
export async function prepareStudioPhoto(file: File, size: TextureLimit, view: PhotoView): Promise<StudioPhoto> {
  if (!REFERENCE_TYPES.includes(file.type as typeof REFERENCE_TYPES[number]) || file.size <= 0 || file.size > REFERENCE_TOTAL_BYTES) throw new Error('Select a JPG, PNG or WebP no larger than 40 MB.')
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('This reference image could not be opened.'))
      image.src = url
    })
    const width = image.naturalWidth, height = image.naturalHeight
    if (!width || !height || width * height > 80 * 1024 * 1024) throw new Error('The reference exceeds 80 megapixels or has invalid dimensions.')
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Your browser could not prepare the reference image.')
    // Four normalized references fit the existing 6 MB server contract. Keep
    // originals untouched and progressively reduce resolution for noisy photos.
    for (const ceiling of [size, Math.min(size, 2048), 1536, 1024]) {
      const scale = Math.min(1, ceiling / Math.max(width, height))
      canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale))
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
      for (const quality of [0.92, 0.84, 0.72]) {
        const dataUrl = canvas.toDataURL('image/jpeg', quality)
        if (dataUrl.startsWith('data:image/jpeg;base64,') && dataUrl.length - 23 <= 2 * 1024 * 1024) {
          return { name: file.name.slice(0, 120) || 'Reference image', view, dataUrl, textureMaxSize: size }
        }
      }
    }
    throw new Error('This reference could not be prepared within the upload limit. The original was not changed.')
  } finally { URL.revokeObjectURL(url) }
}
