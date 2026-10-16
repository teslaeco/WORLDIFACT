/** Read-only WORLDIFACT RunPod management inventory and live GPU catalog.
 * This script never calls /run, changes a resource, or logs provider IDs/tokens.
 * Trusted-main-only when injected with GitHub Production RUNPOD_API_KEY.
 */
import { pathToFileURL } from 'node:url'
import { runReadOnlyPreflight, RUNPOD_ORIGIN } from './runpod-readonly-preflight.mjs'

export const GPU_CATALOG_PATH = '/v2/catalog/gpus?include=AVAILABILITY&product=SERVERLESS&count=1'
const CATEGORIES = Object.freeze(['A100', 'H100', 'L4'])

function decodeCategory(gpu) {
  if (typeof gpu?.name !== 'string') return null
  return CATEGORIES.find(c => new RegExp('(?:^|[^a-z0-9])' + c + '(?:$|[^a-z0-9])', 'i').test(gpu.name)) ?? null
}

async function boundedJSON(res) {
  if (!res.ok) throw Error('CATALOG_HTTP_NOT_OK')
  if (!res.headers.get('content-type')?.toLowerCase().includes('application/json'))
    throw Error('CATALOG_NOT_JSON')
  const reader = res.body?.getReader()
  if (!reader) throw Error('CATALOG_EMPTY')
  const chunks = []
  let size = 0
  try {
    for (;;) {
      const next = await reader.read()
      if (next.done) break
      size += next.value.byteLength
      if (size > 2_000_000) throw Error('CATALOG_TOO_LARGE')
      chunks.push(next.value)
    }
  } finally { await reader.cancel().catch(() => {}) }
  const buffer = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {buffer.set(chunk, offset);offset += chunk.length}
  try {return JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(buffer))}
  catch {throw Error('CATALOG_INVALID_JSON')}
}

export async function inspectOnDemandGpu(apiKey, fetcher=fetch) {
  const account = await runReadOnlyPreflight(apiKey, fetcher)
  const report = {revision:'worldifact-on-demand-gpu-catalog-v1',
    verified:false, GPUWorkerCreated:0, paidInference:0,
    accountInventory:account.verified ? account.checks : {status:'NOT_VERIFIED'},
    requestedGPUs:CATEGORIES, availableGPUs:[]}
  if (!account.verified) return report
  let response
  try {
    response=await fetcher(RUNPOD_ORIGIN+GPU_CATALOG_PATH,{
      method:'GET', redirect:'error', signal:AbortSignal.timeout(15000),
      headers:{Authorization:'Bearer '+apiKey,Accept:'application/json'}
    })
  } catch {report.reason='GPU_CATALOG_NETWORK_ERROR'; return report}
  try {
    const data=await boundedJSON(response)
    if (!data || !Array.isArray(data.gpus) || data.gpus.length > 300)
      throw Error('GPU_CATALOG_FORMAT')
    const discovered=[]
    for (const gpu of data.gpus) {
      const kind=decodeCategory(gpu)
      if (!kind) continue
      const rate=gpu.price?.serverless
      if (typeof rate!=='number' || !Number.isFinite(rate) || rate<=0 || rate>20)continue
      const availability=String(gpu.availability ?? 'NONE')
      if (!['HIGH','MEDIUM','LOW','NONE'].includes(availability))continue
      const memory=Number(gpu.memory)
      if (!Number.isFinite(memory)||memory<=0||memory>200)continue
      discovered.push({kind, memoryGB:memory, priceUsdPerGpuHour:rate, availability})
    }
    report.availableGPUs=discovered.sort((a,b)=>a.kind.localeCompare(b.kind)||a.priceUsdPerGpuHour-b.priceUsdPerGpuHour)
    report.verified=true
    return report
  } catch {report.reason='GPU_CATALOG_UNVERIFIED';return report}
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result=await inspectOnDemandGpu(process.env.RUNPOD_API_KEY)
  process.stdout.write(JSON.stringify(result,null,2)+'\n')
  if (!result.verified) process.exitCode=2
}
