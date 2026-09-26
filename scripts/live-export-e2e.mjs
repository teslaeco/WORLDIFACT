import { mkdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

const base = (process.env.WORLDIFACT_URL || 'https://worldifact.xodobrox.workers.dev').replace(/\/$/, '')
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
function assert(condition, message) { if (!condition) throw new Error(message) }
async function json(response, label) {
  const type = response.headers.get('content-type') || ''
  assert(type.includes('application/json'), `${label}: expected JSON, got ${type || 'unknown'}`)
  const body = await response.json()
  assert(response.ok, `${label}: HTTP ${response.status} ${body?.error || ''}`)
  return body
}
async function bytes(response, label, maximum = 512 * 1024 * 1024) {
  assert(response.ok, `${label}: HTTP ${response.status}`)
  const reader = response.body?.getReader(); assert(reader, `${label}: missing body`)
  const chunks = []; let total = 0
  for (;;) {
    const part = await reader.read(); if (part.done) break
    total += part.value.byteLength; assert(total <= maximum, `${label}: too large`)
    chunks.push(part.value)
  }
  assert(total > 0, `${label}: empty body`)
  const out = new Uint8Array(total); let at = 0
  for (const chunk of chunks) { out.set(chunk, at); at += chunk.byteLength }
  return out
}
function sha256(data) { return createHash('sha256').update(data).digest('hex') }
function assertGlb(data) {
  assert(data.byteLength >= 20, 'GLB too small')
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  assert(view.getUint32(0, true) === 0x46546c67 && view.getUint32(4, true) === 2 && view.getUint32(8, true) === data.byteLength, 'Invalid GLB container')
}
function assertZip(data) { assert(data[0] === 0x50 && data[1] === 0x4b, 'Texture archive is not ZIP') }
function assertBlend(data) {
  const magic = new TextDecoder().decode(data.subarray(0, 7))
  assert(magic === 'BLENDER', 'BLEND file has invalid header')
}
function assertFbx(data) {
  const head = new TextDecoder().decode(data.subarray(0, Math.min(data.length, 32)))
  assert(head.startsWith('Kaydara FBX Binary') || head.includes('FBX'), 'FBX file has invalid header')
}

const capabilities = await json(await fetch(`${base}/api/platform/oracle-worlds`, { cache:'no-store', signal:AbortSignal.timeout(20_000) }), 'oracle-capabilities')
assert(capabilities.oracle === 'CONNECTOR_READY', 'Oracle connector is not ready')
assert(capabilities.connectorVersion === 33, 'Oracle connector is not v33')
assert(capabilities.posthocExportRevision === 2, `Oracle post-hoc export module is missing (reported ${capabilities.posthocExportRevision ?? 'none'})`)
assert(capabilities.legacyGlbExportRecoveryRevision === 1, `Oracle GLB recovery module is missing (reported ${capabilities.legacyGlbExportRecoveryRevision ?? 'none'})`)
console.log('PASS Oracle export capability: v33 posthoc=2 legacyGLB=1')

const status = await json(await fetch(`${base}/api/studio/status`, { cache:'no-store', signal:AbortSignal.timeout(30_000) }), 'studio-status')
assert(status.ready === true && status.oracle === 'CONNECTOR_READY', `Studio is not ready: ${status.reason || status.oracle}`)

const input = {
  worldId: 'enchanted-ai-shop',
  prompt: 'Create one simple small blue cube-shaped game prop with bevelled edges, one neutral PBR material, clean UVs and no text. Keep geometry intentionally low complexity. This is a download/export verification model, not manufacturing-ready.',
  purpose: 'object',
  textureMaxSize: 2048,
  photos: [],
  generationProfile: 'fast-draft-v1',
}
const originHeaders = { Origin: base, 'Content-Type':'application/json' }
const prepared = await json(await fetch(`${base}/api/studio/prepare`, {
  method:'POST', headers:originHeaders, body:JSON.stringify(input), signal:AbortSignal.timeout(45_000)
}), 'studio-prepare')
assert(typeof prepared.id === 'string' && typeof prepared.ticket === 'string', 'Missing Studio receipt')
console.log(`Prepared test job ${prepared.id}`)

const submitted = await json(await fetch(`${base}/api/studio/jobs`, {
  method:'POST', headers:{...originHeaders,'X-WORLDIFACT-Job':prepared.ticket}, body:JSON.stringify(input), signal:AbortSignal.timeout(45_000)
}), 'studio-submit')
assert(submitted.job?.id === prepared.id, 'Studio job id mismatch')
let job = submitted.job
const deadline = Date.now() + 15 * 60_000
while (!['succeeded','failed','cancelled'].includes(job.state) && Date.now() < deadline) {
  await sleep(15_000)
  const response = await fetch(`${base}/api/studio/jobs/${prepared.id}`, {
    headers:{'X-WORLDIFACT-Job':prepared.ticket}, cache:'no-store', signal:AbortSignal.timeout(40_000)
  })
  if (response.status === 429) continue
  job = (await json(response,'studio-poll')).job
  console.log(`Studio state: ${job.state}`)
}
assert(job.state === 'succeeded', `Studio test generation ended as ${job.state}: ${job.detail || ''}`)

const folder = `worldifact-export-e2e-${prepared.id}`
await mkdir(folder, { recursive:true })

async function fetchArtifact(format) {
  const path = format === 'model' ? 'model' : `exports/${format}`
  const headers = {'X-WORLDIFACT-Job':prepared.ticket, 'X-WORLDIFACT-Artifact-Stage':'initial'}
  let response = await fetch(`${base}/api/studio/jobs/${prepared.id}/${path}`, { headers, cache:'no-store', signal:AbortSignal.timeout(180_000) })
  if (format !== 'model' && response.status === 409) {
    await response.body?.cancel().catch(()=>{})
    const prep = await json(await fetch(`${base}/api/studio/jobs/${prepared.id}/exports/prepare`, {
      method:'POST', headers:{...originHeaders,'X-WORLDIFACT-Job':prepared.ticket}, body:'{}', cache:'no-store', signal:AbortSignal.timeout(340_000)
    }), 'exports-prepare')
    console.log(`Prepared exports: ${prep.formats?.join(', ') || 'none'}`)
    response = await fetch(`${base}/api/studio/jobs/${prepared.id}/${path}`, {
      headers:{'X-WORLDIFACT-Job':prepared.ticket,'X-WORLDIFACT-Artifact-Stage':'prepared'}, cache:'no-store', signal:AbortSignal.timeout(180_000)
    })
  }
  const data = await bytes(response, format)
  if (format === 'model') assertGlb(data)
  if (format === 'pbr') assertZip(data)
  if (format === 'fbx') assertFbx(data)
  if (format === 'blend') assertBlend(data)
  const ext = format === 'model' ? 'glb' : format === 'pbr' ? 'textures.zip' : format
  const file = `${folder}/WORLDIFACT-${prepared.id}.${ext}`
  await writeFile(file, data)
  console.log(`PASS ${format.toUpperCase()}: ${data.byteLength} bytes sha256=${sha256(data)} file=${file}`)
  return { format, bytes:data.byteLength, sha256:sha256(data), file }
}

const artifacts = []
for (const format of ['model','pbr','fbx','blend']) artifacts.push(await fetchArtifact(format))
console.log(JSON.stringify({ jobId:prepared.id, state:job.state, artifacts }, null, 2))
console.log('WORLDIFACT_EXPORT_E2E_PASS')
