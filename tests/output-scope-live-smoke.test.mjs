import test from 'node:test'
import assert from 'node:assert/strict'
import {APPROVAL,JOB,MAX_COST_USD,testInput,bytes,run,validateEnvelope} from '../scripts/approved-output-scope-smoke.mjs'
const env={WORLDIFACT_TEST_APPROVAL:APPROVAL,GITHUB_RUN_ATTEMPT:'1',GITHUB_REPOSITORY:'teslaeco/WORLDIFACT',GITHUB_SHA:'a'.repeat(40),GITHUB_TOKEN:'synthetic-approval-token',ORACLE_API_TOKEN:'synthetic-oracle-token'.repeat(3),ORACLE_ENDPOINT:'https://synthetic-test.trycloudflare.com'}
const timestamp=Date.parse('2026-10-10T01:00:00Z')
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}})
const ready={ready:true,codexReady:true,provider:'openai',model:'gpt-6-astra',connectorVersion:33,astraBudgetRevision:'astra-usd175-v1',astraBudgetMaxUsd:1.75,astraBudgetPreflight:'input-tokens',astraBudgetExpiry:1793145600}
function fixture(mode='failed'){
 const calls=[]
 const fetcher=async(url,options)=>{
  calls.push({url,options})
  if(url.endsWith('/health'))return reply(ready)
  if(url.endsWith('/git/refs'))return reply({ref:'refs/tags/'+APPROVAL,object:{sha:env.GITHUB_SHA}},mode==='claimed'?422:201)
  if(url.endsWith('/v1/jobs')){if(mode==='lost')throw Error('PRIVATE CREDENTIAL');return reply({id:JOB,state:'queued'},202)}
  if(url.endsWith('/v1/jobs/'+JOB)){
   const reads=calls.filter(v=>v.url.endsWith('/v1/jobs/'+JOB)).length
   if(reads===1)return reply({},mode==='exists'?200:404)
   return reply({id:mode==='wrong'?'wrong':JOB,state:'failed',detail:mode==='private'?'Bearer PRIVATE_KEY https://secret/':'complete_scene_not_supported'})
  }
  throw Error('UNEXPECTED ROUTE')
 }
 return {calls,fetcher}
}
test('one fixed legacy175 digital object with no billing selection',()=>{const i=testInput();assert.equal(MAX_COST_USD,1.75);assert.equal(i.purpose,'object');assert.equal(i.budgetTier,undefined);assert.deepEqual(i.photos,[]);assert.ok(i.prompt.length<4000)})
test('missing, expired or replayed approval never contacts any service',async()=>{for(const e of [{...env,WORLDIFACT_TEST_APPROVAL:''},{...env,GITHUB_RUN_ATTEMPT:'2'}]){let n=0;const r=await run(e,{fetcher:()=>{n++;throw Error()},now:()=>timestamp});assert.equal(n,0);assert.equal(r.dispatchAttempts,0)}let n=0;await run(env,{fetcher:()=>{n++},now:()=>Date.parse('2026-10-12')});assert.equal(n,0)})
test('existing job or claimed authorization cannot buy another request',async()=>{for(const mode of ['exists','claimed']){const f=fixture(mode);const r=await run(env,{...f,now:()=>timestamp,wait:async()=>{}});assert.equal(r.dispatchAttempts,0);assert.equal(f.calls.filter(v=>v.url.endsWith('/v1/jobs')).length,0)}})
test('failed new model submits once, records exact failure and preserves state',async()=>{const f=fixture();const r=await run(env,{...f,now:()=>timestamp,wait:async()=>{}});assert.equal(r.status,'MODEL_FAILED');assert.equal(r.reason,'complete_scene_not_supported');assert.equal(r.dispatchAttempts,1);assert.equal(r.customerFinancialOperations,0);assert.equal(r.actualCostUsd,null);assert.equal(f.calls.filter(v=>v.url.endsWith('/v1/jobs')).length,1)})
test('lost submission response recovers only the same job and never resubmits',async()=>{const f=fixture('lost');const r=await run(env,{...f,now:()=>timestamp,wait:async()=>{}});assert.equal(r.status,'MODEL_FAILED');assert.equal(f.calls.filter(v=>v.url.endsWith('/v1/jobs')).length,1);assert.equal(JSON.stringify(r).includes('PRIVATE'),false)})
test('wrong job identity is terminal and private details are not printed',async()=>{for(const mode of ['wrong','private']){const f=fixture(mode);const r=await run(env,{...f,now:()=>timestamp,wait:async()=>{}});assert.equal(JSON.stringify(r).includes('PRIVATE_KEY'),false);assert.equal(JSON.stringify(r).includes('https://secret'),false);assert.equal(f.calls.filter(v=>v.url.endsWith('/v1/jobs')).length,1)}})
test('bounded downloads reject oversized, malformed and non-success payloads',async()=>{await assert.rejects(bytes(new Response('123456'),3));await assert.rejects(bytes(new Response('{}',{status:401})));await assert.rejects(bytes(new Response('short',{headers:{'content-length':'9'}})));assert.throws(()=>validateEnvelope({id:'wrong',state:'succeeded'}))})

function inertGlb(){
 const vertices=new Float32Array(300*3)
 for(let i=0;i<vertices.length;i++)vertices[i]=(i%7)/10
 const doc={asset:{version:'2.0'},buffers:[{byteLength:vertices.byteLength}],bufferViews:[{buffer:0,byteOffset:0,byteLength:vertices.byteLength}],accessors:[{bufferView:0,componentType:5126,count:300,type:'VEC3'}],meshes:Array.from({length:12},(_,i)=>({primitives:[{attributes:{POSITION:0},material:i%4}]})),materials:Array.from({length:4},()=>({})),nodes:Array.from({length:12},(_,i)=>({mesh:i})),scenes:[{nodes:Array.from({length:12},(_,i)=>i)}],scene:0}
 const text=Buffer.from(JSON.stringify(doc)),length=Math.ceil(text.length/4)*4
 const result=Buffer.alloc(20+length+8+vertices.byteLength)
 result.writeUInt32LE(0x46546c67,0);result.writeUInt32LE(2,4);result.writeUInt32LE(result.length,8);result.writeUInt32LE(length,12);result.writeUInt32LE(0x4e4f534a,16);result.fill(32,20,20+length);text.copy(result,20)
 result.writeUInt32LE(vertices.byteLength,20+length);result.writeUInt32LE(0x004e4942,24+length);Buffer.from(vertices.buffer).copy(result,28+length)
 return result
}
test('only a matching reviewed GLB is saved; repeated download does not submit again',async()=>{
 const {createHash}=await import('node:crypto');const model=inertGlb();const sha=createHash('sha256').update(model).digest('hex')
 for(const mode of ['reviewed','draft','wronghash']){
  let post=0,read=0;const saved=[]
  const fetcher=async(url,opt)=>{
   if(url.endsWith('/health'))return reply(ready)
   if(url.endsWith('/git/refs'))return reply({ref:'refs/tags/'+APPROVAL,object:{sha:env.GITHUB_SHA}},201)
   if(url.endsWith('/v1/jobs')){post++;return reply({id:JOB,state:'succeeded',modelStatus:mode==='draft'?'draft':'reviewed',modelSha256:sha},202)}
   if(url.endsWith('/quality'))return reply({modelStatus:'reviewed',modelSha256:mode==='wronghash'?'0'.repeat(64):sha,acceptanceGate:{passed:true}})
   if(url.endsWith('/model')){read++;return new Response(model,{headers:{'content-type':'model/gltf-binary'}})}
   return reply({},404)
  }
  const r=await run(env,{fetcher,now:()=>timestamp,persist:async(name,data)=>saved.push({name,data}),wait:async()=>{}})
  assert.equal(post,1);assert.equal(r.accountLibrarySaveVerified,false);assert.equal(r.signedInShopFlowVerified,false)
  if(mode==='reviewed'){assert.equal(r.status,'NEW_REVIEWED_GLB_VERIFIED');assert.equal(read,2);assert.equal(saved.length,1);assert.equal(r.model.sha256,sha)}else{assert.equal(r.status,'TEST_INCOMPLETE_NO_RESUBMISSION');assert.equal(saved.length,0)}
 }
})
