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
    get: () => ({ fetch: async () => Response.json({ allowed: true, remaining: 0 }) }),
  },
  GENERATION_LIMITER: { limit: async () => ({ success: true }) },
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
  const blueprint = demoBlueprint('moon workshop')
  const assetSpec = assetSpecForBlueprint(blueprint)
  let sent: any
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
  const result = await response.json()
  validateGenerationResult(result)
  assert.equal(result.mode, 'LIVE')
  assert.equal(result.provenance, 'GENERATED')
  assert.equal(result.assetSpec.make.validationStatus, 'validation-required')
  assert.equal(sent.model, 'gpt-6-astra')
  assert.deepEqual(sent.text.format.schema.required, ['blueprint', 'assetSpec'])
})
