import { readFile, writeFile } from 'node:fs/promises'

export const CONTEST_LIVE_CEILING = 50
export const CONTEST_LIVE_EXPIRES_AT = '2026-09-19T07:00:00.000Z'

type WranglerConfig = { name?: string; vars?: Record<string, string>; [key: string]: unknown }

function fail(message: string): never { throw new Error(message) }

export function buildContestLiveConfig(base: WranglerConfig, now = Date.now()): WranglerConfig {
  if (!Number.isFinite(now) || now >= Date.parse(CONTEST_LIVE_EXPIRES_AT)) fail('Contest LIVE window has ended.')
  if (
    base?.name !== 'worldifact' || !base.vars ||
    base.vars.OPENAI_MODEL !== 'gpt-6-astra' ||
    base.vars.ENABLE_PAID_GENERATION !== 'false' ||
    base.vars.PUBLIC_PILOT !== 'false' ||
    base.vars.ENABLE_ORACLE_JOBS !== 'false' ||
    base.vars.GENERATION_REQUEST_LIMIT !== '0' ||
    base.vars.GENERATION_EXPIRES_AT !== ''
  ) fail('Contest LIVE config must be generated from the reviewed disabled production base.')

  const config = structuredClone(base)
  config.vars = {
    ...base.vars,
    ENABLE_PAID_GENERATION: 'true',
    PUBLIC_PILOT: 'true',
    ENABLE_ORACLE_JOBS: 'true',
    ENABLE_STUDIO_JOBS: 'true',
    ENABLE_APPROVED_FAST_TEST: 'false',
    GENERATION_REQUEST_LIMIT: String(CONTEST_LIVE_CEILING),
    GENERATION_EXPIRES_AT: CONTEST_LIVE_EXPIRES_AT,
  }
  return config
}

if (import.meta.url === new URL(process.argv[1], 'file://').href) {
  const base = JSON.parse(await readFile('wrangler.jsonc', 'utf8')) as WranglerConfig
  const config = buildContestLiveConfig(base)
  await writeFile('.contest-live.wrangler.json', JSON.stringify(config, null, 2) + '\n', { mode: 0o600 })
  console.log(`Prepared contest LIVE config: cumulative ceiling=${CONTEST_LIVE_CEILING}, expires=${CONTEST_LIVE_EXPIRES_AT}.`)
  console.log('Astra blueprint, Oracle bridge and Studio generation are public-pilot enabled; the Durable Object counter remains cumulative and never resets.')
}
