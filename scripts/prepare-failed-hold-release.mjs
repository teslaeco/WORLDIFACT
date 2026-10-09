import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { requireFailedHoldRelease } from './select-failed-hold-release.mjs'
import { buildAiShopUiConfig } from './build-compatible-mcc-config.mjs'

export function buildFailedHoldConfig(base, options) {
  if (options?.failedHoldWaiver !== true || options?.deployAllowed !== false
      || options?.preserveRemoteVars !== true || options?.preserveBilling !== true || options?.preserveSecrets !== true)
    throw new Error('FAILED_HOLD_CONFIG_SCOPE_REQUIRED')
  return buildAiShopUiConfig(base, { ...options, aiShopUi: true })
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 2) throw new Error('Arguments are not allowed.')
    const options = requireFailedHoldRelease()
    const config = buildFailedHoldConfig(JSON.parse(await readFile('wrangler.jsonc', 'utf8')), options)
    await writeFile('.failed-hold-release.wrangler.json', JSON.stringify(config, null, 2) + '\n', { mode: 0o600, flag: 'wx' })
    console.log('Prepared incident Worker/assets config with no declared variables; all bindings and migrations preserved. Deploy only with --keep-vars.')
  } catch {
    console.error('FAILED_HOLD_CONFIG_NOT_VERIFIED: publication stopped; no remote settings were read or changed.')
    process.exitCode = 1
  }
}
