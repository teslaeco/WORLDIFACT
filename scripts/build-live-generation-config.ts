import { readFile, writeFile } from 'node:fs/promises'

type WranglerConfig = { name?: string; vars?: Record<string, string>; [key: string]: unknown }

function fail(message: string): never { throw new Error(message) }

export function buildLiveGenerationConfig(base: WranglerConfig): WranglerConfig {
  if (
    base?.name !== 'worldifact' || !base.vars ||
    base.vars.OPENAI_MODEL !== 'gpt-6-astra' ||
    base.vars.ENABLE_PAID_GENERATION !== 'false' ||
    base.vars.PUBLIC_PILOT !== 'false' ||
    base.vars.ENABLE_ORACLE_JOBS !== 'false' ||
    base.vars.GENERATION_REQUEST_LIMIT !== '0' ||
    base.vars.GENERATION_EXPIRES_AT !== ''
  ) fail('Ongoing LIVE config must be generated from the reviewed disabled production base.')

  const config = structuredClone(base)
  config.vars = {
    ...base.vars,
    ENABLE_PAID_GENERATION: 'true',
    PUBLIC_PILOT: 'true',
    ENABLE_ORACLE_JOBS: 'true',
    ENABLE_STUDIO_JOBS: 'true',
    ENABLE_APPROVED_FAST_TEST: 'false',
    GENERATION_REQUEST_LIMIT: 'unlimited',
    GENERATION_EXPIRES_AT: '',
  }
  return config
}

if (import.meta.url === new URL(process.argv[1], 'file://').href) {
  const base = JSON.parse(await readFile('wrangler.jsonc', 'utf8')) as WranglerConfig
  const config = buildLiveGenerationConfig(base)
  await writeFile('.live-generation.wrangler.json', JSON.stringify(config, null, 2) + '\n', { mode: 0o600 })
  console.log('Prepared ongoing LIVE generation config with no application-level cumulative attempt quota or launch-date expiry.')
  console.log('Per-IP rate limiting, request validation, timeouts, signed Studio receipts, idempotency and worker safety guards remain active.')
}
