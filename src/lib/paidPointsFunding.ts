/** Explicitly negotiated held-points membership policy. Unknown versions fail closed. */
export const PAID_POINTS_POLICY = 'paid-membership-held-points-v1' as const
export const PAID_POINTS_POLICY_HEADER = 'X-WORLDIFACT-Paid-Points-Policy' as const
export const PAID_POINTS_FUNDING = 'paid-membership-held-points-v1' as const
export type PointSettlement = { version: 1; state: 'held' | 'pending-cost' | 'charged' | 'released'; heldPoints: number; chargedPoints: number }
export function isPointSettlement(value: unknown, cost?: number): value is PointSettlement {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 4 ||
      Object.keys(value).some(key => !['version', 'state', 'heldPoints', 'chargedPoints'].includes(key))) return false
  const point = value as PointSettlement
  if (point.version !== 1 || !Number.isSafeInteger(point.heldPoints) || point.heldPoints < 0 ||
      !Number.isSafeInteger(point.chargedPoints) || point.chargedPoints < 0 || cost !== undefined && (!Number.isSafeInteger(cost) || cost <= 0)) return false
  if (point.state === 'held' || point.state === 'pending-cost') return point.heldPoints > 0 && point.chargedPoints === 0 && (cost === undefined || point.heldPoints === cost)
  if (point.state === 'charged') return point.heldPoints === 0 && point.chargedPoints > 0 && (cost === undefined || point.chargedPoints === cost)
  return point.state === 'released' && point.heldPoints === 0 && point.chargedPoints === 0
}
export const POINT_COST_PENDING_DETAIL = 'Generation did not complete. The full point price remains held because provider cost is positive or unknown. Manual cost review is required; no final failure charge or refund has been made.'
