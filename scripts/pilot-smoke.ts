import { appendFile, readFile } from 'node:fs/promises'
import { readDeployment } from './release-check.ts'

function requireCheck(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}
const output = process.env.WRANGLER_OUTPUT_FILE_PATH
requireCheck(output, 'WRANGLER_OUTPUT_FILE_PATH is required.')
const deployment = readDeployment(await readFile(output, 'utf8'))
const healthResponse = await fetch(new URL('/api/health', deployment.origin), {
  headers: { 'Cache-Control': 'no-cache' }, redirect: 'error', signal: AbortSignal.timeout(15_000),
})
requireCheck(healthResponse.ok && healthResponse.headers.get('content-type')?.includes('application/json'), 'Pilot health endpoint failed.')
const health = await healthResponse.json() as Record<string, unknown>
requireCheck(health.mode === 'READY' && health.generationReady === true && health.publicPilot === true &&
  health.accessRequired === false && health.model === 'gpt-6-astra', 'Pilot is not READY as a public hard-capped Astra flow.')
const oracleResponse = await fetch(new URL('/api/oracle/jobs/status', deployment.origin), {
  headers: { 'Cache-Control': 'no-cache' }, redirect: 'error', signal: AbortSignal.timeout(15_000),
})
requireCheck(oracleResponse.ok, 'Oracle job safety status endpoint failed.')
const oracle = await oracleResponse.json() as Record<string, unknown>
requireCheck(['BLOCKED', 'OWNER_ONLY'].includes(String(oracle.mode)) && oracle.image === 'BLOCKED_UNVERIFIED', 'Unexpected Oracle write safety status.')
console.log(`PASS: public Astra pilot is READY at ${deployment.origin}; no generation request was sent.`)
console.log(`Cloudflare version: ${deployment.versionId}; Oracle write mode: ${oracle.mode}.`)
if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `url=${deployment.origin}\n`)
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY,
  `## WORLDIFACT Astra pilot armed\n\n[Open AI Game Lab](${deployment.origin}/lab)\n\n` +
  `Cloudflare version: \`${deployment.versionId}\`\n\n` +
  `Health reports public GPT-6 Astra READY with no login/access-code requirement. This smoke sent no paid generation request. Oracle prompt jobs: ${oracle.mode}; image-to-Oracle: BLOCKED_UNVERIFIED.\n`)
