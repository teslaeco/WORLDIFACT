/** One project-funded MCC request. These fixed storage names are independent of
 * configuration, account, dates and receipt IDs: they never create a refill. */
export const ASTRA_PROJECT_BUDGET_KEY = 'project-astra-mcc-budget:v1'
export const ASTRA_PROJECT_BUDGET_NAMESPACE = 'project-astra-mcc-once:v1'
export const ASTRA_PROJECT_BUDGET_CENTS = 175 as const
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
const HASH = /^[a-f0-9]{64}$/
const CONFIG_KEYS = ['version', 'accountId', 'issuedAt', 'expiresAt', 'maxProviderCents', 'maxAttempts', 'fingerprint']
const RECORD_KEYS = [...CONFIG_KEYS, 'source', 'attemptsUsed', 'reservedCents', 'jobId', 'at']
export type AstraProjectBudget = { version: 1; accountId: string; issuedAt: string; expiresAt: string; maxProviderCents: 175; maxAttempts: 1; fingerprint: string }
/** Full capacity is committed once, including failed or uncertain work. This is
 * project expenditure authority, never customer funds or refundable credit. */
export type AstraProjectBudgetRecord = AstraProjectBudget & { source: 'project'; attemptsUsed: 1; reservedCents: 175; jobId: string; at: number }

export function astraProjectBudget(raw: unknown, verifiedAccount: unknown, ledgerMode: unknown, now: number): AstraProjectBudget | null {
  if (ledgerMode !== undefined && ledgerMode !== 'live') return null
  if (typeof raw !== 'string' || raw.length > 1024 || typeof verifiedAccount !== 'string' || !UUID.test(verifiedAccount.toLowerCase()) || !Number.isSafeInteger(now)) return null
  try {
    const value = JSON.parse(raw) as Record<string, unknown>
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== CONFIG_KEYS.length || Object.keys(value).some(key => !CONFIG_KEYS.includes(key)) ||
        value.version !== 1 || value.maxProviderCents !== ASTRA_PROJECT_BUDGET_CENTS || value.maxAttempts !== 1 ||
        typeof value.accountId !== 'string' || !UUID.test(value.accountId) || value.accountId !== verifiedAccount.toLowerCase() ||
        typeof value.issuedAt !== 'string' || typeof value.expiresAt !== 'string' || typeof value.fingerprint !== 'string' || !HASH.test(value.fingerprint)) return null
    const issued = Date.parse(value.issuedAt), expires = Date.parse(value.expiresAt)
    if (!Number.isSafeInteger(issued) || !Number.isSafeInteger(expires) || new Date(issued).toISOString() !== value.issuedAt || new Date(expires).toISOString() !== value.expiresAt ||
        issued > now || expires <= now || expires <= issued || expires - issued > 86_400_000) return null
    return value as AstraProjectBudget
  } catch { return null }
}

/** Validate every field, including corrupted occupied rows. A bad record can
 * only deny spending; it must never be treated as empty or repaired in place. */
export function matchesAstraProjectBudgetRecord(value: unknown, budget: AstraProjectBudget, now: number, jobId: string, fingerprint: string): value is AstraProjectBudgetRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== RECORD_KEYS.length || Object.keys(value).some(key => !RECORD_KEYS.includes(key))) return false
  const record = value as AstraProjectBudgetRecord
  const authority = astraProjectBudget(JSON.stringify(Object.fromEntries(CONFIG_KEYS.map(key => [key, (value as Record<string, unknown>)[key]]))), budget.accountId, 'live', now)
  return !!authority && CONFIG_KEYS.every(key => (authority as Record<string, unknown>)[key] === (budget as Record<string, unknown>)[key]) &&
    record.source === 'project' && record.attemptsUsed === 1 && record.reservedCents === ASTRA_PROJECT_BUDGET_CENTS &&
    typeof record.jobId === 'string' && UUID.test(record.jobId) && record.jobId === jobId && record.fingerprint === fingerprint &&
    Number.isSafeInteger(record.at) && record.at >= Date.parse(record.issuedAt) && record.at < Date.parse(record.expiresAt) && record.at <= now
}

/** Original persisted authority remains usable only for recovery of its one job,
 * never under replacement configuration or a different verified account. */
export function persistedAstraProjectBudget(record: AstraProjectBudgetRecord, verifiedAccount: unknown, ledgerMode: unknown, now: number): AstraProjectBudget | null {
  return astraProjectBudget(JSON.stringify(Object.fromEntries(CONFIG_KEYS.map(key => [key, (record as unknown as Record<string, unknown>)[key]]))), verifiedAccount, ledgerMode, now)
}

/** A read-only routing tombstone, not spending approval. Even expired or changed
 * authority must keep its previously bound draft away from other funding. */
export function matchesAstraProjectScope(value: unknown, verifiedAccount: unknown, fingerprint: unknown): boolean {
  try {
    const scope = typeof value === 'string' ? JSON.parse(value) : value
    return !!scope && typeof scope === 'object' && !Array.isArray(scope) && typeof verifiedAccount === 'string' &&
      typeof scope.accountId === 'string' && UUID.test(scope.accountId) && scope.accountId === verifiedAccount.toLowerCase() &&
      typeof fingerprint === 'string' && HASH.test(fingerprint) && scope.fingerprint === fingerprint
  } catch { return false }
}

/** Classify occupied records using their original timestamp, even after expiry.
 * Unknown provenance cannot prove that an ordinary request is unrelated. */
export function isAstraProjectBudgetRecord(value: unknown): value is AstraProjectBudgetRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as AstraProjectBudgetRecord
  const authority = persistedAstraProjectBudget(record, record.accountId, 'live', record.at)
  return !!authority && matchesAstraProjectBudgetRecord(record, authority, record.at, record.jobId, record.fingerprint)
}
