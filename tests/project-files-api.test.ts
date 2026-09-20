import test from 'node:test'
import assert from 'node:assert/strict'
import { projectFileApi } from '../server/project-files.ts'
import { PROJECT_ATTACHMENT_MAX_BYTES } from '../src/lib/projectAttachmentPolicy.ts'

const origin = 'https://worldifact.test'
const env = {
  OWNER_ACCESS_TOKEN: 'o'.repeat(48),
  ORACLE_ENDPOINT: 'https://project-files.trycloudflare.com',
  ORACLE_API_TOKEN: 'oracle-secret',
  ENABLE_ORACLE_JOBS: 'true',
  PUBLIC_PILOT: 'true',
  GENERATION_LIMITER: { async limit() { return { success: true } } },
}

function health() {
  return Response.json({
    ready: true,
    provider: 'openai',
    model: 'gpt-6-astra',
    connectorVersion: 33,
    projectFilesRevision: 1,
    projectFileMaxBytes: PROJECT_ATTACHMENT_MAX_BYTES,
    projectFileMaxCount: 2,
  })
}

test('project-file status requires the exact Oracle capability revision', async () => {
  const good = await projectFileApi(new Request(origin + '/api/project-files/status'), env, async input => {
    assert.equal(String(input), 'https://project-files.trycloudflare.com/v1/health')
    return health()
  })
  assert.equal(good?.status, 200)
  assert.deepEqual(await good!.json(), {
    ready: true,
    oracle: 'PROJECT_FILES_READY',
    revision: 1,
    maxFiles: 2,
    maxBytesPerFile: PROJECT_ATTACHMENT_MAX_BYTES,
  })

  const bad = await projectFileApi(new Request(origin + '/api/project-files/status'), env, async () => Response.json({
    ready: true, provider: 'openai', model: 'gpt-6-astra', connectorVersion: 33,
  }))
  assert.equal(bad?.status, 503)
})

test('same-origin public pilot gets a signed 24h project session without exposing Oracle credentials', async () => {
  const response = await projectFileApi(new Request(origin + '/api/project-files/session', {
    method: 'POST',
    headers: { Origin: origin, 'X-WORLDIFACT-Project-Scope': 'shop' },
  }), env, async () => health())
  assert.equal(response?.status, 201)
  const body = await response!.json() as { projectId: string; token: string; scope: string; expiresAt: string }
  assert.match(body.projectId, /^[a-f0-9-]{36}$/)
  assert.equal(body.scope, 'shop')
  assert.ok(Date.parse(body.expiresAt) > Date.now())
  assert.ok(body.token.startsWith(body.projectId + '.'))
  assert.doesNotMatch(JSON.stringify(body), /oracle-secret|trycloudflare/)
})

test('signed upload streams one allowed file to the matching Oracle slot and preserves metadata only', async () => {
  const sessionResponse = await projectFileApi(new Request(origin + '/api/project-files/session', {
    method: 'POST', headers: { Origin: origin, 'X-WORLDIFACT-Project-Scope': 'game-lab' },
  }), env, async () => health())
  const session = await sessionResponse!.json() as { projectId: string; token: string }

  let uploadSeen = false
  const response = await projectFileApi(new Request(`${origin}/api/project-files/game-lab/${session.projectId}/0`, {
    method: 'PUT',
    headers: {
      Origin: origin,
      'X-WORLDIFACT-Project': session.token,
      'X-WORLDIFACT-File-Name': encodeURIComponent('concept.docx'),
      'X-WORLDIFACT-Category': 'document',
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Length': '4',
    },
    body: new Uint8Array([1, 2, 3, 4]),
  }), env, async (input, init) => {
    const url = String(input)
    if (url.endsWith('/v1/health')) return health()
    uploadSeen = true
    assert.equal(url, `https://project-files.trycloudflare.com/v1/project-files/game-lab/${session.projectId}/0`)
    assert.equal(init?.method, 'PUT')
    const headers = new Headers(init?.headers)
    assert.equal(headers.get('Authorization'), 'Bearer oracle-secret')
    assert.equal(headers.get('X-WORLDIFACT-Category'), 'document')
    assert.equal(decodeURIComponent(headers.get('X-WORLDIFACT-File-Name')!), 'concept.docx')
    assert.equal(headers.get('Content-Length'), '4')
    return Response.json({ stored: true, file: { slot: 0, name: 'concept.docx', bytes: 4 } }, { status: 201 })
  })
  assert.equal(response?.status, 201)
  assert.equal(uploadSeen, true)
})

test('project-file proxy rejects wrong origin, unsupported files, oversize and mismatched tokens before Oracle upload', async () => {
  const sessionResponse = await projectFileApi(new Request(origin + '/api/project-files/session', {
    method: 'POST', headers: { Origin: origin, 'X-WORLDIFACT-Project-Scope': 'shop' },
  }), env, async () => health())
  const session = await sessionResponse!.json() as { projectId: string; token: string }

  const wrongOrigin = await projectFileApi(new Request(`${origin}/api/project-files/shop/${session.projectId}/0`, {
    method: 'PUT',
    headers: { Origin: 'https://evil.invalid' },
  }), env, async () => { throw new Error('network must not run') })
  assert.equal(wrongOrigin?.status, 403)

  const badType = await projectFileApi(new Request(`${origin}/api/project-files/shop/${session.projectId}/0`, {
    method: 'PUT',
    headers: {
      Origin: origin, 'X-WORLDIFACT-Project': session.token,
      'X-WORLDIFACT-File-Name': encodeURIComponent('run.exe'),
      'X-WORLDIFACT-Category': 'document',
      'Content-Type': 'application/x-msdownload',
      'Content-Length': '4',
    },
    body: new Uint8Array([1, 2, 3, 4]),
  }), env, async () => { throw new Error('network must not run') })
  assert.equal(badType?.status, 400)

  const oversize = await projectFileApi(new Request(`${origin}/api/project-files/shop/${session.projectId}/1`, {
    method: 'PUT',
    headers: {
      Origin: origin, 'X-WORLDIFACT-Project': session.token,
      'X-WORLDIFACT-File-Name': encodeURIComponent('movie.mp4'),
      'X-WORLDIFACT-Category': 'video',
      'Content-Type': 'video/mp4',
      'Content-Length': String(PROJECT_ATTACHMENT_MAX_BYTES + 1),
    },
    body: new Uint8Array([1]),
  }), env, async () => { throw new Error('network must not run') })
  assert.equal(oversize?.status, 413)
})
