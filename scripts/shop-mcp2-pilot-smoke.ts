function requireCheck(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const base = process.env.WORLDIFACT_URL || 'https://worldifact.xodobrox.workers.dev'
const origin = new URL(base).origin

const healthResponse = await fetch(new URL('/api/health', origin), {
  headers: { 'Cache-Control': 'no-cache' }, redirect: 'error', signal: AbortSignal.timeout(15_000),
})
requireCheck(healthResponse.ok, 'WORLDIFACT health endpoint failed.')
const health = await healthResponse.json() as Record<string, unknown>
requireCheck(health.mode === 'DEMO' && health.generationReady === false,
  'Paid blueprint generation must remain disabled during the one-slot Shop pilot.')

const oracleResponse = await fetch(new URL('/api/oracle/jobs/status', origin), {
  headers: { 'Cache-Control': 'no-cache' }, redirect: 'error', signal: AbortSignal.timeout(15_000),
})
requireCheck(oracleResponse.ok, 'Oracle Shop pilot status endpoint failed.')
const oracle = await oracleResponse.json() as Record<string, unknown>
requireCheck(
  oracle.mode === 'PUBLIC_PILOT' &&
  oracle.prompt === 'SUPPORTED' &&
  oracle.image === 'BLOCKED_UNVERIFIED' &&
  oracle.artifactRead === 'PUBLIC_PILOT' &&
  oracle.budget === 'SHARED_HARD_CAP' &&
  oracle.requiredConnectorVersion === 33,
  'MCP2 Shop pilot is not armed with the reviewed prompt-only hard-capped contract.',
)

const serialized = JSON.stringify(oracle)
requireCheck(!serialized.includes('trycloudflare.com') && !serialized.includes('Bearer') && !serialized.includes('sk-'),
  'Public status leaked connector or secret material.')

console.log('MCP2 Shop pilot smoke PASS: blueprint paid path is OFF; prompt-only Oracle/Blender public pilot is hard-capped and ready. No paid generation was requested.')
