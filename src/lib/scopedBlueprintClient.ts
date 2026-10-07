import { BlueprintClient, BLUEPRINT_RECOVERY_ARCHIVE_KEY, type BlueprintRecovery } from './blueprintClient.ts'
export { blueprintRecoveryDetail, BLUEPRINT_PENDING_COST_DETAIL } from './blueprintClient.ts'
import { blueprintFingerprint } from './blueprintRequest.ts'
import type { GenerationResult } from './blueprint.ts'

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
type Payload = { prompt: string; model: string; [key: string]: unknown }
type Envelope = { snapshotFingerprint: string; recovery: BlueprintRecovery }
export type ScopedBlueprintRecovery = BlueprintRecovery & { snapshotFingerprint: string }
export type ScopedBlueprintProposal = { result: GenerationResult; snapshotFingerprint: string }

/** Keep only opaque request metadata and a world hash, never a prompt or image. */
export class ScopedBlueprintClient {
  readonly owner: string
  readonly worldId: string
  private client: BlueprintClient
  private read: () => Envelope | null
  private readArchive: () => Envelope[]
  private sourceFingerprint: string | null = null
  private busy = false
  private active: () => boolean

  constructor(store: Store, fetcher: typeof fetch, owner: string, worldId: string, active: () => boolean = () => true) {
    if (!owner || !worldId) throw new Error('Sign in and open your world before requesting a proposal.')
    this.owner = owner; this.worldId = worldId; this.active = active
    const key = `worldifact:scoped-blueprint:v1:${encodeURIComponent(owner)}:${encodeURIComponent(worldId)}`
    this.read = () => {
      const raw = store.getItem(key)
      if (!raw) return null
      const value = JSON.parse(raw) as Envelope
      if (!value || !/^[a-f0-9]{64}$/.test(value.snapshotFingerprint) || !value.recovery) throw new Error('This world’s generation recovery metadata needs review. No new paid request was started.')
      return value
    }
    const archiveKey = `${key}:held-history`
    this.readArchive = () => {
      const raw = store.getItem(archiveKey)
      if (!raw) return []
      const values: unknown = JSON.parse(raw)
      if (!Array.isArray(values) || values.some(value => !value || !/^[a-f0-9]{64}$/.test(value.snapshotFingerprint) || !value.recovery)) throw new Error('This world’s saved held-point requests need review. No replacement was started.')
      return values as Envelope[]
    }
    this.client = new BlueprintClient({
      getItem: requestedKey => {
        if (requestedKey === BLUEPRINT_RECOVERY_ARCHIVE_KEY) return JSON.stringify(this.readArchive().map(value => value.recovery))
        const value = this.read(); return value ? JSON.stringify(value.recovery) : null
      },
      setItem: (requestedKey, raw) => {
        this.assertActive()
        if (requestedKey === BLUEPRINT_RECOVERY_ARCHIVE_KEY) {
          const previous = this.readArchive(), active = this.read()
          const records = JSON.parse(raw) as BlueprintRecovery[]
          const envelopes = records.map(recovery => {
            const original = previous.find(value => value.recovery.id === recovery.id) ?? (active?.recovery.id === recovery.id ? active : null)
            if (!original) throw new Error('The original world snapshot could not be verified. No replacement was started.')
            return { snapshotFingerprint: original.snapshotFingerprint, recovery }
          })
          store.setItem(archiveKey, JSON.stringify(envelopes))
          return
        }
        const recovery = JSON.parse(raw) as BlueprintRecovery, previous = this.read()
        if (previous && previous.recovery.id !== recovery.id) throw new Error('Another request is saved for this world. Recover it before continuing.')
        const snapshotFingerprint = previous?.snapshotFingerprint ?? this.sourceFingerprint
        if (!snapshotFingerprint) throw new Error('The original world snapshot could not be verified. No replacement was started.')
        store.setItem(key, JSON.stringify({ snapshotFingerprint, recovery }))
      },
      removeItem: requestedKey => {
        this.assertActive()
        if (requestedKey === BLUEPRINT_RECOVERY_ARCHIVE_KEY) throw new Error('Saved held-point requests cannot be cleared here.')
        store.removeItem(key)
      },
    }, (input, init) => {
      this.assertActive()
      return fetcher(input, init)
    })
  }
  private assertActive() {
    if (!this.active()) throw new Error('The account or world changed. Open the original world with its owner to recover this request.')
  }
  current(): ScopedBlueprintRecovery | null {
    const record = this.client.current()
    return record ? { ...record, snapshotFingerprint: this.read()!.snapshotFingerprint } : null
  }
  archived(): ScopedBlueprintRecovery[] {
    const envelopes = this.readArchive()
    return this.client.archived().map(record => ({ ...record, snapshotFingerprint: envelopes.find(value => value.recovery.id === record.id)!.snapshotFingerprint }))
  }
  async recoverArchived(id: string, signal?: AbortSignal): Promise<void> {
    this.assertActive()
    if (this.busy) throw new Error('This request is already being checked. No second generation was started.')
    this.busy = true
    try { await this.client.recoverArchived(id, signal); this.assertActive() }
    finally { this.busy = false }
  }
  private async run(action: () => Promise<GenerationResult>): Promise<ScopedBlueprintProposal> {
    this.assertActive()
    if (this.busy) throw new Error('This request is already being checked. No second generation was started.')
    this.busy = true
    try {
      const result = await action()
      this.assertActive()
      return { result, snapshotFingerprint: this.current()!.snapshotFingerprint }
    }
    finally { this.busy = false }
  }
  submit(payload: Payload, world: unknown, signal?: AbortSignal, fundingPolicy?: string): Promise<ScopedBlueprintProposal> {
    return this.run(async () => {
      const previous = this.current()
      if (previous && previous.state !== 'pending') throw new Error('This attempt is finished. Recover its result or explicitly prepare a new paid attempt.')
      if (!previous) this.sourceFingerprint = await blueprintFingerprint(world)
      this.assertActive()
      return this.client.submit(payload, signal, fundingPolicy)
    })
  }
  recover(signal?: AbortSignal): Promise<ScopedBlueprintProposal> {
    return this.run(() => this.client.recover(signal))
  }
  reset(confirmed: boolean) {
    this.assertActive()
    if (!confirmed) throw new Error('Confirm a new paid attempt before clearing the finished request.')
    if (this.busy) throw new Error('Wait for the current request check to finish.')
    this.client.reset()
    this.sourceFingerprint = null
  }
}
