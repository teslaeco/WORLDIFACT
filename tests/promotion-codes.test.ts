import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AccountEntitlements, entitlementCall, type EntitlementEnv, type EntitlementStorage } from '../server/entitlements.ts'
import { PROMOTION_NAMESPACE, promotionHash, promotionDefinitions, promotionApi } from '../server/promotionCodes.ts'
const USER='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',OTHER='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',ID='cccccccc-cccc-4ccc-8ccc-cccccccccccc',NOW=Date.now()
// Synthetic test-only value; never a production invitation.
const CODE='TEST_ONLY_NOT_A_REAL_CODE'
async function fixture(){
 const definition={id:ID,sha256:await promotionHash(CODE),accountId:USER,points:1000,startsAt:NOW-1000,expiresAt:NOW+1000,maxRedemptions:1,purpose:'tester'}
 let now=NOW,fail='';const stores=new Map<string,Map<string,unknown>>(),objects=new Map<string,AccountEntitlements>()
 const env:EntitlementEnv={ACCOUNT_LEDGER_MODE:'sandbox',WORLDIFACT_PROMOTIONS_ENABLED:'true',WORLDIFACT_PROMOTION_DEFINITIONS:JSON.stringify([definition])}
 env.ACCOUNT_ENTITLEMENTS={idFromName:n=>n,get:k=>{
  const name=String(k);if(!objects.has(name)){
   if(!stores.has(name))stores.set(name,new Map());let queue:Promise<unknown>=Promise.resolve()
   const wrap=(d:Map<string,unknown>):EntitlementStorage=>({async get<T>(key:string){return structuredClone(d.get(key)) as T|undefined},async put(key,v){if(key===fail)throw Error('atomic failure');d.set(key,structuredClone(v))},transaction<T>(cb:(s:EntitlementStorage)=>Promise<T>){const p=queue.then(async()=>{const next=structuredClone(stores.get(name)!);const result=await cb(wrap(next));stores.set(name,next);return result});queue=p.catch(()=>{});return p}})
   const storage:EntitlementStorage={get:key=>wrap(stores.get(name)!).get(key),put:(key,v)=>wrap(stores.get(name)!).put(key,v),transaction:cb=>wrap(stores.get(name)!).transaction(cb)}
   objects.set(name,new AccountEntitlements({storage,id:{toString:()=>name}},env,()=>now))
  }return{fetch:r=>objects.get(name)!.fetch(r)}
 }}
 const claim=(user=USER)=>env.ACCOUNT_ENTITLEMENTS!.get(PROMOTION_NAMESPACE+':sandbox').fetch(new Request('https://internal/promo-claim',{method:'POST',body:JSON.stringify({accountId:user,sha256:definition.sha256})}))
 return{env,definition,stores,claim,apply:(user=USER)=>entitlementCall<any>(env,user,'/promo-apply',{id:ID}),restart:()=>objects.clear(),advance:(ms:number)=>{now+=ms},fail:(key:string)=>{fail=key},account:()=>stores.get('account:sandbox:v1:'+USER)!}
}
test('single-use tester code is bound to one permitted account under concurrent claims',async()=>{
 const f=await fixture();const results=await Promise.all(Array.from({length:20},(_,i)=>f.claim(i%2?OTHER:USER)))
 assert.equal(results.filter(r=>r.status===200).length,10);assert.equal(results.filter(r=>r.status===403).length,10)
 const grants=await Promise.all(Array.from({length:15},()=>f.apply()))
 assert.equal(grants.filter(v=>!v.repeated).length,1);assert.equal(f.account().get('balance'),1000)
 assert.equal(f.account().get('provider-budget-cents:v1'),0);assert.equal(f.account().has('subscription'),false)
 await assert.rejects(()=>f.apply(OTHER))
})
test('lost acknowledgement, expired code after accepted claim and process restart preserve exactly one grant',async()=>{
 const f=await fixture();assert.equal((await f.claim()).status,200);f.advance(2000);f.restart()
 assert.equal((await f.apply()).redeemed,true);f.restart();assert.equal((await f.apply()).repeated,true)
 assert.equal(f.account().get('balance'),1000)
})
test('account transaction rollback leaves global claim recoverable without partial balance or duplicate credit',async()=>{
 const f=await fixture();await f.claim();f.fail('promotion-grant:v1:'+ID)
 await assert.rejects(()=>f.apply());assert.equal(f.account().has('balance'),false)
 f.fail('');f.restart();assert.equal((await f.apply()).redeemed,true);assert.equal(f.account().get('balance'),1000)
})
test('expiry, revocation and definition tampering fail closed without resetting claim history',async()=>{
 const f=await fixture();f.advance(2000);assert.equal((await f.claim()).status,403)
 const g=await fixture();await g.claim();g.env.WORLDIFACT_PROMOTIONS_ENABLED='false';assert.equal((await g.claim()).status,503)
 g.env.WORLDIFACT_PROMOTIONS_ENABLED='true';g.env.WORLDIFACT_PROMOTION_DEFINITIONS=JSON.stringify([{...g.definition,points:999}]);assert.equal((await g.claim()).status,409)
 g.env.WORLDIFACT_PROMOTION_DEFINITIONS=JSON.stringify([g.definition]);assert.equal((await g.apply()).redeemed,true)
})
test('credits cannot create implicit provider funding through legacy lazy initialization',async()=>{
 const f=await fixture();await f.claim();await entitlementCall(f.env,USER,'/billing');f.account().set('balance',500)
 await f.apply();assert.equal(f.account().get('balance'),1500);assert.equal(f.account().get('provider-budget-cents:v1'),350)
})
test('strict config excludes unbound codes, duplicate hashes, excessive points and unlimited redemption',async()=>{
 const f=await fixture()
 for(const value of [[{...f.definition,accountId:'*'}],[{...f.definition,points:1001}],[{...f.definition,maxRedemptions:0}],[f.definition,f.definition]])
  assert.equal(promotionDefinitions({...f.env,WORLDIFACT_PROMOTION_DEFINITIONS:JSON.stringify(value)}),null)
})
test('public redemption rejects cross-origin and anonymous requests without touching ledgers',async()=>{
 const f=await fixture();const noFetch:typeof fetch=async()=>{throw Error('Unexpected provider request')}
 assert.equal((await promotionApi(new Request('https://site.test/api/account/promotions',{method:'POST',headers:{Origin:'https://evil.test'}}),f.env,noFetch)).status,403)
 assert.equal((await promotionApi(new Request('https://site.test/api/account/promotions'),f.env,noFetch)).status,401)
 assert.equal(f.stores.size,0)
})
test('registry is not accessible from an account Durable Object',async()=>{
 const f=await fixture();const response=await f.env.ACCOUNT_ENTITLEMENTS!.get('account:sandbox:v1:'+USER).fetch(new Request('https://internal/promo-claim',{method:'POST',body:JSON.stringify({accountId:USER,sha256:f.definition.sha256})}))
 assert.equal(response.status,403)
})
