import { IMAGE_ID, IMAGE_MODELS, IMAGE_TERMS, parseImageInput, type ImageJob } from '../src/lib/imageGeneration.ts'
import { getVerifiedAccount, type AccountEnv } from './accounts.ts'
import type { EntitlementEnv, EntitlementStorage } from './entitlements.ts'

export interface ImageEnv extends AccountEnv, EntitlementEnv {
  OPENAI_API_KEY?: string
  ENABLE_PAID_GENERATION?: string
  ENABLE_IMAGE_GENERATION?: string
  GENERATION_LIMITER?: { limit(options: { key: string }): Promise<{ success: boolean }> }
}
const INDEX = 'image-index:v1', HELD = 'customer-reserved-credits:v1'
const CHUNK = 48 * 1024, MAX_BYTES = 8 * 1024 * 1024
const headers = { 'Cache-Control': 'private, no-store', 'Vary': 'Cookie', 'X-Content-Type-Options': 'nosniff' }
const json = (data: unknown, status = 200) => Response.json(data, { status, headers })
const ready = (env: ImageEnv) => !!env.OPENAI_API_KEY && env.ENABLE_PAID_GENERATION === 'true' && env.ENABLE_IMAGE_GENERATION !== 'false' && !!env.GENERATION_LIMITER && !!env.ACCOUNT_ENTITLEMENTS
const key = (id: string) => `image-job:v1:${id}`
const chunkKey = (id: string, index: number) => `image-file:v1:${id}:${index}`
const digest = async (bytes: Uint8Array) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>))].map(n => n.toString(16).padStart(2, '0')).join('')
const integer = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0
async function boundedJson(response: Request | Response, max: number): Promise<unknown> {
  if (Number(response.headers.get('content-length')) > max) throw new Error('Payload too large.')
  const reader = response.body?.getReader()
  if (!reader) throw new Error('Missing JSON.')
  let total = 0; const chunks: Uint8Array[] = []
  for (;;) {
    const part = await reader.read(); if (part.done) break
    total += part.value.length
    if (total > max) { await reader.cancel(); throw new Error('Payload too large.') }
    chunks.push(part.value)
  }
  const bytes = new Uint8Array(total); let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  return JSON.parse(new TextDecoder().decode(bytes))
}

/** Public routes never accept account IDs or internal settlement operations. */
export async function imageApi(request: Request, env: ImageEnv, fetcher: typeof fetch = fetch): Promise<Response | null> {
  const url = new URL(request.url)
  if (url.pathname !== '/api/images' && !url.pathname.startsWith('/api/images/')) return null
  if (url.search || request.headers.get('Sec-Fetch-Site') === 'cross-site' ||
      request.headers.has('Origin') && request.headers.get('Origin') !== url.origin ||
      request.method !== 'GET' && request.headers.get('Origin') !== url.origin)
    return json({ error: 'Same-origin image access required.' }, 403)
  if (url.pathname === '/api/images/status' && request.method === 'GET')
    return json({ ready: ready(env), terms: IMAGE_TERMS, models: IMAGE_MODELS })
  const suffix = url.pathname.slice('/api/images'.length)
  if (!(suffix === '' && ['GET', 'POST'].includes(request.method) || /^\/[a-f0-9-]{36}(?:\/file)?$/.test(suffix) && request.method === 'GET'))
    return json({ error: 'Image route not found.' }, 404)
  try {
    if (!env.ACCOUNT_ENTITLEMENTS || !env.ACCOUNT_LIMITER || env.ACCOUNT_LEDGER_MODE !== undefined && !['live', 'sandbox'].includes(env.ACCOUNT_LEDGER_MODE))
      return json({ error: 'Image account storage is unavailable.' }, 503)
    const account = await getVerifiedAccount(request, env, fetcher)
    if (!account || !IMAGE_ID.test(account.id.toLowerCase())) return json({ error: 'Sign in to generate and view your images.' }, 401)
    if (!(await env.ACCOUNT_LIMITER.limit({ key: `images:${account.id}` })).success) return json({ error: 'Please wait before checking images again.' }, 429)
    if (request.method === 'POST') {
      if (!ready(env)) return json({ error: 'Image generation is currently unavailable.' }, 503)
      if (!request.headers.get('Content-Type')?.startsWith('application/json')) return json({ error: 'Use application/json.' }, 415)
    }
    let body: string | undefined
    if (request.method === 'POST') {
      try { body = JSON.stringify(parseImageInput(await boundedJson(request, 24_000))) }
      catch { return json({ error: 'Use a valid image request with 3–4000 characters and the displayed 25-point price.' }, 400) }
    }
    const namespace = env.ACCOUNT_LEDGER_MODE === 'sandbox' ? 'account:sandbox:v1' : 'account:v1'
    const object = env.ACCOUNT_ENTITLEMENTS.get(env.ACCOUNT_ENTITLEMENTS.idFromName(`${namespace}:${account.id.toLowerCase()}`))
    return await object.fetch(new Request(`https://entitlements.internal/images${suffix}`, {
      method: request.method, body, headers: { 'Content-Type': 'application/json', 'X-WORLDIFACT-Verified-Account': account.id.toLowerCase() },
    }))
  } catch { return json({ error: 'Image status is unavailable. Check your image library before starting another request.' }, 503) }
}

/** Runs only in the verified account's existing Durable Object. No new billing namespace. */
export async function imageStore(request: Request, storage: EntitlementStorage, env: ImageEnv, accountId: string, now = Date.now, fetcher: typeof fetch = fetch): Promise<Response> {
  const path = new URL(request.url).pathname
  if (request.method === 'GET') {
    if (path === '/images') {
      const ids = await storage.get<string[]>(INDEX) ?? []
      const jobs = await Promise.all(ids.map(id => storage.get<ImageJob>(key(id))))
      return json({ jobs: jobs.filter(Boolean).reverse(), terms: IMAGE_TERMS })
    }
    const match = /^\/images\/([a-f0-9-]{36})(\/file)?$/.exec(path)
    if (!match || !IMAGE_ID.test(match[1])) return json({ error: 'Image not found.' }, 404)
    const job = await storage.get<ImageJob>(key(match[1]))
    if (!job) return json({ error: 'Image not found in this account.' }, 404)
    if (!match[2]) return json({ job })
    if (job.state !== 'completed' || !job.bytes || !job.chunks) return json({ error: 'This image is not ready.' }, 409)
    const bytes = new Uint8Array(job.bytes); let offset = 0
    for (let index = 0; index < job.chunks; index++) {
      const part = await storage.get<Uint8Array>(chunkKey(job.id, index))
      if (!part) return json({ error: 'Image storage is temporarily unavailable.' }, 503)
      bytes.set(part, offset); offset += part.length
    }
    if (offset !== job.bytes || await digest(bytes) !== job.sha256) return json({ error: 'Image integrity check failed.' }, 503)
    return new Response(bytes, { headers: { ...headers, 'Content-Type': 'image/png', 'Content-Length': String(bytes.length), 'Content-Disposition': `inline; filename="worldifact-${job.id}.png"` } })
  }
  if (path !== '/images' || request.method !== 'POST') return json({ error: 'Unsupported image operation.' }, 405)
  if (!ready(env)) return json({ error: 'Image generation is unavailable.' }, 503)
  let input
  try { input = parseImageInput(await boundedJson(request, 24_000)) } catch { return json({ error: 'Invalid image request.' }, 400) }
  const fingerprint = await digest(new TextEncoder().encode(JSON.stringify({ ...input, ...IMAGE_TERMS })))
  // Replays bypass the rate limiter and never call the provider, even after expiry.
  const existing = await storage.get<ImageJob>(key(input.id))
  if (existing) return existing.fingerprint === fingerprint ? json({ job: existing }) : json({ error: 'This request ID belongs to another image description.' }, 409)
  if (!(await env.GENERATION_LIMITER!.limit({ key: `image-generation:${accountId}` })).success) return json({ error: 'Please wait before generating again.' }, 429)
  const admission = await storage.transaction(async tx => {
    const duplicate = await tx.get<ImageJob>(key(input.id))
    if (duplicate) return { job: duplicate, started: false }
    const balance = await tx.get<number>('balance') ?? 0, held = await tx.get<number>(HELD) ?? 0
    if (!integer(balance) || !integer(held) || await tx.get('billingHold') === true) return { error: 'Your account needs a billing review.', status: 403 }
    if (balance - held < IMAGE_TERMS.points) return { error: 'You need 25 available points to generate an image.', status: 402 }
    const ids = await tx.get<string[]>(INDEX) ?? []
    if (ids.length >= 100) return { error: 'Your image library has reached its 100-request limit.', status: 409 }
    for (const id of ids) {
      const other = await tx.get<ImageJob>(key(id))
      if (other?.settlement === 'held') return { error: 'Check your existing image request before starting another.', status: 409 }
    }
    const job: ImageJob = { id: input.id, prompt: input.prompt, model: input.model, at: now(), updatedAt: now(), state: 'processing', points: 25, settlement: 'held', fingerprint }
    await tx.put(HELD, held + job.points)
    await tx.put(key(input.id), job)
    await tx.put(INDEX, [...ids, input.id])
    return { job, started: true }
  })
  if ('error' in admission) return json({ error: admission.error }, admission.status)
  if (!admission.started) return admission.job.fingerprint === fingerprint ? json({ job: admission.job }) : json({ error: 'Request conflict.' }, 409)
  const job = admission.job
  // Exactly one external POST. An uncertain outcome is never automatically retried or refunded.
  try {
    const response = await fetcher('https://api.openai.com/v1/images/generations', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(180_000),
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: input.model, prompt: input.prompt, n: 1, size: IMAGE_TERMS.size, quality: IMAGE_TERMS.quality, output_format: 'png' }),
    })
    if (!response.ok) {
      await response.body?.cancel()
      if ([400, 401, 403, 404, 422, 429].includes(response.status)) {
        const detail = response.status === 429 ? 'The image provider is busy or its quota is exhausted. Your 25 points were released.'
          : [401, 403, 404].includes(response.status) ? 'GPT Image 2.5 is not available with the configured API key. Your 25 points were released.'
          : 'The image provider rejected this request. Try a different description. Your 25 points were released.'
        const failed: ImageJob = { ...job, updatedAt: now(), state: 'failed', settlement: 'released', detail }
        await storage.transaction(async tx => {
          const current = await tx.get<ImageJob>(key(job.id)), held = await tx.get<number>(HELD)
          if (current?.settlement !== 'held' || !integer(held) || held < 25) throw new Error('Settlement unavailable')
          await tx.put(HELD, held - 25); await tx.put(key(job.id), failed)
        })
        return json({ job: failed })
      }
      throw new Error('Uncertain provider response')
    }
    const result = await boundedJson(response, Math.ceil(MAX_BYTES / 3) * 4 + 16_384) as { data?: { b64_json?: unknown }[]; usage?: unknown }
    const b64 = result?.data?.length === 1 ? result.data[0]?.b64_json : undefined
    if (typeof b64 !== 'string' || b64.length > Math.ceil(MAX_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) throw new Error('Invalid image payload')
    const bytes = Uint8Array.from(atob(b64), ch => ch.charCodeAt(0))
    const png = [137, 80, 78, 71, 13, 10, 26, 10]
    if (bytes.length < 33 || bytes.length > MAX_BYTES || png.some((value, i) => bytes[i] !== value) ||
        new DataView(bytes.buffer).getUint32(16) !== 1024 || new DataView(bytes.buffer).getUint32(20) !== 1024) throw new Error('Invalid PNG dimensions')
    const usage = result.usage as ImageJob['usage']
    const proof = usage && [usage.input_tokens, usage.output_tokens, usage.total_tokens].every(integer)
      ? { input_tokens: usage.input_tokens, output_tokens: usage.output_tokens, total_tokens: usage.total_tokens } : undefined
    const providerId = response.headers.get('x-request-id')
    const completed: ImageJob = { ...job, state: 'completed', settlement: 'charged', updatedAt: now(), bytes: bytes.length, chunks: Math.ceil(bytes.length / CHUNK), sha256: await digest(bytes),
      ...(providerId && /^[\w-]{1,180}$/.test(providerId) ? { providerRequestId: providerId } : {}), ...(proof ? { usage: proof } : {}) }
    await storage.transaction(async tx => {
      const current = await tx.get<ImageJob>(key(job.id)), held = await tx.get<number>(HELD), balance = await tx.get<number>('balance')
      // A billing event may have reduced the balance during generation. Preserve that debt.
      if (current?.settlement !== 'held' || !integer(held) || held < 25 || !Number.isSafeInteger(balance)) throw new Error('Settlement unavailable')
      for (let i = 0; i < completed.chunks!; i++) await tx.put(chunkKey(job.id, i), bytes.slice(i * CHUNK, (i + 1) * CHUNK))
      await tx.put(HELD, held - 25); await tx.put('balance', balance! - 25); await tx.put(key(job.id), completed)
    })
    return json({ job: completed })
  } catch {
    // Do not overwrite a completed transaction if its acknowledgement was lost.
    const current = await storage.get<ImageJob>(key(job.id))
    if (current?.state === 'completed' || current?.state === 'failed') return json({ job: current })
    const uncertain: ImageJob = { ...job, state: 'uncertain', updatedAt: now(), detail: 'The provider outcome could not be confirmed. 25 points remain held for review; no second image request was sent.' }
    await storage.put(key(job.id), uncertain)
    return json({ job: uncertain })
  }
}
