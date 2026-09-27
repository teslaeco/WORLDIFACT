import { mkdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

const JOB_ID='6b2f93d1-9a6f-45db-a8ad-4b48f1c73721'
const PROMPT='Create one small low-complexity blue ceramic chess rook test asset with clean stable geometry, simple UVs and one neutral material. GAME test only; no manufacturing claim.'
const endpoint=new URL(process.env.ORACLE_ENDPOINT||'')
if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password||endpoint.search||endpoint.hash) throw new Error('Invalid Oracle endpoint')
const token=process.env.ORACLE_API_TOKEN||''
if(token.length<20||token.length>512||/[\r\n]/.test(token)) throw new Error('Invalid Oracle token')
const base=endpoint.origin
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
function assert(v,m){if(!v)throw new Error(m)}
async function req(path,init={}){
  return fetch(base+path,{...init,redirect:'manual',signal:AbortSignal.timeout(190000),
    headers:{Authorization:'Bearer '+token,Accept:'application/json, model/gltf-binary',...(init.body?{'Content-Type':'application/json'}:{})}})
}
async function json(response,label){
  const text=await response.text()
  assert(text.length<65536,label+' oversized')
  let value
  try{value=JSON.parse(text)}catch{throw new Error(label+' invalid JSON')}
  return {response,value}
}
const health=await json(await req('/v1/health'),'health')
assert(health.response.ok&&health.value.ready===true&&health.value.provider==='openai'&&health.value.model==='gpt-6-astra','Oracle not ready')
console.log('HEALTH',JSON.stringify({ready:health.value.ready,provider:health.value.provider,model:health.value.model,connectorVersion:health.value.connectorVersion}))

let lookup=await req('/v1/jobs/'+JOB_ID)
let job
if(lookup.status===200){
  job=(await json(lookup,'existing job')).value
  console.log('RESUME',JOB_ID,job.state)
}else{
  assert(lookup.status===404,'unexpected lookup HTTP '+lookup.status)
  await lookup.body?.cancel().catch(()=>{})
  const submit=await req('/v1/jobs',{method:'POST',body:JSON.stringify({id:JOB_ID,prompt:PROMPT})})
  const parsed=await json(submit,'submit')
  assert([200,202].includes(submit.status),'submit HTTP '+submit.status+' '+String(parsed.value.error||''))
  assert(parsed.value.id===JOB_ID,'job id mismatch')
  job=parsed.value
  console.log('SUBMITTED',JOB_ID,job.state)
}
const terminal=new Set(['succeeded','failed','cancelled'])
const deadline=Date.now()+12*60*1000
while(!terminal.has(job.state)&&Date.now()<deadline){
  await sleep(10000)
  const poll=await json(await req('/v1/jobs/'+JOB_ID),'poll')
  assert(poll.response.status===200,'poll HTTP '+poll.response.status)
  job=poll.value
  console.log('POLL',job.state,String(job.detail||'').slice(0,180))
}
assert(job.state==='succeeded','generation ended '+job.state+': '+String(job.detail||''))

const model=await req('/v1/jobs/'+JOB_ID+'/model')
assert(model.status===200,'model HTTP '+model.status)
const bytes=Buffer.from(await model.arrayBuffer())
assert(bytes.length>=20,'model too small')
assert(bytes.subarray(0,4).toString('ascii')==='glTF','invalid GLB magic')
assert(bytes.readUInt32LE(4)===2,'invalid GLB version')
assert(bytes.readUInt32LE(8)===bytes.length,'invalid GLB length')
await mkdir('.evidence/oracle-generation-proof',{recursive:true})
await writeFile('.evidence/oracle-generation-proof/test-rook.glb',bytes)
const proof={jobId:JOB_ID,state:job.state,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),model:'gpt-6-astra'}
await writeFile('.evidence/oracle-generation-proof/proof.json',JSON.stringify(proof,null,2)+'\n')
console.log('WORLDIFACT_ORACLE_GENERATION_PROOF_PASS',JSON.stringify(proof))
