import { createHash } from 'node:crypto'
import type { HeldPointsForfeitAuthority } from '../../server/heldPointsForfeit.ts'
import { PAID_POINTS_FENCE, PAID_POINTS_JOB_PREFIX } from '../../server/paidPointsStorage.ts'
import { PAID_POINTS_FUNDING } from '../../src/lib/paidPointsFunding.ts'
export const NOW = Date.parse('2026-10-10T18:31:00Z')
export const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
export const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
export const HELD = 'customer-reserved-credits:v1'
export const RESERVE = 'provider-budget-cents:v1'
export const IDS = [1, 2, 3, 4].map(n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`)
export const digest = (value: string) => createHash('sha256').update(value).digest('hex')
export const authority: HeldPointsForfeitAuthority = Object.freeze({ ownerAccountSha256: digest(OWNER), authorizationReferenceSha256: digest('Inert synthetic approval, not live authorization'),
  jobs: Object.freeze(IDS.map((id, i) => Object.freeze({ idSha256: digest(id), at: NOW - 86400000 + i * 100000 }))) })
export function fixtureSeed(): Record<string, unknown> {
  const seed: Record<string, unknown> = { balance: 1190, [HELD]: 1000, [RESERVE]: 17, customer: 'cus_Fixture', 'unrelated:history': { retained: true },
    'current-studio-job:points-v2': { id: IDS[3], at: authority.jobs[3].at, observedLegacyId: '' } }
  for (const [i, id] of IDS.entries()) {
    const at = authority.jobs[i].at, fingerprint = digest('Synthetic prompt ' + i)
    seed[PAID_POINTS_JOB_PREFIX + id] = { fundingMode: PAID_POINTS_FUNDING, pointSettlement: { version: 1, state: 'pending-cost', heldPoints: 250, chargedPoints: 0 },
      providerLiability: { version: 1, source: 'paid-membership', capCents: 175, maximumLiabilityCents: 17, state: 'bounded',
        evidence: { kind: 'studio-terminal', at: at + 60000, receipt: { revision: 'worldifact-terminal-budget-v1', jobId: id, model: 'gpt-6-astra',
          policyRevision: 'astra-low-reconciled-v2', capMicroUsd: 1750000, maximumLiabilityMicroUsd: 170000, sealed: true, sealId: digest('Inert seal ' + i) } } },
      fingerprint, prompt: 'Inert private fixture prompt ' + i, channel: 'studio', profile: 'slow', at, updatedAt: at + 60000, cost: 250,
      kind: 'credits', billingMode: 'hold-v1', state: 'failed', failureCode: 'ORACLE_JOB_FAILED', studioDispatch: 'claimed-v1', studioDispatchUntil: at + 30000 }
    seed['job:' + id] = { fundingMode: PAID_POINTS_FENCE, paidPointsFingerprint: fingerprint, profile: 'slow', channel: 'studio',
      at, updatedAt: at, cost: 0, kind: 'free', state: 'failed', failureCode: 'MISSING_SUBMISSION' }
  }
  return seed
}
