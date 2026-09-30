/** Owner-requested restoration of the existing account-bound mesh workflow.
 * A fresh authenticated GET verifies the installed limits before activation.
 * Never raises a budget, replays a failed job or performs an AI/payment call.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { checkDetailedRuntime } from './check-detailed-studio-runtime.mjs'

export function restoreDetailedConfig(config, evidence) {
  const v = config?.vars
  if (config?.name !== 'worldifact' || v?.ENABLE_PAID_GENERATION !== 'true' || v.PUBLIC_PILOT !== 'true' ||
      v.ENFORCE_ACCOUNT_ENTITLEMENTS !== 'true' || v.ENABLE_ASTRA_PLANS !== 'true' ||
      v.ENABLE_STUDIO_JOBS !== 'false' || v.ENABLE_ORACLE_JOBS !== 'false' ||
      v.OPENAI_MODEL !== 'gpt-6-astra' || v.ENABLE_APPROVED_FAST_TEST !== 'false')
    throw new Error('DETAILED_RESTORE_REQUIRES_REVIEWED_ACCOUNT_CONFIG')
  if (evidence?.verifiedForGuardedRouting !== true || evidence.runtime !== 'VERIFIED' ||
      evidence.model !== 'gpt-6-astra' || evidence.revision !== 'astra-usd175-v1' || evidence.maxProviderUsdPerJob !== 1.75 ||
      evidence.detailed?.costGuardReady !== true || evidence.detailed.outputPolicyReady !== true ||
      evidence.detailed.photoInput !== true || evidence.detailed.promptMaxLength !== 5000)
    throw new Error('DETAILED_RESTORE_REQUIRES_CURRENT_RUNTIME_PROOF')
  const next = structuredClone(config)
  next.vars.ENABLE_STUDIO_JOBS = 'true'
  return next
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv[2] !== '.live-generation.wrangler.json') throw new Error('INVALID_CONFIG_PATH')
    const config = JSON.parse(await readFile(process.argv[2], 'utf8'))
    const evidence = await checkDetailedRuntime(process.env)
    const restored = restoreDetailedConfig(config, evidence)
    await writeFile(process.argv[2], JSON.stringify(restored, null, 2) + '\n', { mode: 0o600 })
    console.log('VERIFIED: account-bound Astra/Blender route restored with existing USD1.75 job guard, low-reasoning output policy and four reference views. Anonymous Oracle writes remain disabled. No job, AI call, charge or budget reset was performed; live visual quality remains UNVERIFIED.')
  } catch { console.error('DETAILED_RESTORE_NOT_VERIFIED: publication stopped; no generation requested.'); process.exitCode = 1 }
}
