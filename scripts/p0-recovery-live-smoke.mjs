import { createHash } from 'node:crypto'

const SITE = 'https://worldifact.xodobrox.workers.dev'
const JOB_ID = '2011ea5e-4545-4e9f-87d3-98d89ed4efc3'
const PROMPT = 'Create one small low-complexity blue concrete pavilion test asset with clean UVs and explicit PBR image maps: base color, roughness and normal. Keep geometry simple, stable and game-ready. This is only a technical download verification model; MAKE remains unapproved.'
const terminal = new Set(['succeeded','failed','cancelled'])
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const hash = bytes => createHash('sha256').update(bytes).digest('hex')

function assert(condition, message) { if (!condition) throw new Error(message) }
function endpoint() {
  const raw = process.env.ORACLE_ENDPOINT || ''
  const url = new URL(raw)
  assert(url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash, 'Oracle endpoint must be a clean HTTPS origin.')
  return url.origin
}
const ORACLE = endpoint()
const TOKEN = process.env.ORACLE_API_TOKEN || ''
assert(TOKEN.length >= 20 && TOKEN.length <= 512 && !/[\r\n]/.test(TOKEN), 'Oracle API token is missing or malformed.')

async function boundedJson(response, label, expected) {
  if (expected !== undefined) assert(response.status === expected, `${label}: HTTP ${response.status}, expected ${expected}`)
  assert(response.headers.get('content-type')?.includes('application/json'), `${label}: expected JSON`)
  const text = await response.text()
  assert(text.length <= 32768, `${label}: oversized response`)
  const value = JSON.parse(text)
  assert(value && typeof value === 'object' && !Array.isArray(value), `${label}: invalid JSON object`)
  return value
}
async function site(path) {
  return fetch(SITE + path, { cache:'no-store', redirect:'error', signal:AbortSignal.timeout(30_000) })
}
async function oracle(path, init = {}) {
  return fetch(ORACLE + path, {
    ...init,
    redirect:'manual',
    signal:AbortSignal.timeout(path.endsWith('/exports/prepare') ? 340_000 : 190_000),
    headers:{ Authorization:`Bearer ${TOKEN}`, Accept:'application/json, application/octet-stream, application/zip', ...(init.body ? {'Content-Type':'application/json'} : {}) },
  })
}
async function binary(response, label, max=512*1024*1024) {
  assert(response.ok, `${label}: HTTP ${response.status}`)
  const reader=response.body?.getReader(); assert(reader, `${label}: missing body`)
  const chunks=[]; let size=0
  for (;;) {
    const next=await reader.read(); if (next.done) break
    size+=next.value.byteLength; assert(size<=max, `${label}: exceeds bounded size`)
    chunks.push(next.value)
  }
  assert(size>0, `${label}: empty response`)
  const bytes=Buffer.alloc(size); let offset=0
  for (const chunk of chunks) { Buffer.from(chunk).copy(bytes,offset); offset+=chunk.byteLength }
  return bytes
}

const siteStatus = await boundedJson(await site('/api/studio/status'), 'site Studio status', 200)
assert(siteStatus.ready === true && siteStatus.reason === 'READY' && siteStatus.oracle === 'CONNECTOR_READY', 'Production Studio is not READY.')
const capabilities = await boundedJson(await site('/api/platform/oracle-worlds'), 'site Oracle capabilities', 200)
assert(capabilities.oracle === 'CONNECTOR_READY' && Number(capabilities.connectorVersion) >= 33, 'Production Oracle bridge is not ready.')
assert(Number(capabilities.posthocExportRevision) >= 2 && Number(capabilities.legacyGlbExportRecoveryRevision) >= 1, 'Production export recovery capability is missing.')

const health = await boundedJson(await oracle('/v1/health'), 'Oracle health', 200)
assert(health.ready === true && health.provider === 'openai' && health.model === 'gpt-6-astra', 'Oracle generation provider is not ready.')
assert(Number(health.connectorVersion) >= 33 && Number(health.posthocExportRevision) >= 2 && Number(health.legacyGlbExportRecoveryRevision) >= 1, 'Oracle export capability mismatch.')

let statusResponse = await oracle(`/v1/jobs/${JOB_ID}`)
let job
if (statusResponse.status === 200) {
  job = await boundedJson(statusResponse, 'existing recovery smoke job', 200)
  console.log(`Resuming deterministic recovery smoke job ${JOB_ID} state=${job.state}`)
} else {
  assert(statusResponse.status === 404, `Initial job lookup returned unexpected HTTP ${statusResponse.status}`)
  await statusResponse.body?.cancel().catch(()=>{})
  const deadline = Date.now() + 20 * 60_000
  for (;;) {
    const response = await oracle('/v1/jobs', { method:'POST', body:JSON.stringify({ id:JOB_ID, prompt:PROMPT }) })
    if (response.status === 202 || response.status === 200) {
      job = await boundedJson(response, 'Oracle smoke submit')
      assert(job.id === JOB_ID, 'Oracle accepted a different job id.')
      console.log(`Accepted deterministic recovery smoke job ${JOB_ID} state=${job.state}`)
      break
    }
    if (response.status !== 409) {
      const value = await boundedJson(response, 'Oracle smoke rejection')
      throw new Error(`Oracle smoke submit rejected HTTP ${response.status}: ${String(value.error || 'unknown').slice(0,180)}`)
    }
    const value = await boundedJson(response, 'Oracle busy rejection', 409)
    const message=String(value.error || '')
    assert(/poprzedni model|previous model|wykonuje/i.test(message), 'Oracle returned an unrecognized 409; refusing to retry.')
    assert(Date.now() < deadline, 'Oracle stayed busy for 20 minutes; no recovery smoke job was accepted.')
    console.log('Oracle is finishing an existing model; no smoke job was accepted. Waiting 30 s before retrying the SAME deterministic id.')
    await sleep(30_000)
    const check = await oracle(`/v1/jobs/${JOB_ID}`)
    if (check.status === 200) { job = await boundedJson(check, 'accepted smoke reconciliation', 200); break }
    assert(check.status === 404, `Smoke reconciliation returned HTTP ${check.status}`)
    await check.body?.cancel().catch(()=>{})
  }
}
assert(job && job.id === JOB_ID, 'Smoke job identity missing.')
const finishBy=Date.now()+20*60_000
while (!terminal.has(job.state) && Date.now()<finishBy) {
  await sleep(15_000)
  const response=await oracle(`/v1/jobs/${JOB_ID}`)
  job=await boundedJson(response,'Oracle smoke poll',200)
  assert(job.id===JOB_ID,'Oracle poll changed job identity.')
  console.log(`Smoke job state=${job.state}`)
}
assert(job.state==='succeeded', `Smoke generation ended as ${job.state}: ${String(job.detail||'').slice(0,240)}`)

const model=await binary(await oracle(`/v1/jobs/${JOB_ID}/model`),'GLB',64*1024*1024)
assert(model.length>=20 && model.subarray(0,4).toString('ascii')==='glTF' && model.readUInt32LE(4)===2 && model.readUInt32LE(8)===model.length,'Invalid GLB container.')

const downloaded={}
const missing=[]
for (const format of ['pbr','fbx','blend']) {
  const response=await oracle(`/v1/jobs/${JOB_ID}/exports/${format}`)
  if (response.status===200) downloaded[format]=await binary(response,format)
  else if (response.status===409) { await response.body?.cancel().catch(()=>{}); missing.push(format) }
  else throw new Error(`${format} initial export HTTP ${response.status}`)
}
if (missing.length) {
  const prepared=await boundedJson(await oracle(`/v1/jobs/${JOB_ID}/exports/prepare`,{method:'POST',body:'{}'}),'post-hoc export prepare',200)
  assert(prepared.generationRequested !== true && prepared.paidGenerationRequested !== true,'Export prepare must not submit AI generation.')
  for (const format of missing) downloaded[format]=await binary(await oracle(`/v1/jobs/${JOB_ID}/exports/${format}`),format)
}
assert(downloaded.pbr[0]===0x50 && downloaded.pbr[1]===0x4b,'PBR export is not ZIP.')
const fbxHead=downloaded.fbx.subarray(0,64).toString('ascii')
assert(fbxHead.includes('FBX') || fbxHead.startsWith('Kaydara'),'FBX header invalid.')
assert(downloaded.blend.subarray(0,7).toString('ascii')==='BLENDER','BLEND header invalid.')

const artifacts=[
  ['glb',model],['pbr',downloaded.pbr],['fbx',downloaded.fbx],['blend',downloaded.blend],
].map(([format,bytes])=>({format,bytes:bytes.length,sha256:hash(bytes)}))
console.log(JSON.stringify({ proof:'WORLDIFACT_P0_RECOVERY_SMOKE_PASS', jobId:JOB_ID, state:job.state, artifacts },null,2))
