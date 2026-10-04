import { readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

export function dotsReviewConfig(base) {
  if (base.name !== 'worldifact' || !base.assets || !base.compatibility_date) throw new Error('Expected reviewed WORLDIFACT base configuration.')
  // Separate OAuth storage and no production ledger, provider secret or paid route.
  return {
    name: 'worldifact-dots-review', main: base.main,
    compatibility_date: base.compatibility_date, compatibility_flags: base.compatibility_flags,
    assets: structuredClone(base.assets),
    kv_namespaces: [{ binding: 'OAUTH_KV' }],
    ratelimits: [{ name: 'ACCOUNT_LIMITER', namespace_id: '5122028', simple: { limit: 20, period: 60 } }],
    vars: {
      MCP_OAUTH_ENABLED: 'true', MCP_READ_ONLY: 'true',
      MCP_RESOURCE_URL: 'https://worldifact-dots-review.xodobrox.workers.dev/mcp',
      MCP_OAUTH_CLIENT_IDS: base.vars.MCP_OAUTH_CLIENT_IDS,
      MCP_OAUTH_REDIRECT_URIS: base.vars.MCP_OAUTH_REDIRECT_URIS,
      ENABLE_PAID_GENERATION: 'false', ENABLE_ORACLE_JOBS: 'false', ENABLE_STUDIO_JOBS: 'false',
      ENABLE_BILLING: 'false', ENABLE_ASTRA_PLANS: 'false', PUBLIC_PILOT: 'false',
      ENFORCE_ACCOUNT_ENTITLEMENTS: 'true', GENERATION_REQUEST_LIMIT: '0', GENERATION_EXPIRES_AT: '',
    },
    observability: { enabled: false },
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const base = JSON.parse(await readFile('wrangler.jsonc', 'utf8'))
  await writeFile('.dots-review.wrangler.json', JSON.stringify(dotsReviewConfig(base), null, 2) + '\n')
  console.log('Prepared isolated Dots review deployment; no production account ledger or provider credentials.')
}
