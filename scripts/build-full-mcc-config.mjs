import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Always deploy this result with --keep-vars. The sole reviewed overwrite is
// necessary because the historical server rejects the later gpt-6.1-sol model.
export function buildFullMccConfig(base) {
  if (base?.name !== 'worldifact' || base.main !== 'server/worker.ts' ||
      base.vars?.OPENAI_FAST_MODEL !== 'gpt-6-sol' ||
      !Array.isArray(base.durable_objects?.bindings) || !Array.isArray(base.migrations) || base.env)
    throw new Error('FULL_MCC_CONFIG_NOT_REVIEWED')
  const omitVars = value => Array.isArray(value) ? value.map(omitVars)
    : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value)
      .filter(([key]) => key !== 'vars').map(([key, item]) => [key, omitVars(item)])) : value
  const config = omitVars(base)
  config.vars = { OPENAI_FAST_MODEL: 'gpt-6-sol' }
  return config
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 2) throw new Error('Arguments are not accepted.')
    const config = buildFullMccConfig(JSON.parse(await readFile('wrangler.jsonc', 'utf8')))
    // Generated config lives under the existing ignored .wrangler directory.
    // Resolve only file paths relative to that location; bindings/migrations are unchanged.
    config.$schema = '../node_modules/wrangler/config-schema.json'
    config.main = '../server/worker.ts'
    config.assets.directory = '../dist'
    await mkdir('.wrangler', { recursive: true })
    await writeFile('.wrangler/full-mcc.wrangler.json', JSON.stringify(config, null, 2) + '\n', { mode: 0o600 })
    console.log('Prepared review-only full restoration config. OPENAI_FAST_MODEL=gpt-6-sol is the only variable overwrite. Publication requires --keep-vars and an independently approved cutover gate.')
  } catch (error) { console.error(`FULL_MCC_CONFIG_BLOCKED: ${error.message}`); process.exitCode = 1 }
}
