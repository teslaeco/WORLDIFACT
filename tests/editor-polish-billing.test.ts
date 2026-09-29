import {test} from 'node:test'
import assert from 'node:assert/strict'
import {billingApi,type BillingEnv} from '../server/billing.ts'
import {AccountEntitlements,type EntitlementStorage} from '../server/entitlements.ts'
const uid='11111111-1111-4111-8111-111111111111',customer='cus_Alice',subscriptionId='sub_Alice',invoiceId='in_Alice'
function fixture(enabled=false){
  const map=new Map<string,unknown>([['balance',1500],['customer',customer],['subscription',{id:subscriptionId,plan:'creator',until:Date.now()+86400000,active:true,revision:1,grantId:invoiceId}]])
  const storage:EntitlementStorage={async get<T>(key:string){return map.get(key) as T|undefined},async put(key,value){map.set(key,value)},async transaction(fn){return fn(storage)}}
  const env:BillingEnv={ENABLE_BILLING:'true',ENABLE_ASTRA_PLANS:enabled?'true':'false',ENFORCE_ACCOUNT_ENTITLEMENTS:'true',ACCOUNT_LEDGER_MODE:'sandbox',STRIPE_SECRET_KEY:'sk_test_fixture_local',STRIPE_WEBHOOK_SECRET:'whsec_fixture',STRIPE_MODE:'test',STRIPE_SUBSCRIPTION_PRICE_ID:'price_Creator',STRIPE_PRO_PRICE_ID:'price_Pro',STRIPE_STUDIO_PRICE_ID:'price_Studio',STRIPE_SUBSCRIPTION_INTERVAL:'month',STRIPE_TOPUP_PRICE_ID:'price_Topup',STRIPE_BILLING_PORTAL_CONFIGURATION_ID:'bpc_Management',STRIPE_PLAN_CHANGE_CONFIGURATION_ID:'bpc_Changes',BILLING_PUBLIC_ORIGIN:'https://worldifact.test',ACCOUNT_LIMITER:{async limit(){return {success:true}}},ACCOUNT_ENTITLEMENTS:{idFromName:n=>n,get:()=>({fetch:r=>new AccountEntitlements({storage},env).fetch(r)})}}
  const calls:{url:string;method:string;body:string}[]=[]
  const subscription={id:subscriptionId,customer,livemode:false,status:'active',metadata:{worldifact_uid:uid},items:{data:[{id:'si_Alice',quantity:1,price:'price_Creator'}]},latest_invoice:invoiceId,cancel_at_period_end:false}
  const invoice={id:invoiceId,subscription:subscriptionId,customer,livemode:false,paid:true,status:'paid',amount_paid:2999,total:2999,currency:'usd',billing_reason:'subscription_cycle',lines:{data:[{price:'price_Creator',quantity:1,amount:2999,currency:'usd'}]}}
  const fetcher=(async (input:unknown,init?:RequestInit)=>{
    const url=String(input),method=init?.method??'GET';calls.push({url,method,body:String(init?.body??'')})
    if(url.endsWith('/auth/v1/user'))return Response.json({id:uid,email:'fixture@example.test',user_metadata:{name:'Fixture'}})
    if(url.includes('/v1/subscriptions?'))return Response.json({data:[subscription],has_more:false})
    if(url.endsWith('/v1/prices/price_Pro'))return Response.json({id:'price_Pro',livemode:false,active:true,unit_amount:9999,currency:'usd',type:'recurring',billing_scheme:'per_unit',recurring:{interval:'month',interval_count:1,usage_type:'licensed'}})
    if(url.endsWith('/v1/invoices/'+invoiceId))return Response.json(invoice)
    if(url.endsWith('/v1/billing_portal/sessions')){const body=new URLSearchParams(String(init?.body));return Response.json({id:'bps_Test',livemode:false,customer:{id:customer},configuration:{id:body.get('configuration')},url:'https://billing.stripe.com/p/session/fixture'})}
    throw new Error('Unexpected provider operation '+method+' '+url)
  }) as typeof fetch
  const call=(path:string,body:unknown,origin='https://worldifact.test')=>billingApi(new Request('https://worldifact.test'+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,Cookie:'__Host-worldifact-access=fixture-token'},body:JSON.stringify(body)}),env,fetcher)
  return {map,env,calls,subscription,invoice,call}
}
test('paused Astra upgrade is not a duplicate checkout and leaves credits/subscription unchanged',async()=>{
  const f=fixture(false),before=structuredClone([...f.map]);const response=await f.call('/api/billing/change-plan',{plan:'pro'})
  assert.equal(response?.status,409);assert.deepEqual([...f.map],before);assert.equal(f.calls.filter(c=>c.url.includes('api.stripe.com')).length,0)
})
test('enabled upgrade opens only explicit Stripe confirmation for the current subscription',async()=>{
  const f=fixture(true),before=structuredClone([...f.map]);const response=await f.call('/api/billing/change-plan',{plan:'pro'})
  assert.equal(response?.status,200);const result=await response!.json() as {requiresConfirmation:boolean};assert.equal(result.requiresConfirmation,true)
  const writes=f.calls.filter(c=>c.method==='POST');assert.equal(writes.length,1);assert.match(writes[0].url,/billing_portal\/sessions$/)
  const body=new URLSearchParams(writes[0].body);assert.equal(body.get('flow_data[type]'),'subscription_update_confirm');assert.equal(body.get('flow_data[subscription_update_confirm][subscription]'),subscriptionId);assert.equal(body.get('flow_data[subscription_update_confirm][items][0][price]'),'price_Pro');assert.deepEqual([...f.map],before)
})
test('management remains available independently of Astra activation and accepts expanded Stripe objects',async()=>{
  const f=fixture(false);f.map.set('balance',-10);const response=await f.call('/api/billing/portal',{})
  assert.equal(response?.status,200);assert.ok(f.calls.some(c=>c.url.endsWith('billing_portal/sessions')))
})
test('invalid target, cross-origin and unsettled invoice do not start billing changes',async()=>{
  const f=fixture(true);assert.equal((await f.call('/api/billing/change-plan',{plan:'unknown'}))?.status,400)
  assert.equal((await f.call('/api/billing/change-plan',{plan:'pro'},'https://evil.test'))?.status,403)
  f.invoice.paid=false;assert.equal((await f.call('/api/billing/change-plan',{plan:'pro'}))?.status,409)
  assert.equal(f.calls.filter(c=>c.method==='POST').length,0)
})
