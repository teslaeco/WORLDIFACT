/**
 * WORLDIFACT guarded RunPod Serverless Flex provisioning.
 *
 * This file DOES NOT run on a push, PR, or user visit. A protected, reviewed
 * manual workflow may invoke it after a real, licensed, CUDA-tested GPU image
 * has been published and separately approved by immutable digest.
 * No persistent Pods, GPU billing calls, or stored provider secrets.
 */
export const ORIGIN = 'https://api.runpod.io'
export const ENDPOINT_NAME = 'WORLDIFACT-3D-FLEX'
export const IMAGE_PATTERN = /^ghcr\.io\/teslaeco\/worldifact-runpod3d@sha256:[a-f0-9]{64}$/
export const COST_CEILING_USD_PER_HOUR = 3.00

export class Refused extends Error {
  constructor(code) { super(code); this.name = 'RunPodProvisionRefused'; this.code = code }
}
const requireTrue = (condition, code) => { if (!condition) throw new Refused(code) }
const record = value => value && typeof value === 'object' && !Array.isArray(value)
const finitePrice = value => typeof value === 'number' && Number.isFinite(value) && value > 0

export function approvedInputs(options) {
  requireTrue(record(options), 'MISSING_REVIEWED_PROVISION_REQUEST')
  requireTrue(options.confirmation === 'PROVISION-WORLDIFACT-FLEX',
    'EXPLICIT_PROVISION_CONFIRMATION_REQUIRED')
  requireTrue(typeof options.image === 'string' && IMAGE_PATTERN.test(options.image),
    'IMMUTABLE_WORLDIFACT_GPU_IMAGE_REQUIRED')
  requireTrue(options.reviewedImage === options.image,
    'REVIEWED_IMAGE_DIGEST_MISMATCH')
  requireTrue(options.licensesReviewed === 'true' &&
    options.cudaParityVerified === 'true' &&
    options.modelWeightsVerified === 'true', 'GPU_IMAGE_EVIDENCE_NOT_APPROVED')
  requireTrue(options.accountBoundR2Verified === 'true',
    'PRIVATE_R2_NOT_VERIFIED')
  return { image: options.image }
}

export function pickA100(catalog) {
  requireTrue(record(catalog) && Array.isArray(catalog.gpus) &&
    catalog.gpus.length < 300, 'GPU_CATALOG_UNVERIFIED')
  const allowed = catalog.gpus.filter(gpu =>
    record(gpu) && /A100/i.test(gpu.name || '') &&
    gpu.memory === 80 &&
    typeof gpu.pool === 'string' && /^[A-Z0-9_]{3,40}$/.test(gpu.pool) &&
    record(gpu.price) && finitePrice(gpu.price.serverless) &&
    gpu.price.serverless <= COST_CEILING_USD_PER_HOUR &&
    ['HIGH', 'MEDIUM', 'LOW'].includes(gpu.availability))
  requireTrue(allowed.length > 0, 'A100_80GB_PRICE_OR_AVAILABILITY_NOT_CONFIRMED')
  allowed.sort((a, b) => a.price.serverless - b.price.serverless ||
    a.pool.localeCompare(b.pool))
  return { pool: allowed[0].pool, pricePerHour: allowed[0].price.serverless }
}

export function requestedEndpoint(image, pool) {
  requireTrue(typeof image === 'string' && IMAGE_PATTERN.test(image), 'INVALID_CONTAINER_IMAGE')
  requireTrue(typeof pool === 'string' && /^[A-Z0-9_]{3,40}$/.test(pool),
    'UNKNOWN_GPU_POOL')
  return {
    name: ENDPOINT_NAME,
    image,
    type: 'QUEUE',
    gpu: { pools: [pool], count: 1 },
    workers: { min: 0, max: 1, idleTimeout: 5 },
    scaling: { type: 'QUEUE_DELAY', queueDelay: 4 },
    timeout: 120000,
    flashboot: 'OFF',
    disk: 20,
    dataCenterIds: [],
    mounts: { network: [], global: [] },
    env: { ENABLE_RUNPOD_WORKER: 'false' }
  }
}

function endpointMatches(current, planned) {
  return record(current) && current.name === planned.name &&
    current.image === planned.image &&
    current.type === 'QUEUE' &&
    current.workers?.min === 0 && current.workers?.max === 1 &&
    current.workers?.idleTimeout === 5 &&
    current.gpu?.count === 1 &&
    Array.isArray(current.gpu?.pools) &&
    JSON.stringify(current.gpu.pools) === JSON.stringify(planned.gpu.pools)
}
const idPattern = /^[a-zA-Z0-9_-]{5,64}$/

async function boundedJson(response) {
  requireTrue(response.headers.get('content-type')?.includes('application/json'),
    'UNEXPECTED_PROVIDER_RESPONSE_TYPE')
  const reader = response.body?.getReader()
  requireTrue(!!reader, 'EMPTY_PROVIDER_RESPONSE')
  const parts = []
  let size = 0
  try {
    for (;;) {
      const result = await reader.read()
      if (result.done) break
      size += result.value.byteLength
      requireTrue(size <= 128 * 1024, 'OVERSIZED_PROVIDER_RESPONSE')
      parts.push(result.value)
    }
  } finally {
    await reader.cancel().catch(() => {})
  }
  const joined = new Uint8Array(size)
  let i = 0
  for (const part of parts) { joined.set(part, i); i += part.length }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(joined))
  } catch {
    throw new Refused('UNEXPECTED_PROVIDER_RESPONSE_JSON')
  }
}

async function call(fetcher, key, method, path, body) {
  const operation = new URL(path, ORIGIN)
  requireTrue(operation.origin === ORIGIN &&
    ['/v2/serverless', '/v2/catalog/gpus'].includes(operation.pathname) &&
    (!operation.search || operation.search ===
      '?include=AVAILABILITY&product=SERVERLESS&count=1'),
    'UNAPPROVED_PROVIDER_RESOURCE')
  requireTrue((method === 'GET' && body === undefined) ||
    (method === 'POST' && operation.pathname === '/v2/serverless' && record(body)),
  'UNAPPROVED_PROVIDER_MUTATION')
  let response
  try {
    response = await fetcher(operation.toString(), {
      method,
      redirect: 'error',
      signal: AbortSignal.timeout(method === 'POST' ? 20000 : 12000),
      headers: {
        Authorization: 'Bearer ' + key,
        Accept: 'application/json',
        ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {})
      },
      ...(method === 'POST' ? { body: JSON.stringify(body) } : {})
    })
  } catch {
    // An ambiguous POST can have created a billable endpoint. Never auto retry.
    throw new Refused(method === 'POST' ?
      'ENDPOINT_CREATE_RESULT_UNKNOWN_DO_NOT_RETRY' : 'PROVIDER_READ_NETWORK_OR_TIMEOUT')
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {})
    throw new Refused(method === 'POST' ?
      'ENDPOINT_CREATE_RESPONSE_NOT_CONFIRMED_DO_NOT_RETRY' :
      'PROVIDER_READ_FAILED')
  }
  if (method === 'POST' && response.status !== 201)
    throw new Refused('ENDPOINT_CREATE_RESULT_UNKNOWN_DO_NOT_RETRY')
  return boundedJson(response)
}

/** Only an exact, reviewed protected manual workflow can call this. */
export async function provisionOnce(options, fetcher = fetch) {
  const { image } = approvedInputs(options)
  const key = options.apiKey
  requireTrue(typeof key === 'string' && key.length >= 12 && !/\s/.test(key),
    'MISSING_SERVER_ONLY_API_KEY')
  const previous = await call(fetcher, key, 'GET', '/v2/serverless')
  requireTrue(record(previous) && Array.isArray(previous.endpoints) &&
    previous.pagination?.hasNextPage === false,
    'ACCOUNT_ENDPOINT_INVENTORY_INCOMPLETE')
  requireTrue(!previous.endpoints.some(ep => ep?.name === ENDPOINT_NAME),
    'WORLDIFACT_ENDPOINT_ALREADY_EXISTS_INSPECT_BEFORE_RETRY')
  const hardware = await call(fetcher, key, 'GET',
    '/v2/catalog/gpus?include=AVAILABILITY&product=SERVERLESS&count=1')
  const gpu = pickA100(hardware)
  const planned = requestedEndpoint(image, gpu.pool)
  // The sole write; never sends R2 credentials or enables a GPU worker.
  const result = await call(fetcher, key, 'POST', '/v2/serverless', planned)
  requireTrue(record(result) && idPattern.test(result.id) &&
    endpointMatches(result, planned),
    'CREATION_UNCONFIRMED_OR_BAD_SETTINGS_INSPECT_PROVIDER_NO_RETRY')
  return {
    status: 'CREATED_MIN_ZERO_DISABLED',
    endpointName: ENDPOINT_NAME,
    endpointId: result.id,
    consoleUrl: 'https://console.runpod.io/serverless',
    executionApi: 'https://api.runpod.ai/v2/' + result.id + '/run',
    gpu: 'A100_80GB',
    observedMaxGpuPriceUsdPerHour: gpu.pricePerHour,
    activeWorkers: 0,
    maxWorkers: 1,
    idleTimeoutSeconds: 5,
    enabledWorker: false,
    paidInferenceRequested: false,
    productionTrafficChanged: false
  }
}

if (process.argv[1] && import.meta.url === new URL('file://' +
    process.argv[1]).href) {
  try {
    const result = await provisionOnce({
      confirmation: process.env.RUNPOD_PROVISION_CONFIRMATION,
      image: process.env.RUNPOD_IMAGE_DIGEST,
      reviewedImage: process.env.RUNPOD_APPROVED_IMAGE_DIGEST,
      licensesReviewed: process.env.RUNPOD_LICENSES_REVIEWED,
      cudaParityVerified: process.env.RUNPOD_CUDA_PARITY_VERIFIED,
      modelWeightsVerified: process.env.RUNPOD_WEIGHTS_VERIFIED,
      accountBoundR2Verified: process.env.RUNPOD_R2_ACCOUNT_VERIFIED,
      apiKey: process.env.RUNPOD_API_KEY
    })
    process.stdout.write(JSON.stringify(result) + '\n')
  } catch (e) {
    process.stdout.write(JSON.stringify({ status: 'NOT_PROVISIONED',
      reason: e instanceof Refused ? e.code : 'UNKNOWN_FAIL_CLOSED' }) + '\n')
    process.exitCode = 2
  }
}
