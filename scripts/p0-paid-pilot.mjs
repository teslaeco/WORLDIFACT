import { appendFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'

const base = (process.env.WORLDIFACT_URL || 'https://worldifact.xodobrox.workers.dev').replace(/\/$/, '')
const owner = process.env.OWNER_ACCESS_TOKEN || ''
const evidence = { startedAt: new Date().toISOString(), base, astra: [], oracle: null }

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function jsonResponse(response) {
  const type = response.headers.get('content-type') || ''
  assert(type.includes('application/json'), `Expected JSON, got ${type || 'unknown content type'}`)
  return response.json()
}

async function runAstra(label, prompt, image) {
  const payload = { prompt, mode: 'live', ...(image ? { image } : {}) }
  const response = await fetch(`${base}/api/blueprint`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: base },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(45_000),
  })
  const data = await jsonResponse(response)
  assert(response.ok, `${label}: HTTP ${response.status} ${data?.error || ''}`)
  assert(data.mode === 'LIVE', `${label}: expected LIVE`)
  assert(data.provenance === 'GENERATED', `${label}: expected GENERATED provenance`)
  assert(data.model === 'gpt-6-astra', `${label}: unexpected model`)
  assert(data.blueprint && Array.isArray(data.blueprint.objects) && data.blueprint.objects.length > 0, `${label}: missing blueprint objects`)
  assert(data.assetSpec?.make?.validationStatus === 'validation-required', `${label}: MAKE boundary missing`)
  const item = {
    label,
    requestId: data.requestId,
    model: data.model,
    title: data.blueprint.title,
    biome: data.blueprint.biome,
    objectCount: data.blueprint.objects.length,
    assetName: data.assetSpec.name,
    gameGeometry: data.assetSpec.game?.geometry,
    makeValidationStatus: data.assetSpec.make?.validationStatus,
    providerResponseId: data.evidence?.providerResponseId || null,
    totalTokens: data.evidence?.totalTokens ?? null,
    blueprintSha256: data.evidence?.blueprintSha256 || null,
  }
  evidence.astra.push(item)
  console.log(`PASS ${label}: ${item.title} | objects=${item.objectCount} | asset=${item.assetName} | tokens=${item.totalTokens ?? 'n/a'}`)
}

const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlL0S8AAAAASUVORK5CYII='

await runAstra('astra-text-1', 'Create a compact solar rover workshop in a green valley with one rover, one habitat and one solar array. Keep the scene simple and playable.')
await runAstra('astra-image-2', 'Use the reference image only as color inspiration. Create a compact blue sculpture garden in a valley with one rover and two rocks. Keep the scene simple and playable.', tinyPng)
await runAstra('astra-text-3', 'Create a small lunar repair outpost with one habitat, one rover and one solar array. Keep the scene simple and playable.')

assert(owner.length >= 32 && owner.length <= 256, 'OWNER_ACCESS_TOKEN is missing or invalid')
const jobId = randomUUID()
const submit = await fetch(`${base}/api/oracle/jobs`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Origin: base,
    'X-WORLDIFACT-Owner': owner,
  },
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

if (finalJob.state !== 'succeeded') throw new Error(`Oracle job ended in ${finalJob.state}: ${finalJob.detail || 'no detail'}`)
console.log(`PASS oracle-job: id=${jobId} state=succeeded`)

if (process.env.GITHUB_STEP_SUMMARY) {
  const lines = [
    '## WORLDIFACT paid P0 pilot evidence',
    '',
    `- Started: ${evidence.startedAt}`,
    `- Completed: ${evidence.completedAt}`,
    `- Astra calls: ${evidence.astra.length}/3 LIVE`,
    ...evidence.astra.map(x => `  - ${x.label}: ${x.title}; ${x.objectCount} objects; ${x.assetName}; tokens=${x.totalTokens ?? 'n/a'}; response=${x.providerResponseId ?? 'n/a'}`),
    `- Oracle job: ${evidence.oracle.state} (${evidence.oracle.id})`,
    '- Truth boundary: the three Astra calls prove structured blueprint/spec generation and server validation. The Oracle job state proves the reviewed render job completed, but no GLB is called GENERATED until its artifact is separately retrieved and inspected.',
    '',
  ]
  await appendFile(process.env.GITHUB_STEP_SUMMARY, lines.join('\n'))
}

console.log(JSON.stringify(evidence, null, 2))
