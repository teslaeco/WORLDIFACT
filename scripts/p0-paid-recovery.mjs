import { appendFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { deflateSync } from 'node:zlib'

const base = (process.env.WORLDIFACT_URL || 'https://worldifact.xodobrox.workers.dev').replace(/\/$/, '')
const owner = process.env.OWNER_ACCESS_TOKEN || ''

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii')
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])))
  return Buffer.concat([length, typeBytes, data, checksum])
}

function makeReferencePngDataUri() {
  const width = 512, height = 512
  const raw = Buffer.alloc(height * (1 + width * 4))
  let offset = 0
  for (let y = 0; y < height; y++) {
    raw[offset++] = 0
    for (let x = 0; x < width; x++) {
      const blueHalf = x < width / 2
      raw[offset++] = blueHalf ? 36 : 42
      raw[offset++] = blueHalf ? 112 : 154
      raw[offset++] = blueHalf ? 196 : 92
      raw[offset++] = 255
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
  return `data:image/png;base64,${png.toString('base64')}`
}

async function jsonResponse(response) {
  const type = response.headers.get('content-type') || ''
  assert(type.includes('application/json'), `Expected JSON, got ${type || 'unknown content type'}`)
  return response.json()
}

const evidence = { startedAt: new Date().toISOString(), imageAstra: null, oracle: null }
const image = makeReferencePngDataUri()
assert(image.length < 1_400_000, 'Generated reference image exceeds WORLDIFACT input limit')

const astra = await fetch(`${base}/api/blueprint`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: base },
  body: JSON.stringify({
    prompt: 'Use the reference image only as color inspiration. Create a compact blue-and-green sculpture garden in a valley with one rover and two rocks. Keep the scene simple and playable.',
    image,
    mode: 'live',
  }),
  signal: AbortSignal.timeout(45_000),
})
const astraData = await jsonResponse(astra)
assert(astra.ok, `astra-image-recovery: HTTP ${astra.status} ${astraData?.error || ''}`)
assert(astraData.mode === 'LIVE' && astraData.provenance === 'GENERATED' && astraData.model === 'gpt-6-astra', 'astra-image-recovery: LIVE provenance/model mismatch')
assert(Array.isArray(astraData.blueprint?.objects) && astraData.blueprint.objects.length > 0, 'astra-image-recovery: missing blueprint')
assert(astraData.assetSpec?.make?.validationStatus === 'validation-required', 'astra-image-recovery: MAKE boundary missing')
evidence.imageAstra = {
  requestId: astraData.requestId,
  providerResponseId: astraData.evidence?.providerResponseId || null,
  totalTokens: astraData.evidence?.totalTokens ?? null,
  blueprintSha256: astraData.evidence?.blueprintSha256 || null,
  title: astraData.blueprint.title,
  objectCount: astraData.blueprint.objects.length,
  assetName: astraData.assetSpec.name,
  makeValidationStatus: astraData.assetSpec.make.validationStatus,
}
console.log(`PASS astra-image-recovery: ${evidence.imageAstra.title} | objects=${evidence.imageAstra.objectCount} | asset=${evidence.imageAstra.assetName} | tokens=${evidence.imageAstra.totalTokens ?? 'n/a'}`)

assert(owner.length >= 32 && owner.length <= 256, 'OWNER_ACCESS_TOKEN is missing or invalid')
const jobId = randomUUID()
const submit = await fetch(`${base}/api/oracle/jobs`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: base, 'X-WORLDIFACT-Owner': owner },
  body: JSON.stringify({
    worldId: 'ai-game-lab',
    id: jobId,
    prompt: 'Create a simple low-complexity game-ready solar rover prop with clean geometry and neutral materials. This is a GAME asset test, not a manufacturing-ready claim.',
  }),
  signal: AbortSignal.timeout(35_000),
})
const submitted = await jsonResponse(submit)
assert(submit.ok, `oracle-submit: HTTP ${submit.status} ${submitted?.error || ''}`)
assert(submitted.job?.id === jobId, 'oracle-submit: job id mismatch')
console.log(`PASS oracle-submit: id=${jobId} state=${submitted.job.state} connector=${submitted.connectorVersion}`)

let finalJob = submitted.job
const deadline = Date.now() + 12 * 60_000
while (!['succeeded', 'failed', 'cancelled'].includes(finalJob.state) && Date.now() < deadline) {
  await new Promise(resolve => setTimeout(resolve, 25_000))
  const poll = await fetch(`${base}/api/oracle/jobs/${jobId}`, {
    headers: { 'X-WORLDIFACT-Owner': owner },
    signal: AbortSignal.timeout(35_000),
  })
  if (poll.status === 429) continue
  const status = await jsonResponse(poll)
  assert(poll.ok, `oracle-poll: HTTP ${poll.status} ${status?.error || ''}`)
  finalJob = status.job
  console.log(`oracle-poll: state=${finalJob.state}${finalJob.detail ? ` detail=${finalJob.detail}` : ''}`)
}
assert(['succeeded', 'failed', 'cancelled'].includes(finalJob.state), 'oracle job did not reach a terminal state before timeout')
evidence.oracle = { id: jobId, state: finalJob.state, detail: finalJob.detail || null }
evidence.completedAt = new Date().toISOString()
assert(finalJob.state === 'succeeded', `Oracle job ended in ${finalJob.state}: ${finalJob.detail || 'no detail'}`)
console.log(`PASS oracle-job: id=${jobId} state=succeeded`)

if (process.env.GITHUB_STEP_SUMMARY) {
  await appendFile(process.env.GITHUB_STEP_SUMMARY, [
    '## WORLDIFACT P0 recovery evidence',
    '',
    '- Prior approved pilot evidence: text Astra call succeeded; tiny 1x1 image test failed after reserving attempt #2.',
    `- Image Astra recovery: LIVE; ${evidence.imageAstra.title}; ${evidence.imageAstra.objectCount} objects; ${evidence.imageAstra.assetName}; tokens=${evidence.imageAstra.totalTokens ?? 'n/a'}; response=${evidence.imageAstra.providerResponseId ?? 'n/a'}.`,
    `- Oracle prompt job: ${evidence.oracle.state} (${evidence.oracle.id}).`,
    '- Total shared reservations: exactly 4 maximum. No retries were issued for provider failures.',
    '- Truth boundary: Oracle job success is render-job evidence; a GLB is not labelled GENERATED until its artifact is separately retrieved and inspected.',
    '',
  ].join('\n'))
}

console.log(JSON.stringify(evidence, null, 2))
