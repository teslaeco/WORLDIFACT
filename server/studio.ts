import { oracleOrigin, ownerAuthorized, type PlatformEnv } from './platform.ts'
import { getVerifiedAccount, type AccountEnv } from './accounts.ts'
import { reserveUserGeneration, settleUserGeneration, userJobAccess, EntitlementError, type EntitlementEnv } from './entitlements.ts'
import { budgetSettings, APPROVED_FAST_TEST, type BudgetEnv, type BudgetNamespace } from './budget.ts'
import { inputDigest, oracleStudioPayload, validateStudioInput, supportsFastDraft, FAST_DRAFT_PROFILE, STUDIO_BODY_LIMIT, STUDIO_MODEL_LIMIT, JOB_DETAILS, type StudioInput, type StudioJob } from '../src/lib/studioProtocol.ts'

export interface StudioEnv extends PlatformEnv, BudgetEnv, AccountEnv, EntitlementEnv { PUBLIC_PILOT?: string; ENABLE_STUDIO_JOBS?: string; GENERATION_BUDGET?: BudgetNamespace }
const UUID = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}'
const RECEIPT = new RegExp(`^(${UUID})\\.([0-9]{13})\\.([a-f0-9]{64})\\.([a-f0-9]{64})$`)
const EXPORTS: Record<string, { name: string; type: string; limit: number }> = {
  pbr: { name: 'textures-pbr.zip', type: 'application/zip', limit: 512 * 1024 * 1024 },
  fbx: { name: 'model.fbx', type: 'application/octet-stream', limit: 512 * 1024 * 1024 },
  blend: { name: 'model.blend', type: 'application/octet-stream', limit: 512 * 1024 * 1024 },
}
class StudioError extends Error { readonly status: number; constructor(message: string, status = 400) { super(message); this.status = status } }