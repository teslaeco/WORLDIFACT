import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash, createHmac } from 'node:crypto'
import { ownerUnusedPointsApi, OWNER_UNUSED_POINTS_PATH } from '../server/ownerUnusedPoints.ts'

const ID='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const OTHER='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const HOST='https://worldifact.test'
const KEY='an-inert-owner-secret-for-tests-that-is-not-live'
const OWNER_HASH=createHash('sha256').update(ID).digest('hex')
const ZERO='10000000-0000-4000-8000-000000000001'
const POSITIVE='10000000-0000-4000-8000-000000000002'
const POINTS=250
const approval='WORLDIFACT-OWNER-UNUSED-POINTS-20261014-v1:'
function request(operation: 'preview'|'release-zero', options: {
 uid?:string; key?:string; origin?:string; at?:number; expected?:Record<string,unknown>; signature?:string
}={}) {
  const content=JSON.stringify({uid:options.uid??ID,at:options.at??Date.now(),operation,...(options.expected?{expected:options.expected}:{})})
  const mac=createHmac('sha256',options.key??KEY).update(approval+content).digest('hex')
  return new Request(HOST+OWNER_UNUSED_POINTS_PATH,{method:'POST',headers:{
    Origin:options.origin??HOST,'Content-Type':'application/json',
    'X-WORLDIFACT-Owner-Maintenance-Proof':options.signature??mac,
  },body:content})
}
function proof(id:string, maximumLiabilityMicroUsd:number){
 return { revision:'worldifact-terminal-budget-v1',jobId:id,model:'gpt-6-astra',
  policyRevision:'astra-low-reconciled-v2',capMicroUsd:1750000,maximumLiabilityMicroUsd,
  sealed:true,sealId:'b'.repeat(64) }
}
function fixture() {
  let holds=500,credits=5000
  const routes:string[]=[],oracle:string[]=[]
  const settlement=new Map([[ZERO,'pending-cost'],[POSITIVE,'pending-cost']])
  let heldAdjustmentCount=0
  const env:any={
    OWNER_ACCESS_TOKEN:KEY,ACCOUNT_LEDGER_MODE:'live',ENFORCE_ACCOUNT_ENTITLEMENTS:'true',
    ORACLE_ENDPOINT:'https://fixture.trycloudflare.com',ORACLE_API_TOKEN:'fixture-oracle-token',
    ACCOUNT_LIMITER:{async limit(){return {success:true}}},
    ACCOUNT_ENTITLEMENTS:{
      idFromName(name:string){return name},
      get(name:string){
        assert.equal(name,'account:v1:'+ID)
        return {async fetch(req:Request){
          assert.equal(req.headers.get('X-WORLDIFACT-Verified-Account'),ID)
          const path=new URL(req.url).pathname
          routes.push(path)
          if(path==='/generation-v3/status')return Response.json({credits,reservedCredits:holds,availableCredits:credits-holds})
          if(path==='/generation-v3/provider-reconciliation-pending')return Response.json({
            ids:[ZERO,POSITIVE],blueprintIds:[],nextCursor:null,hasMore:false
          })
          if(path==='/generation-v3/job'){
            const {id}=await req.json() as {id:string}
            const state=settlement.get(id)
            return Response.json({owned:!!state,state:'failed',cost:POINTS,pointSettlement:{
              version:1,state,heldPoints:state==='pending-cost'?POINTS:0,chargedPoints:0
            }})
          }
          if(path==='/generation-v3/reconcile-studio-provider'){
            const {id,receipt}=await req.json() as {id:string;receipt:{maximumLiabilityMicroUsd:number}}
            assert.equal(receipt.maximumLiabilityMicroUsd,0)
            assert.equal(id,ZERO)
            if(settlement.get(id)!=='pending-cost')return Response.json({reconciled:true,repeated:true})
            settlement.set(id,'released');holds-=POINTS;heldAdjustmentCount++
            return Response.json({reconciled:true,repeated:false})
          }
          throw new Error('Unexpected ledger route: '+path)
        }}
      }
    }
  }
  const fetcher:any=async (resource:any,init:any)=>{
    const u=new URL(String(resource)); oracle.push(u.pathname)
    assert.equal(init.method,'GET')
    assert.equal(init.headers.Authorization,'Bearer fixture-oracle-token')
    if(u.pathname==='/v1/jobs/'+ZERO+'/budget')return Response.json(proof(ZERO,0))
    if(u.pathname==='/v1/jobs/'+POSITIVE+'/budget')return Response.json(proof(POSITIVE,15000))
    throw new Error('Generation endpoint must never be invoked')
  }
  const apply=(r:Request)=>ownerUnusedPointsApi(r,env,fetcher,OWNER_HASH) as Promise<Response>
  return {apply,env,routes,oracle,settlement,getHolds:()=>holds,getCharges:()=>heldAdjustmentCount}
}
test('invalid owner, signature, origin and expired proof cannot read or change a cent',async()=>{
 const f=fixture()
 for(const r of [
   request('preview',{uid:OTHER}),
   request('preview',{key:'incorrect-secret-key-with-adequate-length'}),
   request('preview',{origin:'https://other.example'}),
   request('preview',{at:Date.now()-300000}),
   request('release-zero'),
 ]) {
   const res=await f.apply(r)
   assert.ok([400,403].includes(res.status))
 }
 assert.equal(f.routes.length,0);assert.equal(f.oracle.length,0);assert.equal(f.getHolds(),500)
})
test('preview only accepts authenticated owner zero-liability terminal proof; positive cost remains held',async()=>{
 const f=fixture()
 const res=await f.apply(request('preview'))
 assert.equal(res.status,200)
 const d=await res.json() as any
 assert.equal(d.status,'preview');assert.equal(d.refundableJobs,1);assert.equal(d.refundablePoints,250)
 assert.equal(d.positiveProviderCost,1);assert.equal(d.before.held,500)
 assert.equal(d.paidGenerationRequested,false)
 assert.equal(f.routes.includes('/generation-v3/reconcile-studio-provider'),false)
 assert.deepEqual(f.oracle.sort(),['/v1/jobs/'+POSITIVE+'/budget','/v1/jobs/'+ZERO+'/budget'].sort())
 assert.equal(f.getHolds(),500)
})
test('one owner-approved proof releases exactly one 250-point ZERO cost hold without double releases',async()=>{
 const f=fixture()
 const first=await(await f.apply(request('preview'))).json() as any
 const expected={held:first.before.held,zeroCount:first.refundableJobs,zeroDigest:first.zeroDigest,zeroPoints:first.refundablePoints}
 const result=await f.apply(request('release-zero',{expected}))
 assert.equal(result.status,200)
 const body=await result.json() as any
 assert.equal(body.status,'reconciled')
 assert.equal(body.releasedJobs,1);assert.equal(body.releasedPoints,250)
 assert.equal(body.after.held,250);assert.equal(body.after.available,4750)
 assert.equal(f.getCharges(),1)
 assert.equal(f.settlement.get(ZERO),'released')
 assert.equal(f.settlement.get(POSITIVE),'pending-cost')
 const second=await f.apply(request('release-zero',{expected}))
 assert.equal(second.status,409)
 assert.equal(f.getCharges(),1)
 assert.equal(f.getHolds(),250)
})
