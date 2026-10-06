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
    if (process.argv.length !== 2) throw new Error('COMPATIBLE_MCC_ARGUMENTS_NOT_ALLOWED')
    const options = selectPipelineReleaseOptions()
    const config = buildCompatibleMccConfig(JSON.parse(await readFile('wrangler.jsonc', 'utf8')), options)
    await writeFile('.compatible-mcc.wrangler.json', JSON.stringify(config, null, 2) + '\n', { mode: 0o600 })
    console.log('Prepared compatible UI rollback config without declared vars; deploy only with --keep-vars. Existing bindings and migrations are unchanged.')
  } catch {
    console.error('COMPATIBLE_MCC_CONFIG_NOT_VERIFIED: publication stopped; no remote settings or secrets were read or changed.')
    process.exitCode = 1
  }
}
