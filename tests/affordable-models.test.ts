import { test } from 'node:test'
import assert from 'node:assert/strict'
import { inflateSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { MODEL_CATALOG, draftModel, draftReservationMicroUsd } from '../src/lib/modelCatalog.ts'
import { modelAllowed, planEconomics, providerReserveCents } from '../server/generationEconomics.ts'
import { AccountEntitlements, type EntitlementStorage } from '../server/entitlements.ts'
import { GenerationBudget, type BudgetStorage } from '../server/budget.ts'
import { handle, type Env } from '../server/worker.ts'
import { assetSpecForBlueprint, demoBlueprint, validateBlueprint } from '../src/lib/blueprint.ts'
import { exportBlueprintGlb } from '../src/lib/blueprintExport.ts'
import { inspectGLB } from '../src/lib/glb.ts'
import { rgbaPng } from '../src/lib/proceduralGlb.ts'
import { createMccCabinet } from '../src/lib/mccCabinet.ts'
import { disposeObject } from '../src/lib/worldGeometry.ts'
import { quoteGeneration } from '../src/lib/generationQuote.ts'

class Store implements EntitlementStorage, BudgetStorage {
  data=new Map<string,unknown>(); tail:Promise<unknown>=Promise.resolve()
  async get<T>(key:string){return this.data.get(key) as T|undefined}
  async put(key:string,value:unknown){this.data.set(key,value)}
  transaction<T>(fn:(store:Store)=>Promise<T>):Promise<T>{const next=this.tail.then(()=>fn(this));this.tail=next.catch(()=>{});return next}
}
function account() {const storage=new Store(),object=new AccountEntitlements({storage});return {storage,async call(path:string,body?:unknown){const r=await object.fetch(new Request('https://account.internal'+path,{method:body===undefined?'GET':'POST',...(body===undefined?{}:{body:JSON.stringify(body)})}));return {status:r.status,value:await r.json() as any}}}}

test('approved model prices are tiered but every mix fits the reserved provider budget',()=>{
  assert.deepEqual(Object.keys(MODEL_CATALOG),['luna','sol','astra'])
  assert.equal(MODEL_CATALOG.luna.creditsPerGeneration,15);assert.equal(MODEL_CATALOG.sol.creditsPerGeneration,50);assert.equal(MODEL_CATALOG.astra.creditsPerGeneration,250)
  for(const model of Object.values(MODEL_CATALOG))assert.ok(model.maxProviderCents/model.creditsPerGeneration<=0.7)
  for(const plan of ['creator','pro','studio'] as const)assert.ok(planEconomics(plan).marginBps>=3000)
  assert.equal(modelAllowed('creator','luna'),true);assert.equal(modelAllowed('creator','astra'),false)
  assert.equal(providerReserveCents(1500),1050);assert.throws(()=>draftModel('terra'));assert.throws(()=>draftModel('astra'))
})
test('Luna quotes are visible, server-priced and conditional free quota is shared',()=>{
  const data={credits:900,generationCosts:{luna:15,sol:50,astra:250},subscription:{active:true,plan:'creator'},free:{fastRemaining:2},billingReview:false}
  assert.equal(quoteGeneration('luna',data,{},true).after,885)
  assert.equal(quoteGeneration('sol',data,{},true).after,850)
  assert.equal(quoteGeneration('luna',{...data,credits:0,subscription:{active:false}}, {},true).points,0)
  assert.equal(quoteGeneration('luna',{...data,generationCosts:{luna:1,sol:50,astra:250}}, {},true).state,'pending')
})
test('model-bound idempotency prevents Sol/Luna replay tricks and charges exactly fifteen points',async()=>{
  const a=account();await a.call('/grant',{id:'in_LunaFixture',credits:1500})
  const id='aaaaaaaa-1111-2222-3333-444444444444'
  const first=await a.call('/reserve',{id,profile:'fast',model:'luna'});assert.equal(first.value.cost,15)
  assert.equal((await a.call('/status')).value.credits,1485)
  assert.equal((await a.call('/reserve',{id,profile:'fast',model:'luna'})).value.repeated,true)
  assert.equal((await a.call('/reserve',{id,profile:'fast',model:'sol'})).status,429)
  assert.equal((await a.call('/status')).value.credits,1485)
  const reserved=a.storage.data.get('provider-budget-cents:v1')
  await a.call('/settle',{id,state:'failed'})
  assert.equal((await a.call('/status')).value.credits,1500)
  assert.equal(a.storage.data.get('provider-budget-cents:v1'),reserved)
  assert.equal((await a.call('/reserve',{id,profile:'slow',model:'luna'})).status,400)
})
test('two free attempts total across cheap models, not two per model',async()=>{
  const a=account()
  for(const model of ['luna','sol']){const r=await a.call('/reserve',{id:crypto.randomUUID(),profile:'fast',model});assert.equal(r.value.cost,0);assert.equal(r.status,200)}
  assert.equal((await a.call('/reserve',{id:crypto.randomUUID(),profile:'fast',model:'luna'})).status,429)
  assert.equal((await a.call('/reserve',{id:crypto.randomUUID(),profile:'slow',model:'astra'})).status,429)
})
test('selected Luna reaches only its own provider ID, and arbitrary models are rejected before paid calls',async()=>{
  const env:Env={OPENAI_API_KEY:'fixture-never-use-live',ENABLE_PAID_GENERATION:'true',OPENAI_MODEL:'gpt-6-astra',PUBLIC_PILOT:'true',GENERATION_REQUEST_LIMIT:'unlimited',GENERATION_LIMITER:{async limit(){return {success:true}}}}
  const stores=new Map<string,GenerationBudget>();env.GENERATION_BUDGET={idFromName:name=>name,get:id=>{const key=String(id);if(!stores.has(key))stores.set(key,new GenerationBudget({storage:new Store()},env));return stores.get(key)!}}
  let calls=0
  const blueprint=demoBlueprint('one tree'),assetSpec=assetSpecForBlueprint(blueprint)
  const provider=(async(url:unknown,init?:RequestInit)=>{
    const body=JSON.parse(String(init?.body));assert.equal(body.model,'gpt-6-luna')
    if(String(url).endsWith('/input_tokens'))return Response.json({object:'response.input_tokens',input_tokens:1000})
    calls++;assert.equal(String(url),'https://api.openai.com/v1/responses');assert.equal(body.service_tier,'default')
    return Response.json({id:'resp_luna_fixture',status:'completed',model:'gpt-6-luna',usage:{input_tokens:1000,output_tokens:300,total_tokens:1300},output:[{content:[{type:'output_text',text:JSON.stringify({blueprint,assetSpec})}]}]})
  }) as typeof fetch
  const request=(model:string)=>new Request('https://worldifact.test/api/blueprint',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:'one tree',mode:'live',model})})
  assert.equal((await handle(request('terra'),env,provider)).status,400);assert.equal(calls,0)
  const response=await handle(request('luna'),env,provider);assert.equal(response.status,200);assert.equal((await response.json() as any).model,'gpt-6-luna');assert.equal(calls,1)
  assert.ok(draftReservationMicroUsd('luna',1000)<100000);assert.ok(draftReservationMicroUsd('sol',1000)<150000)
})
test('procedural PNG encoding round-trips without document, canvas or network',()=>{
  const pixels=new Uint8Array([255,0,0,255,0,200,0,255]),png=rgbaPng(2,1,pixels)
  assert.deepEqual(Array.from(png.subarray(0,8)),[137,80,78,71,13,10,26,10])
  let at=8;const idat:Uint8Array[]=[]
  while(at<png.length){const len=new DataView(png.buffer,png.byteOffset+at,4).getUint32(0);const kind=new TextDecoder().decode(png.subarray(at+4,at+8));if(kind==='IDAT')idat.push(png.subarray(at+8,at+8+len));at+=len+12}
  assert.deepEqual(Array.from(inflateSync(Buffer.concat(idat))),[0,...pixels])
})
test('MCC free-quality kit has separate devices, embedded textures and an exportable bounded GLB',async()=>{
  const object=createMccCabinet();try {let drawers=0;object.traverse(o=>{if(o.name.startsWith('drawer-'))drawers++});assert.equal(drawers,26)}finally{disposeObject(object)}
  const scene=validateBlueprint({version:1,title:'MCC fixture',biome:'valley',objects:[{id:'mcc',name:'MCC',kind:'mcc-cabinet',x:0,z:0,scale:1,rotation:0,color:'#d5d8d2'}]})
  const file=await exportBlueprintGlb(scene),inspection=inspectGLB(file);assert.ok(inspection.triangles>1000);assert.ok(inspection.triangles<100000);assert.ok(inspection.byteLength<8_000_000)
  const view=new DataView(file),json=JSON.parse(new TextDecoder().decode(new Uint8Array(file,20,view.getUint32(12,true))))
  assert.ok(json.images.length>=3);assert.ok(json.images.every((i:any)=>i.mimeType==='image/png' && i.uri===undefined))
  assert.ok(json.nodes.some((n:any)=>n.name==='screen'));assert.ok(json.nodes.some((n:any)=>n.name==='isolator-handle'))
  console.log('MCC QUALITY FIXTURE (not live AI):',JSON.stringify(inspection))
})
test('published comparison photos match the cropped source hashes, without fabricated images',async()=>{
  const manifest=JSON.parse(await readFile('public/comparisons/mcc/provenance.json','utf8'))
  for(const name of ['worldifact-detail.webp','meshy-detail.webp']){const data=await readFile('public/comparisons/mcc/'+name);assert.equal(createHash('sha256').update(data).digest('hex'),manifest[name].sha256)}
  const html=await readFile('public/compare/mcc/index.html','utf8');assert.match(html,/not a controlled benchmark/);assert.match(html,/owner-reported/);assert.match(html,/max_output_tokens|output allocation/)
})
