import test from 'node:test'
import assert from 'node:assert/strict'
import { CHESS_AUTH_URL } from '../server/accounts.ts'
import { mcpApi, WORLDIFACT_MCP_TOOLS } from '../server/mcp.ts'
import type { StudioEnv } from '../server/studio.ts'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const USER = { id: USER_ID, email: 'owner@example.test', user_metadata: { name: 'WORLDIFACT Owner' } }
const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
function token(overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000)
  return `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: CHESS_AUTH_URL + '/auth/v1', aud: 'authenticated', exp: now + 3600, iat: now, sub: USER_ID, client_id: 'openai-test-client', scope: 'email profile', ...overrides })}.signature`
}
function message(method: string, params?: unknown, authorization?: string) {
  return new Request('https://worldifact.test/mcp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...(authorization ? { Authorization: 'Bearer ' + authorization } : {}),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, ...(params === undefined ? {} : { params }) }),
  })
}
const env = {} as StudioEnv

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
})

test('private tools emit the OpenAI OAuth linking challenge when no valid token is present', async () => {
  let calls = 0
  const fetcher = (async () => { calls++; throw new Error('No provider call expected') }) as typeof fetch
  const response = await mcpApi(message('tools/call', { name: 'get_profile', arguments: {} }), env, fetcher)
  const body = await response!.json() as { result: { isError: boolean; _meta: { 'mcp/www_authenticate': string[] } } }
  assert.equal(body.result.isError, true)
  assert.match(body.result._meta['mcp/www_authenticate'][0], /oauth-protected-resource/)
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
  ]) {
    const response = await mcpApi(message('tools/call', { name: 'get_profile', arguments: {} }, access), env, fetcher)
    const body = await response!.json() as { result: { isError: boolean } }
    assert.equal(body.result.isError, true)
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
  const response = await mcpApi(message('tools/call', { name: 'start_3d_model', arguments: { prompt: 'A precise solar rover wheel', purpose: 'object' } }, access), env, fetcher)
  const body = await response!.json() as { result: { isError: boolean; structuredContent: Record<string, unknown> } }
  assert.equal(body.result.isError, true)
  assert.match(String(body.result.structuredContent.error), /receipt service is not configured/i)
  assert.equal(calls, 1)
})
