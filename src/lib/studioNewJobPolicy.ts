/** New request policy only. Persisted job prices and provider terms are immutable. */
export type StudioNewJobPolicy = 'legacy-usd175-v1' | 'tiered-v1'
export const HISTORICAL_STUDIO_POLICY = 'legacy-usd175-v1' as const
export function studioNewJobPolicy(value: unknown): StudioNewJobPolicy | null {
  if (value === 'tiered-v1') return 'tiered-v1'
  return value === undefined || value === HISTORICAL_STUDIO_POLICY ? HISTORICAL_STUDIO_POLICY : null
}
