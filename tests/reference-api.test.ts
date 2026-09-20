import test from 'node:test'
import assert from 'node:assert/strict'
import { referenceApi } from '../server/reference.ts'

function env() {
  const budget = {
    async fetch(request: Request) {
      const url = new URL(request.url)
      if (url.pathname === '/reserve') return Response.json({ allowed: true, remaining: null, unlimited: true })
      return Response.json({ error: 'unexpected' }, { status: 404 })
    },
  }
  return {
    OPENAI_API_KEY: 'test-only-key',
    OPENAI_MODEL: 'gpt-6-astra',
    ENABLE_PAID_GENERATION: 'true',
    GENERATION_REQUEST_LIMIT: 'unlimited',
    GENERATION_EXPIRES_AT: '',
    GENERATION_BUDGET: { idFromName: (name: string) => name, get: () => budget },
    GENERATION_LIMITER: { async limit() { return { success: true } } },
  }
}

test('document reference uses user_data upload, one Astra analysis and deletes the temporary OpenAI file', async () => {
  const calls: { url: string; method: string; body?: unknown }[] = []
  const fetcher = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input), method = init.method || 'GET'
    calls.push({ url, method, body: init.body })
    if (url.endsWith('/v1/files') && method === 'POST') {
      assert.ok(init.body instanceof FormData)
      assert.equal(init.body.get('purpose'), 'user_data')
      const file = init.body.get('file')
      assert.ok(file instanceof File)
      assert.equal(file.name, 'design.docx')
      assert.equal(file.size, 8)
      return Response.json({ id: 'file-test123', bytes: 8, filename: 'design.docx', purpose: 'user_data' })
    }
    if (url.endsWith('/v1/responses') && method === 'POST') {
      const payload = JSON.parse(String(init.body))
      assert.equal(payload.model, 'gpt-6-astra')
      assert.equal(payload.store, false)
      assert.equal(payload.input[0].content[0].type, 'input_file')
      assert.equal(payload.input[0].content[0].file_id, 'file-test123')
      return Response.json({
        status: 'completed',
        output: [{ content: [{ type: 'output_text', text: 'Geometry: rounded shell. Material: matte polymer. Keep 120 mm overall height.' }] }],
      })
    }
    if (url.endsWith('/v1/files/file-test123') && method === 'DELETE') return Response.json({ id: 'file-test123', deleted: true })
    throw new Error(`Unexpected fetch: ${method} ${url}`)
  }) as typeof fetch

  const request = new Request('https://worldifact.test/api/reference/analyze', {
    method: 'POST',
    headers: {
      Origin: 'https://worldifact.test',
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'X-WORLDIFACT-Filename': encodeURIComponent('design.docx'),
    },
    body: new Uint8Array([1,2,3,4,5,6,7,8]),
  })
  const response = await referenceApi(request, env(), fetcher)
  assert.ok(response)
  assert.equal(response.status, 200)
  const body = await response.json() as { brief: string; provenance: string; model: string }
  assert.match(body.brief, /rounded shell/)
  assert.equal(body.provenance, 'GENERATED-REFERENCE-BRIEF')
  assert.equal(body.model, 'gpt-6-astra')
  assert.deepEqual(calls.map(call => [call.method, call.url.replace('https://api.openai.com','')]), [
    ['POST','/v1/files'], ['POST','/v1/responses'], ['DELETE','/v1/files/file-test123'],
  ])
})

test('reference analysis rejects cross-origin, unsupported video and oversized documents before any provider call', async () => {
  let calls = 0
  const fetcher = (async () => { calls++; throw new Error('provider must not run') }) as typeof fetch

  const cross = await referenceApi(new Request('https://worldifact.test/api/reference/analyze', {
    method: 'POST',
    headers: { Origin: 'https://evil.test', 'Content-Type': 'application/pdf', 'X-WORLDIFACT-Filename': 'spec.pdf' },
    body: new Uint8Array([1]),
  }), env(), fetcher)
  assert.equal(cross?.status, 403)

  const video = await referenceApi(new Request('https://worldifact.test/api/reference/analyze', {
    method: 'POST',
    headers: { Origin: 'https://worldifact.test', 'Content-Type': 'video/mp4', 'X-WORLDIFACT-Filename': 'walkthrough.mp4' },
    body: new Uint8Array([1]),
  }), env(), fetcher)
  assert.equal(video?.status, 415)

  const large = await referenceApi(new Request('https://worldifact.test/api/reference/analyze', {
    method: 'POST',
    headers: {
      Origin: 'https://worldifact.test',
      'Content-Type': 'application/pdf',
      'Content-Length': String(20 * 1024 * 1024 + 1),
      'X-WORLDIFACT-Filename': 'large.pdf',
    },
    body: new Uint8Array([1]),
  }), env(), fetcher)
  assert.equal(large?.status, 413)
  assert.equal(calls, 0)
})

test('temporary uploaded file is deleted even when Astra analysis fails', async () => {
  const calls: string[] = []
  const fetcher = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input); calls.push(`${init.method || 'GET'} ${url}`)
    if (url.endsWith('/v1/files') && init.method === 'POST') return Response.json({ id: 'file-cleanup123' })
    if (url.endsWith('/v1/responses')) return new Response('busy', { status: 429 })
    if (url.endsWith('/v1/files/file-cleanup123') && init.method === 'DELETE') return Response.json({ deleted: true })
    throw new Error('unexpected')
  }) as typeof fetch
  const response = await referenceApi(new Request('https://worldifact.test/api/reference/analyze', {
    method: 'POST',
    headers: { Origin: 'https://worldifact.test', 'Content-Type': 'application/pdf', 'X-WORLDIFACT-Filename': 'spec.pdf' },
    body: new Uint8Array([1,2,3]),
  }), env(), fetcher)
  assert.equal(response?.status, 429)
  assert.ok(calls.some(call => call.includes('DELETE https://api.openai.com/v1/files/file-cleanup123')))
})
