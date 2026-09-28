/** Reviewed public IDs and Standard prices, 2026-09-29. Never infer model rank from its name.
 * https://developers.openai.com/api/docs/pricing
 * https://developers.openai.com/api/docs/models/gpt-5.6-terra
 * Prices are USD / million tokens, not a promise of cost per finished asset.
 */
export const MODEL_CATALOG = Object.freeze({
  sol: Object.freeze({ model: 'gpt-6-sol', label: 'GPT-6 Sol', creditsPerGeneration: 50, maxProviderCents: 35, inputUsdPerMillion: 2, outputUsdPerMillion: 10, inputNanoUsd: 6000, outputNanoUsd: 17000, pipeline: 'blueprint' as const }),
  astra: Object.freeze({ model: 'gpt-6-astra', label: 'GPT-6 Astra', creditsPerGeneration: 250, maxProviderCents: 175, inputUsdPerMillion: 10, outputUsdPerMillion: 50, inputNanoUsd: 28000, outputNanoUsd: 83000, pipeline: 'oracle' as const }),
  luna: Object.freeze({ model: 'gpt-6-luna', label: 'GPT-6 Luna', creditsPerGeneration: 5, maxProviderCents: 3, inputUsdPerMillion: 0.1, outputUsdPerMillion: 0.5, inputNanoUsd: 300, outputNanoUsd: 900, pipeline: 'blueprint' as const }),
  terra: Object.freeze({ model: 'gpt-5.6-terra', label: 'GPT-5.6 Terra', creditsPerGeneration: 60, maxProviderCents: 42, inputUsdPerMillion: 2, outputUsdPerMillion: 12, inputNanoUsd: 6000, outputNanoUsd: 20000, pipeline: 'blueprint' as const }),
})
export type GenerationModel = keyof typeof MODEL_CATALOG
export type BlueprintModel = Exclude<GenerationModel, 'astra'>
export const MODEL_ORDER = ['luna', 'sol', 'terra', 'astra'] as const
export const GENERATION_COSTS = Object.freeze({ sol: 50, astra: 250, luna: 5, terra: 60 } as const)
export function isGenerationModel(value: unknown): value is GenerationModel {
  return typeof value === 'string' && Object.hasOwn(MODEL_CATALOG, value)
}
export function blueprintModel(value: unknown): BlueprintModel {
  if (value === undefined) return 'sol' // backward-compatible explicit default
  for (const key of ['sol', 'luna', 'terra'] as const) if (MODEL_CATALOG[key].model === value) return key
  throw new Error('Use a reviewed blueprint model. ASTRA uses the separate guarded Oracle workflow.')
}
export function reserveBlueprintMicroUsd(model: BlueprintModel, inputTokens: number, outputTokens = 4000) {
  if (!Number.isSafeInteger(inputTokens) || inputTokens < 0 || inputTokens > 65536 || !Number.isSafeInteger(outputTokens) || outputTokens < 1 || outputTokens > 4000)
    throw new Error('Unreviewed token allowance.')
  const rates = MODEL_CATALOG[model]
  // Integer nano-USD arithmetic; includes framing and rounds upwards. The rates
  // cover cache-write and regional uplifts, even at long-context list pricing.
  return Math.ceil(((inputTokens + 2048) * rates.inputNanoUsd + outputTokens * rates.outputNanoUsd) / 1000)
}
