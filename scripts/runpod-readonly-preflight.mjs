/**
 * Read-only RunPod connection check for WORLDIFACT staging.
 * GET only: official /endpoints, /networkvolumes and /pods REST resources.
 * Never print credentials, raw API JSON, personal IDs or provider environment.
 */
import { pathToFileURL } from 'node:url'

export const RUNPOD_ORIGIN = 'https://api.runpod.io'
export const SAFE_READS = Object.freeze(['/v2/serverless', '/v2/network-volumes', '/v2/pods'])

const validSize = (v) => Number.isSafeInteger(v) && v >= 0 ? v : 0

function rows(path, value) {
  const key = path === '/v2/serverless' ? 'endpoints'
    : path === '/v2/network-volumes' ? 'networkVolumes' : 'pods'
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      !Array.isArray(value[key]) || !value.pagination ||
      typeof value.pagination !== 'object' ||
      typeof value.pagination.hasNextPage !== 'boolean')
    throw new Error('UNEXPECTED_V2_RESPONSE_SHAPE')
  // First-page counts are never silently misrepresented as total inventory.
  if (value.pagination.hasNextPage) throw new Error('PAGINATION_REQUIRES_REVIEW')
  return value[key]
}

async function parseBoundedJson(res) {
  if (!res.headers.get('content-type')?.toLowerCase().includes('application/json'))
    throw new Error('NON_JSON_RESPONSE')
  const reader = res.body?.getReader()
  if (!reader) throw new Error('NO_RESPONSE_BODY')
  const parts = []; let n = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      n += next.value.byteLength
      if (n > 2_000_000) throw new Error('RESPONSE_SIZE_LIMIT')
      parts.push(next.value)
    }
  } finally {
    await reader.cancel().catch(() => {})
  }
  const joined = new Uint8Array(n)
  let position = 0
  for (const p of parts) { joined.set(p, position); position += p.length }
  try { return JSON.parse(new TextDecoder().decode(joined)) } catch {
    throw new Error('INVALID_RESPONSE_JSON')
  }
}

function safeStatus(http) {
  if (http === 401) return 'UNAUTHORIZED'
  if (http === 403) return 'INSUFFICIENT_READ_SCOPE'
  if (http === 429) return 'RATE_LIMITED'
  return http >= 500 ? 'PROVIDER_UNAVAILABLE' : 'HTTP_NOT_OK'
}
function summarize(path, input) {
  const values = rows(path, input)
  if (values.length > 5_000) throw new Error('LIST_SIZE_LIMIT')
  if (path === '/v2/serverless') return {
    status: 'OK',
    count: values.length,
    configuredScaleToZero: values.filter(x => x && x?.workers?.min === 0).length,
    currentlyAlwaysOn: values.filter(x => x && Number(x?.workers?.min) > 0).length,
  }
  if (path === '/v2/network-volumes') return {
    status: 'OK',
    count: values.length,
    totalProvisionedGB: values.reduce((sum, item) => sum + validSize(item?.size), 0),
  }
  return {
    status: 'OK',
    count: values.length,
    running: values.filter(x => String(x?.status ?? x?.desiredStatus ?? x?.runtime?.status ?? '').toUpperCase() === 'RUNNING').length,
  }
}

export async function runReadOnlyPreflight(apiKey, fetcher = fetch) {
  if (typeof apiKey !== 'string' || apiKey.length < 12 || /\s/.test(apiKey))
    return { verified: false, reason: 'MISSING_OR_INVALID_STAGING_SECRET', paidRequests: 0 }
  const report = {
    revision: 'worldifact-runpod-readonly-v1',
    verified: false,
    paidRequests: 0,
    gpuWorkersStarted: 0,
    createdResources: 0,
    checks: {},
  }
  for (const path of SAFE_READS) {
    let res
    try {
      res = await fetcher(RUNPOD_ORIGIN + path, {
        method: 'GET',
        redirect: 'error',
        signal: AbortSignal.timeout(12_000),
        headers: { Authorization: 'Bearer ' + apiKey, Accept: 'application/json' },
      })
    } catch {
      report.checks[path] = { status: 'NETWORK_OR_TIMEOUT_ERROR' }
      continue
    }
    if (!res.ok) {
      report.checks[path] = { status: safeStatus(res.status) }
      await res.body?.cancel().catch(() => {})
      continue
    }
    try {
      report.checks[path] = summarize(path, await parseBoundedJson(res))
    } catch {
      report.checks[path] = { status: 'UNEXPECTED_PROVIDER_FORMAT' }
    }
  }
  report.verified = SAFE_READS.every(x => report.checks[x]?.status === 'OK')
  return report
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await runReadOnlyPreflight(process.env.RUNPOD_API_KEY)
  process.stdout.write(JSON.stringify(result, null, 2) + '\n')
  if (!result.verified) process.exitCode = 2
}
