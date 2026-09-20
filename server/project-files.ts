import { oracleOrigin, ownerAuthorized, type PlatformEnv } from './platform.ts'
import {
  PROJECT_ATTACHMENT_LIMIT,
  PROJECT_ATTACHMENT_MAX_BYTES,
  PROJECT_ATTACHMENT_SESSION_MS,
  attachmentCategory,
  type ProjectAttachmentCategory,
  type ProjectAttachmentScope,
} from '../src/lib/projectAttachmentPolicy.ts'

export interface ProjectFileEnv extends PlatformEnv {
  PUBLIC_PILOT?: string
  ENABLE_ORACLE_JOBS?: string
}

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
const TOKEN = /^([a-f0-9-]{36})\.([0-9]{13})\.(shop|game-lab)\.([a-f0-9]{64})$/
const jsonHeaders = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: jsonHeaders })
const encoder = new TextEncoder()

class ProjectFileError extends Error {
  readonly status: number
  constructor(message: string, status = 400) { super(message); this.status = status }
}

function secretReady(env: ProjectFileEnv) {
  return (env.OWNER_ACCESS_TOKEN?.length ?? 0) >= 32 && (env.OWNER_ACCESS_TOKEN?.length ?? 0) <= 256
}

async function hmacKey(env: ProjectFileEnv) {
  if (!secretReady(env)) throw new ProjectFileError('Project-file signing is not configured.', 503)
  return crypto.subtle.importKey('raw', encoder.encode(env.OWNER_ACCESS_TOKEN!), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
}

const hex = (value: ArrayBuffer) => Array.from(new Uint8Array(value), byte => byte.toString(16).padStart(2, '0')).join('')
const tokenBytes = (payload: string) => encoder.encode(`WORLDIFACT-PROJECT-FILE-v1:${payload}`)

async function createToken(env: ProjectFileEnv, projectId: string, scope: ProjectAttachmentScope) {
  const issued = Date.now()
  const payload = `${projectId}.${issued}.${scope}`
  const signature = hex(await crypto.subtle.sign('HMAC', await hmacKey(env), tokenBytes(payload)))
  return { projectId, scope, token: `${payload}.${signature}`, expiresAt: new Date(issued + PROJECT_ATTACHMENT_SESSION_MS).toISOString() }
}

async function verifyToken(env: ProjectFileEnv, token: string, expectedProject?: string, expectedScope?: ProjectAttachmentScope) {
  const match = TOKEN.exec(token)
  if (!match || !secretReady(env)) throw new ProjectFileError('A valid project-file session is required.', 401)
  const projectId = match[1], issued = Number(match[2]), scope = match[3] as ProjectAttachmentScope
  if ((expectedProject && projectId !== expectedProject) || (expectedScope && scope !== expectedScope))
    throw new ProjectFileError('The project-file session does not match this request.', 401)
  if (issued > Date.now() + 30_000 || Date.now() - issued > PROJECT_ATTACHMENT_SESSION_MS)
    throw new ProjectFileError('This project-file session expired. Create a new session; local files are unchanged.', 401)
  const signature = Uint8Array.from(match[4].match(/../g)!, part => parseInt(part, 16))
  const valid = await crypto.subtle.verify('HMAC', await hmacKey(env), signature, tokenBytes(`${projectId}.${match[2]}.${scope}`))
  if (!valid) throw new ProjectFileError('The project-file session is not valid.', 401)
  return { projectId, scope, issued }
}

async function rateLimit(request: Request, env: ProjectFileEnv, bucket: string) {
  if (!env.GENERATION_LIMITER) throw new ProjectFileError('Project-file limiter is unavailable.', 503)
  try {
    const key = `project-file:${bucket}:${request.headers.get('CF-Connecting-IP') || 'unknown-client'}`
    if (!(await env.GENERATION_LIMITER.limit({ key })).success) throw new ProjectFileError('Please wait before another project-file request.', 429)
  } catch (error) {
    if (error instanceof ProjectFileError) throw error
    throw new ProjectFileError('Project-file limiter is unavailable.', 503)
  }
}

function oracleBase(env: ProjectFileEnv) {
  const origin = oracleOrigin(env.ORACLE_ENDPOINT)
  if (!origin || !env.ORACLE_API_TOKEN) throw new ProjectFileError('Oracle project-file storage is not configured.', 503)
  return origin
}

async function smallJson(response: Response, limit = 16_384) {
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) {
    await response.body?.cancel()
    throw new ProjectFileError('Oracle project-file service did not return a valid response.', response.status === 404 ? 503 : 502)
  }
  const reader = response.body?.getReader()
  if (!reader) throw new ProjectFileError('Oracle project-file response is empty.', 502)
  const decoder = new TextDecoder()
  let text = '', size = 0
  for (;;) {
    const next = await reader.read()
    if (next.done) break
    size += next.value.byteLength
    if (size > limit) { await reader.cancel(); throw new ProjectFileError('Oracle project-file response is too large.', 502) }
    text += decoder.decode(next.value, { stream: true })
  }
  const parsed: unknown = JSON.parse(text + decoder.decode())
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new ProjectFileError('Oracle project-file response is invalid.', 502)
  return parsed as Record<string, unknown>
}

async function oracleHealth(env: ProjectFileEnv, fetcher: typeof fetch) {
  const response = await fetcher(oracleBase(env) + '/v1/health', {
    method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(10_000),
    headers: { Authorization: `Bearer ${env.ORACLE_API_TOKEN}`, Accept: 'application/json' },
  })
  const body = await smallJson(response)
  const ready = body.ready === true &&
    body.provider === 'openai' &&
    body.model === 'gpt-6-astra' &&
    Number.isSafeInteger(body.connectorVersion) && Number(body.connectorVersion) >= 33 &&
    body.projectFilesRevision === 1 &&
    body.projectFileMaxBytes === PROJECT_ATTACHMENT_MAX_BYTES &&
    body.projectFileMaxCount === PROJECT_ATTACHMENT_LIMIT
  return { ready, body }
}

function scopeValue(value: string | undefined): ProjectAttachmentScope | null {
  return value === 'shop' || value === 'game-lab' ? value : null
}

function safeFileName(request: Request) {
  const encoded = request.headers.get('X-WORLDIFACT-File-Name') || ''
  if (!encoded || encoded.length > 720) throw new ProjectFileError('Project file name is missing or too long.')
  let name = ''
  try { name = decodeURIComponent(encoded) } catch { throw new ProjectFileError('Project file name is invalid.') }
  if (!name.trim() || name.length > 180 || /[\u0000-\u001f\u007f]/.test(name)) throw new ProjectFileError('Project file name is invalid.')
  return name.trim()
}

function safeCategory(value: string | null): ProjectAttachmentCategory {
  if (value === 'document' || value === 'model-3d' || value === 'texture' || value === 'video' || value === 'archive') return value
  throw new ProjectFileError('Project file category is invalid.')
}

async function authorizedSessionRequest(request: Request, env: ProjectFileEnv) {
  const publicPilot = env.ENABLE_ORACLE_JOBS === 'true' && env.PUBLIC_PILOT === 'true'
  if (publicPilot) return
  if (!secretReady(env) || !await ownerAuthorized(request, env.OWNER_ACCESS_TOKEN!))
    throw new ProjectFileError('Owner access is required to create a project-file session.', 401)
}

async function forwardJson(env: ProjectFileEnv, fetcher: typeof fetch, path: string, init: RequestInit = {}) {
  const response = await fetcher(oracleBase(env) + path, {
    ...init,
    redirect: 'manual',
    signal: AbortSignal.timeout(45_000),
    headers: {
      Authorization: `Bearer ${env.ORACLE_API_TOKEN}`,
      Accept: 'application/json',
      ...(init.headers || {}),
    },
  })
  return { response, body: await smallJson(response, 32_768) }
}

export async function projectFileApi(request: Request, env: ProjectFileEnv, fetcher: typeof fetch = fetch): Promise<Response | null> {
  const url = new URL(request.url)
  if (!url.pathname.startsWith('/api/project-files')) return null
  try {
    if (url.pathname === '/api/project-files/status' && request.method === 'GET') {
      await rateLimit(request, env, 'status')
      const health = await oracleHealth(env, fetcher)
      return json({
        ready: health.ready,
        oracle: health.ready ? 'PROJECT_FILES_READY' : 'PROJECT_FILES_UNAVAILABLE',
        revision: health.ready ? 1 : null,
        maxFiles: PROJECT_ATTACHMENT_LIMIT,
        maxBytesPerFile: PROJECT_ATTACHMENT_MAX_BYTES,
      }, health.ready ? 200 : 503)
    }

    if (url.pathname === '/api/project-files/session') {
      if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405)
      if (request.headers.get('Origin') !== url.origin) return json({ error: 'Same-origin request required.' }, 403)
      await authorizedSessionRequest(request, env)
      await rateLimit(request, env, 'session')
      const scope = scopeValue(request.headers.get('X-WORLDIFACT-Project-Scope') || undefined)
      if (!scope) throw new ProjectFileError('Project-file scope is invalid.')
      const health = await oracleHealth(env, fetcher)
      if (!health.ready) throw new ProjectFileError('Oracle project-file storage is not installed on the connected worker yet.', 503)
      return json(await createToken(env, crypto.randomUUID(), scope), 201)
    }

    const match = /^\/api\/project-files\/(shop|game-lab)\/([a-f0-9-]{36})(?:\/(0|1))?$/.exec(url.pathname)
    if (!match) return json({ error: 'Project-file route not found.' }, 404)
    const scope = match[1] as ProjectAttachmentScope
    const projectId = match[2]
    const slot = match[3] === undefined ? null : Number(match[3])
    if (!UUID.test(projectId)) throw new ProjectFileError('Project identifier is invalid.')
    if (request.method !== 'GET' && request.headers.get('Origin') !== url.origin) return json({ error: 'Same-origin request required.' }, 403)
    const auth = await verifyToken(env, request.headers.get('X-WORLDIFACT-Project') || '', projectId, scope)

    if (request.method === 'GET' && slot === null) {
      await rateLimit(request, env, `list:${auth.projectId}`)
      const { body } = await forwardJson(env, fetcher, `/v1/project-files/${scope}/${projectId}`, { method: 'GET' })
      return json(body)
    }

    if (slot === null) return json({ error: 'Choose attachment slot 0 or 1.' }, 400)

    if (request.method === 'DELETE') {
      await rateLimit(request, env, `delete:${auth.projectId}`)
      const { body } = await forwardJson(env, fetcher, `/v1/project-files/${scope}/${projectId}/${slot}`, { method: 'DELETE' })
      return json(body)
    }

    if (request.method !== 'PUT') return json({ error: 'Use GET, PUT or DELETE.' }, 405)
    await rateLimit(request, env, `upload:${auth.projectId}`)
    const declared = Number(request.headers.get('Content-Length') || '0')
    if (!Number.isSafeInteger(declared) || declared <= 0 || declared > PROJECT_ATTACHMENT_MAX_BYTES || !request.body)
      throw new ProjectFileError('Each project file must have a known size from 1 byte to 100 MB.', 413)
    const name = safeFileName(request)
    const category = safeCategory(request.headers.get('X-WORLDIFACT-Category'))
    if (attachmentCategory({ name, type: request.headers.get('Content-Type') }) !== category)
      throw new ProjectFileError('Project file type does not match its file name.')
    const contentType = (request.headers.get('Content-Type') || 'application/octet-stream').slice(0, 160)
    const response = await fetcher(oracleBase(env) + `/v1/project-files/${scope}/${projectId}/${slot}`, {
      method: 'PUT',
      body: request.body,
      redirect: 'manual',
      signal: AbortSignal.timeout(180_000),
      headers: {
        Authorization: `Bearer ${env.ORACLE_API_TOKEN}`,
        Accept: 'application/json',
        'Content-Type': contentType,
        'Content-Length': String(declared),
        'X-WORLDIFACT-File-Name': encodeURIComponent(name),
        'X-WORLDIFACT-Category': category,
      },
    })
    const body = await smallJson(response, 32_768)
    return json(body, response.status === 201 ? 201 : 200)
  } catch (error) {
    if (error instanceof ProjectFileError) return json({ error: error.message }, error.status)
    return json({ error: 'Project-file request failed safely. Local files were not changed.' }, 503)
  }
}
