/** Reviewed public catalogue, 2026-10-05. Model price is not whole-job cost.
 * Sources: https://developers.openai.com/api/docs/models/gpt-6.1-sol
 * https://developers.openai.com/api/docs/models/gpt-6-astra
 * https://developers.openai.com/api/docs/models/gpt-6-luna
 * No Terra API identifier has been verified. Never synthesize one.
 */
export type GenerationModel = 'luna' | 'sol' | 'astra'
export type DraftModel = Exclude<GenerationModel, 'astra'>
export type BlueprintModel = GenerationModel
export const MODEL_CATALOG = Object.freeze({
  luna: Object.freeze({ model: 'gpt-6-luna', label: 'GPT-6 Luna', creditsPerGeneration: 15, maxProviderCents: 10,
    inputUsdPerMillion: 0.1, outputUsdPerMillion: 0.5, path: 'blueprint', description: 'Economy procedural draft with shared material quality.' }),
  sol: Object.freeze({ model: 'gpt-6.1-sol', label: 'GPT-6.1 Sol', creditsPerGeneration: 50, maxProviderCents: 35,
    inputUsdPerMillion: 2, outputUsdPerMillion: 10, path: 'blueprint', description: 'Balanced procedural scene and asset specifications.' }),
  astra: Object.freeze({ model: 'gpt-6-astra', label: 'GPT-6 Astra', creditsPerGeneration: 250, maxProviderCents: 175,
    inputUsdPerMillion: 10, outputUsdPerMillion: 50, path: 'blueprint', description: 'Premium single-call blueprint/spec generation with procedural GAME GLB. Detailed Oracle mesh generation remains a separate beta workflow.' }),
} as const)
export function draftModel(value: unknown): DraftModel {
  if (value === undefined || value === 'sol') return 'sol'
  if (value === 'luna') return 'luna'
  throw new Error('Choose Luna or Sol for a cheap procedural draft.')
}
export function blueprintModel(value: unknown): BlueprintModel {
  if (value === undefined || value === 'sol') return 'sol'
  if (value === 'luna' || value === 'astra') return value
  throw new Error('Choose Luna, Sol or Astra.')
}
export function draftReservationMicroUsd(model: DraftModel, countedInput: number, outputLimit = 4000) {
  if (!Number.isSafeInteger(countedInput) || countedInput < 0 || !Number.isSafeInteger(outputLimit) || outputLimit < 1 || outputLimit > 4000)
    throw new Error('Invalid cost preflight.')
  // Upper long-context/cache-write/regional rates, rounded UP. Standard only;
  // no paid tools. Add framing headroom before the ceiling check.
  const rates = model === 'luna' ? { input: 1, output: 1 } : { input: 6, output: 17 }
  const cost = (countedInput + 2048) * rates.input + outputLimit * rates.output
  if (!Number.isSafeInteger(cost)) throw new Error('Cost preflight overflow.')
  return cost
}

export function blueprintReservationMicroUsd(model: BlueprintModel, countedInput: number, outputLimit = 4000) {
  if (!Number.isSafeInteger(countedInput) || countedInput < 0 || !Number.isSafeInteger(outputLimit) || outputLimit < 1 || outputLimit > 4000)
    throw new Error('Invalid cost preflight.')
  // Conservative upper rates in micro-USD/token. Astra uses the reviewed
  // $13.75/M short-input + $55/M output envelope rounded up to 14/55.
  const rates = model === 'luna' ? { input: 1, output: 1 } : model === 'sol' ? { input: 6, output: 17 } : { input: 14, output: 55 }
  const cost = (countedInput + 2048) * rates.input + outputLimit * rates.output
  if (!Number.isSafeInteger(cost)) throw new Error('Cost preflight overflow.')
  return cost
}
