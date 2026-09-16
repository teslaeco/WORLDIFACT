import test from 'node:test'
import assert from 'node:assert/strict'
import { oracleJobApi } from '../server/oracle-jobs.ts'

const endpoint = 'https://sample-connection.trycloudflare.com'
const oracleToken = 't'.repeat(48)
const id = '123e4567-e89b-42d3-a456-426614174001'
let budgetCalls = 0
const env = {
  ORACLE_ENDPOINT: endpoint,
  ORACLE_API_TOKEN: oracleToken,
  ENABLE_ORACLE_JOBS: 'true',
  PUBLIC_PILOT: 'true',
  GENERATION_REQUEST_LIMIT: '5',
  GENERATION_EXPIRES_AT: new Date(Date.now() + 60_000).toISOString(),
  GENERATION_BUDGET: {
    idFromName: (name: string) => name,
    get: () => ({ fetch: async () => { budgetCalls++; return Response.json({ allowed: true, remaining: 0 }) } }),
  },
  GENERATION_LIMITER: { limit: async () => ({ success: true }) },
}
const health = { ready: true, provider: 'openai', model: 'gpt-6-astra', connectorVersion: 33, characterStandard: 20 }

test('public MCP2 Shop pilot exposes reviewed status without secrets', async () => {
  const response = await oracleJobApi(new Request('https://worldifact.test/api/oracle/jobs/status'), env, (() => { throw new Error('No network expected') }) as typeof fetch)
  assert.equal(response.status, 200)
  const body = await response.json() as Record<string, unknown>
  assert.equal(body.mode, 'PUBLIC_PILOT')
  assert.equal(body.prompt, 'SUPPORTED')
  assert.equal(body.image, 'BLOCKED_UNVERIFIED')
  assert.equal(body.artifactRead, 'PUBLIC_PILOT')
  assert.equal(body.budget, 'SHARED_HARD_CAP')
  const text = JSON.stringify(body)
  assert.ok(!text.includes(endpoint)); assert.ok(!text.includes(oracleToken)); assert.ok(!text.includes('Bearer'))
})

test('public MCP2 Shop pilot submits same-origin prompt without owner code and reserves exactly one budget attempt', async () => {
  budgetCalls = 0
  const calls: string[] = []
  const fetcher = (async (input) => {
    calls.push(String(input))
    if (calls.length === 1) return Response.json(health)
    return Response.json({ id, state: 'queued' }, { status: 202 })
  }) as typeof fetch
  const request = new Request('https://worldifact.test/api/oracle/jobs', {
    method: 'POST',
    headers: { Origin: 'https://worldifact.test', 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.11' },
    body: JSON.stringify({ worldId: 'enchanted-ai-shop', id, prompt: 'Create one small stylized tree figurine with a stable base.' }),
  })
  const response = await oracleJobApi(request, env, fetcher)
  assert.equal(response.status, 202)
  assert.equal(budgetCalls, 1)
  assert.deepEqual(calls, [endpoint + '/v1/health', endpoint + '/v1/jobs'])
})

test('public MCP2 Shop pilot still rejects cross-origin write before budget or Oracle network', async () => {
  budgetCalls = 0
  let calls = 0
  const request = new Request('https://worldifact.test/api/oracle/jobs', {
    method: 'POST',
    headers: { Origin: 'https://evil.test', 'Content-Type': 'application/json' },
    body: JSON.stringify({ worldId: 'enchanted-ai-shop', id, prompt: 'Create a figurine.' }),
  })
  const response = await oracleJobApi(request, env, (async () => { calls++; throw new Error('Unexpected network') }) as typeof fetch)
  assert.equal(response.status, 403)
  assert.equal(budgetCalls, 0)
  assert.equal(calls, 0)
})

test('public MCP2 Shop pilot refuses image payloads', async () => {
  const request = new Request('https://worldifact.test/api/oracle/jobs', {
    method: 'POST',
    headers: { Origin: 'https://worldifact.test', 'Content-Type': 'application/json' },
    body: JSON.stringify({ worldId: 'enchanted-ai-shop', id, prompt: 'Create a figurine.', image: 'data:image/png;base64,AAAA' }),
  })
  const response = await oracleJobApi(request, env, (() => { throw new Error('No network expected') }) as typeof fetch)
  assert.equal(response.status, 400)
})
