import { readFile, writeFile, appendFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

export const APPROVED_CEILING = 6
// Already activated and verified in run 35189566878. A code hotfix is not
// permission to start another three-hour window or add another attempt.
export const APPROVED_EXPIRES_AT = '2026-09-17T09:23:37.535Z'
/** Never reset the cumulative counter, create an extra slot or submit a job. */
export function approvedStudioConfig(base, status, now = Date.now()) {
  if (base?.name !== 'worldifact' || base.vars?.OPENAI_MODEL !== 'gpt-6-astra' ||
    base.vars.ENABLE_PAID_GENERATION !== 'false' || base.vars.ENABLE_ORACLE_JOBS !== 'false' || base.vars.PUBLIC_PILOT !== 'false' ||
    base.vars.GENERATION_REQUEST_LIMIT !== '0' || base.vars.GENERATION_EXPIRES_AT !== '') throw new Error('Expected reviewed disabled base configuration.')
  const used = status?.allowance?.used
  if (!Number.isSafeInteger(used) || used < 0) return { eligible: false, reason: 'COUNTER_UNAVAILABLE' }
  if (used >= APPROVED_CEILING) return { eligible: false, reason: 'ORIGINAL_ALLOWANCE_USED', used, remaining: 0 }
  const deadline = Date.parse(APPROVED_EXPIRES_AT)
  if (!Number.isFinite(now) || now >= deadline) return { eligible: false, reason: 'ORIGINAL_WINDOW_EXPIRED', used }
  if (status.oracle !== 'CONNECTOR_READY' || status.photoReady !== true) return { eligible: false, reason: 'ORACLE_NOT_READY', used }
  const config = structuredClone(base)
  config.vars = { ...config.vars, ENABLE_STUDIO_JOBS: 'true', ENABLE_PAID_GENERATION: 'false', ENABLE_ORACLE_JOBS: 'false', PUBLIC_PILOT: 'true',
    GENERATION_REQUEST_LIMIT: String(APPROVED_CEILING), GENERATION_EXPIRES_AT: new Date(Math.min(deadline, now + 180 * 60_000)).toISOString() }
  return { eligible: true, used, remaining: APPROVED_CEILING - used, config }
}
async function currentStatus(fetcher = fetch) {
  const response = await fetcher('https://worldifact.xodobrox.workers.dev/api/studio/status', { method: 'GET', redirect: 'manual', credentials: 'omit', signal: AbortSignal.timeout(40_000) })
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) { await response.body?.cancel(); throw new Error('Public Studio readiness is unavailable; do not change the allowance.') }
  const text = await response.text()
  if (text.length > 16000) throw new Error('Oversized readiness response.')
  return JSON.parse(text)
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const status = await currentStatus()
  if (process.argv[2] === 'verify') {
    if (status.ready !== true || status.photoReady !== true || status.allowance?.limit !== APPROVED_CEILING || status.allowance.expiresAt !== APPROVED_EXPIRES_AT) throw new Error('Studio is not ready under the original six-attempt ceiling and original deadline.')
    console.log(JSON.stringify({ ready: true, used: status.allowance.used, remaining: status.allowance.remaining, expiresAt: status.allowance.expiresAt, paidGenerationRequested: false }))
  } else {
    const base = JSON.parse(await readFile('wrangler.jsonc', 'utf8')), result = approvedStudioConfig(base, status)
    if (result.eligible) await writeFile('.studio-approved.wrangler.json', JSON.stringify(result.config, null, 2) + '\n', { mode: 0o600 })
    if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `eligible=${result.eligible}\n`)
    console.log(JSON.stringify({ eligible: result.eligible, reason: result.reason || 'RESUME_UNUSED_APPROVED_SLOTS', used: result.used, remaining: result.remaining, cumulativeCeiling: APPROVED_CEILING, expiresAt: APPROVED_EXPIRES_AT, paidGenerationRequested: false }))
  }
}
