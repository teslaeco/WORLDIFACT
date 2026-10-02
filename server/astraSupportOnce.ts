/** A private operator-approved single-job allowance, never a payment receipt or
 * an authentication credential. It is inert until a normal verified Studio job
 * atomically consumes the account's permanent one-shot marker. */
export const ASTRA_SUPPORT_ONCE_KEY = 'support-astra-once:v1'
export const ASTRA_SUPPORT_CENTS = 175 as const
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
export const ASTRA_SUPPORT_NAMESPACE = 'astra-support-once:v1'
export type AstraSupportIdentity = { email: string; emailVerified?: boolean }
export type AstraSupportApproval = { version: 1; accountId: string; approvalId: string; issuedAt: string; expiresAt: string; amountCents: 175 }
export type AstraSupportClaim = { version: 1; approvalId: string; amountCents: 175; jobId: string; fingerprint: string; at: number }

export function astraSupportApproval(raw: unknown, verifiedAccount: unknown, ledgerMode: unknown, now: number, verifiedEmail?: string | null): AstraSupportApproval | null {
  if (ledgerMode !== undefined && ledgerMode !== 'live') return null
  if (typeof raw !== 'string' || raw.length > 1024 || typeof verifiedAccount !== 'string' || !UUID.test(verifiedAccount) || !Number.isSafeInteger(now)) return null
  try {
    const value = JSON.parse(raw) as Record<string, unknown>
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        Object.keys(value).length !== 6 || Object.keys(value).some(key => !['version', 'accountId', 'accountEmail', 'approvalId', 'issuedAt', 'expiresAt', 'amountCents'].includes(key)) ||
        value.version !== 1 || value.amountCents !== ASTRA_SUPPORT_CENTS || Object.hasOwn(value, 'accountId') === Object.hasOwn(value, 'accountEmail') ||
        typeof value.approvalId !== 'string' || !UUID.test(value.approvalId) ||
        typeof value.issuedAt !== 'string' || typeof value.expiresAt !== 'string') return null
    if (Object.hasOwn(value, 'accountId')) {
      if (typeof value.accountId !== 'string' || !UUID.test(value.accountId) || value.accountId.toLowerCase() !== verifiedAccount.toLowerCase()) return null
    } else if (typeof value.accountEmail !== 'string' || value.accountEmail.length > 254 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,63}$/i.test(value.accountEmail) ||
      typeof verifiedEmail !== 'string' || value.accountEmail.toLowerCase() !== verifiedEmail.toLowerCase()) return null
    const issued = Date.parse(value.issuedAt), expires = Date.parse(value.expiresAt)
    if (!Number.isSafeInteger(issued) || !Number.isSafeInteger(expires) || new Date(issued).toISOString() !== value.issuedAt || new Date(expires).toISOString() !== value.expiresAt ||
        issued > now || expires <= now || expires <= issued || expires - issued > 86_400_000) return null
    return { version: 1, accountId: verifiedAccount.toLowerCase(), approvalId: value.approvalId.toLowerCase(), issuedAt: value.issuedAt, expiresAt: value.expiresAt, amountCents: ASTRA_SUPPORT_CENTS }
  } catch { return null }
}
