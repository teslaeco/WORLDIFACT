export const PROJECT_ATTACHMENT_LIMIT = 2
export const PROJECT_ATTACHMENT_MAX_BYTES = 100 * 1024 * 1024

export type ProjectAttachmentScope = 'shop' | 'game-lab'
export type ProjectAttachmentCategory = 'document' | 'model-3d' | 'texture' | 'video' | 'archive'

export type ProjectAttachment = {
  id: string
  scope: ProjectAttachmentScope
  name: string
  type: string
  size: number
  lastModified: number
  category: ProjectAttachmentCategory
  file: File
}

type FileLike = Pick<File, 'name' | 'type' | 'size' | 'lastModified'>
type StoredAttachment = Omit<ProjectAttachment, 'file'> & { blob: Blob; key: string }

const CATEGORY_EXTENSIONS: Record<ProjectAttachmentCategory, readonly string[]> = {
  document: ['pdf', 'doc', 'docx', 'odt', 'rtf', 'txt', 'md', 'csv', 'json'],
  'model-3d': ['glb', 'gltf', 'fbx', 'obj', 'stl', 'ply', 'usd', 'usdz', 'blend', 'mtl', 'bin'],
  texture: ['png', 'jpg', 'jpeg', 'webp', 'tif', 'tiff', 'bmp', 'exr', 'hdr'],
  video: ['mp4', 'webm', 'mov', 'm4v'],
  archive: ['zip'],
}

export const PROJECT_ATTACHMENT_ACCEPT = Object.values(CATEGORY_EXTENSIONS)
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

export function attachmentCategory(file: Pick<FileLike, 'name' | 'type'>): ProjectAttachmentCategory | null {
  if (file.type && DANGEROUS_TYPES.has(file.type.toLowerCase())) return null
  const extension = attachmentExtension(file.name)
  for (const [category, extensions] of Object.entries(CATEGORY_EXTENSIONS) as [ProjectAttachmentCategory, readonly string[]][]) {
    if (extensions.includes(extension)) return category
  }
  return null
}

export function validateProjectAttachment(file: FileLike) {
  const category = attachmentCategory(file)
  if (!category) throw new Error('Unsupported project file. Use PDF/Word/text, common 3D model, texture, video or ZIP formats.')
  if (!Number.isFinite(file.size) || file.size <= 0) throw new Error('The selected project file is empty.')
  if (file.size > PROJECT_ATTACHMENT_MAX_BYTES) throw new Error('Each project file must be 100 MB or smaller.')
  if (!file.name.trim() || file.name.length > 180) throw new Error('Use a project file name between 1 and 180 characters.')
  return category
}

export function appendProjectAttachments(current: readonly ProjectAttachment[], incoming: readonly File[], scope: ProjectAttachmentScope) {
  if (current.length + incoming.length > PROJECT_ATTACHMENT_LIMIT) throw new Error('Attach at most two project files.')
  const additions = incoming.map(file => {
    const category = validateProjectAttachment(file)
    return {
      id: crypto.randomUUID(),
      scope,
      name: file.name.trim(),
      type: file.type || 'application/octet-stream',
      size: file.size,
      lastModified: Number.isFinite(file.lastModified) ? file.lastModified : Date.now(),
      category,
      file,
    } satisfies ProjectAttachment
  })
  return [...current, ...additions]
}

function openDb(): Promise<IDBDatabase> {
  if (!('indexedDB' in globalThis)) return Promise.reject(new Error('Local attachment storage is unavailable in this browser.'))
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('worldifact-project-attachments-v1', 1)
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore('attachments', { keyPath: 'key' })
      store.createIndex('scope', 'scope', { unique: false })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(new Error('Local attachment storage could not be opened.'))
    request.onblocked = () => reject(new Error('Local attachment storage is busy in another tab.'))
  })
}

export async function loadProjectAttachments(scope: ProjectAttachmentScope): Promise<ProjectAttachment[]> {
  const db = await openDb()
  try {
    const records = await new Promise<StoredAttachment[]>((resolve, reject) => {
      const request = db.transaction('attachments').objectStore('attachments').index('scope').getAll(scope)
      request.onsuccess = () => resolve(request.result as StoredAttachment[])
      request.onerror = () => reject(new Error('Local project files could not be restored.'))
    })
    return records
      .sort((a, b) => a.key.localeCompare(b.key))
      .slice(0, PROJECT_ATTACHMENT_LIMIT)
      .map(record => ({
        id: record.id,
        scope: record.scope,
        name: record.name,
        type: record.type,
        size: record.size,
        lastModified: record.lastModified,
        category: record.category,
        file: new File([record.blob], record.name, { type: record.type, lastModified: record.lastModified }),
      }))
  } finally {
    db.close()
  }
}

export async function saveProjectAttachments(scope: ProjectAttachmentScope, attachments: readonly ProjectAttachment[]) {
  if (attachments.length > PROJECT_ATTACHMENT_LIMIT) throw new Error('Attach at most two project files.')
  for (const attachment of attachments) validateProjectAttachment(attachment.file)
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('attachments', 'readwrite')
      const store = tx.objectStore('attachments')
      const index = store.index('scope')
      const lookup = index.getAllKeys(scope)
      let failure: Error | null = null
      lookup.onsuccess = () => {
        try {
          for (const key of lookup.result) store.delete(key)
          attachments.forEach((attachment, indexNumber) => {
            const record: StoredAttachment = {
              key: `${scope}:${indexNumber}:${attachment.id}`,
              id: attachment.id,
              scope,
              name: attachment.name,
              type: attachment.type,
              size: attachment.size,
              lastModified: attachment.lastModified,
              category: attachment.category,
              blob: attachment.file,
            }
            store.put(record)
          })
        } catch (error) {
          failure = error instanceof Error ? error : new Error('Project files could not be saved locally.')
          tx.abort()
        }
      }
      lookup.onerror = () => { failure = new Error('Existing local project files could not be inspected.'); tx.abort() }
      tx.oncomplete = () => resolve()
      tx.onerror = tx.onabort = () => reject(failure || new Error('Project files could not be saved locally.'))
    })
  } finally {
    db.close()
  }
}

export function formatAttachmentBytes(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}
