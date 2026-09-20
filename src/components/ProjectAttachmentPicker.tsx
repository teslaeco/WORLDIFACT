import { useEffect, useMemo, useState } from 'react'
import {
  PROJECT_ATTACHMENT_ACCEPT,
  PROJECT_ATTACHMENT_LIMIT,
  appendProjectAttachments,
  formatAttachmentBytes,
  loadProjectAttachments,
  saveProjectAttachments,
  type ProjectAttachment,
  type ProjectAttachmentScope,
} from '../lib/projectAttachments.ts'
import './ProjectAttachmentPicker.css'

function Preview({ attachment }: { attachment: ProjectAttachment }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    if (!['texture', 'video'].includes(attachment.category)) return
    const next = URL.createObjectURL(attachment.file)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [attachment])
  if (!url) return null
  if (attachment.category === 'video') return <video className="project-attachment-video" src={url} controls preload="metadata" playsInline />
  return <img className="project-attachment-image" src={url} alt={`Local texture preview: ${attachment.name}`} />
}

export default function ProjectAttachmentPicker({
  scope,
  disabled = false,
  onChange,
}: {
  scope: ProjectAttachmentScope
  disabled?: boolean
  onChange?: (attachments: readonly ProjectAttachment[]) => void
}) {
  const [attachments, setAttachments] = useState<ProjectAttachment[]>([])
  const [message, setMessage] = useState('')
  const [restoreDone, setRestoreDone] = useState(false)
  const label = scope === 'shop' ? 'Model project files' : 'Game project files'

  useEffect(() => {
    let closed = false
    loadProjectAttachments(scope)
      .then(items => {
        if (closed) return
        setAttachments(items)
        onChange?.(items)
      })
      .catch(() => {
        if (!closed) setMessage('Local project-file archive is unavailable. New files can still be used in this browser session.')
      })
      .finally(() => { if (!closed) setRestoreDone(true) })
    return () => { closed = true }
  }, [scope, onChange])

  const total = useMemo(() => attachments.reduce((sum, attachment) => sum + attachment.size, 0), [attachments])

  const persist = async (next: ProjectAttachment[]) => {
    setAttachments(next)
    onChange?.(next)
    try {
      await saveProjectAttachments(scope, next)
      setMessage(next.length ? 'Saved locally on this device.' : 'Local project files cleared.')
    } catch {
      setMessage('Files are attached for this browser session, but this device could not persist them locally.')
    }
  }

  const add = async (files: FileList | null) => {
    if (!files?.length || disabled) return
    setMessage('')
    try {
      const next = appendProjectAttachments(attachments, Array.from(files), scope)
      await persist(next)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Project files could not be added.')
    }
  }

  return <section className="project-attachments" aria-label={label}>
    <div className="project-attachments-head">
      <div><strong>{label}</strong><small>LOCAL REFERENCE · max {PROJECT_ATTACHMENT_LIMIT} files · 100 MB each</small></div>
      <span>{attachments.length}/{PROJECT_ATTACHMENT_LIMIT}</span>
    </div>
    <label className="project-attachment-input">
      Add PDF / Word / 3D / texture / video / ZIP
      <input
        type="file"
        multiple
        accept={PROJECT_ATTACHMENT_ACCEPT}
        disabled={disabled || attachments.length >= PROJECT_ATTACHMENT_LIMIT}
        onChange={event => { void add(event.target.files); event.target.value = '' }}
      />
    </label>
    <small className="project-attachment-types">Documents: PDF, DOC/DOCX, ODT, RTF, TXT/MD/CSV/JSON · 3D: GLB/GLTF, FBX, OBJ, STL, PLY, USD/USDZ, BLEND, MTL/BIN · textures: PNG/JPG/WebP/TIFF/BMP/EXR/HDR · video: MP4/WebM/MOV/M4V · ZIP.</small>
    <small className="project-attachment-boundary">These attachments stay local to this browser/device in this release. They are not uploaded to GPT-6 Astra, Oracle, a supplier or manufacturing automatically. Existing image-reference controls remain the only binary reference inputs sent to generation.</small>
    {attachments.length > 0 && <div className="project-attachment-list">
      {attachments.map(attachment => <article key={attachment.id} className="project-attachment-card">
        <div className="project-attachment-meta">
          <strong>{attachment.name}</strong>
          <span>{attachment.category.replace('-', ' ')} · {formatAttachmentBytes(attachment.size)}</span>
        </div>
        <Preview attachment={attachment} />
        <div className="project-attachment-actions">
          <button type="button" disabled={disabled} onClick={() => void persist(attachments.filter(item => item.id !== attachment.id))}>Remove</button>
        </div>
      </article>)}
    </div>}
    {attachments.length > 0 && <small>Total attached locally: {formatAttachmentBytes(total)}.</small>}
    {!restoreDone && <small>Checking local project files…</small>}
    {message && <p className="project-attachment-message" role="status">{message}</p>}
  </section>
}
