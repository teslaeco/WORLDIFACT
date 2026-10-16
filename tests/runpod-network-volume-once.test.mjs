import test from 'node:test'
import assert from 'node:assert/strict'
import {VOLUME_GB, VOLUME_NAME, Refused, approvedStorageBudget,
  chooseDatacenter, provisionSharedStorage} from '../scripts/runpod-network-volume-once.mjs'

const key='inert-test-only-runpod-secret'
const centers={dataCenters:[
 {id:'EU-RO-1',region:'EUROPE',networkVolumeTypes:['STANDARD','HIGH_PERFORMANCE']},
 {id:'EU-CZ-1',region:'EUROPE',networkVolumeTypes:['STANDARD']},
 {id:'US-KS-2',region:'NORTH_AMERICA',networkVolumeTypes:['STANDARD']}
]}
const gpus={gpus:[
 {name:'NVIDIA A100 80GB',memory:80,price:{serverless:2.72},dataCenters:[
   {id:'EU-RO-1',availability:'HIGH'},{id:'EU-CZ-1',availability:'NONE'}]},
 {name:'NVIDIA H100 80GB',memory:80,price:{serverless:4.79},dataCenters:[
   {id:'EU-RO-1',availability:'LOW'},{id:'EU-CZ-1',availability:'NONE'}]},
 {name:'NVIDIA L4',memory:24,price:{serverless:1.3},dataCenters:[
   {id:'EU-RO-1',availability:'MEDIUM'}]}
]}
const inventory={networkVolumes:[],pagination:{hasNextPage:false,nextCursor:null}}
const approved={apiKey:key,authorization:'CREATE-WORLDIFACT-256GB-ONCE'}
const api=(choices={})=>{
 const actions=[]
 const requester=async(url,opts)=>{
   assert.equal(opts.headers.Authorization,'Bearer '+key)
   assert.equal(opts.redirect,'error')
   assert.ok(url.startsWith('https://api.runpod.io/v2/'))
   actions.push({method:opts.method,url,body:opts.body&&JSON.parse(opts.body)})
   if(opts.method==='POST'){
     assert.equal(url,'https://api.runpod.io/v2/network-volumes')
     return choices.write?.(JSON.parse(opts.body)) ??
       Response.json({id:'volxabc123',...JSON.parse(opts.body)},{status:201})
   }
   if(url.endsWith('/network-volumes'))return Response.json(choices.inventory??inventory)
   if(url.endsWith('/catalog/datacenters'))return Response.json(choices.centers??centers)
   if(url.includes('/catalog/gpus?'))return Response.json(choices.gpus??gpus)
   throw new Error('Unapproved provider host')
 }
 return {requester,actions}
}

test('256GB standard persistent disk cost reserves money for on-demand GPU',()=>{
 assert.equal(VOLUME_GB,256)
 assert.equal(approvedStorageBudget(),17.92)
})

test('only EUROPE Standard center with A100/H100 chooses multi-GPU pool',()=>{
 const x=chooseDatacenter(centers,gpus)
 assert.deepEqual(x,{id:'EU-RO-1',region:'EUROPE',gpus:['H100','A100','L4'],score:22})
})

test('READ ONLY inspect does 3 GET no paid writes',async()=>{
 const i=api()
 const result=await provisionSharedStorage({...approved,mode:'INSPECT'},i.requester)
 assert.equal(result.status,'READ_ONLY_READY')
 assert.equal(result.sizeGB,256)
 assert.equal(result.dataCenter,'EU-RO-1')
 assert.deepEqual(i.actions.map(x=>x.method),['GET','GET','GET'])
})

test('one verified POST creates exactly 256GB in selected European center',async()=>{
 const i=api()
 const result=await provisionSharedStorage(approved,i.requester)
 assert.equal(result.status,'CREATED_VERIFIED')
 assert.equal(result.name,VOLUME_NAME)
 assert.equal(result.volumeId,'volxabc123')
 assert.equal(result.sizeGB,256)
 assert.equal(result.gpuWorkersStarted,0)
 assert.equal(result.podsCreated,0)
 assert.equal(result.endpointCreated,false)
 assert.equal(result.requiresMonthlyFunding,true)
 assert.deepEqual(i.actions.map(x=>x.method),['GET','GET','GET','POST'])
 const body=i.actions.at(-1).body
 assert.deepEqual(body,{name:VOLUME_NAME,size:256,dataCenter:'EU-RO-1',type:'STANDARD'})
 assert.equal(JSON.stringify(result).includes(key),false)
})

test('lack of explicit owner approval blocks before all requests',async()=>{
 const i=api()
 await assert.rejects(provisionSharedStorage({apiKey:key,authorization:'wrong'},i.requester),Refused)
 assert.equal(i.actions.length,0)
})

test('existing same-name disk prevents duplicate even if same size',async()=>{
 const i=api({inventory:{
   networkVolumes:[{name:VOLUME_NAME,size:256,id:'alreadyx3'}],
   pagination:{hasNextPage:false}}})
 await assert.rejects(provisionSharedStorage(approved,i.requester),/SHARED_VOLUME_ALREADY_EXISTS/)
 assert.deepEqual(i.actions.map(x=>x.method),['GET'])
})

test('existing large paid storage demands cost review',async()=>{
 const i=api({inventory:{
   networkVolumes:[{name:'OTHER_VOLUME',size:600,id:'existing700'}],
   pagination:{hasNextPage:false}}})
 await assert.rejects(provisionSharedStorage(approved,i.requester),/EXISTING_LARGE_VOLUME/)
 assert.equal(i.actions.length,1)
})

test('paginated or malformed account inventory refuses any POST',async()=>{
 for(const entries of [[],{networkVolumes:[],pagination:{hasNextPage:true}}]){
   const i=api({inventory:entries})
   await assert.rejects(provisionSharedStorage(approved,i.requester),/NETWORK_VOLUME_INVENTORY_INCOMPLETE/)
   assert.equal(i.actions.length,1)
 }
})

test('wrong geography, no standard tier, or L4 alone cannot select region',async()=>{
 for(const d of [
  {dataCenters:[centers.dataCenters[2]]},
  {dataCenters:[{...centers.dataCenters[0],networkVolumeTypes:['HIGH_PERFORMANCE']}]}
 ]){
   assert.throws(()=>chooseDatacenter(d,gpus),/NO_EUROPE_DATACENTER/)
 }
 const onlyL4={gpus:gpus.gpus.filter(x=>x.name==='NVIDIA L4')}
 assert.throws(()=>chooseDatacenter(centers,onlyL4),/NO_EUROPE_DATACENTER/)
})

test('absence of provider SKU availability refuses creation',async()=>{
 const i=api({gpus:{gpus:[]}})
 await assert.rejects(provisionSharedStorage(approved,i.requester),/NO_EUROPE_DATACENTER/)
 assert.deepEqual(i.actions.map(x=>x.method),['GET','GET','GET'])
})

test('POST timeout outcome is ambiguous and never auto retried',async()=>{
 const i=api({write:()=>{throw Error('secret private network error')}})
 await assert.rejects(provisionSharedStorage(approved,i.requester),
   /VOLUME_CREATE_UNCERTAIN_DO_NOT_RETRY/)
 assert.equal(i.actions.filter(x=>x.method==='POST').length,1)
})

test('provider reply with wrong size/region must not claim success',async()=>{
 const i=api({write:body=>Response.json({id:'volxabc123',...body,size:512},{status:201})})
 await assert.rejects(provisionSharedStorage(approved,i.requester),
   /CREATE_RECEIPT_INVALID_INSPECT_ACCOUNT_BEFORE_RETRY/)
 assert.equal(i.actions.filter(x=>x.method==='POST').length,1)
})

test('provider 403 is redacted and fails without a paid POST',async()=>{
 const calls=[]
 const requester=async(url,opts)=>{calls.push(url);return new Response('Bearer '+key,{status:403})}
 await assert.rejects(provisionSharedStorage(approved,requester),/PROVIDER_READ_DENIED/)
 assert.equal(calls.length,1)
})

test('no secret text is ever present in sanitized errors',async()=>{
 const requester=async()=>{throw Error('Authorization: '+key)}
 await assert.rejects(provisionSharedStorage(approved,requester),e=>{
   assert.equal(String(e).includes(key),false)
   return true
 })
})
