import {test} from 'node:test'
import assert from 'node:assert/strict'
import {AccountEntitlements,type EntitlementStorage,type EntitlementStatus,type Reservation} from '../server/entitlements.ts'
import {planEconomics,providerReserveCents} from '../server/generationEconomics.ts'
function fixture(enabled=true){const values=new Map<string,unknown>();let queue=Promise.resolve();const storage:EntitlementStorage={async get<T>(k:string){return values.get(k) as T|undefined},async put(k,v){values.set(k,v)},transaction(fn){const job=queue.then(()=>fn(storage));queue=job.then(()=>{},()=>{});return job}};const ledger=new AccountEntitlements({storage},{ENABLE_ASTRA_PLANS:enabled?'true':'false'},()=>1790640000000);const call=async(path:string,body?:unknown)=>(await ledger.fetch(new Request('https://ledger'+path,{method:body===undefined?'GET':'POST',...(body===undefined?{}:{body:JSON.stringify(body)})}))).json() as Promise<EntitlementStatus & Reservation>;return {call,values}}
async function activate(f:ReturnType<typeof fixture>){await f.call('/grant',{id:'in_creator',credits:1500,subscriptionId:'sub_creator'});await f.call('/subscription',{id:'sub_creator',until:1793240000000,active:true,revision:1,plan:'creator',grantId:'in_creator'})}
test('Creator can budget two Astra attempts and twenty Sol attempts inside the same paid grant',async()=>{const f=fixture();await activate(f);for(let i=0;i<2;i++)assert.equal((await f.call('/reserve',{id:crypto.randomUUID(),profile:'slow',model:'astra'})).cost,250);for(let i=0;i<20;i++)assert.equal((await f.call('/reserve',{id:crypto.randomUUID(),profile:'fast',model:'sol'})).cost,50);assert.equal((await f.call('/status')).credits,0);assert.equal(f.values.get('provider-budget-cents:v1'),0);assert.equal(providerReserveCents(1500),1050);assert.ok(planEconomics('creator').profit>1000)})
test('Creator can pass six attempts only with real additional funded credits, without resetting old counters',async()=>{
  const f=fixture();await activate(f)
  f.values.set('creator-astra:in_creator',6)
  const ids=Array.from({length:6},()=>crypto.randomUUID())
  for(const id of ids)assert.equal((await f.call('/reserve',{id,profile:'slow'})).allowed,true)
  assert.equal((await f.call('/reserve',{id:ids[0],profile:'slow'})).repeated,true)
  assert.equal((await f.call('/reserve',{id:crypto.randomUUID(),profile:'slow'})).reason,'CREDITS_EXHAUSTED')
  await f.call('/grant',{id:'pi_topup',credits:1500})
  assert.equal((await f.call('/reserve',{id:crypto.randomUUID(),profile:'slow'})).allowed,true)
  const status=await f.call('/status')
  assert.equal(status.paidGenerationPolicy,'paid-membership-no-quota-v1')
  assert.deepEqual(status.creatorAstra,{active:true,remaining:null,maximum:null,recommended:2,pointsForTwo:500})
  assert.equal(f.values.get('creator-astra:in_creator'),6)
  assert.equal(status.credits,1250);assert.equal(f.values.get('provider-budget-cents:v1'),875)
})
test('Creator Astra remains closed before the existing production safety activation',async()=>{const f=fixture(false);await activate(f);assert.equal((await f.call('/reserve',{id:crypto.randomUUID(),profile:'slow'})).allowed,false);assert.equal((await f.call('/status')).credits,1500);assert.equal((await f.call('/status')).creatorAstra.active,false)})
test('failed legacy attempts refund points but retain uncertain provider spend; invoice replay grants no bonus',async()=>{const f=fixture();await activate(f);const id=crypto.randomUUID();await f.call('/reserve',{id,profile:'slow'});await f.call('/settle',{id,state:'failed'});await f.call('/grant',{id:'in_creator',credits:1500,subscriptionId:'sub_creator'});assert.equal((await f.call('/status')).credits,1500);assert.equal((await f.call('/status')).creatorAstra.remaining,null);assert.equal(f.values.has('creator-astra:in_creator'),false);assert.equal(f.values.get('provider-budget-cents:v1'),875)})

test('obsolete malformed quota never blocks funded Creator, Pro or Studio admission',async()=>{
  for(const plan of ['creator','pro','studio']){
    const f=fixture();await activate(f)
    await f.call('/subscription',{id:'sub_creator',until:1793240000000,active:true,revision:2,plan,grantId:'in_creator'})
    f.values.set('creator-astra:in_creator','obsolete-counter')
    assert.equal((await f.call('/status')).generationAdmission.astra.allowed,true)
    assert.equal((await f.call('/reserve',{id:crypto.randomUUID(),profile:'slow'})).allowed,true)
    assert.equal(f.values.get('creator-astra:in_creator'),'obsolete-counter')
  }
})

test('removing plan quotas does not bypass point holds, provider funding, billing review or paid membership',async()=>{
  for(const [seed,reason] of [
    [{'provider-budget-cents:v1':174},'PROVIDER_BUDGET_EXHAUSTED'],
    [{'customer-reserved-credits:v1':1300},'CREDITS_EXHAUSTED'],
    [{billingHold:true},'BILLING_REVIEW_REQUIRED'],
    [{subscription:undefined},'ASTRA_PLAN_REQUIRED'],
  ] as const){
    const f=fixture();await activate(f)
    for(const [key,value] of Object.entries(seed))f.values.set(key,value)
    const before=structuredClone([...f.values])
    assert.equal((await f.call('/status')).generationAdmission.astra.reason,reason)
    assert.equal((await f.call('/reserve',{id:crypto.randomUUID(),profile:'slow'})).reason,reason)
    assert.deepEqual([...f.values],before)
  }
})
