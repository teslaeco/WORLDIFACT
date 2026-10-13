import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'

const APPROVAL = 'worldifact-sol-luna-live-acceptance-20261013-v1'
const JOBS = Object.freeze([
  { name: 'sol', model: 'sol', provider: 'gpt-6.1-sol', jobId: '5f017611-1d33-4e9a-8b3d-02f4c6d47001', ceilingUsd: 0.35,
    prompt: 'Create one compact premium 8x8 wooden chessboard test asset with exactly 64 alternating squares, no chess pieces, a thin blue-green LED rim, simple clean PBR wood materials, and a low rectangular base. Keep geometry efficient and fully 3D. GAME asset only; MAKE is not validated.' },
  { name: 'luna', model: 'luna', provider: 'gpt-6-luna', jobId: '5f017611-1d33-4e9a-8b3d-02f4c6d47002', ceilingUsd: 0.10,
    prompt: 'Create one compact premium 8x8 wooden chessboard test asset with exactly 64 alternating squares, no chess pieces, a thin violet-amber LED rim, simple clean PBR wood materials, and a low rectangular base. Keep geometry efficient and fully 3D. GAME asset only; MAKE is not validated.' },
])
const OWNER = createHash('sha256').update(APPROVAL + ':owner').digest('hex')
const FINGERPRINT = createHash('sha256').update(APPROVAL + ':fingerprint').digest('hex')
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const hash = b => createHash('sha256').update(b).digest('hex')
const terminal = new Set(['succeeded','failed','cancelled'])

function origin(value) {
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('INVALID_ORACLE_ENDPOINT')
  return url.origin
}
async function bounded(response, max = 50_000_000) {
  if (!response.ok) throw new Error('HTTP_' + response.status)
  const a = Buffer.from(await response.arrayBuffer())
  if (!a.length || a.length > max) throw new Error('INVALID_BODY_SIZE')
  return a
}
async function j(response, max = 262144) {
  const b = await bounded(response, max)
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('JSON_REQUIRED')
  return JSON.parse(b.toString())
}
async function claim(env) {
  if (env.GITHUB_REPOSITORY !== 'teslaeco/WORLDIFACT' || !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA || '') || !env.GITHUB_TOKEN) throw new Error('GITHUB_APPROVAL_CONFIG')
  const r = await fetch('https://api.github.com/repos/teslaeco/WORLDIFACT/git/refs', {
    method:'POST', redirect:'error', signal:AbortSignal.timeout(15000),
    headers:{Authorization:'Bearer '+env.GITHUB_TOKEN,Accept:'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'},
    body:JSON.stringify({ref:'refs/tags/'+APPROVAL,sha:env.GITHUB_SHA})
  })
  if (r.status !== 201) { await r.body?.cancel(); throw new Error('APPROVAL_ALREADY_CLAIMED_NO_RETRY') }
  const x = await j(r, 32768)
  if (x.ref !== 'refs/tags/'+APPROVAL || x.object?.sha !== env.GITHUB_SHA) throw new Error('APPROVAL_NOT_CONFIRMED')
}
function agentInstructions(model) {
  return `WORLDIFACT live acceptance test for ${model}. Build exactly one small complete 3D object and do not start any other job.
Use the supervised Blender MCP tool contract only:
1. get_modeling_contract once;
2. build_model once with a complete scene;
3. inspect front, side, back and three-quarter renders;
4. get_current_model summary and correct only a concrete blocking issue if required;
5. finish_model once with an honest accepted flag.
Export the actual self-contained GLB. Keep geometry/materials compact. Do not claim manufacturing approval. Do not retry provider execution if anything becomes uncertain.`
}
async function call(base, token, path, init = {}, timeout = 30000) {
  return fetch(base + path, { ...init, redirect:'error', signal:AbortSignal.timeout(timeout),
    headers:{Authorization:'Bearer '+token,'X-WORLDIFACT-Owner':OWNER,'X-WORLDIFACT-Fingerprint':FINGERPRINT,Accept:'application/json',...(init.body?{'Content-Type':'application/json'}:{}),...(init.headers||{})} })
}
async function runOne(base, token, spec, out) {
  const pre = await call(base,token,'/v1/jobs/'+spec.jobId)
  if (pre.status !== 404) { await pre.body?.cancel(); throw new Error(spec.name.toUpperCase()+'_JOB_ALREADY_EXISTS_NO_RETRY') }
  await pre.body?.cancel()
  const payload = { id:spec.jobId, prompt:spec.prompt, agentInstructions:agentInstructions(spec.provider),
    studioExecution:{revision:'studio-execution-v1',model:spec.model,mode:'standard'} }
  const staged = await call(base,token,'/v1/jobs/stage',{method:'POST',body:JSON.stringify(payload)})
  if (staged.status !== 202) { const s=staged.status; await staged.body?.cancel(); throw new Error(spec.name.toUpperCase()+'_STAGE_'+s) }
  const stageBody = await j(staged,32768), receipt = stageBody.admission
  if (!receipt || receipt.id !== spec.jobId || !/^[a-f0-9]{64}$/.test(receipt.payloadSha256||'')) throw new Error(spec.name.toUpperCase()+'_STAGE_RECEIPT_INVALID')
  const started = await call(base,token,'/v1/jobs/start',{method:'POST',body:JSON.stringify({id:spec.jobId,payloadSha256:receipt.payloadSha256,deadline:Date.now()+120000})})
  if (started.status !== 202) { const s=started.status; await started.body?.cancel(); throw new Error(spec.name.toUpperCase()+'_START_'+s) }
  await started.body?.cancel()
  let job
  for (let n=0;n<90;n++) {
    await sleep(n?10000:2500)
    const r=await call(base,token,'/v1/jobs/'+spec.jobId,{},30000)
    if (r.status !== 200) { const s=r.status; await r.body?.cancel(); throw new Error(spec.name.toUpperCase()+'_READ_'+s) }
    job=await j(r,32768)
    if (job.id !== spec.jobId || typeof job.state !== 'string') throw new Error(spec.name.toUpperCase()+'_IDENTITY')
    if (terminal.has(job.state)) break
    if (n%6===0) console.log(spec.name,'state',job.state)
  }
  if (job?.state !== 'succeeded') throw new Error(spec.name.toUpperCase()+'_NOT_SUCCEEDED_'+String(job?.state))
  const model = await call(base,token,'/v1/jobs/'+spec.jobId+'/model',{},180000)
  const glb = await bounded(model)
  if (glb.length < 20 || glb.subarray(0,4).toString('ascii') !== 'glTF' || glb.readUInt32LE(4) !== 2 || glb.readUInt32LE(8) !== glb.length)
    throw new Error(spec.name.toUpperCase()+'_INVALID_GLB')
  await writeFile(out+'/'+spec.name+'.glb',glb)
  return {status:'PASSED',jobId:spec.jobId,model:spec.provider,mode:'standard',maximumProviderUsd:spec.ceilingUsd,bytes:glb.length,sha256:hash(glb),state:job.state}
}

const env=process.env
if (env.WORLDIFACT_SOL_LUNA_APPROVAL !== 'SOL_LUNA_ONCE_20261013' || env.GITHUB_RUN_ATTEMPT !== '1') throw new Error('APPROVAL_MISSING')
if (!env.ORACLE_ENDPOINT || !env.ORACLE_API_TOKEN) throw new Error('ORACLE_CONFIG_MISSING')
const base=origin(env.ORACLE_ENDPOINT), out='sol-luna-live-evidence'
await mkdir(out,{recursive:true})
await claim(env)
const report={approval:APPROVAL,startedAt:new Date().toISOString(),automaticRetries:0,maximumCombinedProviderUsd:0.45,results:[]}
for (const spec of JOBS) {
  try {
    const value=await runOne(base,env.ORACLE_API_TOKEN,spec,out)
    report.results.push(value); console.log(JSON.stringify(value))
  } catch (e) {
    const fail={status:'FAILED',name:spec.name,reason:String(e?.message||'UNKNOWN').slice(0,180)}
    report.results.push(fail); console.error(JSON.stringify(fail)); await writeFile(out+'/report.json',JSON.stringify(report,null,2)); process.exit(1)
  }
}
report.finishedAt=new Date().toISOString()
await writeFile(out+'/report.json',JSON.stringify(report,null,2))
console.log(JSON.stringify(report,null,2))
