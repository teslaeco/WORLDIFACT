/** A separate, private one-attempt Studio allowance. Never resets the original
 * support grant or replenishes ordinary provider budget. */
export const ASTRA_SUPPLEMENTAL_KEY = 'support-astra-supplemental:v1'
export const ASTRA_SUPPLEMENTAL_NAMESPACE = 'astra-support-supplemental:v1'
export const ASTRA_SUPPLEMENTAL_CENTS = 175 as const
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
const CONFIG_KEYS = ['version', 'accountId', 'accountEmail', 'grantId', 'issuedAt', 'expiresAt', 'amountCents']
const CLAIM_KEYS = ['version', 'accountId', 'grantId', 'issuedAt', 'expiresAt', 'amountCents', 'jobId', 'fingerprint', 'at']
export type AstraSupplementalGrant = { version: 1; accountId: string; grantId: string; issuedAt: string; expiresAt: string; amountCents: 175 }
export type AstraSupplementalClaim = AstraSupplementalGrant & { jobId: string; fingerprint: string; at: number }

export function astraSupplementalGrant(raw: unknown, verifiedAccount: unknown, ledgerMode: unknown, now: number, verifiedEmail?: string | null): AstraSupplementalGrant | null {
  if (ledgerMode !== undefined && ledgerMode !== 'live') return null
  if (typeof raw !== 'string' || raw.length > 1024 || typeof verifiedAccount !== 'string' || !UUID.test(verifiedAccount) || !Number.isSafeInteger(now)) return null
  try {
    const value = JSON.parse(raw) as Record<string, unknown>
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 6 || Object.keys(value).some(key => !CONFIG_KEYS.includes(key)) ||
        value.version !== 1 || value.amountCents !== ASTRA_SUPPLEMENTAL_CENTS || Object.hasOwn(value, 'accountId') === Object.hasOwn(value, 'accountEmail') ||
        typeof value.grantId !== 'string' || !UUID.test(value.grantId) || typeof value.issuedAt !== 'string' || typeof value.expiresAt !== 'string') return null
    if (Object.hasOwn(value, 'accountId')) {
      if (typeof value.accountId !== 'string' || !UUID.test(value.accountId) || value.accountId.toLowerCase() !== verifiedAccount.toLowerCase()) return null
    } else if (typeof value.accountEmail !== 'string' || value.accountEmail.length > 254 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,63}$/i.test(value.accountEmail) ||
      typeof verifiedEmail !== 'string' || value.accountEmail.toLowerCase() !== verifiedEmail.toLowerCase()) return null
    const issued = Date.parse(value.issuedAt), expires = Date.parse(value.expiresAt)
    if (!Number.isSafeInteger(issued) || !Number.isSafeInteger(expires) || new Date(issued).toISOString() !== value.issuedAt || new Date(expires).toISOString() !== value.expiresAt ||
        issued > now || expires <= now || expires <= issued || expires - issued > 86_400_000) return null
    return { version: 1, accountId: verifiedAccount.toLowerCase(), grantId: value.grantId.toLowerCase(), issuedAt: value.issuedAt, expiresAt: value.expiresAt, amountCents: ASTRA_SUPPLEMENTAL_CENTS }
  } catch { return null }
}

/** Validate every stored/acknowledged field before allowing exact-job replay. */
export function matchesAstraSupplementalClaim(value: unknown, grant: AstraSupplementalGrant, now: number, jobId: string, fingerprint: string): value is AstraSupplementalClaim {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== CLAIM_KEYS.length || Object.keys(value).some(key => !CLAIM_KEYS.includes(key))) return false
  const claim = value as AstraSupplementalClaim
  return claim.version === 1 && claim.amountCents === ASTRA_SUPPLEMENTAL_CENTS && claim.accountId === grant.accountId && claim.grantId === grant.grantId &&
    claim.issuedAt === grant.issuedAt && claim.expiresAt === grant.expiresAt && claim.jobId === jobId && UUID.test(claim.jobId) && claim.fingerprint === fingerprint && /^[a-f0-9]{64}$/.test(claim.fingerprint) &&
    Number.isSafeInteger(now) && now >= Date.parse(grant.issuedAt) && now < Date.parse(grant.expiresAt) &&
    Number.isSafeInteger(claim.at) && claim.at >= Date.parse(grant.issuedAt) && claim.at < Date.parse(grant.expiresAt) && claim.at <= now
}
