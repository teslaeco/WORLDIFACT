import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { selectPipelineReleaseOptions } from './select-pipeline-only-release.mjs'

/** --keep-vars preserves only variables omitted from the submitted config.
 * Keep every non-variable binding and migration byte-for-byte equivalent in
 * JSON while removing all declared vars, including environment overrides.
 */
export function buildCompatibleMccConfig(base, options) {
  if (options?.compatibleMccRollback !== true || options?.preserveBilling !== true || options?.preserveRemoteVars !== true)
    throw new Error('COMPATIBLE_MCC_SCOPE_REQUIRED')
  return omitDeclaredVars(base)
}

export function buildSubscriptionUpgradeConfig(base, options) {
  if (options?.subscriptionUpgradeRepair !== true || options?.preserveBilling !== true || options?.preserveRemoteVars !== true || options?.preserveSecrets !== true)
    throw new Error('SUBSCRIPTION_UPGRADE_SCOPE_REQUIRED')
  return omitDeclaredVars(base)
}

export function buildAccountPurchaseEvidenceConfig(base, options) {
  if (options?.accountPurchaseEvidence !== true || options?.preserveBilling !== true || options?.preserveRemoteVars !== true || options?.preserveSecrets !== true)
    throw new Error('ACCOUNT_PURCHASE_EVIDENCE_SCOPE_REQUIRED')
  return omitDeclaredVars(base)
}

export function buildOwnerReserveAdjustmentConfig(base, options) {
  if (options?.ownerReserveAdjustment !== true || options?.preserveBilling !== true || options?.preserveRemoteVars !== true || options?.preserveSecrets !== true)
    throw new Error('OWNER_RESERVE_ADJUSTMENT_SCOPE_REQUIRED')
  return omitDeclaredVars(base)
}

function omitDeclaredVars(base) {
  if (base?.name !== 'worldifact' || base.main !== 'server/worker.ts' || !base.vars ||
      !Array.isArray(base.durable_objects?.bindings) || !Array.isArray(base.migrations))
    throw new Error('COMPATIBLE_MCC_CONFIG_NOT_REVIEWED')
  const omitVars = value => Array.isArray(value) ? value.map(omitVars)
    : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value)
      .filter(([key]) => key !== 'vars').map(([key, item]) => [key, omitVars(item)])) : value
  return omitVars(base)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const subscriptionUpgrade = process.argv.length === 3 && process.argv[2] === '--subscription-upgrade-repair'
    const accountPurchaseEvidence = process.argv.length === 3 && process.argv[2] === '--account-purchase-evidence'
    const ownerReserveAdjustment = process.argv.length === 3 && process.argv[2] === '--owner-reserve-adjustment'
    if (process.argv.length !== 2 && !subscriptionUpgrade && !accountPurchaseEvidence && !ownerReserveAdjustment) throw new Error('PRESERVING_RELEASE_ARGUMENTS_NOT_ALLOWED')
    const options = selectPipelineReleaseOptions()
    const buildConfig = ownerReserveAdjustment ? buildOwnerReserveAdjustmentConfig : accountPurchaseEvidence ? buildAccountPurchaseEvidenceConfig : subscriptionUpgrade ? buildSubscriptionUpgradeConfig : buildCompatibleMccConfig
    const config = buildConfig(JSON.parse(await readFile('wrangler.jsonc', 'utf8')), options)
    const path = ownerReserveAdjustment ? '.owner-reserve-adjustment.wrangler.json' : accountPurchaseEvidence ? '.account-purchase-evidence.wrangler.json' : subscriptionUpgrade ? '.subscription-upgrade.wrangler.json' : '.compatible-mcc.wrangler.json'
    await writeFile(path, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 })
    console.log(`Prepared ${ownerReserveAdjustment ? 'owner reserve adjustment' : accountPurchaseEvidence ? 'account purchase evidence' : subscriptionUpgrade ? 'subscription upgrade repair' : 'compatible UI rollback'} config without declared vars; deploy only with --keep-vars. Existing bindings and migrations are unchanged.`)
  } catch {
    console.error('PRESERVING_RELEASE_CONFIG_NOT_VERIFIED: publication stopped; no remote settings or secrets were read or changed.')
    process.exitCode = 1
  }
}
