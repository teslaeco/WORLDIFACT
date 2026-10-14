import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AccountEntitlements, type EntitlementStorage } from '../server/entitlements.ts'
import { STUDIO_INCOMPLETE_REVISION, STUDIO_INCOMPLETE_INDEX_KEY } from '../src/lib/studioIncomplete.ts'

const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const ID = 'c5555555-1111-4111-8111-222222222222'
const NOW = Date.parse('2026-10-14T15:00:00Z')
const execution = { revision: 'studio-execution-v1' as const, model: 'sol' as const, mode: 'standard' as const }
const stored = { channel:'studio', state:'failed', failureCode:'MODEL_BUDGET_EXCEEDED',
  fingerprint:'a'.repeat(64), prompt:'An unfinished copper and glass workstation',
  profile:'fast', model:'sol', studioExecution:execution, kind:'credits', cost:50, at:NOW-60000, updatedAt:NOW-3000 }
function account(owner: string, initial?: Map<string, unknown>) {
  const values = initial ?? new Map<string,unknown>()
  if (!initial) {
    values.set('job:'+ID, structuredClone(stored))
    values.set('balance', 2000)
    values.set('customer-reserved-credits:v1', 50)
    values.set('subscription', {active:true,until:NOW+86400000,id:'sub_existing'})
  }
  let queue:Promise<unknown>=Promise.resolve()
  const storage:EntitlementStorage = {
    async get<T>(key:string){return structuredClone(values.get(key)) as T|undefined},
    async put(key,value){values.set(key,structuredClone(value))},
    async list<T>({prefix,startAfter,limit}:{prefix:string;startAfter?:string;limit:number}) {
      return new Map([...values].filter(([k]) => k.startsWith(prefix)&&(!startAfter||k>startAfter))
        .sort(([a],[b]) => a.localeCompare(b)).slice(0,limit).map(([k,v]) => [k,structuredClone(v) as T]))
    },
    transaction<T>(callback:(s:EntitlementStorage)=>Promise<T>){
      const next=queue.then(()=>callback(storage));queue=next.catch(()=>{});return next
    },
  }
  const namespace={idFromName:(name:string)=>name,get:()=>{throw Error('No cross-account namespace')}}
  const object=new AccountEntitlements({storage,id:{toString:()=> 'account:v1:'+owner}},
    {ACCOUNT_ENTITLEMENTS:namespace,ACCOUNT_LEDGER_MODE:'live'},()=>NOW)
  const call=(path:string,body?:unknown,uid=owner)=>object.fetch(new Request('https://ledger.internal/generation-v3/'+path,{
    method:body===undefined?'GET':'POST',headers:{'X-WORLDIFACT-Verified-Account':uid,'Content-Type':'application/json'},
    ...(body===undefined?{}:{body:JSON.stringify(body)}),
  }))
  const candidate={revision:STUDIO_INCOMPLETE_REVISION,id:ID,modelSha256:'c'.repeat(64),at:NOW-1000,
    failureCode:'MODEL_BUDGET_EXCEEDED',studioExecution:execution}
  return {values,call,candidate}
}
test('completed-only library history remains unchanged; a preserved unfinished GLB appears separately on its owner account',async()=>{
  const f=account(OWNER)
  const before=structuredClone(f.values.get('job:'+ID))
  const prior=await(await f.call('studio-library')).json() as any
  assert.equal(prior.incompleteModels,undefined)
  const recorded=await f.call('studio-incomplete-record',f.candidate)
  assert.equal(recorded.status,200)
  assert.deepEqual(await recorded.json(),{recorded:true,repeated:false})
  assert.deepEqual(f.values.get('job:'+ID),before,'No failed job or customer debit can be changed')
  assert.equal(f.values.get('balance'),2000)
  assert.equal(f.values.get('customer-reserved-credits:v1'),50)
  const later=await(await f.call('studio-library')).json() as any
  assert.deepEqual(later.models,[])
  assert.equal(later.incompleteModels.length,1)
  assert.equal(later.incompleteModels[0].completion,'INCOMPLETE')
  assert.equal(later.incompleteModels[0].failureCode,'MODEL_BUDGET_EXCEEDED')
  assert.equal(later.incompleteModels[0].studioExecution.model,'sol')
  assert.equal(later.incompleteModels[0].providerEvidence,undefined)
  const owned=await(await f.call('studio-library/'+ID)).json() as any
  assert.equal(owned.model.modelSha256,'c'.repeat(64))
  const access=await(await f.call('job',{id:ID})).json() as any
  assert.equal(access.state,'failed')
  assert.equal(access.incompleteAvailable,true)
  assert.equal(access.incompleteDownloadAllowed,true)
  const repeated=await(await f.call('studio-incomplete-record',{...f.candidate,at:NOW})).json() as any
  assert.equal(repeated.recorded,true)
  assert.equal(repeated.repeated,true)
  assert.equal(f.values.get('customer-reserved-credits:v1'),50)
  assert.deepEqual(f.values.get('job:'+ID),before)
  assert.ok(f.values.has(STUDIO_INCOMPLETE_INDEX_KEY))
})
test('forged owner, model, fake receipt, altered hash, and completed-but-not-failed job never create incomplete assets',async()=>{
  for(const kind of ['owner','model','proof','checksum','completed','reason'] as const) {
    const f=account(OWNER)
    if(kind==='completed')f.values.set('job:'+ID,{...stored,state:'completed',failureCode:undefined})
    const data:any=structuredClone(f.candidate)
    if(kind==='model')data.studioExecution.model='luna'
    if(kind==='proof')data.providerEvidence={revision:'studio-provider-evidence-v1',model:'gpt-6.1-sol',mode:'standard',source:'oracle-terminal-budget'}
    if(kind==='checksum')data.modelSha256='incorrect'
    if(kind==='reason')data.failureCode='INVALID_MODEL_OUTPUT'
    const res=await f.call('studio-incomplete-record',data,kind==='owner'?OTHER:OWNER)
    assert.equal((await res.json() as any).recorded,false,kind)
    assert.equal(f.values.has(STUDIO_INCOMPLETE_INDEX_KEY),false,kind)
    assert.equal(f.values.has('studio-incomplete-v1:'+ID),false,kind)
  }
})
test('existing incomplete entry can upgrade only its separate backup evidence, not its original ledger', async () => {
  const f = account(OWNER)
  const before = structuredClone(f.values.get('job:' + ID))
  const saved = await f.call('studio-incomplete-record', f.candidate)
  assert.equal((await saved.json() as any).recorded, true)
  const verified = await f.call('studio-incomplete-record', {
    ...f.candidate, backupVerified: 'r2-sha256-readback-v1', at: NOW,
  })
  assert.deepEqual(await verified.json(), { recorded: true, repeated: true })
  const list = await (await f.call('studio-library')).json() as any
  assert.equal(list.incompleteModels[0].backupVerified, 'r2-sha256-readback-v1')
  assert.deepEqual(f.values.get('job:' + ID), before)
  assert.equal(f.values.get('balance'), 2000)
  assert.equal(f.values.get('customer-reserved-credits:v1'), 50)
  const another = await f.call('studio-incomplete-record', {
    ...f.candidate, modelSha256: 'b'.repeat(64), backupVerified: 'r2-sha256-readback-v1',
  })
  assert.deepEqual(await another.json(), { recorded: false, repeated: true })
  assert.equal((f.values.get('studio-incomplete-v1:' + ID) as any).modelSha256, 'c'.repeat(64))
})

test('different account cannot claim an original account draft or read its stored entry',async()=>{
  const first=account(OWNER),other=account(OTHER)
  assert.equal((await(await first.call('studio-incomplete-record',first.candidate)).json() as any).recorded,true)
  assert.equal((await(await other.call('studio-library')).json() as any).incompleteModels,undefined)
  assert.equal((await(await other.call('studio-library/'+ID)).json() as any).model,null)
})
