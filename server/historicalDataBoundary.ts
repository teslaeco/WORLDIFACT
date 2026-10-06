import type { BudgetStorage, BudgetNamespace } from './budget.ts'
import type { EntitlementStorage } from './entitlements.ts'

// Private, immutable copy-on-write archive. Existing rows remain in this same
// account object; no export, deletion, balance rewind or provider funding occurs.
export const HISTORICAL_INTERNAL_PREFIX = '/mcc-restore-20261006'
export const historicalInternalUrl = (origin: string, path: string) => `${origin}${HISTORICAL_INTERNAL_PREFIX}${path}`

export function historicalInternalPath(request: Request, readOnlyPaths: readonly string[]): string | null {
  const path = new URL(request.url).pathname
  if (path.startsWith(`${HISTORICAL_INTERNAL_PREFIX}/`)) return path.slice(HISTORICAL_INTERNAL_PREFIX.length)
  return request.method === 'GET' && readOnlyPaths.includes(path) ? path : null
}

/** Prefix every production budget call, preserving each native method's receiver. */
export function historicalBudgetNamespace(namespace: BudgetNamespace): BudgetNamespace {
  return {
    idFromName: name => namespace.idFromName(name),
    get(id) {
      const stub = namespace.get(id)
      return { fetch(request) {
        const url = new URL(request.url)
        if (!url.pathname.startsWith(`${HISTORICAL_INTERNAL_PREFIX}/`)) url.pathname = `${HISTORICAL_INTERNAL_PREFIX}${url.pathname}`
        return stub.fetch(new Request(url, request))
      } }
    },
  }
}

export const HISTORICAL_ARCHIVE_PREFIX = 'mcc-rollback:2026-10-06:before:'
export const historicalJobKey = (id: string) => `mcc-rollback:2026-10-06:job:${id}`
type OriginalValue = { existed: false } | { existed: true; value: unknown }

export async function pendingHistoricalCredits(storage: EntitlementStorage): Promise<number> {
  const stored = await storage.get<number>('customer-reserved-credits:v1')
  const held = stored === undefined ? 0 : stored
  if (!Number.isSafeInteger(held) || held < 0) throw new Error('Invalid archived credit hold')
  return held
}

/** All writes are transactional and save the original before touching its key.
 * Recovery overlays these originals on untouched rows; absent originals identify
 * newly created rows. Use only for reviewed, targeted recovery; never overwrite
 * later real payment events with an old snapshot. This is not a global backup.
 * Epoch-versioned calls reject mixed-version writes. Old jobs stay quarantined;
 * neither this archive nor the route fence settles their external liabilities.
 */
export function historicalDataBoundary(storage: EntitlementStorage): EntitlementStorage {
  return {
    get: key => storage.get(key),
    put: () => Promise.reject(new Error('Historical writes require a transaction')),
    transaction: callback => storage.transaction(async transaction => {
      const protectedStorage: EntitlementStorage = {
        get: key => transaction.get(key),
        async put(key, value) {
          if (key.startsWith(HISTORICAL_ARCHIVE_PREFIX)) throw new Error('Historical archive is immutable')
          const backupKey = `${HISTORICAL_ARCHIVE_PREFIX}${key}`
          const saved = await transaction.get<OriginalValue>(backupKey)
          if (saved !== undefined && (!saved || typeof saved !== 'object' ||
            (saved.existed === false ? Object.keys(saved).length !== 1 : saved.existed !== true || !Object.hasOwn(saved, 'value') || Object.keys(saved).length !== 2))) throw new Error('Invalid historical archive')
          if (saved === undefined) {
            const original = await transaction.get(key)
            await transaction.put(backupKey, original === undefined ? { existed: false } : { existed: true, value: original })
          }
          await transaction.put(key, value)
        },
        transaction: () => Promise.reject(new Error('Nested historical transactions are unsupported')),
      }
      return callback(protectedStorage)
    }),
  }
}

/** Numeric global-budget rows use a numeric archive and a separate absence marker. */
export function historicalBudgetBoundary(storage: BudgetStorage): BudgetStorage {
  return {
    get: key => storage.get(key),
    put: () => Promise.reject(new Error('Historical writes require a transaction')),
    transaction: callback => storage.transaction(async transaction => {
      const protectedStorage: BudgetStorage = {
        get: key => transaction.get(key),
        async put(key, value) {
          if (key.startsWith(HISTORICAL_ARCHIVE_PREFIX)) throw new Error('Historical archive is immutable')
          const originalKey = `${HISTORICAL_ARCHIVE_PREFIX}number:${key}`, absentKey = `${HISTORICAL_ARCHIVE_PREFIX}absent:${key}`
          const saved = await transaction.get<number>(originalKey), absent = await transaction.get<number>(absentKey)
          if (saved !== undefined && (!Number.isSafeInteger(saved) || absent !== undefined) || absent !== undefined && absent !== 1) throw new Error('Invalid historical budget archive')
          if (saved === undefined && absent === undefined) {
            const original = await transaction.get<number>(key)
            if (original !== undefined && !Number.isSafeInteger(original)) throw new Error('Invalid historical budget')
            await transaction.put(original === undefined ? absentKey : originalKey, original ?? 1)
          }
          await transaction.put(key, value)
        },
        transaction: () => Promise.reject(new Error('Nested historical transactions are unsupported')),
      }
      return callback(protectedStorage)
    }),
  }
}
