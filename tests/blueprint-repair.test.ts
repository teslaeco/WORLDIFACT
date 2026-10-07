import test from 'node:test'
import assert from 'node:assert/strict'
import { handle, type Env } from '../server/worker.ts'
import { AccountEntitlements, entitlementCall, entitlementStatus, reserveUserGeneration, type EntitlementStorage } from '../server/entitlements.ts'
import { assetSpecForBlueprint, demoBlueprint } from '../src/lib/blueprint.ts'
import { blueprintFingerprint, blueprintRequestId, BLUEPRINT_REFERENCE_BYTES } from '../src/lib/blueprintRequest.ts'
import { BlueprintClient, BLUEPRINT_RECOVERY_KEY, BLUEPRINT_RECOVERY_ARCHIVE_KEY, blueprintRecoveryDetail } from '../src/lib/blueprintClient.ts'
import { PAID_POINTS_FUNDING, PAID_POINTS_POLICY, PAID_POINTS_POLICY_HEADER } from '../src/lib/paidPointsFunding.ts'
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
  const env:Env={OPENAI_API_KEY:'fixture-only',OPENAI_MODEL:'gpt-6-astra',OPENAI_FAST_MODEL:'gpt-6.1-sol',ENABLE_PAID_GENERATION:'true',ENABLE_ASTRA_PLANS:'true',PUBLIC_PILOT:'true',GENERATION_REQUEST_LIMIT:'unlimited',ENFORCE_ACCOUNT_ENTITLEMENTS:'true',GENERATION_LIMITER:{async limit(){return {success:true}}},GENERATION_BUDGET:{idFromName:n=>n,get:()=>({async fetch(){budgetCalls++;return Response.json({allowed:true})}})}}
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
  const request=(input:unknown=payload(),id: string=crypto.randomUUID())=>handle(new Request(origin+'/api/blueprint',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-WORLDIFACT-Request':id,[PAID_POINTS_POLICY_HEADER]:PAID_POINTS_POLICY,Cookie:'__Host-worldifact-access=alice-token'},body:JSON.stringify(input)}),env,provider)
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
  const status=await (await f.recover(id)).json() as any;assert.equal(status.state,'completed');assert.deepEqual({...status.result,pointSettlement:status.pointSettlement},first)
  assert.equal((await f.request({...payload(4),prompt:'A different cabinet'},id)).status,409)
  assert.equal((await f.request({...payload(4),references:payload(4).references.toReversed()},id)).status,409)
  assert.deepEqual(f.counts(),{providerCalls:1,preflights:1,budgetCalls:1});assert.equal(await f.balance(),4250)
  const otherStatus=await (await f.recover(id,'bob-token')).json() as any;assert.equal(otherStatus.owned,false);assert.equal(otherStatus.result,undefined)
})
for(const mode of ['timeout','http-failure','json-failure','no-evidence','wrong-model','missing-spec','refusal','character-result'])test(`${mode} retains full paid point holds while provider cost remains unresolved`,async()=>{
  const f=await fixture(),id=crypto.randomUUID(),before=f.ledger().get('provider-budget-cents:v1');f.change(mode)
  const r=await f.request(payload(),id);assert.ok([422,502].includes(r.status))
  assert.equal(await f.balance(),4500)
  const status=await (await f.recover(id)).json() as any;assert.equal(status.state,'failed');assert.equal(status.refunded,false);assert.deepEqual(status.pointSettlement,{version:1,state:'pending-cost',heldPoints:250,chargedPoints:0})
  const entitlements=await entitlementStatus(f.env,uid);assert.equal(entitlements.reservedCredits,250);assert.equal(entitlements.availableCredits,4250)
  const spent=f.ledger().get('provider-budget-cents:v1') as number;assert.equal(spent, before)
  const paid=f.ledger().get('paid-points-job:v2:'+await blueprintRequestId(id)) as any
  assert.equal(paid.providerLiability.state,'unresolved');assert.equal(paid.providerLiability.maximumLiabilityCents,175)
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

test('top-up-only provider funding refusal retains its reason with available customer points and no request', async () => {
  const f = await fixture()
  await entitlementCall(f.env, uid, '/subscription', { id: 'sub_Repair', active: false, until: 0, revision: 2, plan: 'pro' })
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
        if (new URL(request.url).pathname === '/generation-v3/reserve') return Response.json({ allowed: false, reason })
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

test('cancellation before Blueprint allocation creates no orphan receipt or request', async () => {
  const data = new Map<string, string>()
  const store = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value) }, removeItem: (key: string) => { data.delete(key) } }
  let calls = 0
  const client = new BlueprintClient(store, (async () => { calls++; throw new Error('No request should start') }) as typeof fetch)
  const already = new AbortController(); already.abort()
  await assert.rejects(client.submit(payload(), already.signal), { name: 'AbortError' })
  assert.equal(client.current(), null); assert.equal(calls, 0)
  const duringHash = new AbortController(), submission = client.submit(payload(), duringHash.signal)
  duringHash.abort()
  await assert.rejects(submission, { name: 'AbortError' })
  assert.equal(client.current(), null); assert.equal(calls, 0)
})

function heldPointBrowser() {
  const data = new Map<string, string>()
  const store = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value) }, removeItem: (key: string) => { data.delete(key) } }
  return { data, store }
}
const pendingCost = { version: 1, state: 'pending-cost', heldPoints: 250, chargedPoints: 0 } as const
const releasedPoints = { version: 1, state: 'released', heldPoints: 0, chargedPoints: 0 } as const

test('failed held-point Blueprint receipts survive reload, explicit prepare-new and read-only archive recovery', async () => {
  const b = heldPointBrowser(), calls: { path: string; method: string }[] = []
  let settlement: unknown = pendingCost
  const fetcher = (async (url: unknown, init?: RequestInit) => {
    const path = String(url), method = init?.method ?? 'GET'; calls.push({ path, method })
    const seed = method === 'POST' ? new Headers(init?.headers).get('X-WORLDIFACT-Request')! : path.split('/').at(-1)!
    return Response.json({ state: 'failed', requestId: await blueprintRequestId(seed), pointSettlement: settlement, error: 'Untrusted refund wording must not appear' }, { status: method === 'POST' ? 502 : 200 })
  }) as typeof fetch
  const first = new BlueprintClient(b.store, fetcher)
  await assert.rejects(first.submit(payload()), /Manual review/)
  const saved = first.current()!
  assert.equal(saved.state, 'failed'); assert.deepEqual(saved.pointSettlement, pendingCost)
  assert.equal(calls.length, 1, 'An explicit terminal settlement is saved directly without automatic recovery')
  const reload = new BlueprintClient(b.store, fetcher)
  assert.deepEqual(reload.current(), saved)
  assert.match(blueprintRecoveryDetail(saved), /No points have been charged or released/)
  await assert.rejects(reload.recover(), /Manual review/)
  assert.deepEqual(calls.at(-1), { path: `/api/blueprint/requests/${saved.id}`, method: 'GET' })
  reload.reset()
  assert.equal(reload.current(), null); assert.deepEqual(reload.archived(), [saved]); assert.equal(calls.length, 2)
  const prepared = new BlueprintClient(b.store, fetcher)
  assert.deepEqual(prepared.archived(), [saved])
  await assert.rejects(prepared.submit(payload()), /Manual review/)
  const next = prepared.current()!
  assert.notEqual(next.id, saved.id)
  const activeRaw = b.data.get(BLUEPRINT_RECOVERY_KEY)
  await assert.rejects(prepared.recoverArchived(saved.id), /Manual review/)
  assert.equal(b.data.get(BLUEPRINT_RECOVERY_KEY), activeRaw, 'Archived recovery cannot overwrite the newer active receipt')
  settlement = releasedPoints
  await assert.rejects(prepared.recoverArchived(saved.id), /held points were released; no points were charged/)
  assert.equal(prepared.archived()[0].id, saved.id); assert.deepEqual(prepared.archived()[0].pointSettlement, releasedPoints)
  assert.equal(b.data.get(BLUEPRINT_RECOVERY_KEY), activeRaw)
  assert.equal(calls.filter(call => call.method === 'POST').length, 2)
  assert.doesNotMatch([...b.data.values()].join(''), /MCC cabinet|data:image|Untrusted refund/)
})

test('lost failed Blueprint response recovers the same UUID and preserves positive or unknown cost holds', async () => {
  const b = heldPointBrowser(); let posts = 0, reads = 0, seed = ''
  const fetcher = (async (url: unknown, init?: RequestInit) => {
    if (init?.method === 'POST') { posts++; seed = new Headers(init.headers).get('X-WORLDIFACT-Request')!; throw new TypeError('Response lost') }
    reads++; assert.equal(String(url), `/api/blueprint/requests/${seed}`)
    return Response.json({ state: 'failed', refunded: false, pointSettlement: pendingCost })
  }) as typeof fetch
  await assert.rejects(new BlueprintClient(b.store, fetcher).submit(payload()), /Response lost/)
  const reload = new BlueprintClient(b.store, fetcher)
  await assert.rejects(reload.recover(), /Manual review/)
  await assert.rejects(reload.recover(), /Manual review/)
  assert.equal(reload.current()?.id, seed); assert.equal(reload.current()?.state, 'failed')
  assert.deepEqual(reload.current()?.pointSettlement, pendingCost); assert.equal(posts, 1); assert.equal(reads, 2)
})

test('unknown, malformed or contradictory point markers fail closed before refund or charge claims', async () => {
  for (const pointSettlement of [null, {}, { ...pendingCost, version: 2 }, { ...pendingCost, state: 'future' }, { ...pendingCost, heldPoints: 249 }, { ...pendingCost, chargedPoints: 250 }, { ...pendingCost, extra: true }, { ...pendingCost, state: 'charged', heldPoints: 0, chargedPoints: 250 }]) {
    const b = heldPointBrowser(); let calls = 0
    const client = new BlueprintClient(b.store, (async () => { calls++; return Response.json({ state: 'failed', pointSettlement, error: 'All points refunded' }, { status: 502 }) }) as typeof fetch)
    await assert.rejects(client.submit(payload()), /settlement needs review/)
    assert.equal(client.current()?.state, 'pending'); assert.equal(client.current()?.pointSettlement, undefined); assert.equal(calls, 1)
    b.data.set(BLUEPRINT_RECOVERY_KEY, JSON.stringify({ ...client.current(), state: 'failed', pointSettlement }))
    assert.throws(() => client.current(), /settlement needs review/)
  }
  for (const contradiction of [{ noCharge: true }, { refunded: true }]) {
    const b = heldPointBrowser(), client = new BlueprintClient(b.store, (async () => Response.json({ state: 'failed', pointSettlement: pendingCost, ...contradiction }, { status: 502 })) as typeof fetch)
    await assert.rejects(client.submit(payload()), /settlement needs review/)
    assert.equal(client.current()?.state, 'pending')
  }
})

test('a saved held-point receipt cannot be downgraded to a legacy refund and a failed archive write never clears it', async () => {
  const b = heldPointBrowser(); let body: Record<string, unknown> = { state: 'failed', pointSettlement: pendingCost }
  const fetcher = (async (_url: unknown, init?: RequestInit) => Response.json(body, { status: init?.method === 'POST' ? 502 : 200 })) as typeof fetch
  const client = new BlueprintClient(b.store, fetcher)
  await assert.rejects(client.submit(payload()), /Manual review/)
  const original = b.data.get(BLUEPRINT_RECOVERY_KEY)
  body = { state: 'failed', refunded: true }
  await assert.rejects(client.recover(), /settlement needs review/)
  assert.equal(b.data.get(BLUEPRINT_RECOVERY_KEY), original)
  const blocked = new BlueprintClient({ ...b.store, setItem(key, value) { if (key === BLUEPRINT_RECOVERY_ARCHIVE_KEY) throw new Error('Archive unavailable'); b.store.setItem(key, value) } }, fetcher)
  assert.throws(() => blocked.reset(), /Archive unavailable/)
  assert.equal(b.data.get(BLUEPRINT_RECOVERY_KEY), original)
  b.data.set(BLUEPRINT_RECOVERY_ARCHIVE_KEY, '{"invalid":true}')
  assert.throws(() => client.reset(), /need review/)
  assert.equal(b.data.get(BLUEPRINT_RECOVERY_KEY), original)
})

test('charged Blueprint settlement stays in its durable receipt without altering the validated generated asset', async () => {
  const b = heldPointBrowser(), pointSettlement = { version: 1, state: 'charged', heldPoints: 0, chargedPoints: 250 }
  let result: Record<string, unknown> | undefined, calls = 0
  const client = new BlueprintClient(b.store, (async (_url: unknown, init?: RequestInit) => {
    calls++
    if (init?.method === 'POST') {
      const blueprint = demoBlueprint('Fixture')
      result = { mode: 'LIVE', provenance: 'GENERATED', blueprint, assetSpec: assetSpecForBlueprint(blueprint), requestId: await blueprintRequestId(new Headers(init.headers).get('X-WORLDIFACT-Request')!), model: 'gpt-6-astra', limitation: 'Inert fixture.', evidence: { providerResponseId: 'resp_held_fixture', receivedAt: '2026-10-07T00:00:00.000Z', blueprintSha256: await blueprintFingerprint(blueprint), inputTokens: null, outputTokens: null, totalTokens: null }, delivery: { kind: 'procedural-blueprint', referenceCount: 0, fallbackUsed: false } }
      return Response.json({ ...result, pointSettlement })
    }
    return Response.json({ state: 'completed', result, pointSettlement })
  }) as typeof fetch)
  const asset = await client.submit(payload())
  assert.deepEqual(asset, result); assert.equal(Object.hasOwn(asset, 'pointSettlement'), false)
  assert.deepEqual(client.current()?.pointSettlement, pointSettlement); assert.match(blueprintRecoveryDetail(client.current()!), /250 points were charged/)
  assert.deepEqual(await client.recover(), asset); assert.equal(calls, 2)
})

test('negotiated held-point policy is durable before a lost POST and cannot degrade into a legacy refund on reload', async () => {
  const b = heldPointBrowser(); let posts = 0, reads = 0, oldId = '', response: unknown = { state: 'failed', refunded: true }
  const fetcher = (async (url: unknown, init?: RequestInit) => {
    if (init?.method === 'POST') {
      posts++; oldId = new Headers(init.headers).get('X-WORLDIFACT-Request')!
      const durable = JSON.parse(b.data.get(BLUEPRINT_RECOVERY_KEY)!)
      assert.equal(durable.id, oldId); assert.equal(durable.fundingPolicy, PAID_POINTS_FUNDING)
      assert.equal(new Headers(init.headers).get(PAID_POINTS_POLICY_HEADER), PAID_POINTS_POLICY)
      assert.equal(JSON.parse(String(init.body)).fundingPolicy, undefined, 'Local receipt metadata is not a provider input')
      throw new TypeError('Lost acknowledgement')
    }
    reads++; assert.equal(String(url), `/api/blueprint/requests/${oldId}`)
    return Response.json(response)
  }) as typeof fetch
  await assert.rejects(new BlueprintClient(b.store, fetcher).submit(payload(), undefined, PAID_POINTS_FUNDING), /Lost acknowledgement/)
  const reload = new BlueprintClient(b.store, fetcher), original = b.data.get(BLUEPRINT_RECOVERY_KEY)
  assert.equal(reload.current()?.fundingPolicy, PAID_POINTS_FUNDING)
  response = { state: 'pending' }
  await assert.rejects(reload.recover(), /Point settlement needs review/)
  assert.equal(b.data.get(BLUEPRINT_RECOVERY_KEY), original)
  assert.throws(() => reload.reset(), /Recover the pending/)
  for (const oldReply of [{ state: 'failed', refunded: true }, { state: 'failed', noCharge: true, failureCode: 'CREDITS_EXHAUSTED' }]) {
    response = oldReply
    await assert.rejects(reload.recover(), /Point settlement is unconfirmed/)
    assert.equal(reload.current()?.state, 'failed'); assert.equal(reload.current()?.pointSettlementUnconfirmed, true)
    assert.equal(reload.current()?.id, oldId); assert.equal(reload.current()?.failureCode, undefined)
  }
  response = { state: 'failed', pointSettlement: pendingCost }
  await assert.rejects(reload.recover(), /Manual review/)
  reload.reset()
  assert.equal(reload.archived()[0].fundingPolicy, PAID_POINTS_FUNDING)
  assert.equal(reload.archived()[0].id, oldId); assert.equal(posts, 1); assert.equal(reads, 4)
})

test('missing settlement on known funding and unknown local policy versions fail closed without a replacement', async () => {
  for (const body of [{ noCharge: true, failureCode: 'CREDITS_EXHAUSTED' }, { state: 'failed', refunded: true }]) {
    const b = heldPointBrowser(); let calls = 0
    const fetcher = (async () => { calls++; return Response.json(body, { status: 502 }) }) as typeof fetch
    const client = new BlueprintClient(b.store, fetcher)
    await assert.rejects(client.submit(payload(), undefined, PAID_POINTS_FUNDING), /Point settlement (needs review|is unconfirmed)/)
    assert.equal(client.current()?.state, body.state === 'failed' ? 'failed' : 'pending'); assert.equal(client.current()?.fundingPolicy, PAID_POINTS_FUNDING); assert.equal(calls, 1)
    b.data.set(BLUEPRINT_RECOVERY_KEY, JSON.stringify({ ...client.current(), fundingPolicy: 'paid-membership-future-v99' }))
    assert.throws(() => client.current(), /settlement needs review/)
  }
  const b = heldPointBrowser(); let calls = 0
  const client = new BlueprintClient(b.store, (async () => { calls++; throw new Error('Unexpected') }) as typeof fetch)
  await assert.rejects(client.submit(payload(), undefined, 'paid-membership-future-v99'), /settlement needs review/)
  assert.equal(client.current(), null); assert.equal(calls, 0)
})

test('terminal unconfirmed settlement remains reviewable after prepare-new and resolves without replacing the next receipt', async () => {
  const b = heldPointBrowser(), calls: { path: string; method: string; policy: string | null }[] = []
  let response: Record<string, unknown> = { state: 'failed', refunded: true }
  const client = new BlueprintClient(b.store, (async (url: unknown, init?: RequestInit) => {
    const method = init?.method ?? 'GET'; calls.push({ path: String(url), method, policy: new Headers(init?.headers).get(PAID_POINTS_POLICY_HEADER) })
    return Response.json(response, { status: method === 'POST' ? 502 : 200 })
  }) as typeof fetch)
  await assert.rejects(client.submit(payload(), undefined, PAID_POINTS_FUNDING), /Point settlement is unconfirmed/)
  const old = client.current()!
  assert.equal(old.pointSettlementUnconfirmed, true); assert.equal(old.pointSettlement, undefined)
  client.reset(); assert.deepEqual(client.archived(), [old]); assert.equal(calls.length, 1)
  await assert.rejects(client.submit(payload(), undefined, PAID_POINTS_FUNDING), /Point settlement is unconfirmed/)
  const current = b.data.get(BLUEPRINT_RECOVERY_KEY)
  response = { state: 'failed', pointSettlement: releasedPoints }
  await assert.rejects(client.recoverArchived(old.id), /held points were released/)
  assert.equal(b.data.get(BLUEPRINT_RECOVERY_KEY), current)
  assert.equal(client.archived()[0].pointSettlementUnconfirmed, undefined)
  assert.deepEqual(client.archived()[0].pointSettlement, releasedPoints)
  assert.equal(client.archived()[0].fundingPolicy, PAID_POINTS_FUNDING)
  assert.deepEqual(calls.map(call => [call.method, call.policy]), [['POST', PAID_POINTS_POLICY], ['POST', PAID_POINTS_POLICY], ['GET', null]])
})
