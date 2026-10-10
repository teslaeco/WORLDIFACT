/** Explicitly negotiated held-points membership policy. Unknown versions fail closed. */
export const PAID_POINTS_POLICY = 'paid-membership-held-points-v1' as const
export const PAID_POINTS_POLICY_HEADER = 'X-WORLDIFACT-Paid-Points-Policy' as const
export const PAID_POINTS_FUNDING = 'paid-membership-held-points-v1' as const
export type PointSettlement = { version: 1; state: 'held' | 'pending-cost' | 'charged' | 'released'; heldPoints: number; chargedPoints: number } |
  { version: 1; state: 'waived'; heldPoints: 0; chargedPoints: 0; approvalId: 'failed-hold-waiver-20261009-v1' } |
  { version: 1; state: 'forfeited'; heldPoints: 0; chargedPoints: 0; forfeitedPoints: 250; approvalId: 'held-points-forfeit-20261010-v1' }
export function isPointSettlement(value: unknown, cost?: number): value is PointSettlement {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const forfeited = (value as { state?: unknown }).state === 'forfeited'
  const waived = (value as { state?: unknown }).state === 'waived'
  const fields = ['version', 'state', 'heldPoints', 'chargedPoints', ...(waived || forfeited ? ['approvalId'] : []), ...(forfeited ? ['forfeitedPoints'] : [])]
  if (Object.keys(value).length !== fields.length || Object.keys(value).some(key => !fields.includes(key))) return false
  const point = value as PointSettlement
  if (point.version !== 1 || !Number.isSafeInteger(point.heldPoints) || point.heldPoints < 0 ||
      !Number.isSafeInteger(point.chargedPoints) || point.chargedPoints < 0 || cost !== undefined && (!Number.isSafeInteger(cost) || cost <= 0)) return false
  if (point.state === 'held' || point.state === 'pending-cost') return point.heldPoints > 0 && point.chargedPoints === 0 && (cost === undefined || point.heldPoints === cost)
  if (point.state === 'charged') return point.heldPoints === 0 && point.chargedPoints > 0 && (cost === undefined || point.chargedPoints === cost)
  if (point.state === 'forfeited') return point.heldPoints === 0 && point.chargedPoints === 0 && point.forfeitedPoints === 250 && (cost === undefined || cost === 250) && point.approvalId === 'held-points-forfeit-20261010-v1'
  if (point.state === 'waived') return point.heldPoints === 0 && point.chargedPoints === 0 && point.approvalId === 'failed-hold-waiver-20261009-v1'
  return point.state === 'released' && point.heldPoints === 0 && point.chargedPoints === 0
}
export const POINT_COST_PENDING_DETAIL = 'Generation did not complete. The full point price remains held because provider cost is positive or unknown. Manual cost review is required; no final failure charge or refund has been made.'

export const POINT_COST_WAIVED_DETAIL = 'This model failed. Its customer point charge was waived as incident compensation. No points remain held or charged. WORLDIFACT absorbs the recorded provider cost; no provider refund or completed model is implied.'

/** Manual closures remain failed jobs and cannot be reopened by recovery. */
export function isManualPointClosure(point: PointSettlement | undefined): boolean {
  return point?.state === 'waived' || point?.state === 'forfeited'
}
export function manualPointClosureDetail(point: PointSettlement | undefined): string {
  return point?.state === 'forfeited' ? 'This model failed. The owner forfeited its 250 held points without a refund. No points remain held. Provider usage and request history are preserved; no completed model is implied.' : POINT_COST_WAIVED_DETAIL
}
