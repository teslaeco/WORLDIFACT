import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { lstat, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const HISTORICAL_COMMIT = '58e04843cee9afa5f7a8427edf853fe3986f6d45'
export const HISTORICAL_TREE = 'b4a31ba454d744ace4e9625077d6c2f1e8517812'
export const BASE_COMMIT = '29b6b9af08d62baafddceb029652db321ec83273'
export const RELEASE_MARKER = 'ops/FULL_MCC_RESTORE_RELEASE_20261006.json'
export const SOURCE_EXCEPTIONS = Object.freeze([
  'server/entitlements.ts', 'server/billing.ts', 'server/budget.ts', 'server/historicalDataBoundary.ts', 'server/worker.ts',
  'src/lib/studioClient.ts', 'src/lib/studioArchive.ts', 'src/lib/archive.ts',
  'tests/historical-data-boundary.test.ts', 'tests/historical-browser-storage.test.mjs',
  'tests/historical-cutover-protocol.test.ts', 'tests/historical-cutover-native.test.mjs',
  'tests/fixtures/pre-rollback-do-routing.json',
  'tests/affordable-models.test.ts', 'tests/approved-fast-test.test.ts', 'tests/budget.test.ts',
  'tests/paid-provider-budget.test.ts', 'tests/payment-ledger.test.ts',
  'tests/studio-accounts.test.ts', 'tests/studio-api.test.ts',
  'tests/core.test.ts', 'tests/p0-astra.test.ts',
  '.github/workflows/cloudflare.yml', 'scripts/check-full-mcc-source.mjs',
  'scripts/check-full-mcc-cutover.mjs', 'scripts/build-full-mcc-config.mjs',
  'scripts/check-full-mcc-release.mjs', 'tests/full-mcc-release.test.mjs',
  'docs/FULL_MCC_RESTORATION.md', 'tests/live-generation-config.test.mjs', RELEASE_MARKER,
])
export const hash = value => createHash('sha256').update(value).digest('hex')
const git = (root, ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 })
export function gitTree(root, revision) {
  return new Map(git(root, 'ls-tree', '-rz', '--full-tree', revision).split('\0').filter(Boolean).map(line => {
    const match = /^(\d{6}) (blob) ([0-9a-f]{40})\t(.+)$/.exec(line)
    if (!match) throw new Error('Source trees must contain only ordinary Git blobs.')
    return [match[4], { mode: match[1], oid: match[3] }]
  }))
}
export function compareSourceTrees(historical, candidate) {
  const allowed = new Set(SOURCE_EXCEPTIONS), exceptions = [], violations = []
  for (const path of [...new Set([...historical.keys(), ...candidate.keys()])].sort()) {
    const before = historical.get(path), after = candidate.get(path)
    if (after && !['100644', '100755'].includes(after.mode)) violations.push({ path, reason: 'non-regular source file' })
    if (before?.mode === after?.mode && before?.oid === after?.oid) continue
    const change = { path, historical: before ?? null, candidate: after ?? null }
    if (allowed.has(path)) exceptions.push(change)
    else violations.push(change)
  }
  // The one canonical review marker is excluded solely to avoid a recursive hash.
  // Its approval fields are validated independently immediately before publication.
  const entries = [...candidate].filter(([path]) => path !== RELEASE_MARKER).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
  return { sourceSnapshotSha256: hash(JSON.stringify(entries)), historicalFiles: historical.size, candidateFiles: candidate.size, exceptions, violations }
}
export async function checkFullMccSource({ root = process.cwd(), committed = false } = {}) {
  if (git(root, 'rev-parse', `${HISTORICAL_COMMIT}^{tree}`).trim() !== HISTORICAL_TREE)
    throw new Error('Historical source tree is not the pinned September 29 tree.')
  const head = git(root, 'rev-parse', 'HEAD').trim()
  const parent = committed ? git(root, 'rev-parse', 'HEAD^').trim() : head
  if (parent !== BASE_COMMIT) throw new Error('Candidate must have the reviewed October 6 base as its direct parent; local preparation must remain on that base.')
  if (committed && git(root, 'status', '--porcelain', '--untracked-files=all').trim())
    throw new Error('Committed publication requires a clean source worktree; build artifacts must stay ignored.')
  let candidate
  if (committed) candidate = gitTree(root, 'HEAD')
  else {
    candidate = new Map()
    const files = [...new Set(git(root, 'ls-files', '-z', '--cached', '--others', '--exclude-standard').split('\0').filter(Boolean))].sort()
    for (const path of files) {
      let info
      try { info = await lstat(resolve(root, path)) } catch (error) { if (error.code === 'ENOENT') continue; throw error }
      if (!info.isFile() || info.isSymbolicLink()) throw new Error(`Non-regular candidate source: ${path}`)
      const bytes = await readFile(resolve(root, path))
      const oid = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
      candidate.set(path, { mode: info.mode & 0o111 ? '100755' : '100644', oid })
    }
  }
  const proof = { historicalCommit: HISTORICAL_COMMIT, historicalTree: HISTORICAL_TREE, baseCommit: BASE_COMMIT,
    candidateCommit: committed ? head : null, scope: committed ? 'committed-tree' : 'local-working-tree',
    ...compareSourceTrees(gitTree(root, HISTORICAL_COMMIT), candidate) }
  if (proof.violations.length) throw new Error(`Unreviewed source differences: ${JSON.stringify(proof.violations)}`)
  for (const path of SOURCE_EXCEPTIONS) if (!candidate.has(path)) throw new Error(`Required reviewed exception is missing: ${path}`)
  return proof
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.slice(2).some(arg => arg !== '--committed') || process.argv.length > 3) throw new Error('Use only optional --committed.')
    console.log(JSON.stringify(await checkFullMccSource({ committed: process.argv.includes('--committed') }), null, 2))
  } catch (error) { console.error(`FULL_MCC_SOURCE_BLOCKED: ${error.message}`); process.exitCode = 1 }
}
