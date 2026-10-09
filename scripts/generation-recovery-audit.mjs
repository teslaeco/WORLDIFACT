/** GET-only evidence collection. Never calls a generation, billing or account route. */
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const PUBLIC_ORIGIN = 'https://worldifact.xodobrox.workers.dev'
export const AUDIT_PATHS = Object.freeze(['/', '/shop', '/lab', '/api/health', '/api/studio/status'])
const BODY_LIMIT = 65_536
const flags = ['ready', 'generationReady', 'detailedReady', 'costGuardReady', 'photoReady', 'fastReady', 'tiersReady']
const enums = {
  mode: ['READY', 'LIVE', 'DEMO', 'BLOCKED'],
  reason: ['READY', 'BLOCKED', 'NOT_CONFIGURED', 'ORACLE_UNAVAILABLE', 'PROVIDER_BUDGET_EXHAUSTED'],
  oracle: ['CONNECTOR_READY', 'NOT_CONFIGURED', 'UNAVAILABLE'],
  newJobPolicy: ['legacy-usd175-v1', 'tiered-v1'],
}
export function summarizePublicStatus(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { jsonShape: 'INVALID' }
  const result = { jsonShape: 'OBJECT' }
  for (const key of flags) if (typeof value[key] === 'boolean') result[key] = value[key]
  for (const [key, allowed] of Object.entries(enums)) if (Object.hasOwn(value, key)) result[key] = allowed.includes(value[key]) ? value[key] : 'UNRECOGNIZED'
  return result
}
async function boundedJson(response) {
  const reader = response.body?.getReader()
  if (!reader) throw new Error('EMPTY_BODY')
  let length = 0, text = ''
  const decoder = new TextDecoder()
  try {
    for (;;) {
      const next = await reader.read()
      if (next.done) break
      length += next.value.byteLength
      if (length > BODY_LIMIT) throw new Error('BODY_LIMIT')
      text += decoder.decode(next.value, { stream: true })
    }
    return JSON.parse(text + decoder.decode())
  } finally { await reader.cancel().catch(() => {}) }
}
export async function collectPublicRuntimeEvidence(fetcher = fetch) {
  const results = []
  for (const path of AUDIT_PATHS) {
    let response
    try {
      response = await fetcher(PUBLIC_ORIGIN + path, { method: 'GET', redirect: 'error', credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(20_000), headers: { Accept: path.startsWith('/api/') ? 'application/json' : 'text/html' } })
      const mime = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
      const row = { path, status: response.status, expectedContentType: mime === (path.startsWith('/api/') ? 'application/json' : 'text/html') }
      if (path.startsWith('/api/') && row.expectedContentType) {
        try { row.publicStatus = summarizePublicStatus(await boundedJson(response)) }
        catch { row.publicStatus = { read: 'INVALID_OR_UNAVAILABLE' } }
      }
      results.push(row)
    } catch { results.push({ path, read: 'UNAVAILABLE', diagnosis: 'Network, timeout or redirect; not proof the service is down.' }) }
    finally { if (response?.body && !response.body.locked) await response.body.cancel().catch(() => {}) }
  }
  return { checkedAt: new Date().toISOString(), method: 'GET_ONLY', authenticatedAccountChecked: false, generationRequested: false, paidGenerationVerified: false, results }
}
export function repositoryInventory(cwd = process.cwd()) {
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
  const paths = git('ls-files', '-z').split('\0').filter(Boolean)
  const groups = {}
  for (const path of paths) { const group = path.includes('/') ? path.split('/')[0] : '(root)'; groups[group] = (groups[group] || 0) + 1 }
  return { head: git('rev-parse', 'HEAD').trim(), tree: git('rev-parse', 'HEAD^{tree}').trim(), trackedFiles: paths.length, groups, coverage: 'Inventory is not a line-by-line review or a successful generation test.' }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const output = resolve(process.argv[2] || 'audit-evidence')
  mkdirSync(output, { recursive: true })
  writeFileSync(resolve(output, 'repository.json'), JSON.stringify(repositoryInventory(), null, 2) + '\n')
  const evidence = await collectPublicRuntimeEvidence()
  writeFileSync(resolve(output, 'public-runtime.json'), JSON.stringify(evidence, null, 2) + '\n')
  console.log(JSON.stringify(evidence, null, 2))
}
