import { readFile, writeFile } from 'node:fs/promises'

function fail(message: string): never { throw new Error(message) }
const confirmation = process.env.PILOT_CONFIRMATION || ''
const rawLimit = process.env.PILOT_REQUEST_LIMIT || ''
const rawMinutes = process.env.PILOT_DURATION_MINUTES || ''
const oracleJobs = process.env.PILOT_ORACLE_JOBS || 'false'
if (confirmation !== 'ASTRA-PILOT') fail('Pilot confirmation must equal ASTRA-PILOT.')
const limit = Number(rawLimit), minutes = Number(rawMinutes)
if (!Number.isSafeInteger(limit) || limit < 1 || limit > 5) fail('Pilot absolute request limit must be 1-5.')
if (!Number.isSafeInteger(minutes) || minutes < 15 || minutes > 360) fail('Pilot duration must be 15-360 minutes.')
if (!['true', 'false'].includes(oracleJobs)) fail('PILOT_ORACLE_JOBS must be true or false.')
const config = JSON.parse(await readFile('wrangler.jsonc', 'utf8')) as { name?: string; vars?: Record<string, string> }
if (config.name !== 'worldifact' || !config.vars || config.vars.OPENAI_MODEL !== 'gpt-6-astra' ||
    config.vars.ENABLE_PAID_GENERATION !== 'false' || config.vars.PUBLIC_PILOT !== 'false' ||
    config.vars.ENABLE_ORACLE_JOBS !== 'false' || config.vars.GENERATION_REQUEST_LIMIT !== '0' || config.vars.GENERATION_EXPIRES_AT !== '')
  fail('Pilot must be generated from the reviewed disabled production config.')
const expiresAt = new Date(Date.now() + minutes * 60_000).toISOString()
config.vars = {
  ...config.vars,
  ENABLE_PAID_GENERATION: 'true',
  PUBLIC_PILOT: 'true',
  ENABLE_ORACLE_JOBS: oracleJobs,
  GENERATION_REQUEST_LIMIT: String(limit),
  GENERATION_EXPIRES_AT: expiresAt,
}
await writeFile('.pilot.wrangler.json', JSON.stringify(config, null, 2) + '\n', { mode: 0o600 })
console.log(`Prepared hard-capped public Astra pilot: absolute ceiling=${limit}, expires=${expiresAt}, Oracle jobs=${oracleJobs}.`)
console.log('The Durable Object counter is cumulative across deployments; raising the ceiling later is an explicit operator action.')
