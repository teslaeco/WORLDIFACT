import { STUDIO_MODEL_LIMIT, type StudioLibraryModel, type StudioLibraryPage } from './studioProtocol.ts'

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
const cursorPattern = /^[A-Za-z0-9_-]+\.[a-f0-9]{64}$/
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const date = (value: unknown): value is string => typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value))
type Fetcher = typeof fetch
const browserFetch: Fetcher = (input, init) => fetch(input, init)

export const isStudioLibraryId = (value: string) => uuid.test(value)
export class StudioLibraryAccountError extends Error {}

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
  return { id: value.id, prompt: value.prompt, createdAt: value.createdAt, completedAt: value.completedAt,
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
    value.hasMore !== (value.nextCursor !== null) || (cursor !== null && value.nextCursor === cursor)) {
    throw new Error('The account gallery page could not be verified. Refresh the gallery to try again.')
  }
  return { accountId, models: value.models.map(parseModel), nextCursor: value.nextCursor, hasMore: value.hasMore }
}

/** The URL identifies a model; only the authenticated server establishes ownership. */
export async function getStudioLibraryModel(accountId: string, id: string, signal: AbortSignal, fetcher: Fetcher = browserFetch): Promise<StudioLibraryModel> {
  if (!isStudioLibraryId(id)) throw new Error('This account model link is invalid.')
  const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(40_000)])
  const response = await fetcher(`/api/studio/library/${id}`, options(requestSignal))
  const value = await json(response, requestSignal)
  if (!accountId || !object(value) || value.accountId !== accountId) throw new StudioLibraryAccountError('Your signed-in account changed. Refresh your account before opening its models.')
  const model = parseModel(value.model)
  if (model.id !== id) throw new Error('The response belongs to a different model. No file was opened.')
  return model
}

/** Fetch only the explicitly selected GLB. Local records never prove ownership. */
export async function readStudioLibraryModel(accountId: string, model: StudioLibraryModel, signal: AbortSignal, fetcher: Fetcher = browserFetch): Promise<Blob> {
  if (!accountId) throw new Error('Sign in to open an account model.')
  let verified = parseModel(model)
  for (let attempt = 0; attempt < 2; attempt++) {
    signal.throwIfAborted()
    const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(180_000)])
    const response = await fetcher(`/api/studio/jobs/${verified.id}/model`, {
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
    const blob = new Blob(await bytes(response, STUDIO_MODEL_LIMIT, requestSignal), { type: 'model/gltf-binary' })
    signal.throwIfAborted()
    return blob
  }
  throw new Error('The account model receipt expired. Refresh the gallery and try again.')
}
