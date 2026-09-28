/** Read the already-created owner test job. GET only; no provider retry. */
import { oracleOrigin } from '../server/platform.ts'
import { boundedBytes, ASTRA_JOB } from './approved-model-test.mjs'
import { demoBlueprint } from '../src/lib/blueprint.ts'
import { exportBlueprintGlb } from '../src/lib/blueprintExport.ts'

const origin = oracleOrigin(process.env.ORACLE_ENDPOINT)
if (!origin || !process.env.ORACLE_API_TOKEN) throw new Error('ORACLE_CONFIG_MISSING')
const response = await fetch(origin + '/v1/jobs/' + ASTRA_JOB, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(20000), headers: { Authorization: 'Bearer ' + process.env.ORACLE_API_TOKEN, Accept: 'application/json' } })
const job = JSON.parse((await boundedBytes(response, 65536)).toString())
if (job.id !== ASTRA_JOB) throw new Error('JOB_MISMATCH')
function safe(v) {
  if (typeof v !== 'string') return null
  for (const secret of [process.env.ORACLE_ENDPOINT, process.env.ORACLE_API_TOKEN]) if (secret) v = v.split(secret).join('[redacted]')
  return v.replace(/Bearer\s+\S+|\bsk-[\w-]+|https?:\/\/\S+/gi, '[redacted]').slice(0,700)
}
console.log(JSON.stringify({ existingJobId: ASTRA_JOB, state: safe(job.state), detail: safe(job.detail), error: safe(job.error), errorCode: safe(job.error_code), paidRequestsMadeByThisRead: 0 }, null, 2))
// Offline export diagnostic uses a deterministic local fixture, not a new AI result.
try { await exportBlueprintGlb(demoBlueprint('solar rover garden')); console.log('OFFLINE_EXPORT_FIXTURE_PASSED') }
catch (e) { console.log('OFFLINE_EXPORT_FIXTURE_ERROR:', safe(e.message)) }
