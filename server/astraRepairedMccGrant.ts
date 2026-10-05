/** One fixed repaired-MCC attempt. Rotating configuration never creates a new
 * authority and this allowance never becomes ordinary account funding. */
export const ASTRA_REPAIRED_MCC_KEY = 'support-astra-repaired-mcc:v1'
export const ASTRA_REPAIRED_MCC_NAMESPACE = 'astra-support-repaired-mcc:v1'
export const ASTRA_REPAIRED_MCC_CENTS = 175 as const
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
const HASH = /^[a-f0-9]{64}$/
const CONFIG_KEYS = ['version', 'accountId', 'accountEmail', 'grantId', 'issuedAt', 'expiresAt', 'amountCents', 'fingerprint']
const CLAIM_KEYS = ['version', 'accountId', 'grantId', 'issuedAt', 'expiresAt', 'amountCents', 'fingerprint', 'jobId', 'at']
export type AstraRepairedMccGrant = { version: 1; accountId: string; grantId: string; issuedAt: string; expiresAt: string; amountCents: 175; fingerprint: string }
export type AstraRepairedMccClaim = AstraRepairedMccGrant & { jobId: string; at: number }

/** fingerprint is the existing canonical Studio input digest bound to the
 * verified account, exactly as committed by a signed Studio receipt. */
export function astraRepairedMccGrant(raw: unknown, verifiedAccount: unknown, ledgerMode: unknown, now: number, verifiedEmail?: string | null): AstraRepairedMccGrant | null {
  if (ledgerMode !== undefined && ledgerMode !== 'live') return null
  if (typeof raw !== 'string' || raw.length > 1536 || typeof verifiedAccount !== 'string' || !UUID.test(verifiedAccount) || !Number.isSafeInteger(now)) return null
  try {
    const value = JSON.parse(raw) as Record<string, unknown>
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 7 || Object.keys(value).some(key => !CONFIG_KEYS.includes(key)) ||
        value.version !== 1 || value.amountCents !== ASTRA_REPAIRED_MCC_CENTS || Object.hasOwn(value, 'accountId') === Object.hasOwn(value, 'accountEmail') ||
        typeof value.grantId !== 'string' || !UUID.test(value.grantId) || typeof value.issuedAt !== 'string' || typeof value.expiresAt !== 'string' ||
        typeof value.fingerprint !== 'string' || !HASH.test(value.fingerprint)) return null
    if (Object.hasOwn(value, 'accountId')) {
      if (typeof value.accountId !== 'string' || !UUID.test(value.accountId) || value.accountId.toLowerCase() !== verifiedAccount.toLowerCase()) return null
    } else if (typeof value.accountEmail !== 'string' || value.accountEmail.length > 254 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,63}$/i.test(value.accountEmail) ||
      typeof verifiedEmail !== 'string' || value.accountEmail.toLowerCase() !== verifiedEmail.toLowerCase()) return null
    const issued = Date.parse(value.issuedAt), expires = Date.parse(value.expiresAt)
    if (!Number.isSafeInteger(issued) || !Number.isSafeInteger(expires) || new Date(issued).toISOString() !== value.issuedAt || new Date(expires).toISOString() !== value.expiresAt ||
        issued > now || expires <= now || expires <= issued || expires - issued > 86_400_000) return null
    return { version: 1, accountId: verifiedAccount.toLowerCase(), grantId: value.grantId.toLowerCase(), issuedAt: value.issuedAt, expiresAt: value.expiresAt, amountCents: ASTRA_REPAIRED_MCC_CENTS, fingerprint: value.fingerprint }
  } catch { return null }
}

/** Every provenance field is checked; malformed occupied markers stay spent. */
export function matchesAstraRepairedMccClaim(value: unknown, grant: AstraRepairedMccGrant, now: number, jobId: string, fingerprint: string): value is AstraRepairedMccClaim {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== CLAIM_KEYS.length || Object.keys(value).some(key => !CLAIM_KEYS.includes(key))) return false
  const claim = value as AstraRepairedMccClaim
  if (typeof claim.accountId !== 'string' || !UUID.test(claim.accountId) || claim.accountId !== claim.accountId.toLowerCase() ||
      typeof claim.grantId !== 'string' || !UUID.test(claim.grantId) || claim.grantId !== claim.grantId.toLowerCase() ||
      typeof claim.issuedAt !== 'string' || typeof claim.expiresAt !== 'string' || typeof claim.jobId !== 'string' || typeof claim.fingerprint !== 'string') return false
  const issued = Date.parse(claim.issuedAt), expires = Date.parse(claim.expiresAt)
  if (!Number.isSafeInteger(issued) || !Number.isSafeInteger(expires) || new Date(issued).toISOString() !== claim.issuedAt || new Date(expires).toISOString() !== claim.expiresAt ||
      expires <= issued || expires - issued > 86_400_000) return false
  return claim.version === 1 && claim.amountCents === ASTRA_REPAIRED_MCC_CENTS && claim.accountId === grant.accountId && claim.grantId === grant.grantId &&
    claim.issuedAt === grant.issuedAt && claim.expiresAt === grant.expiresAt && claim.jobId === jobId && UUID.test(claim.jobId) &&
    claim.fingerprint === fingerprint && claim.fingerprint === grant.fingerprint && HASH.test(claim.fingerprint) &&
    Number.isSafeInteger(now) && now >= issued && now < expires &&
    Number.isSafeInteger(claim.at) && claim.at >= issued && claim.at < expires && claim.at <= now
}
