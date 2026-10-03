/** Internal Oracle evidence, never a browser-supplied price or an API invoice. */
export interface TerminalBudgetReceipt {
  revision: 'worldifact-terminal-budget-v1'
  jobId: string
  model: 'gpt-6-astra'
  policyRevision: 'astra-low-reconciled-v2'
  capMicroUsd: 1750000
  maximumLiabilityMicroUsd: number
  sealed: true
  sealId: string
}

const JOB_ID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/
const FIELDS = ['revision', 'jobId', 'model', 'policyRevision', 'capMicroUsd', 'maximumLiabilityMicroUsd', 'sealed', 'sealId']

/** Validate the exact, bounded receipt fetched by the Worker from its authenticated Oracle. */
export function validateTerminalBudgetReceipt(value: unknown, expectedJobId: string): value is TerminalBudgetReceipt {
  if (!value || typeof value !== 'object' || Array.isArray(value) || typeof expectedJobId !== 'string' || !JOB_ID.test(expectedJobId)) return false
  const receipt = value as Record<string, unknown>
  return Object.keys(receipt).length === FIELDS.length && Object.keys(receipt).every(key => FIELDS.includes(key)) &&
    receipt.revision === 'worldifact-terminal-budget-v1' && receipt.jobId === expectedJobId && receipt.model === 'gpt-6-astra' &&
    receipt.policyRevision === 'astra-low-reconciled-v2' && receipt.capMicroUsd === 1750000 && receipt.sealed === true &&
    typeof receipt.maximumLiabilityMicroUsd === 'number' && Number.isSafeInteger(receipt.maximumLiabilityMicroUsd) &&
    receipt.maximumLiabilityMicroUsd >= 0 && receipt.maximumLiabilityMicroUsd <= receipt.capMicroUsd &&
    typeof receipt.sealId === 'string' && /^[a-f0-9]{64}$/.test(receipt.sealId)
}
