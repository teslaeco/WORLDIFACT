import {
  PROJECT_ATTACHMENT_ACCEPT,
  PROJECT_ATTACHMENT_LIMIT,
  PROJECT_ATTACHMENT_MAX_BYTES,
  attachmentCategory,
  validateAttachmentMetadata,
  type ProjectAttachmentCategory,
  type ProjectAttachmentScope,
} from './projectAttachmentPolicy.ts'

export {
  PROJECT_ATTACHMENT_ACCEPT,
  PROJECT_ATTACHMENT_LIMIT,
  PROJECT_ATTACHMENT_MAX_BYTES,
  attachmentCategory,
  type ProjectAttachmentCategory,
  type ProjectAttachmentScope,
}

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

export function validateProjectAttachment(file: FileLike) {
  return validateAttachmentMetadata(file)
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
