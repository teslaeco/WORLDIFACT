import { readFile, writeFile } from 'node:fs/promises'

function fail(message: string): never { throw new Error(message) }

const confirmation = process.env.SHOP_PILOT_CONFIRMATION || ''
const rawLimit = process.env.SHOP_PILOT_REQUEST_LIMIT || ''
const rawMinutes = process.env.SHOP_PILOT_DURATION_MINUTES || ''

if (confirmation !== 'MCP2-SHOP-PILOT') fail('Shop pilot confirmation must equal MCP2-SHOP-PILOT.')
const limit = Number(rawLimit)
const minutes = Number(rawMinutes)
if (!Number.isSafeInteger(limit) || limit !== 6) fail('Shop pilot cumulative request limit must equal exactly 6.')
if (!Number.isSafeInteger(minutes) || minutes < 15 || minutes > 180) fail('Shop pilot duration must be 15-180 minutes.')

const config = JSON.parse(await readFile('wrangler.jsonc', 'utf8')) as { name?: string; vars?: Record<string, string> }
if (
  config.name !== 'worldifact' || !config.vars ||
  config.vars.OPENAI_MODEL !== 'gpt-6-astra' ||
  config.vars.ENABLE_PAID_GENERATION !== 'false' ||
  config.vars.PUBLIC_PILOT !== 'false' ||
  config.vars.ENABLE_ORACLE_JOBS !== 'false' ||
  config.vars.GENERATION_REQUEST_LIMIT !== '0' ||
  config.vars.GENERATION_EXPIRES_AT !== ''
) fail('Shop pilot must be generated from the reviewed disabled production config.')

const expiresAt = new Date(Date.now() + minutes * 60_000).toISOString()
config.vars = {
  ...config.vars,
  ENABLE_PAID_GENERATION: 'false',
  PUBLIC_PILOT: 'true',
  ENABLE_ORACLE_JOBS: 'true',
  GENERATION_REQUEST_LIMIT: String(limit),
  GENERATION_EXPIRES_AT: expiresAt,
}

await writeFile('.shop-pilot.wrangler.json', JSON.stringify(config, null, 2) + '\n', { mode: 0o600 })
console.log(`Prepared MCP2 Shop pilot: cumulative ceiling=${limit}, expires=${expiresAt}, paid blueprint=false, Oracle jobs=true.`)
console.log('The Durable Object counter remains cumulative. Raising the reviewed ceiling from 5 to 6 permits exactly one additional paid REAL 3D job; it does not reset prior usage.')
