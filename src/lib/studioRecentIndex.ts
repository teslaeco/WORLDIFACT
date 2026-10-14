/** Account-scoped, bounded discovery hint for finished Studio GLBs.
 * The durable authenticated job row is the authority for ownership, success,
 * model identity and download permission. Never trust this index by itself. */
export const STUDIO_RECENT_KEY = 'studio-library-recent:v1'
export const STUDIO_RECENT_CAPACITY = 32
export const STUDIO_RECENT_READ_LIMIT = 12

const ID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/
export type RecentStudioEntry = { id: string; completedAt: number }
export type RecentStudioIndex = { revision: 'studio-library-recent-v1'; entries: RecentStudioEntry[] }

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
export function readRecentStudioIndex(value: unknown): RecentStudioIndex | null {
  if (value === undefined) return { revision: 'studio-library-recent-v1', entries: [] }
  if (!record(value) || Object.keys(value).sort().join(',') !== 'entries,revision' ||
      value.revision !== 'studio-library-recent-v1' || !Array.isArray(value.entries) ||
      value.entries.length > STUDIO_RECENT_CAPACITY) return null
  const entries: RecentStudioEntry[] = [], seen = new Set<string>()
  for (const item of value.entries) {
    if (!record(item) || Object.keys(item).sort().join(',') !== 'completedAt,id' ||
        typeof item.id !== 'string' || !ID.test(item.id) || seen.has(item.id) ||
        typeof item.completedAt !== 'number' || !Number.isSafeInteger(item.completedAt) || item.completedAt <= 0) return null
    const entry = { id: item.id, completedAt: item.completedAt }
    const previous = entries.at(-1)
    if (previous && (entry.completedAt > previous.completedAt ||
        entry.completedAt === previous.completedAt && entry.id >= previous.id)) return null
    seen.add(item.id)
    entries.push(entry)
  }
  return { revision: 'studio-library-recent-v1', entries }
}
export function upsertRecentStudioIndex(value: unknown, id: string, completedAt: number): RecentStudioIndex | null {
  const prior = readRecentStudioIndex(value)
  if (!prior || !ID.test(id) || !Number.isSafeInteger(completedAt) || completedAt <= 0) return null
  return { revision: 'studio-library-recent-v1',
    entries: [...prior.entries.filter(item => item.id !== id), { id, completedAt }]
      .sort((a, b) => b.completedAt - a.completedAt || b.id.localeCompare(a.id))
      .slice(0, STUDIO_RECENT_CAPACITY) }
}
