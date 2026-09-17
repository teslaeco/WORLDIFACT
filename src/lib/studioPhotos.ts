import type { StudioPhoto, TextureLimit, PhotoView } from './studioProtocol.ts'

/** Normalize original images only after explicit file selection. No AI/network. */
export async function prepareStudioPhoto(file: File, size: TextureLimit, view: PhotoView): Promise<StudioPhoto> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size <= 0 || file.size > 12 * 1024 * 1024) throw new Error('Select a JPG, PNG or WebP no larger than 12 MB.')
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
    const scale = Math.min(1, size / Math.max(width, height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Your browser could not prepare the reference image.')
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    for (const quality of [0.95, 0.9, 0.86]) {
      const dataUrl = canvas.toDataURL('image/jpeg', quality)
      if (dataUrl.startsWith('data:image/jpeg;base64,') && dataUrl.length - 23 <= Math.floor(2 * 1024 * 1024 / 3) * 4) {
        return { name: file.name.slice(0, 120) || 'Reference image', view, dataUrl, textureMaxSize: size }
      }
    }
    throw new Error('The prepared reference exceeds 2 MB. Select a smaller size limit; the original was not changed.')
  } finally { URL.revokeObjectURL(url) }
}
