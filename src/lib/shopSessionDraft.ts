import type { DraftModel } from './modelCatalog.ts'
import type { BlueprintDelivery } from './blueprintRequest.ts'
import type { StudioBudgetTier } from './studioPricing.ts'
import { FAST_DRAFT_PROFILE, type GenerationProfile, type StudioInput, type TextureLimit } from './studioProtocol.ts'

export const SHOP_SESSION_DRAFT_KEY = 'worldifact:shop-session-draft:v1'
type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
export type ShopSessionDraft = {
  prompt: string
  profile: GenerationProfile
  cheapModel: DraftModel
  deliverable: BlueprintDelivery
  purpose: StudioInput['purpose']
  textureLimit: TextureLimit
  budgetTier: StudioBudgetTier
  referenceCount: number
}
const fields = ['prompt', 'profile', 'cheapModel', 'deliverable', 'purpose', 'textureLimit', 'budgetTier', 'referenceCount'] as const
// Preserve over-limit text for editing, without accepting unbounded storage input.
const MAX_STORED_PROMPT = 100_000
const invalidated = new WeakSet<DraftStorage>()

export function shopSessionStorage(): DraftStorage | null {
  const browser = globalThis as { window?: { sessionStorage?: DraftStorage } }
  try { return browser.window?.sessionStorage ?? null } catch { return null }
}
function validDraft(value: unknown): value is ShopSessionDraft {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const draft = value as Record<string, unknown>
  return Object.keys(draft).length === fields.length && fields.every(key => key in draft) &&
    typeof draft.prompt === 'string' && draft.prompt.length <= MAX_STORED_PROMPT &&
    ['standard', FAST_DRAFT_PROFILE].includes(draft.profile as string) &&
    ['sol', 'luna'].includes(draft.cheapModel as string) &&
    ['procedural-blueprint', 'detailed-mesh'].includes(draft.deliverable as string) &&
    ['figurine', 'game', 'terrain', 'object'].includes(draft.purpose as string) &&
    [2048, 4096, 8192].includes(draft.textureLimit as number) &&
    ['standard', 'extended'].includes(draft.budgetTier as string) &&
    Number.isInteger(draft.referenceCount) && Number(draft.referenceCount) >= 0 && Number(draft.referenceCount) <= 4
}
export function clearShopSessionDraft(storage: DraftStorage | null): boolean {
  if (!storage) return false
  invalidated.add(storage)
  try { storage.removeItem(SHOP_SESSION_DRAFT_KEY); invalidated.delete(storage); return true } catch { return false }
}
export function readShopSessionDraft(storage: DraftStorage | null, accountOwner: string): { draft: ShopSessionDraft | null; unavailable: boolean } {
  if (!storage || invalidated.has(storage)) return { draft: null, unavailable: true }
  try {
    const raw = storage.getItem(SHOP_SESSION_DRAFT_KEY)
    if (!raw) return { draft: null, unavailable: false }
    if (raw.length > MAX_STORED_PROMPT * 6 + 2048) throw new Error('Invalid session draft')
    const saved = JSON.parse(raw)
    if (!saved || Object.keys(saved).length !== 3 || saved.version !== 1 || saved.accountOwner !== accountOwner || !accountOwner || !validDraft(saved.draft)) {
      return { draft: null, unavailable: !clearShopSessionDraft(storage) }
    }
    return { draft: saved.draft, unavailable: false }
  } catch { return { draft: null, unavailable: !clearShopSessionDraft(storage) } }
}
export function saveShopSessionDraft(storage: DraftStorage | null, accountOwner: string, draft: ShopSessionDraft): boolean {
  if (!storage) return false
  // Copy only editable inputs. Never store receipts, credentials, image bytes or consent.
  const safe = Object.fromEntries(fields.map(key => [key, draft[key]]))
  if (!accountOwner || !validDraft(safe)) { clearShopSessionDraft(storage); return false }
  try {
    storage.setItem(SHOP_SESSION_DRAFT_KEY, JSON.stringify({ version: 1, accountOwner, draft: safe }))
    invalidated.delete(storage)
    return true
  } catch { clearShopSessionDraft(storage); return false }
}

/** Called only after successful session verification, including outside Shop. */
export function reconcileShopSessionAccount(storage: DraftStorage | null, accountOwner: string | null): void {
  if (accountOwner) readShopSessionDraft(storage, accountOwner)
  else clearShopSessionDraft(storage)
}
