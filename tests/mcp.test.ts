import test from 'node:test'
import assert from 'node:assert/strict'
import { CHESS_AUTH_URL } from '../server/accounts.ts'
import { mcpApi, WORLDIFACT_MCP_TOOLS } from '../server/mcp.ts'
import type { StudioEnv } from '../server/studio.ts'
import { GenerationBudget, type BudgetStorage } from '../server/budget.ts'
import { AccountEntitlements, entitlementCall, entitlementStatus, type EntitlementStorage } from '../server/entitlements.ts'
import { detailedHealthFixture } from './detailed-studio-fixture.ts'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const USER = { id: USER_ID, email: 'owner@example.test', user_metadata: { name: 'WORLDIFACT Owner' } }
const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
function token(overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000)
  return `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: CHESS_AUTH_URL + '/auth/v1', aud: ['authenticated', 'https://worldifact.test/mcp'], exp: now + 3600, iat: now, sub: USER_ID, client_id: 'openai-test-client', scope: 'email profile', ...overrides })}.signature`
}
function message(method: string, params?: unknown, authorization?: string, headers: Record<string, string> = {}) {
  return new Request('https://worldifact.test/mcp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...(authorization ? { Authorization: 'Bearer ' + authorization } : {}),
      ...headers,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, ...(params === undefined ? {} : { params }) }),
  })
}
const env: StudioEnv = { MCP_RESOURCE_URL: 'https://worldifact.test/mcp', MCP_OAUTH_CLIENT_IDS: 'openai-test-client', MCP_OAUTH_REDIRECT_URIS: 'https://chatgpt.com/connector_platform_oauth_redirect' }
const modelArgs = { prompt: 'A precise solar rover wheel', worldId: 'enchanted-ai-shop', purpose: 'object', textureMaxSize: 4096, model: 'astra', generationProfile: 'standard' }

test('MCP exposes public OAuth metadata and a stateless initialize handshake', async () => {
  const metadata = await mcpApi(new Request('https://worldifact.test/.well-known/oauth-protected-resource'), env)
  assert.ok(metadata)
  assert.equal(metadata.status, 200)
  const body = await metadata.json() as Record<string, unknown>
  assert.equal(body.resource, 'https://worldifact.test/mcp')
  assert.deepEqual(body.authorization_servers, [CHESS_AUTH_URL + '/auth/v1'])
  assert.deepEqual(body.scopes_supported, ['email', 'profile'])

  const initialized = await mcpApi(message('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } }), env)
  const init = await initialized!.json() as { result: { protocolVersion: string; capabilities: Record<string, unknown> } }
  assert.equal(init.result.protocolVersion, '2025-06-18')
  assert.ok(init.result.capabilities.tools)
})

test('tool list marks private tools with OAuth and generation as consequential', async () => {
  const response = await mcpApi(message('tools/list'), env)
  const body = await response!.json() as { result: { tools: typeof WORLDIFACT_MCP_TOOLS } }
  const status = body.result.tools.find(tool => tool.name === 'get_worldifact_status')
  const profile = body.result.tools.find(tool => tool.name === 'get_profile')
  const generation = body.result.tools.find(tool => tool.name === 'start_3d_model')
  assert.equal(status?.securitySchemes[0].type, 'noauth')
  assert.equal(profile?.securitySchemes[0].type, 'oauth2')
  assert.equal(profile?._meta?.['openai/profile'], true)
  assert.equal(generation?.annotations.destructiveHint, true)
})

test('public status works without provider calls', async () => {
  const fetcher = (() => { throw new Error('No network expected') }) as typeof fetch
  const response = await mcpApi(message('tools/call', { name: 'get_worldifact_status', arguments: {} }), env, fetcher)
  const body = await response!.json() as { result: { structuredContent: Record<string, unknown> } }
  assert.equal(body.result.structuredContent.cloudflare, 'RESPONDING')
  assert.equal(body.result.structuredContent.mcp, 'RESPONDING')
  assert.equal(body.result.structuredContent.generationStarted, false)
  assert.equal(body.result.structuredContent.oauthConfigured, true)
  const unconfigured = await mcpApi(message('tools/call', { name: 'get_worldifact_status', arguments: {} }), {}, fetcher)
  assert.equal((await unconfigured!.json() as { result: { structuredContent: { oauthConfigured: boolean } } }).result.structuredContent.oauthConfigured, false)
})

test('private tools emit the OpenAI OAuth linking challenge when no valid token is present', async () => {
  let calls = 0
  const fetcher = (async () => { calls++; throw new Error('No provider call expected') }) as typeof fetch
  const response = await mcpApi(message('tools/call', { name: 'get_profile', arguments: {} }), env, fetcher)
  const body = await response!.json() as { result: { isError: boolean; _meta: { 'mcp/www_authenticate': string[] } } }
  assert.equal(body.result.isError, true)
  assert.match(body.result._meta['mcp/www_authenticate'][0], /oauth-protected-resource/)
  assert.equal(response!.status, 401)
  assert.equal(response!.headers.get('WWW-Authenticate'), body.result._meta['mcp/www_authenticate'][0])
  assert.equal(calls, 0)
})

test('OAuth profile is resolved only after Supabase verifies the bearer user', async () => {
  let calls = 0
  const fetcher = (async (input, init) => {
    calls++
    assert.equal(String(input), CHESS_AUTH_URL + '/auth/v1/user')
    assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer ' + token())
    return Response.json(USER)
  }) as typeof fetch
  const access = token()
  const response = await mcpApi(message('tools/call', { name: 'get_profile', arguments: {} }, access), env, fetcher)
  const body = await response!.json() as { result: { isError?: boolean; structuredContent: Record<string, string> } }
  assert.equal(body.result.isError, undefined)
  assert.equal(body.result.structuredContent.id, USER_ID)
  assert.equal(body.result.structuredContent.name, 'WORLDIFACT Owner')
  assert.equal(body.result.structuredContent.email, 'owner@example.test')
  assert.equal(calls, 1)
})

test('expired or under-scoped OAuth tokens are rejected before any upstream request', async () => {
  const fetcher = (() => { throw new Error('No network expected') }) as typeof fetch
  for (const access of [
    token({ exp: Math.floor(Date.now() / 1000) - 1 }),
    token({ scope: 'email' }),
    token({ client_id: undefined }),
    token({ aud: 'other-resource' }),
    token({ aud: 'authenticated' }),
    token({ client_id: 'unrelated-client' }),
  ]) {
    const response = await mcpApi(message('tools/call', { name: 'get_profile', arguments: {} }, access), env, fetcher)
    const body = await response!.json() as { result: { isError: boolean } }
    assert.equal(body.result.isError, true)
    assert.equal(response!.status, 401)
  }
})

test('3D tool cannot start a paid provider call when existing Studio guards are unavailable', async () => {
  let calls = 0
  const access = token()
  const fetcher = (async (input, init) => {
    calls++
    if (String(input) === CHESS_AUTH_URL + '/auth/v1/user') {
      assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer ' + access)
      return Response.json(USER)
    }
    throw new Error('A paid/provider endpoint must not be reached')
  }) as typeof fetch
  const response = await mcpApi(message('tools/call', { name: 'prepare_3d_model', arguments: modelArgs }, access), env, fetcher)
  const body = await response!.json() as { result: { isError: boolean; structuredContent: Record<string, unknown> } }
  assert.equal(body.result.isError, true)
  assert.match(String(body.result.structuredContent.error), /account-bound Studio entitlements/i)
  assert.equal(calls, 1)
})

test('OAuth discovery fails closed when missing and uses configured issuer/resource on an alias', async () => {
  const missing = await mcpApi(new Request('https://worldifact.test/.well-known/oauth-protected-resource'), {})
  assert.equal(missing!.status, 503)
  const configured = await mcpApi(new Request('https://alias.test/.well-known/oauth-protected-resource'), { ...env, SUPABASE_URL: 'https://testproject.supabase.co' })
  const body = await configured!.json() as { resource: string; authorization_servers: string[] }
  assert.equal(body.resource, env.MCP_RESOURCE_URL)
  assert.deepEqual(body.authorization_servers, ['https://testproject.supabase.co/auth/v1'])
})

test('foreign and null origins are rejected before auth while same-origin and server requests work', async () => {
  let calls = 0
  const fetcher = (async () => { calls++; throw new Error('No upstream call expected') }) as typeof fetch
  for (const Origin of ['https://untrusted.test', 'null', 'https://worldifact.test.evil.test']) {
    const response = await mcpApi(message('tools/list', undefined, undefined, { Origin }), env, fetcher)
    assert.equal(response!.status, 403)
    assert.equal(response!.headers.get('Access-Control-Allow-Origin'), null)
  }
  const same = await mcpApi(message('tools/list', undefined, undefined, { Origin: 'https://worldifact.test' }), env, fetcher)
  assert.equal(same!.status, 200)
  assert.equal(same!.headers.get('Access-Control-Allow-Origin'), 'https://worldifact.test')
  assert.equal((await mcpApi(message('tools/list'), env, fetcher))!.status, 200)
  assert.equal(calls, 0)
})

test('temporary identity outage is not converted into an invalid-token reconnection loop', async () => {
  const response = await mcpApi(message('tools/call', { name: 'get_profile', arguments: {} }, token()), env,
    (async () => Response.json({}, { status: 503 })) as typeof fetch)
  assert.equal(response!.status, 503)
  assert.equal(response!.headers.get('WWW-Authenticate'), null)
})

test('unsupported models, discarded photos, invalid enums and extra arguments are rejected before auth', async () => {
  let calls = 0
  const fetcher = (async () => { calls++; throw new Error('No upstream call expected') }) as typeof fetch
  for (const args of [
    { ...modelArgs, photos: [{ dataUrl: 'https://reference.test/image.jpg' }] },
    { ...modelArgs, generationProfile: 'fast-draft-v1' }, { ...modelArgs, model: 'sol' },
    { ...modelArgs, worldId: 'unknown' }, { ...modelArgs, purpose: 'unknown' },
    { ...modelArgs, textureMaxSize: '4096' }, { ...modelArgs, textureMaxSize: 1234 },
    { prompt: modelArgs.prompt },
  ]) {
    const response = await mcpApi(message('tools/call', { name: 'prepare_3d_model', arguments: args }, token()), env, fetcher)
    assert.equal((await response!.json() as { result: { isError: boolean } }).result.isError, true)
  }
  const world = await mcpApi(message('tools/call', { name: 'save_my_world', arguments: { document: {}, expectedRevision: -1 } }, token()), env, fetcher)
  assert.equal((await world!.json() as { result: { isError: boolean } }).result.isError, true)
  assert.equal(calls, 0)
})

function memoryStorage(): EntitlementStorage {
  const values = new Map<string, unknown>(); let queue: Promise<unknown> = Promise.resolve()
  const storage: EntitlementStorage = {
    async get<T>(key: string) { return structuredClone(values.get(key)) as T | undefined },
    async put(key, value) { values.set(key, structuredClone(value)) },
    transaction<T>(callback: (store: EntitlementStorage) => Promise<T>) { const next = queue.then(() => callback(storage)); queue = next.catch(() => {}); return next },
  }
  return storage
}
function studioFixture() {
  const configured: StudioEnv = { ...env, OWNER_ACCESS_TOKEN: 'fixture-owner-'.repeat(4),
    ORACLE_ENDPOINT: 'https://worker.trycloudflare.com', ORACLE_API_TOKEN: 'fixture-oracle',
    PUBLIC_PILOT: 'true', ENABLE_STUDIO_JOBS: 'true', GENERATION_REQUEST_LIMIT: 'unlimited',
    ENFORCE_ACCOUNT_ENTITLEMENTS: 'true', GENERATION_LIMITER: { async limit() { return { success: true } } } }
  const budget = new GenerationBudget({ storage: memoryStorage() as BudgetStorage }, configured)
  configured.GENERATION_BUDGET = { idFromName: name => name, get: () => budget }
  const users = new Map<string, AccountEntitlements>()
  configured.ACCOUNT_ENTITLEMENTS = { idFromName: name => name, get(id) {
    const key = String(id)
    if (!users.has(key)) users.set(key, new AccountEntitlements({ storage: memoryStorage() }, {}, () => Date.now()))
    return users.get(key)!
  } }
  let posts = 0, prepareCalls = 0, lostAcceptance = false
  const fetcher = (async (url, init) => {
    const path = new URL(String(url)).pathname
    if (path === '/auth/v1/user') {
      const auth = new Headers(init?.headers).get('Authorization')!
      const claims = JSON.parse(Buffer.from(auth.split('.')[1], 'base64url').toString())
      return Response.json({ ...USER, id: claims.sub })
    }
    if (path === '/v1/health') return Response.json(detailedHealthFixture)
    if (path === '/v1/jobs' && init?.method === 'POST') {
      posts++
      if (lostAcceptance) throw new Error('Fixture lost acceptance: no live provider call')
      return Response.json({ id: JSON.parse(String(init.body)).id, state: 'building' })
    }
    if (/^\/v1\/jobs\/[a-f0-9-]+$/.test(path)) return Response.json({ id: path.split('/').pop(), state: 'building' })
    throw new Error('Unrecognized network fixture request')
  }) as typeof fetch
  const call = async (name: string, args: Record<string, unknown>, access = token()) => {
    if (name === 'prepare_3d_model') prepareCalls++
    const response = await mcpApi(message('tools/call', { name, arguments: args }, access), configured, fetcher)
    return await response!.json() as { result: { isError?: boolean; structuredContent: Record<string, any> } }
  }
  return { env: configured, call, posts: () => posts, prepareCalls: () => prepareCalls, lose: () => { lostAcceptance = true },
    subscribe: async () => {
      await entitlementCall(configured, USER_ID, '/grant', { id: 'in_fixture', credits: 4500, subscriptionId: 'sub_fixture' })
      await entitlementCall(configured, USER_ID, '/subscription', { id: 'sub_fixture', until: Date.now() + 86400000, active: true, revision: 1, plan: 'pro', grantId: 'in_fixture' })
    } }
}

test('preparation is no-spend and repeated same-receipt starts use one reservation and one Oracle POST', async () => {
  const f = studioFixture(); await f.subscribe()
  const prepared = (await f.call('prepare_3d_model', modelArgs)).result.structuredContent
  assert.equal(prepared.generationStarted, false)
  assert.equal(prepared.pointsHeld, false)
  assert.equal(prepared.maximumPoints, (await entitlementStatus(f.env, USER_ID)).generationCosts.astra)
  assert.equal((await entitlementStatus(f.env, USER_ID)).availableCredits, 4500)
  assert.equal(f.posts(), 0)
  const args = { ...modelArgs, jobId: prepared.jobId, receipt: prepared.receipt, maxPoints: prepared.maximumPoints }
  const replies = await Promise.all([f.call('start_3d_model', args), f.call('start_3d_model', args)])
  assert.ok(replies.every(reply => !reply.result.isError))
  assert.ok(replies.every(reply => reply.result.structuredContent.jobId === prepared.jobId))
  assert.equal(f.posts(), 1)
  assert.equal(f.prepareCalls(), 1)
  assert.equal((await entitlementStatus(f.env, USER_ID)).availableCredits, 4500 - prepared.maximumPoints)
})

test('ambiguous submission keeps the exact receipt and recovery cannot create another paid job', async () => {
  const f = studioFixture(); await f.subscribe()
  const prepared = (await f.call('prepare_3d_model', modelArgs)).result.structuredContent
  f.lose()
  const args = { ...modelArgs, jobId: prepared.jobId, receipt: prepared.receipt, maxPoints: prepared.maximumPoints }
  const first = (await f.call('start_3d_model', args)).result.structuredContent
  assert.equal(first.job.state, 'pending')
  assert.equal(first.receipt, prepared.receipt)
  assert.equal(first.jobId, prepared.jobId)
  const replay = (await f.call('start_3d_model', args)).result.structuredContent
  assert.equal(replay.receipt, prepared.receipt)
  await f.call('get_generation_status', { jobId: prepared.jobId, receipt: prepared.receipt })
  assert.equal(f.posts(), 1)
  assert.equal(f.prepareCalls(), 1)
})

test('changed inputs, insufficient approved point ceiling and another account cannot submit a prepared receipt', async () => {
  const f = studioFixture(); await f.subscribe()
  const prepared = (await f.call('prepare_3d_model', modelArgs)).result.structuredContent
  const args = { ...modelArgs, jobId: prepared.jobId, receipt: prepared.receipt, maxPoints: prepared.maximumPoints }
  assert.equal((await f.call('start_3d_model', { ...args, prompt: 'Different paid job' })).result.isError, true)
  assert.equal((await f.call('start_3d_model', { ...args, maxPoints: 0 })).result.isError, true)
  assert.equal((await f.call('start_3d_model', args, token({ sub: '22222222-2222-4222-8222-222222222222' }))).result.isError, true)
  assert.equal(f.posts(), 0)
  assert.equal((await entitlementStatus(f.env, USER_ID)).availableCredits, 4500)
})

test('invalid JSON-RPC ids and unsupported protocol headers cannot reach tools', async () => {
  const request = message('tools/list', undefined, undefined, { 'MCP-Protocol-Version': 'invalid-version' })
  assert.equal((await mcpApi(request, env))!.status, 400)
  const badId = new Request('https://worldifact.test/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: {} }) })
  assert.equal((await (await mcpApi(badId, env))!.json() as { error: { code: number } }).error.code, -32600)
})
