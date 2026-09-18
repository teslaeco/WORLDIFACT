import test from 'node:test'
import assert from 'node:assert/strict'
import { assetSpecForBlueprint, astraGenerationSchema, demoBlueprint, validateAssetSpec, validateGenerationResult } from '../src/lib/blueprint.ts'
import { handle } from '../server/worker.ts'

const ACCESS = 'p0-preview-access-code-with-more-than-32-characters'
const liveEnv = {
  OPENAI_API_KEY: 'test-key-not-real',
  OPENAI_MODEL: 'gpt-6-astra',
  ENABLE_PAID_GENERATION: 'true',
  GENERATION_ACCESS_TOKEN: ACCESS,
  GENERATION_REQUEST_LIMIT: '1',
  GENERATION_EXPIRES_AT: new Date(Date.now() + 60_000).toISOString(),
  GENERATION_BUDGET: {
    idFromName: (name: string) => name,
    get: () => ({ fetch: async (request: Request) => new URL(request.url).pathname === '/status'
      ? Response.json({ used: 0, limit: 1, remaining: 1, enabled: true, expiresAt: new Date(Date.now() + 60_000).toISOString() })
      : Response.json({ allowed: true, remaining: 0 }) }),
  },
  GENERATION_LIMITER: { limit: async () => ({ success: true }) },
}
const combinedProvider = (blueprint = demoBlueprint('moon workshop')) => {
  const assetSpec = assetSpecForBlueprint(blueprint)
  return (async (_url: unknown, _init: RequestInit | undefined) => new Response(JSON.stringify({
    status: 'completed', model: 'gpt-6-astra', id: 'resp_p0_stub',
    usage: { input_tokens: 120, output_tokens: 80, total_tokens: 200 },
    output: [{ content: [{ type: 'output_text', text: JSON.stringify({ blueprint, assetSpec }) }] }],
  }))) as typeof fetch
}

test('AssetSpec keeps GAME separate from validation-required MAKE', () => {
  const spec = assetSpecForBlueprint(demoBlueprint('red rover'))
  assert.equal(spec.game.geometry, 'procedural-spec')
  assert.equal(spec.make.validationStatus, 'validation-required')
  assert.ok(spec.make.constraints.length >= 1)
  assert.deepEqual(validateAssetSpec(spec), spec)
  assert.throws(() => validateAssetSpec({ ...spec, make: { ...spec.make, validationStatus: 'approved' } }))
})

test('strict Astra schema requires both WorldBlueprint and AssetSpec', () => {
  assert.deepEqual(astraGenerationSchema.required, ['blueprint', 'assetSpec'])
  assert.equal(astraGenerationSchema.additionalProperties, false)
})

test('simulated LIVE Astra result returns validated blueprint and AssetSpec', async () => {
  let sent: any
  const blueprint = demoBlueprint('moon workshop')
  const assetSpec = assetSpecForBlueprint(blueprint)
  const provider = (async (_url: unknown, init: RequestInit | undefined) => {
    sent = JSON.parse(String(init?.body))
    return new Response(JSON.stringify({
      status: 'completed', model: 'gpt-6-astra', id: 'resp_p0_stub',
      usage: { input_tokens: 120, output_tokens: 80, total_tokens: 200 },
      output: [{ content: [{ type: 'output_text', text: JSON.stringify({ blueprint, assetSpec }) }] }],
    }))
  }) as typeof fetch
  const response = await handle(new Request('https://worldifact.test/api/blueprint', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-WORLDIFACT-Access': ACCESS },
    body: JSON.stringify({ prompt: 'moon workshop', mode: 'live' }),
  }), liveEnv, provider)
  assert.equal(response.status, 200)
  const result = validateGenerationResult(await response.json())
  assert.equal(result.mode, 'LIVE')
  assert.equal(result.provenance, 'GENERATED')
  assert.equal(result.assetSpec?.make.validationStatus, 'validation-required')
  assert.equal(sent.model, 'gpt-6-astra')
  assert.deepEqual(sent.text.format.schema.required, ['blueprint', 'assetSpec'])
})

test('public pilot removes login/access-code friction but keeps limiter and global budget gates', async () => {
  let limiterCalls = 0, budgetCalls = 0
  const env = {
    ...liveEnv,
    PUBLIC_PILOT: 'true',
    GENERATION_ACCESS_TOKEN: undefined,
    GENERATION_LIMITER: { limit: async () => { limiterCalls++; return { success: true } } },
    GENERATION_BUDGET: {
      idFromName: (name: string) => name,
      get: () => ({ fetch: async (request: Request) => {
        budgetCalls++
        return new URL(request.url).pathname === '/status'
          ? Response.json({ used: 0, limit: 1, remaining: 1, enabled: true, expiresAt: new Date(Date.now() + 60_000).toISOString() })
          : Response.json({ allowed: true, remaining: 0 })
      } }),
    },
  }
  const health = await (await handle(new Request('https://worldifact.test/api/health'), env)).json() as { generationReady: boolean; accessRequired: boolean; publicPilot: boolean }
  assert.equal(health.generationReady, true)
  assert.equal(health.accessRequired, false)
  assert.equal(health.publicPilot, true)
  const response = await handle(new Request('https://worldifact.test/api/blueprint', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: 'public pilot rover', mode: 'live' }),
  }), env, combinedProvider())
  assert.equal(response.status, 200)
  assert.equal(limiterCalls, 1)
  assert.equal(budgetCalls, 2)
  assert.equal(validateGenerationResult(await response.json()).mode, 'LIVE')
})
