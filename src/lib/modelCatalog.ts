/** Reviewed public catalogue, 2026-09-29. Model price is not whole-job cost.
 * Sources: https://developers.openai.com/api/docs/models/gpt-6-{astra,sol,luna}
 * No Terra API identifier has been verified. Never synthesize one.
 */
export type GenerationModel = 'luna' | 'sol' | 'astra'
export type DraftModel = Exclude<GenerationModel, 'astra'>
export const MODEL_CATALOG = Object.freeze({
  luna: Object.freeze({ model: 'gpt-6-luna', label: 'GPT-6 Luna', creditsPerGeneration: 15, maxProviderCents: 10,
    inputUsdPerMillion: 0.1, outputUsdPerMillion: 0.5, path: 'blueprint', description: 'Economy procedural draft with shared material quality.' }),
  sol: Object.freeze({ model: 'gpt-6-sol', label: 'GPT-6 Sol', creditsPerGeneration: 50, maxProviderCents: 35,
    inputUsdPerMillion: 2, outputUsdPerMillion: 10, path: 'blueprint', description: 'Balanced procedural scene and asset specifications.' }),
  astra: Object.freeze({ model: 'gpt-6-astra', label: 'GPT-6 Astra', creditsPerGeneration: 250, maxProviderCents: 175,
    inputUsdPerMillion: 10, outputUsdPerMillion: 50, path: 'oracle', description: 'Detailed Oracle/Blender workflow; paid activation requires a passing live test.' }),
} as const)
export function draftModel(value: unknown): DraftModel {
  if (value === undefined || value === 'sol') return 'sol'
  if (value === 'luna') return 'luna'
  throw new Error('Choose Luna or Sol for procedural generation. Astra uses the separate detailed Studio route.')
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
