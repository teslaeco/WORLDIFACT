import { isStudioExecution, type StudioExecution } from '../src/lib/studioExecution.ts'
import { MODEL_CATALOG } from '../src/lib/modelCatalog.ts'
import { isStudioPricing, type StudioPricing } from '../src/lib/studioPricing.ts'

/** Internal Oracle evidence, never a browser-supplied price or an API invoice. */
export interface TerminalBudgetReceipt {
  revision: 'worldifact-terminal-budget-v1'
  jobId: string
  model: 'gpt-6-astra' | 'gpt-6.1-sol' | 'gpt-6-luna'
  policyRevision: 'astra-low-reconciled-v2' | 'astra-low-tiered-v1' | 'studio-model-budget-v1:standard' | 'studio-model-budget-v1:fast'
  capMicroUsd: 1750000 | 2000000 | 4000000 | 350000 | 100000
  maximumLiabilityMicroUsd: number
  sealed: true
  sealId: string
}

const JOB_ID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/
const FIELDS = ['revision', 'jobId', 'model', 'policyRevision', 'capMicroUsd', 'maximumLiabilityMicroUsd', 'sealed', 'sealId']

/** Validate bounded authenticated Oracle evidence. null requires historical terms;
 * a pricing object requires that exact stored tier. Omitted terms validate only
 * the receipt format: account reconciliation must also bind it to its own job. */
export function validateTerminalBudgetReceipt(value: unknown, expectedJobId: string, expectedPricing?: StudioPricing | null, execution?: StudioExecution): value is TerminalBudgetReceipt {
  if (!value || typeof value !== 'object' || Array.isArray(value) || typeof expectedJobId !== 'string' || !JOB_ID.test(expectedJobId)) return false
  const receipt = value as Record<string, unknown>
  const legacy = receipt.policyRevision === 'astra-low-reconciled-v2' && receipt.capMicroUsd === 1750000
  const tiered = receipt.policyRevision === 'astra-low-tiered-v1' && (receipt.capMicroUsd === 2000000 || receipt.capMicroUsd === 4000000)
  const modelBound = ['studio-model-budget-v1:standard', 'studio-model-budget-v1:fast'].includes(String(receipt.policyRevision)) && Object.values(MODEL_CATALOG).some(m => m.model === receipt.model && m.maxProviderCents * 10000 === receipt.capMicroUsd)
  if (execution !== undefined && (!isStudioExecution(execution) || !modelBound || receipt.model !== MODEL_CATALOG[execution.model].model || receipt.policyRevision !== `studio-model-budget-v1:${execution.mode}` || receipt.capMicroUsd !== MODEL_CATALOG[execution.model].maxProviderCents * 10000 || expectedPricing)) return false
  if (execution === undefined && expectedPricing !== undefined && modelBound) return false
  if (!modelBound && receipt.model !== 'gpt-6-astra') return false
  if (!legacy && !tiered && !modelBound || expectedPricing === null && !legacy && execution === undefined || expectedPricing !== undefined && expectedPricing !== null &&
      (!isStudioPricing(expectedPricing) || !tiered || receipt.capMicroUsd !== expectedPricing.maxProviderCents * 10_000)) return false
  return Object.keys(receipt).length === FIELDS.length && Object.keys(receipt).every(key => FIELDS.includes(key)) &&
    receipt.revision === 'worldifact-terminal-budget-v1' && receipt.jobId === expectedJobId && receipt.sealed === true &&
    typeof receipt.maximumLiabilityMicroUsd === 'number' && Number.isSafeInteger(receipt.maximumLiabilityMicroUsd) &&
    receipt.maximumLiabilityMicroUsd >= 0 && receipt.maximumLiabilityMicroUsd <= Number(receipt.capMicroUsd) &&
    typeof receipt.sealId === 'string' && /^[a-f0-9]{64}$/.test(receipt.sealId)
}
