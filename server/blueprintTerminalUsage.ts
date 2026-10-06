import type { GenerationModel } from './generationEconomics.ts'

// Immutable writer economics. Catalogue changes must not reinterpret saved evidence.
export const BLUEPRINT_RECONCILIATION_TERMS = Object.freeze({
  luna: { model: 'gpt-6-luna', points: 15, capCents: 10, inputRate: 1, outputRate: 1 },
  sol: { model: 'gpt-6-sol', points: 50, capCents: 35, inputRate: 6, outputRate: 17 },
  astra: { model: 'gpt-6-astra', points: 250, capCents: 175, inputRate: 14, outputRate: 55 },
})
// Prospective Sol 6.1 writer; keep historical gpt-6-sol terms unchanged.
const SOL61_RECONCILIATION_TERMS = Object.freeze({ model: 'gpt-6.1-sol', points: 50, capCents: 35, inputRate: 6, outputRate: 17 })
export type BlueprintTerminalUsage = {
  revision: 'blueprint-terminal-usage-v1'
  accountId: string
  requestId: string
  fingerprint: string
  model: string
  dispatchDeadline: number
  dispatchedAt: number
  receivedAt: number
  maxOutputTokens: 4000
  reservedCents: number
  providerResponseId: string
  providerStatus: 'completed' | 'incomplete'
  incompleteReason: null | 'max_output_tokens'
  inputTokens: number
  outputTokens: number
  totalTokens: number
}
const fields = ['revision', 'accountId', 'requestId', 'fingerprint', 'model', 'dispatchDeadline', 'dispatchedAt', 'receivedAt',
  'maxOutputTokens', 'reservedCents', 'providerResponseId', 'providerStatus', 'incompleteReason', 'inputTokens', 'outputTokens', 'totalTokens']
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/
export function validateBlueprintTerminalUsage(value: unknown): value is BlueprintTerminalUsage {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== fields.length || Object.keys(value).some(key => !fields.includes(key))) return false
  const proof = value as BlueprintTerminalUsage
  const terms = proof.model === SOL61_RECONCILIATION_TERMS.model ? SOL61_RECONCILIATION_TERMS
    : Object.values(BLUEPRINT_RECONCILIATION_TERMS).find(entry => entry.model === proof.model)
  return proof.revision === 'blueprint-terminal-usage-v1' && typeof proof.accountId === 'string' && uuid.test(proof.accountId) &&
    typeof proof.requestId === 'string' && uuid.test(proof.requestId) && typeof proof.fingerprint === 'string' && /^[a-f0-9]{64}$/.test(proof.fingerprint) &&
    !!terms && proof.reservedCents === terms.capCents && proof.maxOutputTokens === 4000 &&
    Number.isSafeInteger(proof.dispatchDeadline) && Number.isSafeInteger(proof.dispatchedAt) && proof.dispatchedAt > 0 && proof.dispatchedAt < proof.dispatchDeadline &&
    Number.isSafeInteger(proof.receivedAt) && proof.receivedAt >= proof.dispatchedAt &&
    typeof proof.providerResponseId === 'string' && /^resp_[a-zA-Z0-9_-]{1,190}$/.test(proof.providerResponseId) &&
    (proof.providerStatus === 'completed' && proof.incompleteReason === null || proof.providerStatus === 'incomplete' && proof.incompleteReason === 'max_output_tokens') &&
    Number.isSafeInteger(proof.inputTokens) && proof.inputTokens >= 0 && proof.inputTokens <= 32768 &&
    Number.isSafeInteger(proof.outputTokens) && proof.outputTokens >= 0 && proof.outputTokens <= 4000 &&
    Number.isSafeInteger(proof.totalTokens) && proof.totalTokens === proof.inputTokens + proof.outputTokens
}

/** Call only on the authenticated, successful server /responses fetch, before parsing generated content. */
export function captureBlueprintTerminalUsage(body: Record<string, unknown>, context: Pick<BlueprintTerminalUsage,
  'accountId' | 'requestId' | 'fingerprint' | 'model' | 'dispatchDeadline' | 'dispatchedAt' | 'receivedAt' | 'reservedCents'>): BlueprintTerminalUsage | undefined {
  if (body.model !== context.model || body.error != null || body.service_tier != null && body.service_tier !== 'default' ||
      body.status !== 'completed' && body.status !== 'incomplete' ||
      body.status === 'completed' && body.incomplete_details != null) return undefined
  const usage = body.usage as Record<string, unknown> | undefined
  const incomplete = body.incomplete_details as Record<string, unknown> | undefined
  if (!usage || typeof usage !== 'object' || Array.isArray(usage)) return undefined
  const evidence = { ...context, revision: 'blueprint-terminal-usage-v1', maxOutputTokens: 4000,
    providerResponseId: body.id, providerStatus: body.status, incompleteReason: body.status === 'incomplete' ? incomplete?.reason : null,
    inputTokens: usage.input_tokens, outputTokens: usage.output_tokens, totalTokens: usage.total_tokens }
  return validateBlueprintTerminalUsage(evidence) ? evidence : undefined
}

/** A conservative liability bound, never an invoice or an inference of zero-cost output. */
export function blueprintRetainedCents(model: GenerationModel, inputTokens: number, outputTokens = 4000): number {
  if (!Object.hasOwn(BLUEPRINT_RECONCILIATION_TERMS, model) || !Number.isSafeInteger(inputTokens) || inputTokens < 0 || inputTokens > 32768 ||
      !Number.isSafeInteger(outputTokens) || outputTokens < 0 || outputTokens > 4000) throw new Error('Invalid Blueprint liability token bounds')
  const terms = BLUEPRINT_RECONCILIATION_TERMS[model]
  return Math.ceil(((inputTokens + 2048) * terms.inputRate + outputTokens * terms.outputRate) / 10_000)
}
