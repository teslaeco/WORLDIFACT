/** Public terms only. Identity/payment/authorization commitments stay server-side. */
export const OWNER_RESERVE_ADJUSTMENT_APPROVAL = 'owner-reserve-adjustment-20261007-v1' as const
export const OWNER_RESERVE_ADJUSTMENT_REVISION = 'owner-reserve-adjustment-v1' as const
export type OwnerReserveAdjustmentResponse = {
  revision: typeof OWNER_RESERVE_ADJUSTMENT_REVISION
  status: 'preview' | 'applied' | 'already-applied'
  approvalId: typeof OWNER_RESERVE_ADJUSTMENT_APPROVAL
  amountCents: 112
  before: { reserveCents: 63; points: 1440; heldPoints: 0 }
  after: { reserveCents: 175; points: 1440; heldPoints: 0 }
  generationStarted: false
  appliedAt: number | null
}

function record(value: unknown, keys: string[]): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && Object.keys(value).every(key => keys.includes(key))
}
export function readOwnerReserveAdjustmentResponse(value: unknown): OwnerReserveAdjustmentResponse {
  if (!record(value, ['revision', 'status', 'approvalId', 'amountCents', 'before', 'after', 'generationStarted', 'appliedAt']) ||
      value.revision !== OWNER_RESERVE_ADJUSTMENT_REVISION || value.approvalId !== OWNER_RESERVE_ADJUSTMENT_APPROVAL ||
      !['preview', 'applied', 'already-applied'].includes(value.status as string) || value.amountCents !== 112 || value.generationStarted !== false ||
      !record(value.before, ['reserveCents', 'points', 'heldPoints']) || value.before.reserveCents !== 63 || value.before.points !== 1440 || value.before.heldPoints !== 0 ||
      !record(value.after, ['reserveCents', 'points', 'heldPoints']) || value.after.reserveCents !== 175 || value.after.points !== 1440 || value.after.heldPoints !== 0 ||
      (value.status === 'preview' ? value.appliedAt !== null : !Number.isSafeInteger(value.appliedAt) || Number(value.appliedAt) <= 0))
    throw new Error('The reserve adjustment returned an unrecognized response.')
  return value as OwnerReserveAdjustmentResponse
}
