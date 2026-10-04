/** An owned-account read snapshot. It is neither admission approval nor an API invoice. */
export interface GenerationFundingSnapshot {
  version: 1
  readOnly: true
  currency: 'USD'
  customerPoints: { status: 'known' | 'invalid'; balance: number | null; held: number | null; available: number | null }
  providerBudget: {
    status: 'known' | 'uninitialized' | 'invalid'
    unreservedCents: number | null
    /** Informational legacy calculation only; this read does not initialize funding. */
    legacyDerivedFallbackCents: number | null
  }
  ordinaryAstraMinimumCents: { blueprint: 175; unpricedDetailed: 175 }
  jobs: {
    scanLimit: 256
    scanned: number
    partial: boolean
    scanStatus: 'complete' | 'partial' | 'unavailable' | 'invalid'
    states: { reserved: number; completed: number; failed: number; unknown: number }
    routes: { studio: number; blueprint: number; legacyBlueprint: number; unknown: number }
    /** Overlapping record counts. Pending evidence is not proof of unused funding. */
    evidence: {
      ordinaryTerminalStudioPending: number
      ordinaryCompletedBlueprintPending: number
      legacyReadyWithoutReservation: number
      legacyAllowanceRefusalCandidates: number
      supportGrantRecords: number
      markedReconciled: number
      unknown: number
    }
    /** Sums of recognized stored evidence in this scan only, never actual spend or refundable amounts.
     * Zero means no recognized evidence in that bucket; it does not establish zero account liability. */
    fundingEvidence: {
      unresolvedOrdinaryReservations: { records: number; cents: number }
      recordedPreDispatchReleases: { records: number; cents: number }
      recordedStudioReconciliations: { records: number; releasedCents: number; retainedLiabilityCents: number }
      unknownAmountRecords: number
    }
  }
  /** Presence only. Availability, validity and global support authority are not evaluated. */
  supportGrantClaims: { originalRecordPresent: boolean; supplementalRecordPresent: boolean }
}

/** Reject expanded/unrecognized responses before rendering any account data. */
export function readGenerationFundingSnapshot(value: unknown): GenerationFundingSnapshot {
  const invalid = () => { throw new Error('Generation funding returned an unrecognized snapshot.') }
  const object = (input: unknown, keys: string[]): Record<string, unknown> => {
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== keys.length || Object.keys(input).some(key => !keys.includes(key))) return invalid()
    return input as Record<string, unknown>
  }
  const integer = (input: unknown, minimum = Number.MIN_SAFE_INTEGER, maximum = Number.MAX_SAFE_INTEGER) =>
    typeof input === 'number' && Number.isSafeInteger(input) && input >= minimum && input <= maximum
  const nullableInteger = (input: unknown, minimum?: number) => input === null || integer(input, minimum)
  const root = object(value, ['version', 'readOnly', 'currency', 'customerPoints', 'providerBudget', 'ordinaryAstraMinimumCents', 'jobs', 'supportGrantClaims'])
  if (root.version !== 1 || root.readOnly !== true || root.currency !== 'USD') return invalid()
  const points = object(root.customerPoints, ['status', 'balance', 'held', 'available'])
  if (typeof points.status !== 'string' || !['known', 'invalid'].includes(points.status) || !nullableInteger(points.balance) || !nullableInteger(points.held, 0) || !nullableInteger(points.available) ||
      (points.status === 'known') !== (points.available !== null) || points.available !== null &&
      (points.balance === null || points.held === null || points.available !== Number(points.balance) - Number(points.held))) return invalid()
  const budget = object(root.providerBudget, ['status', 'unreservedCents', 'legacyDerivedFallbackCents'])
  if (typeof budget.status !== 'string' || !['known', 'uninitialized', 'invalid'].includes(budget.status) || !nullableInteger(budget.unreservedCents) || !nullableInteger(budget.legacyDerivedFallbackCents, 0) ||
      (budget.status === 'known') !== (budget.unreservedCents !== null) || budget.status !== 'uninitialized' && budget.legacyDerivedFallbackCents !== null) return invalid()
  const minimum = object(root.ordinaryAstraMinimumCents, ['blueprint', 'unpricedDetailed'])
  if (minimum.blueprint !== 175 || minimum.unpricedDetailed !== 175) return invalid()
  const jobs = object(root.jobs, ['scanLimit', 'scanned', 'partial', 'scanStatus', 'states', 'routes', 'evidence', 'fundingEvidence'])
  if (jobs.scanLimit !== 256 || !integer(jobs.scanned, 0, 256) || typeof jobs.partial !== 'boolean' || typeof jobs.scanStatus !== 'string' || !['complete', 'partial', 'unavailable', 'invalid'].includes(jobs.scanStatus) ||
      (jobs.scanStatus === 'complete') !== !jobs.partial || jobs.scanStatus === 'complete' && jobs.scanned === 256) return invalid()
  const counts = (input: unknown, keys: string[], sum = false) => {
    const result = object(input, keys)
    if (Object.values(result).some(count => !integer(count, 0, Number(jobs.scanned))) || sum && Object.values(result).reduce<number>((total, count) => total + Number(count), 0) !== jobs.scanned) return invalid()
    return result
  }
  counts(jobs.states, ['reserved', 'completed', 'failed', 'unknown'], true)
  counts(jobs.routes, ['studio', 'blueprint', 'legacyBlueprint', 'unknown'], true)
  counts(jobs.evidence, ['ordinaryTerminalStudioPending', 'ordinaryCompletedBlueprintPending', 'legacyReadyWithoutReservation', 'legacyAllowanceRefusalCandidates', 'supportGrantRecords', 'markedReconciled', 'unknown'])
  const funding = object(jobs.fundingEvidence, ['unresolvedOrdinaryReservations', 'recordedPreDispatchReleases', 'recordedStudioReconciliations', 'unknownAmountRecords'])
  if (!integer(funding.unknownAmountRecords, 0, Number(jobs.scanned))) return invalid()
  for (const field of ['unresolvedOrdinaryReservations', 'recordedPreDispatchReleases', 'recordedStudioReconciliations']) {
    const amountFields = field === 'recordedStudioReconciliations' ? ['releasedCents', 'retainedLiabilityCents'] : ['cents']
    const bucket = object(funding[field], ['records', ...amountFields])
    if (!integer(bucket.records, 0, Number(jobs.scanned)) || amountFields.some(key => !integer(bucket[key], 0, Number(bucket.records) * 400)) ||
        amountFields.reduce((total, key) => total + Number(bucket[key]), 0) > Number(bucket.records) * 400) return invalid()
  }
  const support = object(root.supportGrantClaims, ['originalRecordPresent', 'supplementalRecordPresent'])
  if (typeof support.originalRecordPresent !== 'boolean' || typeof support.supplementalRecordPresent !== 'boolean') return invalid()
  return value as GenerationFundingSnapshot
}
