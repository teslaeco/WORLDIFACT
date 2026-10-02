import test from 'node:test'
import assert from 'node:assert/strict'
import { handle, type Env } from '../server/worker.ts'
import { AccountEntitlements, entitlementCall, entitlementStatus, reserveUserGeneration, type EntitlementStorage } from '../server/entitlements.ts'
import { assetSpecForBlueprint, demoBlueprint } from '../src/lib/blueprint.ts'
import { blueprintFingerprint, blueprintRequestId, BLUEPRINT_REFERENCE_BYTES } from '../src/lib/blueprintRequest.ts'
import { BlueprintClient, BLUEPRINT_RECOVERY_KEY } from '../src/lib/blueprintClient.ts'
import { ADMISSION_FAILURE_CODES, blueprintAdmissionDetail } from '../src/lib/generationAdmission.ts'

const origin = 'https://worldifact.test', uid = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', other = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lN8AAAAASUVORK5CYII='
const views = ['front','left','right','back','detail','other']
const payload = (count=0) => ({ worldId:'enchanted-ai-shop', mode:'live', model:'astra', prompt:'MCC cabinet color and shape concept', deliverable:'procedural-blueprint', references:views.slice(0,count).map(view=>({view,dataUrl:png})) })
function memory() {
  const data = new Map<string,unknown>();let queue:Promise<unknown>=Promise.resolve()
  const storage:EntitlementStorage={async get<T>(k:string){return structuredClone(data.get(k)) as T|undefined},async put(k,v){data.set(k,structuredClone(v))},transaction<T>(fn:(s:EntitlementStorage)=>Promise<T>){const p=queue.then(()=>fn(storage));queue=p.catch(()=>{});return p}}
  return {data,storage}
}
async function fixture() {
  let now=Date.now(),providerCalls=0,preflights=0,budgetCalls=0,mode='ok',sent:any
  const ledgers=new Map<string,ReturnType<typeof memory>>()
  const env:Env={OPENAI_API_KEY:'fixture-only',OPENAI_MODEL:'gpt-6-astra',OPENAI_FAST_MODEL:'gpt-6-sol',ENABLE_PAID_GENERATION:'true',ENABLE_ASTRA_PLANS:'true',PUBLIC_PILOT:'true',GENERATION_REQUEST_LIMIT:'unlimited',ENFORCE_ACCOUNT_ENTITLEMENTS:'true',GENERATION_LIMITER:{async limit(){return {success:true}}},GENERATION_BUDGET:{idFromName:n=>n,get:()=>({async fetch(){budgetCalls++;return Response.json({allowed:true})}})}}
  env.ACCOUNT_ENTITLEMENTS={idFromName:n=>n,get:n=>{const key=String(n);if(!ledgers.has(key))ledgers.set(key,memory());return new AccountEntitlements({storage:ledgers.get(key)!.storage},env,()=>now)}}
  const provider=(async(url:string|URL|Request,init?:RequestInit)=>{
    const path=new URL(String(url)).pathname
    if(path==='/auth/v1/user')return Response.json({id:new Headers(init?.headers).get('Authorization')==='Bearer bob-token'?other:uid,email:'fixture@example.test'})
    if(path==='/v1/responses/input_tokens'){preflights++;return Response.json({object:'response.input_tokens',input_tokens:1000})}
    assert.equal(path,'/v1/responses');providerCalls++;sent=JSON.parse(String(init?.body))
    if(mode==='timeout')throw new DOMException('fixture timeout','TimeoutError')
    if(mode==='http-failure')return Response.json({}, {status:500})
    if(mode==='json-failure')return new Response('not JSON')
    const blueprint=demoBlueprint('MCC cabinet'),assetSpec=assetSpecForBlueprint(blueprint)
    if(mode==='character-result'){assetSpec.name='Adult woman';assetSpec.summary='A heroine in a silver costume'}
    return Response.json({...(mode==='no-evidence'?{}:{id:'resp_repair_fixture'}),status:'completed',model:mode==='wrong-model'?'gpt-6-sol':sent.model,output:[{content:[mode==='refusal'?{type:'refusal'}:{type:'output_text',text:JSON.stringify(mode==='missing-spec'?{blueprint}:{blueprint,assetSpec})}]}]})
  }) as typeof fetch
  await entitlementCall(env,uid,'/grant',{id:'in_repair_fixture',credits:4500,subscriptionId:'sub_Repair'})
  await entitlementCall(env,uid,'/subscription',{id:'sub_Repair',active:true,until:now+86_400_000,revision:1,plan:'pro',grantId:'in_repair_fixture'})
  const request=(input:unknown=payload(),id: string=crypto.randomUUID())=>handle(new Request(origin+'/api/blueprint',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-WORLDIFACT-Request':id,Cookie:'__Host-worldifact-access=alice-token'},body:JSON.stringify(input)}),env,provider)
  const recover=(id:string,who='alice-token')=>handle(new Request(origin+'/api/blueprint/requests/'+id,{headers:{Cookie:'__Host-worldifact-access='+who}}),env,provider)
  return {env,request,recover,provider,change:(value:string)=>{mode=value},advance:(ms:number)=>{now+=ms},balance:async()=>(await entitlementStatus(env,uid)).credits,counts:()=>({providerCalls,preflights,budgetCalls}),sent:()=>sent,ledger:()=>ledgers.get('account:v1:'+uid)!.data}
}
for(const count of [1,4,6])test(`${count} reference views reach the provider in order and settle once`,async()=>{
  const f=await fixture(),input=payload(count),r=await f.request(input),result=await r.json() as any
  assert.equal(r.status,200);assert.equal(result.delivery.referenceCount,count);assert.equal(result.delivery.kind,'procedural-blueprint')
  assert.deepEqual(f.sent().input[0].content.filter((c:any)=>c.type==='input_image').map((c:any)=>c.image_url),input.references.map(p=>p.dataUrl))
  assert.deepEqual(f.sent().input[0].content.filter((c:any)=>c.type==='input_text').slice(1).map((c:any)=>c.text.split(': ')[1].split('.')[0]),views.slice(0,count))
  assert.equal(await f.balance(),4250);assert.equal(f.counts().providerCalls,1)
})
test('the entire 3,500-character prompt is transmitted without truncation',async()=>{
  const f=await fixture(),prompt=('MCC cabinet '+ 'panel '.repeat(600)).slice(0,3500)
  assert.equal((await f.request({...payload(4),prompt})).status,200)
  assert.equal(f.sent().input[0].content[0].text,prompt)
})
for(const [label,input] of [
  ['seven references',{...payload(),references:Array.from({length:7},()=>({view:'front',dataUrl:png}))}],
  ['bad magic',{...payload(1),references:[{view:'front',dataUrl:'data:image/png;base64,YmFk'}]}],
  ['coerced delivery',{...payload(),deliverable:['procedural-blueprint']}],
  ['bad view',{...payload(1),references:[{view:'surprise',dataUrl:png}]}],
  ['two ambiguous image fields',{...payload(1),image:png}],
  ['4,001 characters',{...payload(),prompt:'x'.repeat(4001)}],
] as const)test(`${label} is rejected before spending`,async()=>{
  const f=await fixture();assert.equal((await f.request(input)).status,400)
  assert.equal(await f.balance(),4500);assert.deepEqual(f.counts(),{providerCalls:0,preflights:0,budgetCalls:0})
})
test('combined reference byte limit is enforced without silently omitting images',async()=>{
  const f=await fixture(),b=Buffer.alloc(BLUEPRINT_REFERENCE_BYTES/2+1);Buffer.from('\x89PNG\r\n\x1a\n','latin1').copy(b)
  const dataUrl='data:image/png;base64,'+b.toString('base64')
  const r=await f.request({...payload(),references:[{view:'front',dataUrl},{view:'back',dataUrl}]})
  assert.ok([400,413].includes(r.status));assert.equal(await f.balance(),4500);assert.equal(f.counts().preflights,0)
})
for(const [name,input] of [
  ['Polish character',{...payload(4),prompt:'Stwórz realistyczny model 3D całej kobiecej postaci bez kuli.'}],
  ['English heroine',{...payload(4),prompt:'Reconstruct the adult heroine exactly from the references.'}],
  ['explicit detailed mesh',{...payload(4),deliverable:'detailed-mesh'}],
  ['legacy photo request',{worldId:'enchanted-ai-shop',model:'astra',prompt:'Create my model',mode:'live',image:png}],
] as const)test(`${name} cannot be charged for a procedural building`,async()=>{
  const f=await fixture(),r=await f.request(input),v=await r.json() as any
  assert.equal(r.status,422);assert.equal(v.code,'UNSUPPORTED_DELIVERABLE');assert.equal(v.noCharge,true)
  assert.equal(await f.balance(),4500);assert.deepEqual(f.counts(),{providerCalls:0,preflights:0,budgetCalls:0})
})
test('completed replay and account recovery return the same result without another charge',async()=>{
  const f=await fixture(),id=crypto.randomUUID(),r=await f.request(payload(4),id),first=await r.json()
  const repeat=await f.request(payload(4),id);assert.equal(repeat.status,200);assert.deepEqual(await repeat.json(),first)
  const status=await (await f.recover(id)).json() as any;assert.equal(status.state,'completed');assert.deepEqual(status.result,first)
  assert.equal((await f.request({...payload(4),prompt:'A different cabinet'},id)).status,409)
  assert.equal((await f.request({...payload(4),references:payload(4).references.toReversed()},id)).status,409)
  assert.deepEqual(f.counts(),{providerCalls:1,preflights:1,budgetCalls:1});assert.equal(await f.balance(),4250)
  const otherStatus=await (await f.recover(id,'bob-token')).json() as any;assert.equal(otherStatus.owned,false);assert.equal(otherStatus.result,undefined)
})
for(const mode of ['timeout','http-failure','json-failure','no-evidence','wrong-model','missing-spec','refusal','character-result'])test(`${mode} returns customer credits once and never replenishes provider spend`,async()=>{
  const f=await fixture(),id=crypto.randomUUID(),before=f.ledger().get('provider-budget-cents:v1');f.change(mode)
  const r=await f.request(payload(),id);assert.ok([422,502].includes(r.status))
  assert.equal(await f.balance(),4500)
  const status=await (await f.recover(id)).json() as any;assert.equal(status.state,'failed');assert.equal(status.refunded,true)
  const spent=f.ledger().get('provider-budget-cents:v1') as number;assert.ok(spent < Number(before))
  assert.equal((await f.request(payload(),id)).status,409);assert.equal(await f.balance(),4500)
  assert.equal(f.ledger().get('provider-budget-cents:v1'),spent);assert.equal(f.counts().providerCalls,1)
})
test('an abandoned synchronous reservation reconciles once and cannot later become a charged success',async()=>{
  const f=await fixture(),seed=crypto.randomUUID(),id=await blueprintRequestId(seed)
  await reserveUserGeneration(f.env,uid,id,'slow','astra',await blueprintFingerprint(payload()))
  assert.equal(await f.balance(),4250);const spend=f.ledger().get('provider-budget-cents:v1')
  f.advance(600_001)
  assert.equal((await (await f.recover(seed)).json() as any).refunded,true)
  assert.equal((await (await f.recover(seed)).json() as any).refunded,true)
  assert.equal(await f.balance(),4500);assert.equal(f.ledger().get('provider-budget-cents:v1'),spend)
})
test('lost POST response, page reload and repeated recovery produce only one provider call',async()=>{
  const f=await fixture(),data=new Map<string,string>(),store={getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v)},removeItem:(k:string)=>{data.delete(k)}}
  let posts=0,lose=true
  const transport=(async(url:string|URL|Request,init?:RequestInit)=>{
    if(String(url)==='/api/blueprint'){
      posts++;const response=await f.request(JSON.parse(String(init?.body)),new Headers(init?.headers).get('X-WORLDIFACT-Request')!)
      if(lose){lose=false;throw new TypeError('Fixture: connection lost after server completion')};return response
    }
    return f.recover(String(url).split('/').at(-1)!)
  }) as typeof fetch
  const a=new BlueprintClient(store,transport)
  await assert.rejects(a.submit(payload(4)),/connection lost/)
  assert.equal(a.current()?.state,'pending')
  await assert.rejects(a.submit({...payload(),prompt:'A changed prompt'}),/Different inputs/)
  const b=new BlueprintClient(store,transport),result=await b.submit(payload(4))
  assert.equal(result.delivery?.referenceCount,4);assert.equal(b.current()?.state,'completed')
  await b.submit(payload(4));assert.equal(posts,1);assert.equal(f.counts().providerCalls,1);assert.equal(await f.balance(),4250)
  assert.ok(!data.get(BLUEPRINT_RECOVERY_KEY)!.includes(png));assert.ok(!data.get(BLUEPRINT_RECOVERY_KEY)!.includes(payload().prompt))
})

for (const failure of ['service-disabled', 'rate-limited', 'model-disabled', 'credits-empty'] as const) test(`${failure} is definitively rejected without stranding client recovery`, async () => {
  const f = await fixture()
  if (failure === 'service-disabled') f.env.ENABLE_PAID_GENERATION = 'false'
  if (failure === 'rate-limited') f.env.GENERATION_LIMITER = { async limit() { return { success: false } } }
  if (failure === 'model-disabled') f.env.ENABLE_ASTRA_PLANS = 'false'
  if (failure === 'credits-empty') f.ledger().set('balance', 0)
  const data = new Map<string, string>(), store = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v) }, removeItem: (k: string) => { data.delete(k) } }
  const client = new BlueprintClient(store, (async (_url: unknown, init?: RequestInit) => f.request(JSON.parse(String(init?.body)), new Headers(init?.headers).get('X-WORLDIFACT-Request')!)) as typeof fetch)
  await assert.rejects(client.submit(payload()))
  assert.equal(client.current()?.state, 'failed')
  client.reset(); assert.equal(client.current(), null)
  assert.equal(f.counts().providerCalls, 0)
  assert.equal(await f.balance(), failure === 'credits-empty' ? 0 : 4500)
})

test('Blueprint transport preserves the native fetch receiver for submission and recovery', async () => {
  const f = await fixture(), data = new Map<string, string>()
  const store = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v) }, removeItem: (k: string) => { data.delete(k) } }
  const receiverSensitive = async function (this: unknown, url: string | URL | Request, init?: RequestInit) {
    assert.equal(this, undefined, 'Raw native fetch must not receive a BlueprintClient instance as its receiver')
    if (String(url) === '/api/blueprint') return f.request(JSON.parse(String(init?.body)), new Headers(init?.headers).get('X-WORLDIFACT-Request')!)
    return f.recover(String(url).split('/').at(-1)!)
  } as typeof fetch
  const client = new BlueprintClient(store, receiverSensitive)
  await client.submit(payload())
  await client.recover()
  assert.equal(f.counts().providerCalls, 1)
})

test('actual provider funding refusal retains its reason with available customer points and no request', async () => {
  const f = await fixture()
  f.ledger().set('provider-budget-cents:v1', 0)
  const before = structuredClone([...f.ledger()])
  const id = crypto.randomUUID(), reply = await f.request(payload(), id)
  assert.equal(reply.status, 429)
  assert.deepEqual(await reply.json(), {
    error: blueprintAdmissionDetail('PROVIDER_BUDGET_EXHAUSTED'),
    failureCode: 'PROVIDER_BUDGET_EXHAUSTED', requestId: await blueprintRequestId(id), noCharge: true,
  })
  assert.equal(await f.balance(), 4500)
  assert.deepEqual([...f.ledger()], before)
  assert.deepEqual(f.counts(), { providerCalls: 0, preflights: 0, budgetCalls: 0 })
})

test('Blueprint exposes only fixed account denial reasons and preserves them through reload without a new call', async () => {
  for (const reason of [...ADMISSION_FAILURE_CODES, 'JOB_CHANNEL_MISMATCH', 'PRIVATE_LEDGER_DETAIL']) {
    const f = await fixture(), namespace = f.env.ACCOUNT_ENTITLEMENTS!
    f.env.ACCOUNT_ENTITLEMENTS = { idFromName: name => name, get: name => ({
      async fetch(request: Request) {
        if (new URL(request.url).pathname === '/reserve') return Response.json({ allowed: false, reason })
        return namespace.get(name).fetch(request)
      },
    }) }
    const data = new Map<string, string>()
    const store = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v) }, removeItem: (k: string) => { data.delete(k) } }
    let requests = 0
    const fetcher = (async (url: unknown, init?: RequestInit) => {
      requests++; assert.equal(String(url), '/api/blueprint')
      return f.request(JSON.parse(String(init?.body)), new Headers(init?.headers).get('X-WORLDIFACT-Request')!)
    }) as typeof fetch
    const code = reason === 'PRIVATE_LEDGER_DETAIL' ? 'ACCOUNT_ADMISSION_UNAVAILABLE' : reason === 'JOB_CHANNEL_MISMATCH' ? 'ACCOUNT_REQUEST_CONFLICT' : reason as typeof ADMISSION_FAILURE_CODES[number]
    const expected = blueprintAdmissionDetail(code)
    const client = new BlueprintClient(store, fetcher)
    await assert.rejects(client.submit(payload()), error => error instanceof Error && error.message === expected)
    assert.equal(client.current()?.failureCode, code)
    assert.equal(client.current()?.state, 'failed')
    const restored = new BlueprintClient(store, fetcher)
    await assert.rejects(restored.recover(), error => error instanceof Error && error.message === expected)
    await assert.rejects(restored.submit(payload()), error => error instanceof Error && error.message === expected)
    assert.equal(requests, 1, 'A definite unreserved refusal must not be reinterpreted as an unknown cloud job')
    assert.equal(await f.balance(), 4500)
    assert.deepEqual(f.counts(), { providerCalls: 0, preflights: 0, budgetCalls: 0 })
    assert.doesNotMatch(data.get(BLUEPRINT_RECOVERY_KEY)!, /PRIVATE_LEDGER_DETAIL|MCC cabinet|alice-token/)
    restored.reset(); assert.equal(restored.current(), null)
  }
})

test('a denial code cannot mask uncertain acceptance or be restored on a pending request', async () => {
  const data = new Map<string, string>()
  const store = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v) }, removeItem: (k: string) => { data.delete(k) } }
  let posts = 0, reads = 0
  const client = new BlueprintClient(store, (async (_url: unknown, init?: RequestInit) => {
    if (init?.method === 'POST') { posts++; return Response.json({ failureCode: 'PROVIDER_BUDGET_EXHAUSTED' }, { status: 503 }) }
    reads++; return Response.json({ state: 'pending' })
  }) as typeof fetch)
  await assert.rejects(client.submit(payload()), /pending/)
  assert.equal(client.current()?.state, 'pending'); assert.equal(client.current()?.failureCode, undefined)
  assert.equal(posts, 1); assert.equal(reads, 1)
  const pending = JSON.parse(data.get(BLUEPRINT_RECOVERY_KEY)!)
  for (const invalid of [{ ...pending, failureCode: 'PROVIDER_BUDGET_EXHAUSTED' }, { ...pending, state: 'failed', failureCode: 'PRIVATE_DETAIL' }]) {
    data.set(BLUEPRINT_RECOVERY_KEY, JSON.stringify(invalid))
    assert.throws(() => client.current(), /metadata needs review/)
  }
})
