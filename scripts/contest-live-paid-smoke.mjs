const base = (process.env.WORLDIFACT_URL || 'https://worldifact.xodobrox.workers.dev').replace(/\/$/, '')

function assert(condition, message) {
  if (!condition) throw new Error(message)
}
async function json(response, label) {
  const type = response.headers.get('content-type') || ''
  assert(type.includes('application/json'), `${label}: expected JSON, got ${type || 'unknown'}`)
  const body = await response.json()
  assert(response.ok, `${label}: HTTP ${response.status} ${body?.error || ''}`)
  return body
}
const originHeaders = { Origin: base, 'Content-Type': 'application/json' }

const health = await json(await fetch(`${base}/api/health`, { cache: 'no-store', signal: AbortSignal.timeout(15_000) }), 'health')
assert(health.generationReady === true, 'health: LIVE Astra is not ready')
assert(health.publicPilot === true, 'health: public pilot is not enabled')
assert(health.model === 'gpt-6-astra', 'health: unexpected model')

const astra = await json(await fetch(`${base}/api/blueprint`, {
  method: 'POST',
  headers: originHeaders,
  body: JSON.stringify({
    worldId: 'ai-game-lab',
    mode: 'live',
    prompt: 'Create a compact solar rover checkpoint with one rover, one habitat and one solar array. Keep the scene simple, playable and clearly separated into GAME and validation-required MAKE plans.'
  }),
  signal: AbortSignal.timeout(50_000),
}), 'astra-live')
assert(astra.mode === 'LIVE' && astra.provenance === 'GENERATED', 'astra-live: missing LIVE GENERATED provenance')
assert(astra.model === 'gpt-6-astra', 'astra-live: unexpected model')
assert(Array.isArray(astra.blueprint?.objects) && astra.blueprint.objects.length > 0, 'astra-live: missing scene objects')
assert(astra.assetSpec?.make?.validationStatus === 'validation-required', 'astra-live: MAKE boundary missing')
console.log(`PASS Astra LIVE: request=${astra.requestId} response=${astra.evidence?.providerResponseId || 'n/a'} objects=${astra.blueprint.objects.length}`)

const studio = await json(await fetch(`${base}/api/studio/status`, { cache: 'no-store', signal: AbortSignal.timeout(30_000) }), 'studio-status')
assert(studio.ready === true, `studio-status: not ready (${studio.reason || 'unknown'})`)
assert(studio.publicPilot === true, 'studio-status: public pilot not enabled')
assert(studio.oracle === 'CONNECTOR_READY', 'studio-status: Oracle connector not ready')
assert(studio.fastReady === true, 'studio-status: FAST profile not ready')
assert((studio.allowance?.remaining ?? 0) >= 1, 'studio-status: no remaining allowance')

const input = {
  worldId: 'enchanted-ai-shop',
  prompt: 'Create a simple low-complexity 3D solar rover display prop with stable clean geometry and neutral materials. GAME preview only; MAKE remains validation-required.',
  purpose: 'object',
  textureMaxSize: 2048,
  photos: [],
  generationProfile: 'fast-draft-v1',
}

const prepared = await json(await fetch(`${base}/api/studio/prepare`, {
  method: 'POST',
  headers: originHeaders,
  body: JSON.stringify(input),
  signal: AbortSignal.timeout(40_000),
}), 'studio-prepare')
assert(typeof prepared.id === 'string' && typeof prepared.ticket === 'string', 'studio-prepare: missing receipt')

const submitted = await json(await fetch(`${base}/api/studio/jobs`, {
  method: 'POST',
  headers: { ...originHeaders, 'X-WORLDIFACT-Job': prepared.ticket },
  body: JSON.stringify(input),
  signal: AbortSignal.timeout(45_000),
}), 'studio-submit')
assert(submitted.job?.id === prepared.id, 'studio-submit: job id mismatch')
console.log(`Studio job submitted: ${prepared.id} state=${submitted.job.state}`)

let state = submitted.job
const deadline = Date.now() + 15 * 60_000
while (!['succeeded', 'failed', 'cancelled'].includes(state.state) && Date.now() < deadline) {
  await new Promise(resolve => setTimeout(resolve, 20_000))
  const response = await fetch(`${base}/api/studio/jobs/${prepared.id}`, {
    headers: { 'X-WORLDIFACT-Job': prepared.ticket },
    signal: AbortSignal.timeout(40_000),
  })
  if (response.status === 429) continue
  const body = await json(response, 'studio-poll')
  state = body.job
  console.log(`Studio poll: ${state.state}`)
}
assert(state.state === 'succeeded', `studio job ended as ${state.state}: ${state.detail || 'no detail'}`)

const model = await fetch(`${base}/api/studio/jobs/${prepared.id}/model`, {
  headers: { 'X-WORLDIFACT-Job': prepared.ticket },
  signal: AbortSignal.timeout(180_000),
})
assert(model.ok, `studio-model: HTTP ${model.status}`)
const length = Number(model.headers.get('content-length'))
assert(Number.isSafeInteger(length) && length >= 20, 'studio-model: invalid content length')
const reader = model.body?.getReader()
assert(reader, 'studio-model: missing body')
let first = new Uint8Array(0)
while (first.length < 12) {
  const next = await reader.read()
  assert(!next.done, 'studio-model: incomplete GLB')
  const merged = new Uint8Array(first.length + next.value.length)
  merged.set(first); merged.set(next.value, first.length); first = merged
}
await reader.cancel()
const header = new DataView(first.buffer, first.byteOffset, first.byteLength)
assert(header.getUint32(0, true) === 0x46546c67, 'studio-model: invalid GLB magic')
assert(header.getUint32(4, true) === 2, 'studio-model: unsupported GLB version')
assert(header.getUint32(8, true) === length, 'studio-model: GLB length mismatch')
console.log(`PASS Studio LIVE 3D: job=${prepared.id} modelBytes=${length}`)

const finalStatus = await json(await fetch(`${base}/api/studio/status`, { cache: 'no-store', signal: AbortSignal.timeout(30_000) }), 'studio-final-status')
console.log(JSON.stringify({
  astra: { requestId: astra.requestId, providerResponseId: astra.evidence?.providerResponseId || null, model: astra.model },
  studio: { jobId: prepared.id, state: state.state, modelBytes: length },
  allowance: finalStatus.allowance,
}, null, 2))
