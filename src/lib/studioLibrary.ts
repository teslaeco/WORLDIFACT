import { STUDIO_MODEL_LIMIT, readStudioGenerationTiming, type StudioLibraryModel, type StudioLibraryPage } from './studioProtocol.ts'
import { validateStudioArtifactHeader, type StudioArtifactFormat } from './studioArtifact.ts'
import { isStudioExecution } from './studioExecution.ts'
import { isStudioProviderEvidence } from './studioProviderEvidence.ts'
import { isStudioIncompleteReason, STUDIO_INCOMPLETE_CAPACITY, STUDIO_INCOMPLETE_BACKUP_PROOF } from './studioIncomplete.ts'

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
const cursorPattern = /^[A-Za-z0-9_-]+\.[a-f0-9]{64}$/
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const date = (value: unknown): value is string => typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value))
type Fetcher = typeof fetch
const browserFetch: Fetcher = (input, init) => fetch(input, init)

export const isStudioLibraryId = (value: string) => uuid.test(value)
export class StudioLibraryAccountError extends Error {}
/** A selected model may keep its still-valid receipt only for these transient
 * metadata failures. Ownership, malformed responses and caller aborts still fail. */
export class StudioLibraryMetadataUnavailableError extends Error {}
export const isStudioLibraryTemporaryError = (error: unknown): boolean => error instanceof StudioLibraryMetadataUnavailableError

class LibraryError extends Error {
  status: number
  code?: string
  constructor(message: string, status: number, code?: string) { super(message); this.status = status; this.code = code }
}

function parseModel(value: unknown): StudioLibraryModel {
  if (!object(value) || typeof value.id !== 'string' || !isStudioLibraryId(value.id) ||
    typeof value.prompt !== 'string' || value.prompt.length > 4000 || !date(value.createdAt) || !date(value.completedAt) ||
    value.review !== 'UNREVIEWED' || typeof value.downloadAllowed !== 'boolean' || !object(value.receipt) ||
    value.receipt.id !== value.id || !date(value.receipt.createdAt) || typeof value.receipt.ticket !== 'string' ||
    !new RegExp(`^library\\.${value.id}\\.[0-9]{13}\\.[a-f0-9]{64}\\.[a-f0-9]{64}$`).test(value.receipt.ticket)) {
    throw new Error('The account model record could not be verified. Refresh the gallery to try again.')
  }
  if (value.studioExecution !== undefined && !isStudioExecution(value.studioExecution)) throw new Error('Invalid model provenance. Refresh the library.')
  if (value.providerEvidence !== undefined && !isStudioProviderEvidence(value.providerEvidence, value.studioExecution))
    throw new Error('Oracle provider evidence does not match this model. Refresh the library.')
  if (value.completion !== undefined &&
      (value.completion !== 'INCOMPLETE' || !isStudioIncompleteReason(value.incompleteReason) || !isStudioExecution(value.studioExecution)))
    throw new Error('This unfinished model record is invalid. Refresh the library.')
  if (value.completion === undefined && value.incompleteReason !== undefined)
    throw new Error('The model completion state could not be verified.')
  if (value.backupVerified !== undefined &&
      (value.completion !== 'INCOMPLETE' || value.backupVerified !== STUDIO_INCOMPLETE_BACKUP_PROOF))
    throw new Error('Unverified or inconsistent private GLB backup metadata.')
  const generationTiming = readStudioGenerationTiming(value.generationTiming)
  return { id: value.id, prompt: value.prompt, createdAt: value.createdAt, completedAt: value.completedAt,
    ...(isStudioExecution(value.studioExecution) ? { studioExecution: value.studioExecution } : {}),
    ...(isStudioProviderEvidence(value.providerEvidence, value.studioExecution) ? { providerEvidence: value.providerEvidence } : {}),
    ...(value.completion === 'INCOMPLETE' && isStudioIncompleteReason(value.incompleteReason)
      ? { completion: 'INCOMPLETE' as const, incompleteReason: value.incompleteReason } : {}),
    ...(value.completion === 'INCOMPLETE' && value.backupVerified === STUDIO_INCOMPLETE_BACKUP_PROOF
      ? { backupVerified: STUDIO_INCOMPLETE_BACKUP_PROOF } : {}),
    ...(generationTiming ? { generationTiming } : {}),
    review: 'UNREVIEWED', downloadAllowed: value.downloadAllowed,
    receipt: { id: value.id, ticket: value.receipt.ticket, createdAt: value.receipt.createdAt } }
}

async function bytes(response: Response, maximum: number, signal: AbortSignal): Promise<Uint8Array<ArrayBuffer>[]> {
  signal.throwIfAborted()
  const declared = Number(response.headers.get('content-length') || 0)
  if (declared > maximum) { await response.body?.cancel(); throw new Error('This model response exceeds the download size limit.') }
  const reader = response.body?.getReader()
  if (!reader) throw new Error('The model service returned an empty response.')
  const chunks: Uint8Array<ArrayBuffer>[] = []
  let length = 0
  try {
    for (;;) {
      signal.throwIfAborted()
      const result = await reader.read()
      signal.throwIfAborted()
      if (result.done) break
      length += result.value.byteLength
      if (length > maximum) throw new Error('This model response exceeds the download size limit.')
      chunks.push(new Uint8Array(result.value))
    }
    if (!length || (declared && length !== declared)) throw new Error('The model download was interrupted. Try opening the same model again.')
    return chunks
  } catch (error) { await reader.cancel().catch(() => {}); throw error }
}

async function json(response: Response, signal: AbortSignal): Promise<unknown> {
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('The account model service did not return a valid response.')
  const body: unknown = JSON.parse(await new Blob(await bytes(response, 1024 * 1024, signal)).text())
  signal.throwIfAborted()
  if (!response.ok) {
    const message = object(body) && typeof body.error === 'string' ? body.error.slice(0, 600) : `The account model is unavailable (${response.status}).`
    const code = object(body) && typeof body.code === 'string' ? body.code : undefined
    if (response.status === 401 && code !== 'STUDIO_LIBRARY_RECEIPT_EXPIRED') throw new StudioLibraryAccountError(message)
    throw new LibraryError(message, response.status, code)
  }
  return body
}

function options(signal: AbortSignal): RequestInit {
  return { method: 'GET', credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal }
}

/** Metadata reads only. The cursor is opaque, signed and bounded by the server. */
export async function listStudioLibrary(accountId: string, cursor: string | null, signal: AbortSignal, fetcher: Fetcher = browserFetch): Promise<StudioLibraryPage> {
  if (cursor !== null && (cursor.length > 12000 || !cursorPattern.test(cursor))) throw new Error('The account gallery page link is invalid. Refresh the gallery.')
  const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(40_000)])
  const response = await fetcher(`/api/studio/library${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, options(requestSignal))
  const value = await json(response, requestSignal)
  if (!accountId || !object(value) || value.accountId !== accountId) throw new StudioLibraryAccountError('Your signed-in account changed. Refresh your account before opening its models.')
  if (!object(value) || !Array.isArray(value.models) || value.models.length > 64 || typeof value.hasMore !== 'boolean' ||
    !(value.nextCursor === null || (typeof value.nextCursor === 'string' && value.nextCursor.length <= 12000 && cursorPattern.test(value.nextCursor))) ||
    value.hasMore !== (value.nextCursor !== null) || (cursor !== null && value.nextCursor === cursor) ||
    (value.recentModels !== undefined && (cursor !== null || !Array.isArray(value.recentModels) || value.recentModels.length > 6)) ||
    (value.incompleteModels !== undefined && (cursor !== null || !Array.isArray(value.incompleteModels) || value.incompleteModels.length > STUDIO_INCOMPLETE_CAPACITY))) {
    throw new Error('The account gallery page could not be verified. Refresh the gallery to try again.')
  }
  return { accountId, models: value.models.map(parseModel),
    ...(Array.isArray(value.recentModels) ? { recentModels: value.recentModels.map(parseModel) } : {}),
    ...(Array.isArray(value.incompleteModels) ? { incompleteModels: value.incompleteModels.map(parseModel) } : {}),
    nextCursor: value.nextCursor, hasMore: value.hasMore }
}

/** The URL identifies a model; only the authenticated server establishes ownership. */
export async function getStudioLibraryModel(accountId: string, id: string, signal: AbortSignal, fetcher: Fetcher = browserFetch): Promise<StudioLibraryModel> {
  if (!isStudioLibraryId(id)) throw new Error('This account model link is invalid.')
  const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(40_000)])
  let value: unknown
  let response: Response | undefined
  try {
    response = await fetcher(`/api/studio/library/${id}`, options(requestSignal))
    signal.throwIfAborted()
    if (response.status === 401) {
      await response.body?.cancel().catch(() => {})
      throw new StudioLibraryAccountError('Sign in again to read your saved model.')
    }
    if (response.status === 429 || response.status >= 500 && response.status <= 599) {
      await response.body?.cancel().catch(() => {})
      throw new StudioLibraryMetadataUnavailableError('Saved model metadata is temporarily unavailable.')
    }
    value = await json(response, requestSignal)
  } catch (error) {
    signal.throwIfAborted()
    if ((!response || response.ok) && (requestSignal.aborted || error instanceof TypeError || error instanceof DOMException && error.name === 'TimeoutError'))
      throw new StudioLibraryMetadataUnavailableError('Saved model metadata is temporarily unavailable.')
    throw error
  }
  if (!accountId || !object(value) || value.accountId !== accountId) throw new StudioLibraryAccountError('Your signed-in account changed. Refresh your account before opening its models.')
  const model = parseModel(value.model)
  if (model.id !== id) throw new Error('The response belongs to a different model. No file was opened.')
  return model
}

/** Reads an existing signed receipt only; never starts or retries paid AI. */
export async function retainStudioIncompleteModel(id: string, ticket: string, signal: AbortSignal,
  fetcher: Fetcher = browserFetch): Promise<{ retained: boolean; canOpen?: boolean; backedUp?: boolean; verifiedProvider?: boolean; reason?: string }> {
  if (!isStudioLibraryId(id) || typeof ticket !== 'string' || ticket.length > 400 ||
      !ticket.includes(id + '.') || !/^(?:held\.)?[a-f0-9.-]{100,400}$/.test(ticket))
    throw new Error('Recover only the original signed job receipt.')
  const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(180_000)])
  const response = await fetcher('/api/studio/jobs/' + id + '/retain-draft', {
    method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error',
    headers: { 'X-WORLDIFACT-Job': ticket }, signal: requestSignal,
  })
  const value = await json(response, requestSignal)
  if (!object(value) || typeof value.retained !== 'boolean' ||
      (value.reason !== undefined && typeof value.reason !== 'string') ||
      (value.canOpen !== undefined && typeof value.canOpen !== 'boolean') ||
      (value.backedUp !== undefined && typeof value.backedUp !== 'boolean') ||
      (value.verifiedProvider !== undefined && typeof value.verifiedProvider !== 'boolean'))
    throw new Error('The retained draft recovery result could not be verified.')
  return { retained: value.retained,
    ...(typeof value.canOpen === 'boolean' ? { canOpen: value.canOpen } : {}),
    ...(typeof value.backedUp === 'boolean' ? { backedUp: value.backedUp } : {}),
    ...(typeof value.verifiedProvider === 'boolean' ? { verifiedProvider: value.verifiedProvider } : {}),
    ...(typeof value.reason === 'string' ? { reason: value.reason } : {}) }
}

/** Fetch only the explicitly selected GLB. Local records never prove ownership. */
export async function readStudioLibraryModel(accountId: string, model: StudioLibraryModel, signal: AbortSignal, fetcher: Fetcher = browserFetch, maximum = STUDIO_MODEL_LIMIT): Promise<Blob> {
  return readLibraryArtifact(accountId, model, 'model', signal, fetcher, Math.min(maximum, STUDIO_MODEL_LIMIT))
}

/** Read an original stored export with the same account-bound, renewable ticket.
 * Missing formats remain unavailable; this never generates or converts a file. */
export async function readStudioLibraryExport(accountId: string, model: StudioLibraryModel, format: Exclude<StudioArtifactFormat, 'model'>, signal: AbortSignal, fetcher: Fetcher = browserFetch): Promise<Blob> {
  if (model.completion === 'INCOMPLETE') throw new Error('Unfinished GLB drafts do not have final FBX, BLEND or texture ZIP exports.')
  if (!['fbx', 'blend', 'pbr'].includes(format)) throw new Error('Unsupported saved model export format.')
  return readLibraryArtifact(accountId, model, format, signal, fetcher, 512 * 1024 * 1024)
}

async function readLibraryArtifact(accountId: string, model: StudioLibraryModel, format: StudioArtifactFormat, signal: AbortSignal, fetcher: Fetcher, maximum: number): Promise<Blob> {
  if (!accountId) throw new Error('Sign in to open an account model.')
  let verified = parseModel(model)
  for (let attempt = 0; attempt < 2; attempt++) {
    signal.throwIfAborted()
    const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(180_000)])
    const response = await fetcher(`/api/studio/jobs/${verified.id}/${format === 'model' ? verified.completion === 'INCOMPLETE' ? 'draft' : 'model' : `exports/${format}`}`, {
      ...options(requestSignal), headers: { 'X-WORLDIFACT-Job': verified.receipt.ticket },
    })
    if (!response.ok) {
      try { await json(response, requestSignal) }
      catch (error) {
        if (attempt === 0 && error instanceof LibraryError && error.status === 401 && error.code === 'STUDIO_LIBRARY_RECEIPT_EXPIRED') {
          verified = await getStudioLibraryModel(accountId, verified.id, signal, fetcher)
          continue
        }
        throw error
      }
      throw new Error('This account model is unavailable.')
    }
    const blob = new Blob(await bytes(response, maximum, requestSignal), { type: format === 'model' ? 'model/gltf-binary' : format === 'pbr' ? 'application/zip' : 'application/octet-stream' })
    await validateStudioArtifactHeader(format, blob)
    signal.throwIfAborted()
    return blob
  }
  throw new Error('The account model receipt expired. Refresh the gallery and try again.')
}
