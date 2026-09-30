/** Reviewed Oracle capability contract; readiness is not a successful live model. */
export const DETAILED_MESH_PROFILE = 'reference-mesh-v1' as const
export const DETAILED_MESH_PHOTOS = 4
export const DETAILED_MESH_PROMPT_LIMIT = 4000
export const ASTRA_GUARD_EXPIRY = 1793145600 // 2026-10-28 UTC; re-review prices before extending.
export function detailedRuntimeSafe(value: Record<string, unknown>, now = Date.now()): boolean {
  return value.ready === true && value.codexReady === true && value.provider === 'openai' && value.model === 'gpt-6-astra'
    && Number.isSafeInteger(value.connectorVersion) && Number(value.connectorVersion) >= 33 && Number(value.connectorVersion) <= 10000
    && value.astraBudgetRevision === 'astra-usd175-v1' && value.astraBudgetMaxUsd === 1.75
    && value.astraBudgetPreflight === 'input-tokens' && value.astraBudgetExpiry === ASTRA_GUARD_EXPIRY
    && Number.isFinite(now) && now < ASTRA_GUARD_EXPIRY * 1000
    && value.astraOutputPolicy === 'astra-low-reconciled-v2' && value.astraReasoningEffort === 'low'
    && value.astraMaxOutputTokens === 16000 && value.astraUsageSettlement === 'authenticated-completed-only'
    && value.promptMaxLength === 5000
}
export function detailedStatusReady(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const s = value as Record<string, unknown>
  return s.ready === true && s.detailedMeshReady === true && s.detailedMeshProfile === DETAILED_MESH_PROFILE
    && s.detailedMeshMaxPhotos === DETAILED_MESH_PHOTOS && s.detailedMeshPromptLimit === DETAILED_MESH_PROMPT_LIMIT
}
