export type StudioPreviewIdentity = { id: string; origin: 'job' | 'archive'; label: string }

/** A visible archived result must never inherit another job's export controls. */
export function mayExportCurrentJob(id: string | undefined, state: string | undefined, preview: StudioPreviewIdentity | null): boolean {
  return !!id && state === 'succeeded' && (!preview || (preview.origin === 'job' && preview.id === id))
}
export function previewFileName(preview: StudioPreviewIdentity): string {
  if (!/^[a-f0-9-]{36}$/.test(preview.id)) throw new Error('Invalid model identity.')
  return `WORLDIFACT-${preview.id}.glb`
}
export type ArchiveIdentity = { id: string; sha256: string; byteLength: number }
export function archiveWriteDecision(existing: ArchiveIdentity | undefined, next: ArchiveIdentity): 'insert' | 'retain' {
  if (!existing) return 'insert'
  if (existing.id === next.id && existing.sha256 === next.sha256 && existing.byteLength === next.byteLength) return 'retain'
  throw new Error('A different original is already saved for this job. It was not overwritten. Download the new result separately.')
}
