import type { EntitlementStorage } from './entitlements.ts'
import { verifyFailedHoldWaiverJob } from './failedHoldWaiver.ts'
import { PAID_POINTS_FUNDING } from '../src/lib/paidPointsFunding.ts'

export const PAID_POINTS_ROUTE_PREFIX = '/generation-v3'
export const PAID_POINTS_JOB_PREFIX = 'paid-points-job:v2:'
export const PAID_POINTS_FENCE = 'paid-membership-fence-v2'
const CURRENT = 'current-studio-job:v1'
const PAID_CURRENT = 'current-studio-job:points-v2'
const GENERATION_PATHS = new Set(['/status', '/reserve', '/reserve-overnight-test', '/settle', '/job', '/blueprint-status', '/blueprint-complete',
  '/blueprint-dispatch', '/studio-dispatch', '/studio-current', '/studio-current-clear', '/studio-close-missing', '/studio-library',
  '/studio-provider-pending', '/provider-reconciliation-pending', '/reconcile-studio-provider', '/reconcile-blueprint-provider', '/generation-funding', '/failed-hold-waiver'])
export function generationPath(path: string) {
  const pathname = path.split('?')[0]
  return GENERATION_PATHS.has(pathname) || pathname.startsWith('/studio-library/')
}
type Row = Record<string, unknown>
const row = (value: unknown): value is Row => !!value && typeof value === 'object' && !Array.isArray(value)
function fence(job: Row) {
  return { fundingMode: PAID_POINTS_FENCE, paidPointsFingerprint: job.fingerprint, profile: job.profile, channel: job.channel,
    at: job.at, updatedAt: job.at, cost: 0, kind: 'free', state: 'failed', failureCode: 'MISSING_SUBMISSION' }
}
export function matchingPaidPointsFence(value: unknown, job: Row) {
  const expected = fence(job)
  return row(value) && Object.keys(value).length === Object.keys(expected).length &&
    Object.entries(expected).every(([key, item]) => value[key] === item)
}
/** The old namespace contains only an inert terminal collision fence. Old
 * Workers cannot dispatch, settle or reconcile the isolated paid job. All writes
 * below run inside the caller's real Durable Object transaction. */
export function paidPointsStorage(storage: EntitlementStorage, valid: (value: unknown, id?: string) => boolean): EntitlementStorage {
  async function readJob(key: string) {
    const [paid, old] = await Promise.all([storage.get(PAID_POINTS_JOB_PREFIX + key.slice(4)), storage.get(key)])
    if (paid !== undefined) {
      if (!valid(paid, key.slice(4)) || !row(paid) || !matchingPaidPointsFence(old, paid)) throw new Error('Unverified paid membership job')
      if (row(paid.pointSettlement) && paid.pointSettlement.state === 'waived' && !await verifyFailedHoldWaiverJob(storage, key.slice(4), paid)) throw new Error('Unverified failed-hold waiver')
      return paid
    }
    if (row(old) && ('fundingMode' in old || 'providerLiability' in old || 'pointSettlement' in old)) throw new Error('Unknown job funding mode')
    return old
  }
  async function pointer() {
    const [current, legacy] = await Promise.all([storage.get<Row>(PAID_CURRENT), storage.get<Row>(CURRENT)])
    if (current !== undefined && (!row(current) || Object.keys(current).some(key => !['id', 'at', 'dismissedLegacyId', 'observedLegacyId'].includes(key)) ||
        typeof current.id !== 'string' || current.id !== '' && !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(current.id) ||
        !Number.isSafeInteger(current.at) || Number(current.at) < 0 ||
        typeof current.observedLegacyId !== 'string' || current.observedLegacyId !== '' && !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(current.observedLegacyId) ||
        current.dismissedLegacyId !== undefined && (typeof current.dismissedLegacyId !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(current.dismissedLegacyId))))
      throw new Error('Invalid paid current pointer')
    const currentJob = current?.id ? await readJob('job:' + current.id) : undefined
    if (current?.id && (!row(currentJob) || currentJob.channel !== 'studio' || currentJob.at !== current.at)) throw new Error('Orphan paid current pointer')
    const oldJob = typeof legacy?.id === 'string' && legacy.id ? await readJob('job:' + legacy.id) : undefined
    if (legacy?.id === current?.dismissedLegacyId || !row(oldJob)) return current
    const oldAt = Number.isSafeInteger(oldJob.at) ? Number(oldJob.at) : -1
    // Preserve the old outstanding request when the newer one is terminal.
    // A cleared pointer never resurrects a dismissed/older terminal request.
    if (oldJob.state === 'reserved' && (!row(currentJob) || currentJob.state !== 'reserved')) return legacy
    // Millisecond clocks can tie across old/new Workers. A legacy pointer ID
    // changed since the versioned write proves the legacy selection is newer.
    if (current && Number(current.at) === oldAt && legacy?.id !== current.observedLegacyId) return legacy
    return current && Number(current.at) >= oldAt ? current : legacy
  }

  return {
    async get<T>(key: string) {
      return (key.startsWith('job:') ? await readJob(key) : key === CURRENT ? await pointer() : await storage.get(key)) as T | undefined
    },
    async put(key: string, value: unknown) {
      if (key.startsWith('job:')) {
        if (row(value) && value.fundingMode === PAID_POINTS_FUNDING) {
          if (!valid(value, key.slice(4))) throw new Error('Invalid paid membership job write')
          const priorPaid = await storage.get<Row>(PAID_POINTS_JOB_PREFIX + key.slice(4))
          if (row(value.pointSettlement) && value.pointSettlement.state === 'waived' || row(priorPaid?.pointSettlement) && priorPaid.pointSettlement.state === 'waived')
            throw new Error('Incident-waived jobs are immutable')
          const prior = await storage.get(key)
          if (prior !== undefined && !matchingPaidPointsFence(prior, value)) throw new Error('Legacy job collision')
          await storage.put(PAID_POINTS_JOB_PREFIX + key.slice(4), value)
          if (prior === undefined) await storage.put(key, fence(value))
          return
        }
        if (row(value) && ('fundingMode' in value || 'providerLiability' in value || 'pointSettlement' in value) || await storage.get(PAID_POINTS_JOB_PREFIX + key.slice(4)) !== undefined)
          throw new Error('Unknown or conflicting funding mode')
      }
      if (key === CURRENT && row(value)) {
        const selected = value.id ? await readJob('job:' + value.id) : undefined
        const current = await pointer(), prior = await storage.get<Row>(PAID_CURRENT), legacy = await storage.get<Row>(CURRENT)
        if (value.id && (!row(selected) || selected.channel !== 'studio')) throw new Error('Invalid current Studio job')
        const currentJob = current?.id ? await readJob('job:' + current.id) : undefined
        const at = row(selected) ? selected.at : Math.max(Number(prior?.at ?? 0), row(currentJob) ? Number(currentJob.at) : 0)
        const dismissedLegacyId = !value.id && current?.id === legacy?.id ? legacy?.id : prior?.dismissedLegacyId
        await storage.put(PAID_CURRENT, { ...value, at, observedLegacyId: legacy?.id ?? '', ...(dismissedLegacyId ? { dismissedLegacyId } : {}) })
        return
      }

      await storage.put(key, value)
    },
    ...(storage.list ? { async list<T>(options: { prefix: string; startAfter?: string; limit: number }) {
      if (options.prefix !== 'job:') return storage.list!<T>(options)
      const [old, paid] = await Promise.all([storage.list!<unknown>(options), storage.list!<unknown>({ ...options, prefix: PAID_POINTS_JOB_PREFIX,
        ...(options.startAfter ? { startAfter: PAID_POINTS_JOB_PREFIX + options.startAfter.slice(4) } : {}) })])
      const keys = new Set([...old.keys(), ...[...paid.keys()].map(key => 'job:' + key.slice(PAID_POINTS_JOB_PREFIX.length))])
      const entries: [string, T][] = []
      for (const key of [...keys].sort().slice(0, options.limit)) entries.push([key, await readJob(key) as T])
      return new Map(entries)
    } } : {}),
    transaction<T>(callback: (transaction: EntitlementStorage) => Promise<T>) {
      return storage.transaction(transaction => callback(paidPointsStorage(transaction, valid)))
    },
  }
}
