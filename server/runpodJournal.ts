/** Transactional dispatch journal adapter. NOT registered as a new public route.
 * Bind one instance to one authenticated tenant's existing Durable Object storage.
 * Never use KV or a process-local map to implement this interface in production.
 */
import { PipelineError, type DispatchJournal } from './runpodPipeline.ts'
export interface Transaction {
  get<T>(key: string): Promise<T | undefined>
  put<T>(key: string, value: T): Promise<void>
}
export interface TransactionalStorage extends Transaction {
  transaction<T>(fn: (transaction: Transaction) => Promise<T>): Promise<T>
}
type Record = { fingerprint: string; state: 'CLAIMED' | 'QUEUED' | 'UNKNOWN'; maxMicroUsd: number; providerId?: string; endpointId?: string }
export class DurableDispatchJournal implements DispatchJournal {
  private storage: TransactionalStorage
  private scope: string
  private dailyMaxMicroUsd: number
  private now: () => number
  constructor(storage: TransactionalStorage, scope: string, dailyMaxMicroUsd: number, now: () => number = Date.now) {
    if (!/^[a-f0-9]{64}$/.test(scope) || !Number.isSafeInteger(dailyMaxMicroUsd) || dailyMaxMicroUsd < 1) throw new PipelineError('INVALID_JOURNAL_CONFIGURATION')
    this.storage = storage; this.scope = scope; this.dailyMaxMicroUsd = dailyMaxMicroUsd; this.now = now
  }
  private key(scope: string, jobId: string) {
    if (scope !== this.scope || !/^[a-f0-9-]{36}$/.test(jobId)) throw new PipelineError('JOURNAL_SCOPE_MISMATCH')
    return `runpod/v1/jobs/${jobId}`
  }
  async claim(scope: string, jobId: string, fingerprint: string, maxMicroUsd: number): Promise<'new' | 'existing'> {
    const key = this.key(scope, jobId)
    if (!/^[a-f0-9]{64}$/.test(fingerprint) || !Number.isSafeInteger(maxMicroUsd) || maxMicroUsd < 1) throw new PipelineError('INVALID_CLAIM')
    const bucket = `runpod/v1/exposure/${new Date(this.now()).toISOString().slice(0, 10)}`
    return this.storage.transaction(async txn => {
      const prior = await txn.get<Record>(key)
      if (prior) {
        if (prior.fingerprint !== fingerprint || prior.maxMicroUsd !== maxMicroUsd) throw new PipelineError('JOB_INPUT_CONFLICT')
        return 'existing'
      }
      const used = (await txn.get<number>(bucket)) ?? 0
      if (!Number.isSafeInteger(used + maxMicroUsd) || used + maxMicroUsd > this.dailyMaxMicroUsd) throw new PipelineError('DAILY_GPU_EXPOSURE_LIMIT')
      await txn.put(bucket, used + maxMicroUsd)
      await txn.put<Record>(key, { fingerprint, state: 'CLAIMED', maxMicroUsd })
      return 'new'
    })
  }
  async queued(scope: string, jobId: string, providerId: string, endpointId: string) {
    const key = this.key(scope, jobId)
    if (!/^[a-zA-Z0-9_-]{8,128}$/.test(providerId) || !/^[a-z0-9]{6,64}$/.test(endpointId)) throw new PipelineError('INVALID_PROVIDER_JOB')
    await this.storage.transaction(async txn => {
      const prior = await txn.get<Record>(key)
      if (!prior || prior.state !== 'CLAIMED') throw new PipelineError('INVALID_QUEUE_TRANSITION')
      await txn.put(key, { ...prior, state: 'QUEUED', providerId, endpointId })
    })
  }
  async uncertain(scope: string, jobId: string) {
    const key = this.key(scope, jobId)
    await this.storage.transaction(async txn => {
      const prior = await txn.get<Record>(key)
      if (!prior) throw new PipelineError('MISSING_CLAIM')
      if (prior.state === 'CLAIMED') await txn.put(key, { ...prior, state: 'UNKNOWN' })
    })
  }
  async record(scope: string, jobId: string) { return this.storage.get<Record>(this.key(scope, jobId)) }
}
