import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { createHash } from 'node:crypto'
const USER='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',OTHER='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',APPROVAL='cccccccc-cccc-4ccc-8ccc-cccccccccccc',CODEID='dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const NOW=Date.now(),HASH='a'.repeat(64),CODEHASH=createHash('sha256').update('TEST_ONLY_NOT_A_REAL_CODE').digest('hex')
test('real SQLite Durable Objects persist owner budgets and globally single-use promotion grants across races and restart',{timeout:60000},async t=>{
 const dir=await mkdtemp(join(tmpdir(),'worldifact-admin-promo-'))
 const bundle=await build({stdin:{resolveDir:fileURLToPath(new URL('..',import.meta.url)),sourcefile:'admin-native-fixture.ts',contents:`
 import {AccountEntitlements,entitlementCall} from './server/entitlements.ts';
 export class NativeLedger {
  constructor(state,env){this.store=state.storage;this.ledger=new AccountEntitlements({storage:state.storage,id:state.id},env,()=>${NOW})}
  fetch(request){if(new URL(request.url).pathname==='/inspect')return this.store.list().then(m=>Response.json(Object.fromEntries(m)));return this.ledger.fetch(request)}
 }
 // Test-only internal router; this is never part of the production Worker.
 export default {async fetch(request,env){const v=await request.json();if(v.path==='/promo-claim')return env.ACCOUNT_ENTITLEMENTS.get(env.ACCOUNT_ENTITLEMENTS.idFromName('worldifact-promotions:v1:sandbox')).fetch(new Request('https://internal/promo-claim',{method:'POST',body:JSON.stringify(v.body)}));try{return Response.json(await entitlementCall(env,v.account,v.path,v.body))}catch{return Response.json({error:'refused'},{status:503})}}};
 `},bundle:true,write:false,format:'esm',platform:'neutral'})
 const allocation={version:1,accountId:USER,approvalId:APPROVAL,startsAt:NOW-1000,expiresAt:NOW+86400000,maxProviderCents:350,maxJobs:2,models:['astra']}
 const definitions=[{id:CODEID,sha256:CODEHASH,accountId:OTHER,points:1000,startsAt:NOW-1000,expiresAt:NOW+86400000,maxRedemptions:1,purpose:'tester'}]
 const options=convertV4MiniflareOptions({modules:true,compatibilityDate:'2026-09-14',cf:false,script:bundle.outputFiles[0].text,bindings:{ACCOUNT_LEDGER_MODE:'sandbox',ENABLE_ASTRA_PLANS:'true',WORLDIFACT_ADMIN_ENABLED:'true',WORLDIFACT_ADMIN_ALLOCATION:JSON.stringify(allocation),WORLDIFACT_PROMOTIONS_ENABLED:'true',WORLDIFACT_PROMOTION_DEFINITIONS:JSON.stringify(definitions)},durableObjects:{ACCOUNT_ENTITLEMENTS:{className:'NativeLedger',useSQLite:true}},resourcePersistencePath:dir,isolatedResourcePersistencePath:dir,outboundService:()=>{throw Error('No external/provider requests allowed')}})
 let mf=new Miniflare(options);t.after(async()=>{await mf.dispose();await rm(dir,{recursive:true,force:true})})
 async function call(account,path,body,status=200){const r=await mf.dispatchFetch('https://inert.test',{method:'POST',body:JSON.stringify({account,path,body})});const v=await r.json();assert.equal(r.status,status,JSON.stringify(v));return v}
 const id=crypto.randomUUID(),input={id,channel:'studio',profile:'slow',fingerprint:HASH,prompt:'Inert native test'}
 const race=await Promise.all(Array.from({length:15},()=>call(USER,'/reserve',input)))
 assert.equal(race.filter(r=>r.allowed&&!r.repeated).length,1)
 const dispatch=await Promise.all(Array.from({length:10},()=>call(USER,'/studio-dispatch',{id,fingerprint:HASH})))
 assert.equal(dispatch.filter(r=>r.dispatch).length,1)
 const claims=await Promise.all(Array.from({length:16},(_,i)=>call(i%2?USER:OTHER,'/promo-claim',{accountId:i%2?USER:OTHER,sha256:CODEHASH},i%2?403:200)))
 assert.equal(claims.filter(c=>c.claim&&!c.repeated).length,1)
 const grants=await Promise.all(Array.from({length:15},()=>call(OTHER,'/promo-apply',{id:CODEID})))
 assert.equal(grants.filter(g=>!g.repeated).length,1)
 await mf.dispose();mf=new Miniflare(options)
 assert.equal((await call(USER,'/reserve',input)).repeated,true)
 assert.equal((await call(USER,'/status')).admin.remainingProviderCents,175)
 assert.equal((await call(OTHER,'/promo-apply',{id:CODEID})).repeated,true)
 const customer=await call(OTHER,'/inspect');assert.equal(customer.balance,1000);assert.equal(customer['provider-budget-cents:v1'],0);assert.equal(customer.subscription,undefined)
 const owner=await call(USER,'/inspect');assert.equal(owner.balance,undefined);assert.equal(owner['customer-reserved-credits:v1'],undefined);assert.equal(owner.subscription,undefined)
})
