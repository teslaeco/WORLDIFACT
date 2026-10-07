/** Only explicitly supplied canonical references may be echoed by the stored-evidence read. */
export const isStoredInvoiceReference = (value: unknown): value is string => typeof value === 'string' && /^in_[A-Za-z0-9]{1,180}$/.test(value)

/** null is the unchanged default read; malformed or expanded queries are rejected. */
export function readGenerationFundingEvidenceQuery(params: URLSearchParams): { invoices: string[] } | null {
  if (params.size === 0) return null
  const invoices = params.getAll('invoice')
  if (params.size > 3 || [...params.keys()].some(key => key !== 'evidence' && key !== 'invoice') ||
      params.getAll('evidence').length !== 1 || params.get('evidence') !== 'stored-v1' ||
      invoices.length > 2 || new Set(invoices).size !== invoices.length || !invoices.every(isStoredInvoiceReference))
    throw new Error('Invalid stored evidence query.')
  return { invoices }
}

export interface StoredGenerationFundingEvidence {
  version: 1
  source: 'stored-credit-records'
  stripeCustomerLinked: boolean
  stripeCustomerStatus: 'known' | 'invalid' | 'unavailable'
  invoiceGrants: {
    scanLimit: 64
    scanned: number
    partial: boolean
    scanStatus: 'complete' | 'partial' | 'unavailable' | 'invalid'
    states: { present: number; revoked: number; unverifiable: number }
    /** Stored point quantities, including tombstones; not proof of a payment or current balance. */
    creditedPoints: number
    revokedPoints: number
  }
  requestedInvoices: {
    invoiceReference: string
    state: 'present' | 'missing' | 'revoked' | 'unverifiable'
    reason: null | 'invalid-record' | 'unavailable'
    creditedPoints: number | null
    revokedPoints: number | null
    subscriptionLinked: boolean
  }[]
  unknownAmountProvenance: {
    records: number
    classifiedRecords: number
    unclassifiedRecords: number
    /** Only recognized stored metadata; no inferred model, provider spend or refundability. */
    groups: {
      route: 'studio' | 'blueprint' | 'legacyBlueprint'
      model: 'luna' | 'sol' | 'astra' | 'unknown'
      state: 'reserved' | 'completed' | 'failed'
      records: number
      recordedPointCosts: number
      earliestAt: number
      latestAt: number
    }[]
  }
}

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
  /** Conservative stored liability for points-funded jobs in this bounded scan.
   * Not actual spend, a customer reserve, or an amount available to refund. */
  paidMembershipLiability?: { version: 1; jobs: number; unresolvedJobs: number; maximumLiabilityCents: number }
  pendingCostReviews?: { version: 1; items: { id: string; channel: 'studio' | 'blueprint'; model: 'luna' | 'sol' | 'astra'; at: number; heldPoints: number; state: 'held' | 'pending-cost' }[]; nextCursor: string | null; hasMore: boolean; scanStatus: 'complete' | 'partial' | 'unavailable' }
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
    /** Read-only preview for existing v1 completed Blueprint evidence; never an applied credit. */
    blueprintOutputAdjustment?: { scanLimit: 32; checked: number; candidates: number; potentialCents: number; unavailable: number; partial: boolean }
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
  /** Present only when explicitly requested with evidence=stored-v1. */
  storedEvidence?: StoredGenerationFundingEvidence
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
  const rootKeys = ['version', 'readOnly', 'currency', 'customerPoints', 'providerBudget', 'ordinaryAstraMinimumCents', 'jobs', 'supportGrantClaims']
  if (value && typeof value === 'object' && Object.hasOwn(value, 'storedEvidence')) rootKeys.push('storedEvidence')
  if (value && typeof value === 'object' && Object.hasOwn(value, 'paidMembershipLiability')) rootKeys.push('paidMembershipLiability')
  if (value && typeof value === 'object' && Object.hasOwn(value, 'pendingCostReviews')) rootKeys.push('pendingCostReviews')
  const root = object(value, rootKeys)
  if (root.version !== 1 || root.readOnly !== true || root.currency !== 'USD') return invalid()
  if (Object.hasOwn(root, 'pendingCostReviews')) {
    const pending = object(root.pendingCostReviews, ['version', 'items', 'nextCursor', 'hasMore', 'scanStatus'])
    const uuid = (input: unknown): input is string => typeof input === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(input)
    if (pending.version !== 1 || !Array.isArray(pending.items) || pending.items.length > 8 || typeof pending.hasMore !== 'boolean' ||
        typeof pending.scanStatus !== 'string' || !['complete', 'partial', 'unavailable'].includes(pending.scanStatus) ||
        (pending.hasMore ? !uuid(pending.nextCursor) || pending.scanStatus !== 'partial' : pending.nextCursor !== null || pending.scanStatus === 'partial') ||
        pending.scanStatus === 'unavailable' && pending.items.length !== 0) return invalid()
    let prior = ''
    for (const raw of pending.items) {
      const entry = object(raw, ['id', 'channel', 'model', 'at', 'heldPoints', 'state'])
      if (!uuid(entry.id) || entry.id <= prior || typeof entry.channel !== 'string' || !['studio', 'blueprint'].includes(entry.channel) || typeof entry.model !== 'string' || !['luna', 'sol', 'astra'].includes(entry.model) ||
          !['held', 'pending-cost'].some(state => entry.state === state) || !integer(entry.at, 1, 8_640_000_000_000_000) || !integer(entry.heldPoints, 1, 500) ||
          (entry.model === 'astra' ? ![250, ...(entry.channel === 'studio' ? [500] : [])].includes(Number(entry.heldPoints)) : entry.heldPoints !== (entry.model === 'sol' ? 50 : 15))) return invalid()
      prior = entry.id
    }
    if (pending.hasMore && typeof pending.nextCursor === 'string' && pending.nextCursor < prior) return invalid()
  }
  const points = object(root.customerPoints, ['status', 'balance', 'held', 'available'])
  if (typeof points.status !== 'string' || !['known', 'invalid'].includes(points.status) || !nullableInteger(points.balance) || !nullableInteger(points.held, 0) || !nullableInteger(points.available) ||
      (points.status === 'known') !== (points.available !== null) || points.available !== null &&
      (points.balance === null || points.held === null || points.available !== Number(points.balance) - Number(points.held))) return invalid()
  const budget = object(root.providerBudget, ['status', 'unreservedCents', 'legacyDerivedFallbackCents'])
  if (typeof budget.status !== 'string' || !['known', 'uninitialized', 'invalid'].includes(budget.status) || !nullableInteger(budget.unreservedCents) || !nullableInteger(budget.legacyDerivedFallbackCents, 0) ||
      (budget.status === 'known') !== (budget.unreservedCents !== null) || budget.status !== 'uninitialized' && budget.legacyDerivedFallbackCents !== null) return invalid()
  const minimum = object(root.ordinaryAstraMinimumCents, ['blueprint', 'unpricedDetailed'])
  if (minimum.blueprint !== 175 || minimum.unpricedDetailed !== 175) return invalid()
  const jobsKeys = ['scanLimit', 'scanned', 'partial', 'scanStatus', 'states', 'routes', 'evidence', 'fundingEvidence']
  if (root.jobs && typeof root.jobs === 'object' && Object.hasOwn(root.jobs, 'blueprintOutputAdjustment')) jobsKeys.push('blueprintOutputAdjustment')
  const jobs = object(root.jobs, jobsKeys)
  if (jobs.scanLimit !== 256 || !integer(jobs.scanned, 0, 256) || typeof jobs.partial !== 'boolean' || typeof jobs.scanStatus !== 'string' || !['complete', 'partial', 'unavailable', 'invalid'].includes(jobs.scanStatus) ||
      (jobs.scanStatus === 'complete') !== !jobs.partial || jobs.scanStatus === 'complete' && jobs.scanned === 256) return invalid()
  if (Object.hasOwn(root, 'paidMembershipLiability')) {
    const liability = object(root.paidMembershipLiability, ['version', 'jobs', 'unresolvedJobs', 'maximumLiabilityCents'])
    if (liability.version !== 1 || !integer(liability.jobs, 0, Number(jobs.scanned)) ||
        !integer(liability.unresolvedJobs, 0, Number(liability.jobs)) ||
        !integer(liability.maximumLiabilityCents, 0, Number(liability.jobs) * 400)) return invalid()
  }
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
  if (Object.hasOwn(jobs, 'blueprintOutputAdjustment')) {
    const review = object(jobs.blueprintOutputAdjustment, ['scanLimit', 'checked', 'candidates', 'potentialCents', 'unavailable', 'partial'])
    if (review.scanLimit !== 32 || !integer(review.checked, 0, Math.min(32, Number(jobs.scanned))) ||
        !integer(review.unavailable, 0, Number(review.checked)) || !integer(review.candidates, 0, Number(review.checked) - Number(review.unavailable)) ||
        !integer(review.potentialCents, 0, Number(review.candidates) * 175) ||
        Number(review.potentialCents) < Number(review.candidates) || typeof review.partial !== 'boolean' || jobs.partial === true && review.partial !== true) return invalid()
  }
  const support = object(root.supportGrantClaims, ['originalRecordPresent', 'supplementalRecordPresent'])
  if (typeof support.originalRecordPresent !== 'boolean' || typeof support.supplementalRecordPresent !== 'boolean') return invalid()
  if (Object.hasOwn(root, 'storedEvidence')) {
    const stored = object(root.storedEvidence, ['version', 'source', 'stripeCustomerLinked', 'stripeCustomerStatus', 'invoiceGrants', 'requestedInvoices', 'unknownAmountProvenance'])
    if (stored.version !== 1 || stored.source !== 'stored-credit-records' || typeof stored.stripeCustomerLinked !== 'boolean' ||
        typeof stored.stripeCustomerStatus !== 'string' || !['known', 'invalid', 'unavailable'].includes(stored.stripeCustomerStatus) ||
        stored.stripeCustomerStatus !== 'known' && stored.stripeCustomerLinked) return invalid()
    const grants = object(stored.invoiceGrants, ['scanLimit', 'scanned', 'partial', 'scanStatus', 'states', 'creditedPoints', 'revokedPoints'])
    if (grants.scanLimit !== 64 || !integer(grants.scanned, 0, 64) || typeof grants.partial !== 'boolean' || typeof grants.scanStatus !== 'string' ||
        !['complete', 'partial', 'unavailable', 'invalid'].includes(grants.scanStatus) ||
        (grants.scanStatus === 'complete') !== !grants.partial || grants.scanStatus === 'complete' && grants.scanned === 64 ||
        grants.scanStatus === 'partial' && grants.scanned !== 64 || ['unavailable', 'invalid'].includes(grants.scanStatus) && grants.scanned !== 0) return invalid()
    const states = object(grants.states, ['present', 'revoked', 'unverifiable'])
    if (Object.values(states).some(count => !integer(count, 0, Number(grants.scanned))) ||
        Object.values(states).reduce<number>((total, count) => total + Number(count), 0) !== grants.scanned ||
        !integer(grants.creditedPoints, Number(states.present), (Number(states.present) + Number(states.revoked)) * 1_000_000) ||
        !integer(grants.revokedPoints, Number(states.revoked), Number(states.revoked) * 1_000_000)) return invalid()
    if (!Array.isArray(stored.requestedInvoices) || stored.requestedInvoices.length > 2) return invalid()
    const references = new Set<string>()
    for (const raw of stored.requestedInvoices) {
      const invoice = object(raw, ['invoiceReference', 'state', 'reason', 'creditedPoints', 'revokedPoints', 'subscriptionLinked'])
      if (!isStoredInvoiceReference(invoice.invoiceReference) || references.has(invoice.invoiceReference) || typeof invoice.state !== 'string' ||
          !['present', 'missing', 'revoked', 'unverifiable'].includes(invoice.state) || typeof invoice.subscriptionLinked !== 'boolean') return invalid()
      references.add(invoice.invoiceReference)
      if (invoice.state === 'unverifiable') {
        if (typeof invoice.reason !== 'string' || !['invalid-record', 'unavailable'].includes(invoice.reason) || invoice.creditedPoints !== null || invoice.revokedPoints !== null || invoice.subscriptionLinked) return invalid()
      } else if (invoice.state === 'missing') {
        if (invoice.reason !== null || invoice.creditedPoints !== null || invoice.revokedPoints !== null || invoice.subscriptionLinked) return invalid()
      } else if (invoice.reason !== null || !integer(invoice.creditedPoints, invoice.state === 'present' ? 1 : 0, 1_000_000) ||
          !integer(invoice.revokedPoints, invoice.state === 'present' ? 0 : 1, invoice.state === 'present' ? 0 : 1_000_000) ||
          Number(invoice.creditedPoints) > 0 && Number(invoice.revokedPoints) > Number(invoice.creditedPoints)) return invalid()
    }
    const provenance = object(stored.unknownAmountProvenance, ['records', 'classifiedRecords', 'unclassifiedRecords', 'groups'])
    if (provenance.records !== funding.unknownAmountRecords || !integer(provenance.classifiedRecords, 0, Number(provenance.records)) ||
        !integer(provenance.unclassifiedRecords, 0, Number(provenance.records)) || Number(provenance.classifiedRecords) + Number(provenance.unclassifiedRecords) !== provenance.records ||
        !Array.isArray(provenance.groups) || provenance.groups.length > 36) return invalid()
    const groups = new Set<string>()
    let groupedRecords = 0
    for (const raw of provenance.groups) {
      const group = object(raw, ['route', 'model', 'state', 'records', 'recordedPointCosts', 'earliestAt', 'latestAt'])
      if (typeof group.route !== 'string' || !['studio', 'blueprint', 'legacyBlueprint'].includes(group.route) ||
          typeof group.model !== 'string' || !['luna', 'sol', 'astra', 'unknown'].includes(group.model) ||
          typeof group.state !== 'string' || !['reserved', 'completed', 'failed'].includes(group.state) ||
          !integer(group.records, 1, Number(provenance.classifiedRecords)) || !integer(group.recordedPointCosts, 0, Number(group.records) * 1_000_000) ||
          !integer(group.earliestAt, 1, 8_640_000_000_000_000) || !integer(group.latestAt, Number(group.earliestAt), 8_640_000_000_000_000)) return invalid()
      const key = `${group.route}:${group.model}:${group.state}`
      if (groups.has(key)) return invalid()
      groups.add(key); groupedRecords += Number(group.records)
    }
    if (groupedRecords !== provenance.classifiedRecords) return invalid()
  }
  return value as GenerationFundingSnapshot
}
