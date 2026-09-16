import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { inspectGlb } from './lib/glb-inspect.mjs'

const base = (process.env.WORLDIFACT_URL || '').replace(/\/$/, '')
const token = process.env.OWNER_ACCESS_TOKEN || ''
const jobId = process.env.ORACLE_JOB_ID || ''
const outDir = resolve(process.env.OUT_DIR || '.evidence/oracle-artifact')

if (!/^https:\/\/[^/]+$/.test(base)) throw new Error('WORLDIFACT_URL must be one HTTPS origin')
if (token.length < 32 || token.length > 256) throw new Error('OWNER_ACCESS_TOKEN is missing or invalid')
if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(jobId)) throw new Error('ORACLE_JOB_ID is invalid')

const headers = { 'X-WORLDIFACT-Owner': token, Accept: 'application/json' }
const statusResponse = await fetch(`${base}/api/oracle/jobs/${jobId}`, { headers, redirect: 'error', signal: AbortSignal.timeout(30_000) })
if (!statusResponse.ok) throw new Error(`Job status HTTP ${statusResponse.status}`)
const status = await statusResponse.json()
if (status?.job?.id !== jobId || status?.job?.state !== 'succeeded') throw new Error(`Oracle job is not succeeded: ${status?.job?.state || 'unknown'}`)

const modelResponse = await fetch(`${base}/api/oracle/jobs/${jobId}/model`, {
  headers: { 'X-WORLDIFACT-Owner': token, Accept: 'model/gltf-binary' },
  redirect: 'error',
  signal: AbortSignal.timeout(30_000),
})
if (!modelResponse.ok) throw new Error(`Model HTTP ${modelResponse.status}`)
if (modelResponse.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'model/gltf-binary') throw new Error('Unexpected model content type')
const provenance = modelResponse.headers.get('x-worldifact-provenance')
if (provenance !== 'GENERATED-UNREVIEWED') throw new Error('Unexpected model provenance')

const declared = Number(modelResponse.headers.get('content-length') || 0)
if (declared && (declared < 20 || declared > 12 * 1024 * 1024)) throw new Error('Model size header out of bounds')
const bytes = new Uint8Array(await modelResponse.arrayBuffer())
const report = inspectGlb(bytes)
const serverSha = modelResponse.headers.get('x-worldifact-sha256')
if (!serverSha || serverSha !== report.sha256) throw new Error('Server/client SHA-256 mismatch')

await mkdir(outDir, { recursive: true })
const modelPath = resolve(outDir, `oracle-${jobId}.glb`)
const reportPath = resolve(outDir, `oracle-${jobId}.json`)
const evidence = {
  checkedAt: new Date().toISOString(),
  source: `${base}/api/oracle/jobs/${jobId}/model`,
  job: status.job,
  provenance,
  ...report,
  reviewStatus: 'GENERATED-UNREVIEWED',
  note: 'Binary integrity and glTF container structure verified. Visual/model-quality review is still required before any production-ready claim.',
}
await writeFile(modelPath, bytes, { mode: 0o600 })
await writeFile(reportPath, JSON.stringify(evidence, null, 2) + '\n', { mode: 0o600 })
console.log(`PASS: retrieved ${bytes.byteLength} byte GLB for ${jobId}`)
console.log(`SHA-256: ${report.sha256}`)
console.log(`meshes=${report.meshCount} nodes=${report.nodeCount} materials=${report.materialCount} animations=${report.animationCount} vertices=${report.declaredVertices}`)
console.log(`Saved: ${modelPath}`)
console.log(`Report: ${reportPath}`)
