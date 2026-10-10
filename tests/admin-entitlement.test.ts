import { studioApi, type StudioEnv } from '../server/studio.ts'
import { GenerationBudget, type BudgetStorage } from '../server/budget.ts'
import { detailedHealthFixture, detailedGLBFixture } from './detailed-studio-fixture.ts'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AccountEntitlements, entitlementApi, entitlementCall, entitlementStatus, reserveUserGeneration, type EntitlementEnv, type EntitlementStorage } from '../server/entitlements.ts'
import { ADMIN_JOB_PREFIX, adminAllocation, type AdminAllocation } from '../server/adminEntitlement.ts'
import { MODEL_ECONOMICS } from '../server/generationEconomics.ts'
import { quoteGeneration } from '../src/lib/generationQuote.ts'
const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const NOW = Date.now(), HASH = 'a'.repeat(64)
function fixture(overrides: Partial<AdminAllocation> = {}) {
  let now = NOW, fail = ''
  const allocation: AdminAllocation = { version: 1, accountId: USER, approvalId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', startsAt: NOW - 1000, expiresAt: NOW + 86400000, maxProviderCents: 350, maxJobs: 2, models: ['astra', 'sol', 'luna'], ...overrides }
  const maps = new Map<string, Map<string, unknown>>(), instances = new Map<string, AccountEntitlements>()
  const env: EntitlementEnv = { ACCOUNT_LEDGER_MODE: 'sandbox', ENFORCE_ACCOUNT_ENTITLEMENTS: 'true', ENABLE_ASTRA_PLANS: 'true', WORLDIFACT_ADMIN_ENABLED: 'true', WORLDIFACT_ADMIN_ALLOCATION: JSON.stringify(allocation) }
  env.ACCOUNT_ENTITLEMENTS = { idFromName: name => name, get: key => {
    const name = String(key)
    if (!instances.has(name)) {
      if (!maps.has(name)) maps.set(name, new Map())
      let queue: Promise<unknown> = Promise.resolve()
      const wrap = (data: Map<string, unknown>): EntitlementStorage => ({
        async get<T>(k: string) { return structuredClone(data.get(k)) as T | undefined },
        async put(k, v) { if (k === fail) throw new Error('injected atomic failure'); data.set(k, structuredClone(v)) },
        async list<T>({prefix, startAfter, limit}: {prefix: string; startAfter?: string; limit: number}) { return new Map([...data.entries()].filter(([k]) => k.startsWith(prefix) && (!startAfter || k > startAfter)).sort(([a],[b])=>a.localeCompare(b)).slice(0,limit)) as Map<string,T> },
        transaction<T>(cb: (s: EntitlementStorage)=>Promise<T>) { const p = queue.then(async()=>{const next = structuredClone(maps.get(name)!); const result = await cb(wrap(next)); maps.set(name, next); return result}); queue=p.catch(()=>undefined); return p },
      })
      const storage: EntitlementStorage = {get: k=>wrap(maps.get(name)!).get(k), put: (k,v)=>wrap(maps.get(name)!).put(k,v), list: o=>wrap(maps.get(name)!).list!(o), transaction: cb=>wrap(maps.get(name)!).transaction(cb)}
      instances.set(name,new AccountEntitlements({storage,id:{toString:()=>name}},env,()=>now))
    }
    return { fetch: r=>instances.get(name)!.fetch(r) }
  } }
  return { env, allocation, data: (user=USER)=>maps.get('account:sandbox:v1:'+user)!, restart:()=>instances.clear(), advance:(ms:number)=>{now+=ms}, fail:(key:string)=>{fail=key},
    reserve: (id=crypto.randomUUID(),user=USER,channel:'studio'|'blueprint'='studio',model:'astra'|'sol'|'luna'='astra')=>reserveUserGeneration(env,user,id,model==='astra'?'slow':'fast',model,HASH,'standard',{channel,prompt:'Test object',...(channel==='blueprint'?{blueprintDispatch:'fenced-v1',providerModel:MODEL_ECONOMICS[model].model}:{})}),
    call: <T=any>(path:string,body?:unknown,user=USER)=>entitlementCall<T>(env,user,path,body) }
}
test('owner uses isolated allocation without customer subscription, points or provider pool mutations',async()=>{
  const f=fixture(),id=crypto.randomUUID(),before=await entitlementStatus(f.env,USER)
  assert.equal(before.subscription.active,false);assert.equal(before.credits,0);assert.equal(before.studioAdmission.allowed,true)
  assert.equal((await f.reserve(id)).cost,0)
  for (const key of ['balance','customer-reserved-credits:v1','provider-budget-cents:v1','subscription','usage']) assert.equal(f.data().has(key),false,key)
  assert.equal((f.data().get(ADMIN_JOB_PREFIX+id) as any).adminFunding.capCents,175)
  assert.equal((f.data().get('job:'+id) as any).state,'failed')
  assert.equal((await entitlementStatus(f.env,USER)).admin?.remainingProviderCents,175)
  assert.equal((await f.reserve(undefined,OTHER)).allowed,false)
})
test('duplicate clicks, restart, budget and dispatch races commit and dispatch once',async()=>{
  const f=fixture(),id=crypto.randomUUID()
  const reservations=await Promise.all(Array.from({length:15},()=>f.reserve(id)))
  assert.equal(reservations.filter(x=>x.allowed&&!x.repeated).length,1)
  f.restart();assert.equal((await f.reserve(id)).repeated,true)
  const claims=await Promise.all(Array.from({length:12},()=>f.call('/studio-dispatch',{id,fingerprint:HASH})))
  assert.equal(claims.filter(x=>x.dispatch).length,1)
  const concurrent=await Promise.all(Array.from({length:10},()=>f.reserve()))
  assert.equal(concurrent.filter(x=>x.allowed).length,1)
  assert.equal((await entitlementStatus(f.env,USER)).admin?.remainingProviderCents,0)
})
test('completed admin model remains in same-user library and downloads after expiry, without a subscription',async()=>{
  const f=fixture(),id=crypto.randomUUID();await f.reserve(id);await f.call('/studio-dispatch',{id,fingerprint:HASH})
  await f.call('/settle',{id,state:'completed'})
  f.advance(2*86400000);f.restart()
  assert.equal((await f.call('/job',{id})).downloadAllowed,true)
  assert.equal((await f.call('/studio-library')).models[0].id,id)
  assert.equal((await f.call('/studio-library')).models[0].downloadAllowed,true)
  assert.equal((await f.call('/job',{id},OTHER)).owned,false)
  assert.equal((await f.call('/studio-library',undefined,OTHER)).models.length,0)
})
test('emergency disable and expiry block dispatch of prepared admin jobs; failed jobs never replenish budget',async()=>{
  for(const operation of ['disable','expiry','model','billing'] as const){
    const f=fixture(),id=crypto.randomUUID();await f.reserve(id)
    if(operation==='disable')f.env.WORLDIFACT_ADMIN_ENABLED='false'
    if(operation==='expiry')f.advance(2*86400000)
    if(operation==='model')f.env.WORLDIFACT_ADMIN_ALLOCATION=JSON.stringify({...f.allocation,models:['sol']})
    if(operation==='billing')f.data().set('billingHold',true)
    f.restart();assert.equal((await f.call('/studio-dispatch',{id,fingerprint:HASH})).dispatch,false)
    await f.call('/settle',{id,state:'failed'})
    assert.equal((f.data().get('admin-allocation:v1:'+f.allocation.approvalId) as any).committedCents,175)
    assert.equal(f.data().has('balance'),false)
  }
})
test('atomic failure rolls back the allocation and job; same request safely retries',async()=>{
  const f=fixture(),id=crypto.randomUUID();f.fail(ADMIN_JOB_PREFIX+id)
  await assert.rejects(()=>f.reserve(id));assert.equal(f.data().size,0)
  f.fail('');assert.equal((await f.reserve(id)).allowed,true)
})
test('configuration is strict, bounded and identity-bound; edits cannot refill an existing allocation',async()=>{
  const f=fixture();assert.equal(adminAllocation(f.env,OTHER,NOW),null)
  for(const patch of [{accountId:'owner@example.com'},{maxJobs:0},{maxProviderCents:Infinity},{expiresAt:NOW},{role:'admin'},{models:['astra','astra']}]){
    assert.equal(adminAllocation({...f.env,WORLDIFACT_ADMIN_ALLOCATION:JSON.stringify({...f.allocation,...patch})},USER,NOW),null)
  }
  await f.reserve();f.env.WORLDIFACT_ADMIN_ALLOCATION=JSON.stringify({...f.allocation,maxProviderCents:700});f.restart()
  await assert.rejects(()=>f.reserve())
})
test('all Blueprint model routes preserve model binding and one-use dispatch without free-pool admission',async()=>{
  for(const model of ['sol','astra','luna'] as const){
    const f=fixture(),id=crypto.randomUUID();const r=await f.reserve(id,USER,'blueprint',model)
    assert.equal(r.allowed,true);assert.equal(r.kind,'credits');assert.equal(r.cost,0)
    assert.equal((await f.call('/blueprint-dispatch',{id,fingerprint:HASH})).dispatch,true)
    assert.equal((await f.call('/blueprint-dispatch',{id,fingerprint:HASH})).dispatch,false)
  }
})
test('UI displays explicit admin budget and zero point cost only with server admission',async()=>{
  const f=fixture(),status=await entitlementStatus(f.env,USER)
  const quote=quoteGeneration('astra',status,{},true,true)
  assert.equal(quote.points,0);assert.match(quote.message,/ADMIN budget/)
  assert.notEqual(quoteGeneration('astra',{...status,studioAdmission:{allowed:false,reason:'ASTRA_RUNTIME_DISABLED'}},{},true,true).points,0)
})
test('authenticated Oracle receipt is retained as a bound, never called actual cost or used to mint credits',async()=>{
  const f=fixture(),id=crypto.randomUUID();await f.reserve(id);await f.call('/studio-dispatch',{id,fingerprint:HASH});await f.call('/settle',{id,state:'completed'})
  const receipt={revision:'worldifact-terminal-budget-v1',jobId:id,model:'gpt-6-astra',policyRevision:'astra-low-reconciled-v2',capMicroUsd:1750000,maximumLiabilityMicroUsd:420001,sealed:true,sealId:'b'.repeat(64)}
  assert.equal((await f.call('/reconcile-studio-provider',{id,receipt})).retainedCents,43)
  assert.equal((await f.call('/reconcile-studio-provider',{id,receipt})).repeated,true)
  assert.equal((await entitlementStatus(f.env,USER)).admin?.remainingProviderCents,175)
  assert.equal(f.data().has('balance'),false)
})

test('authenticated Studio HTTP pipeline uses real handlers with a fixture provider: prepare, submit, recover, library, download',async()=>{
  const f=fixture(),env:StudioEnv={...f.env,OWNER_ACCESS_TOKEN:'test-signing-secret-'.repeat(4),ORACLE_ENDPOINT:'https://worker.trycloudflare.com',ORACLE_API_TOKEN:'inert-test-token',PUBLIC_PILOT:'true',ENABLE_STUDIO_JOBS:'true',GENERATION_REQUEST_LIMIT:'unlimited',GENERATION_LIMITER:{async limit(){return {success:true}}}}
  const data=new Map<string,number>();let queue:Promise<unknown>=Promise.resolve()
  const store:BudgetStorage={async get<T>(k:string){return data.get(k) as T|undefined},async put(k,v){data.set(k,v)},transaction<T>(cb:(s:BudgetStorage)=>Promise<T>){const p=queue.then(()=>cb(store));queue=p.catch(()=>{});return p}}
  const budget=new GenerationBudget({storage:store},env);env.GENERATION_BUDGET={idFromName:n=>n,get:()=>budget}
  let posts=0
  const fetcher:typeof fetch=async(url,init)=>{
    const path=new URL(String(url)).pathname
    if(path==='/auth/v1/user')return Response.json({id:new Headers(init?.headers).get('Authorization')==='Bearer owner-token'?USER:OTHER,email:'fixture@example.test',user_metadata:{role:'admin'}})
    if(path==='/v1/health')return Response.json(detailedHealthFixture)
    if(path==='/v1/jobs'){posts++;return Response.json({id:JSON.parse(String(init?.body)).id,state:'building'})}
    if(path.endsWith('/model')){const bytes=detailedGLBFixture();return new Response(bytes,{headers:{'Content-Type':'model/gltf-binary','Content-Length':String(bytes.length)}})}
    if(path.endsWith('/budget'))return Response.json({}, {status:404})
    return Response.json({id:path.split('/').pop(),state:'succeeded'})
  }
  const input={worldId:'enchanted-ai-shop',prompt:'A detailed blue chess rook',purpose:'figurine',textureMaxSize:4096,photos:[]}
  const call=(path:string,method='GET',body?:unknown,ticket?:string,owner=true)=>studioApi(new Request('https://site.test'+path,{method,headers:{Origin:'https://site.test','Content-Type':'application/json',Cookie:'__Host-worldifact-access='+(owner?'owner-token':'other-token'),...(ticket?{'X-WORLDIFACT-Job':ticket}:{})},...(body?{body:JSON.stringify(body)}:{})}),env,fetcher)
  const prepared=await call('/api/studio/prepare','POST',input);assert.equal(prepared.status,200,await prepared.clone().text())
  const receipt=await prepared.json() as {id:string;ticket:string}
  assert.equal((await call('/api/studio/jobs','POST',input,receipt.ticket,false)).status,401)
  const submit=await call('/api/studio/jobs','POST',input,receipt.ticket);assert.equal(submit.status,202,await submit.clone().text())
  const poll=await call('/api/studio/jobs/'+receipt.id,'GET',undefined,receipt.ticket);assert.equal(poll.status,200,await poll.clone().text())
  assert.equal((await poll.json() as any).job.state,'succeeded')
  const download=await call('/api/studio/jobs/'+receipt.id+'/model','GET',undefined,receipt.ticket);assert.equal(download.status,200,await download.clone().text());assert.equal(new DataView(await download.arrayBuffer()).getUint32(0,true),0x46546c67)
  const models=await f.call('/studio-library');assert.equal(models.models[0].id,receipt.id)
  const retry=await call('/api/studio/jobs','POST',input,receipt.ticket);assert.equal(retry.status,202);assert.equal(posts,1)
  assert.equal((await call('/api/studio/current?job='+receipt.id)).status,200)
  env.ENABLE_STUDIO_JOBS='false';assert.equal((await call('/api/studio/prepare','POST',input)).status,503);assert.equal(posts,1)
  assert.equal((await entitlementStatus(env,USER)).credits,0);assert.equal((await entitlementStatus(env,USER)).subscription.active,false)
})

test('forged browser headers and editable metadata cannot identify an administrator',async()=>{
 const f=fixture()
 const fetcher:typeof fetch=async()=>Response.json({id:OTHER,email:'fixture@example.test',user_metadata:{role:'admin',admin:true,owner:true}})
 const r=await entitlementApi(new Request('https://site.test/api/account/entitlements',{headers:{Cookie:'__Host-worldifact-access=other-token','X-WORLDIFACT-Verified-Account':USER,'X-Admin':'true'}}),f.env,fetcher)
 assert.equal(r!.status,200);const v=await r!.json() as any;assert.equal(v.admin,undefined);assert.equal(v.studioAdmission.allowed,false)
})
