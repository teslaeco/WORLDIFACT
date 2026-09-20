import {
  PROJECT_ATTACHMENT_LIMIT,
  PROJECT_ATTACHMENT_MAX_BYTES,
  type ProjectAttachmentScope,
} from './projectAttachmentPolicy.ts'
import type { ProjectAttachment } from './projectAttachments.ts'

type RemoteStatus = {
  ready: boolean
  oracle?: string
  revision?: number | null
  maxFiles?: number
  maxBytesPerFile?: number
}

type ProjectSession = {
  projectId: string
  scope: ProjectAttachmentScope
  token: string
  expiresAt: string
}

export type ProjectFileSyncState =
  | { mode: 'checking'; message: string }
  | { mode: 'local'; message: string }
  | { mode: 'oracle'; message: string; projectId: string }

const SESSION_PREFIX = 'worldifact-project-file-session-v1:'

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

async function responseJson(response: Response) {
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Project-file service returned an invalid response.')
  const value: unknown = await response.json()
  if (!response.ok) throw new Error(object(value) && typeof value.error === 'string' ? value.error : 'Project-file service request failed.')
  if (!object(value)) throw new Error('Project-file service returned an invalid response.')
  return value
}

function parseSession(value: unknown, scope: ProjectAttachmentScope): ProjectSession | null {
  if (!object(value) ||
    typeof value.projectId !== 'string' ||
    !/^[a-f0-9-]{36}$/.test(value.projectId) ||
    value.scope !== scope ||
    typeof value.token !== 'string' ||
    value.token.length > 400 ||
    typeof value.expiresAt !== 'string' ||
    !Number.isFinite(Date.parse(value.expiresAt)) ||
    Date.parse(value.expiresAt) <= Date.now() + 60_000
  ) return null
  return value as unknown as ProjectSession
}

function storedSession(scope: ProjectAttachmentScope) {
  try {
    const text = localStorage.getItem(SESSION_PREFIX + scope)
    return text ? parseSession(JSON.parse(text), scope) : null
  } catch { return null }
}

function rememberSession(session: ProjectSession) {
  try { localStorage.setItem(SESSION_PREFIX + session.scope, JSON.stringify(session)) } catch { /* session still works until page close */ }
}

export async function checkProjectFileRemote(fetcher: typeof fetch = fetch): Promise<RemoteStatus> {
  try {
    const response = await fetcher('/api/project-files/status', { cache: 'no-store', signal: AbortSignal.timeout(15_000) })
    const body = await responseJson(response)
    const ready = body.ready === true &&
      body.revision === 1 &&
      body.maxFiles === PROJECT_ATTACHMENT_LIMIT &&
      body.maxBytesPerFile === PROJECT_ATTACHMENT_MAX_BYTES
    return { ready, oracle: typeof body.oracle === 'string' ? body.oracle : undefined,
      revision: typeof body.revision === 'number' ? body.revision : null,
      maxFiles: typeof body.maxFiles === 'number' ? body.maxFiles : undefined,
      maxBytesPerFile: typeof body.maxBytesPerFile === 'number' ? body.maxBytesPerFile : undefined }
  } catch {
    return { ready: false }
  }
}

async function createSession(scope: ProjectAttachmentScope, fetcher: typeof fetch) {
  const response = await fetcher('/api/project-files/session', {
    method: 'POST',
    headers: { 'X-WORLDIFACT-Project-Scope': scope },
    signal: AbortSignal.timeout(20_000),
  })
  const value = await responseJson(response)
  const session = parseSession(value, scope)
  if (!session) throw new Error('Project-file session could not be verified.')
  rememberSession(session)
  return session
}

async function ensureSession(scope: ProjectAttachmentScope, fetcher: typeof fetch) {
  return storedSession(scope) ?? createSession(scope, fetcher)
}

async function uploadSlot(session: ProjectSession, attachment: ProjectAttachment, slot: number, fetcher: typeof fetch) {
  const response = await fetcher(`/api/project-files/${session.scope}/${session.projectId}/${slot}`, {
    method: 'PUT',
    headers: {
      'X-WORLDIFACT-Project': session.token,
      'X-WORLDIFACT-File-Name': encodeURIComponent(attachment.name),
      'X-WORLDIFACT-Category': attachment.category,
      'Content-Type': attachment.type || 'application/octet-stream',
      'Content-Length': String(attachment.size),
    },
    body: attachment.file,
    signal: AbortSignal.timeout(300_000),
  })
  await responseJson(response)
}

async function deleteSlot(session: ProjectSession, slot: number, fetcher: typeof fetch) {
  const response = await fetcher(`/api/project-files/${session.scope}/${session.projectId}/${slot}`, {
    method: 'DELETE',
    headers: { 'X-WORLDIFACT-Project': session.token },
    signal: AbortSignal.timeout(30_000),
  })
  await responseJson(response)
}

export async function syncProjectAttachments(
  scope: ProjectAttachmentScope,
  attachments: readonly ProjectAttachment[],
  fetcher: typeof fetch = fetch,
): Promise<ProjectFileSyncState> {
  if (attachments.length > PROJECT_ATTACHMENT_LIMIT) throw new Error('Attach at most two project files.')
  const status = await checkProjectFileRemote(fetcher)
  if (!status.ready) return { mode: 'local', message: 'Saved locally. Oracle project-file storage is not ready on the connected worker yet.' }
  const session = await ensureSession(scope, fetcher)
  for (let slot = 0; slot < attachments.length; slot++) await uploadSlot(session, attachments[slot], slot, fetcher)
  for (let slot = attachments.length; slot < PROJECT_ATTACHMENT_LIMIT; slot++) {
    try { await deleteSlot(session, slot, fetcher) } catch { /* empty/missing remote slot is harmless */ }
  }
  return {
    mode: 'oracle',
    projectId: session.projectId,
    message: attachments.length
      ? `Synced ${attachments.length}/${PROJECT_ATTACHMENT_LIMIT} project file${attachments.length === 1 ? '' : 's'} to the authenticated Oracle project-file vault.`
      : 'Oracle project-file vault cleared for this project session.',
  }
}
