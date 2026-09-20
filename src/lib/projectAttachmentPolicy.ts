export const PROJECT_ATTACHMENT_LIMIT = 2
export const PROJECT_ATTACHMENT_MAX_BYTES = 100 * 1024 * 1024
export const PROJECT_ATTACHMENT_SESSION_MS = 24 * 60 * 60 * 1000

export type ProjectAttachmentScope = 'shop' | 'game-lab'
export type ProjectAttachmentCategory = 'document' | 'model-3d' | 'texture' | 'video' | 'archive'

export const PROJECT_ATTACHMENT_EXTENSIONS: Record<ProjectAttachmentCategory, readonly string[]> = {
  document: ['pdf', 'doc', 'docx', 'odt', 'rtf', 'txt', 'md', 'csv', 'json'],
  'model-3d': ['glb', 'gltf', 'fbx', 'obj', 'stl', 'ply', 'usd', 'usdz', 'blend', 'mtl', 'bin'],
  texture: ['png', 'jpg', 'jpeg', 'webp', 'tif', 'tiff', 'bmp', 'exr', 'hdr'],
  video: ['mp4', 'webm', 'mov', 'm4v'],
  archive: ['zip'],
}

export const PROJECT_ATTACHMENT_ACCEPT = Object.values(PROJECT_ATTACHMENT_EXTENSIONS)
  .flat()
  .map(extension => `.${extension}`)
  .join(',')

const DANGEROUS_TYPES = new Set([
  'application/x-msdownload',
  'application/x-dosexec',
  'application/x-sh',
  'application/javascript',
  'text/javascript',
  'text/html',
])

export function attachmentExtension(name: string) {
  const normalized = name.trim().toLowerCase()
  const dot = normalized.lastIndexOf('.')
  return dot > -1 && dot < normalized.length - 1 ? normalized.slice(dot + 1) : ''
}

export function attachmentCategory(value: { name: string; type?: string | null }): ProjectAttachmentCategory | null {
  const type = value.type?.toLowerCase() || ''
  if (DANGEROUS_TYPES.has(type)) return null
  const extension = attachmentExtension(value.name)
  for (const [category, extensions] of Object.entries(PROJECT_ATTACHMENT_EXTENSIONS) as [ProjectAttachmentCategory, readonly string[]][]) {
    if (extensions.includes(extension)) return category
  }
  return null
}

export function validateAttachmentMetadata(value: { name: string; type?: string | null; size: number }) {
  const category = attachmentCategory(value)
  if (!category) throw new Error('Unsupported project file. Use PDF/Word/text, common 3D model, texture, video or ZIP formats.')
  if (!Number.isFinite(value.size) || value.size <= 0) throw new Error('The selected project file is empty.')
  if (value.size > PROJECT_ATTACHMENT_MAX_BYTES) throw new Error('Each project file must be 100 MB or smaller.')
  if (!value.name.trim() || value.name.length > 180) throw new Error('Use a project file name between 1 and 180 characters.')
  return category
}
