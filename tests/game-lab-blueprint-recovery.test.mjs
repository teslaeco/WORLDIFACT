import test from 'node:test'
import assert from 'node:assert/strict'
import { setTimeout as pause } from 'node:timers/promises'
import { harness, owner, other, deferred, text } from './game-lab-editor-helper.mjs'
import { assetSpecForBlueprint, demoBlueprint } from '../src/lib/blueprint.ts'
import { blueprintFingerprint, blueprintRequestId } from '../src/lib/blueprintRequest.ts'
import { ScopedBlueprintClient } from '../src/lib/scopedBlueprintClient.ts'

const requestLabel='Request once · 15 points if credit-funded',recoverLabel='Recover saved proposal · no new charge',resetLabel='Prepare new paid attempt…'
const storage=data=>({getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)})
async function verifiedResult(seed,model='luna') {
  const blueprint=demoBlueprint('Fixture solar rover')
  return {mode:'LIVE',provenance:'GENERATED',blueprint,assetSpec:assetSpecForBlueprint(blueprint),requestId:await blueprintRequestId(seed),model:model==='sol'?'gpt-6.1-sol':`gpt-6-${model}`,limitation:'Inert fixture; no live model was called.',evidence:{providerResponseId:'resp_editor_fixture',receivedAt:'2026-10-02T00:00:00.000Z',blueprintSha256:await blueprintFingerprint(blueprint),inputTokens:null,outputTokens:null,totalTokens:null},delivery:{kind:'procedural-blueprint',referenceCount:0,fallbackUsed:false}}
}
function transport({lose=false,pending,failed=false}={}) {
  const records=new Map(),calls=[]
  const fetcher=async(path,init={},actor=owner)=>{
    const method=init.method||'GET';calls.push({path,method,actor})
    if(method==='POST'){
      const seed=new Headers(init.headers).get('X-WORLDIFACT-Request');assert.match(seed,/^[a-f0-9-]{36}$/)
      const body=JSON.parse(init.body),result=await verifiedResult(seed,body.model)
      records.set(seed,{actor,result})
      if(pending)await pending.promise
      if(lose)throw new TypeError('Response lost after server completion')
      return failed?Response.json({error:'Fixture rejected before reservation',noCharge:true},{status:503}):Response.json(result)
    }
    const record=records.get(path.split('/').at(-1))
    if(!record||record.actor!==actor)return Response.json({error:'Not found'},{status:404})
    return Response.json({state:'completed',result:record.result})
  }
  return {fetcher,records,calls,posts:()=>calls.filter(c=>c.method==='POST')}
}
async function until(h,ready) {
  for(let i=0;i<200;i++){await h.settle();if(ready())return;await pause(1)}
  assert.fail('The fixture request did not reach its expected state')
}
const finished=h=>until(h,()=>!h.all().some(n=>n.type==='button'&&text(n)==='Waiting for one AI proposal…'))
async function assistant(h,prompt='A small solar rover') {
  h.button('Assistant').props.onClick();await h.settle()
  h.node(n=>n.type==='textarea'&&n.props.maxLength===1600).props.onChange({target:{value:prompt}});await h.settle()
}

// These exercise the real editor handlers, durable metadata and BlueprintClient.
// Transport responses are inert fixtures, never paid/provider or browser calls.
test('lost editor POST response survives reload; repeated explicit recovery never posts again',async()=>{
  const t=transport({lose:true}),h=await harness({blueprintTransport:t.fetcher});let reload
  try{
    await assistant(h);const id=h.canvas().props.world.id
    const click=h.button(requestLabel).props.onClick;click();click();await finished(h)
    assert.equal(t.posts().length,1);assert.equal(h.calls.find(c=>c.path==='/api/blueprint').headers.has('X-WORLDIFACT-Request'),true)
    assert.ok(h.stores.get(owner).has(`private-world:${id}`),'New world is saved before paying so reload can reopen recovery')
    assert.equal(h.button(requestLabel).props.disabled,true);assert.ok(h.button(recoverLabel));assert.match(h.text(),/Response lost/)
    const raw=[...h.recoveryStore.values()].join('');assert.doesNotMatch(raw,/solar rover|Design at most|Model test world|data:image/)
    h.close();reload=await harness({autoCreate:false,durableStores:h.stores,recoveryStore:h.recoveryStore,blueprintTransport:t.fetcher})
    await reload.open(id);await assistant(reload,'Different input after reload')
    assert.equal(t.calls.length,1,'Mount and opening a world never automatically recover or generate')
    assert.equal(reload.button(requestLabel).props.disabled,true)
    const recover=reload.button(recoverLabel).props.onClick;recover();recover();await finished(reload)
    assert.equal(t.posts().length,1);assert.equal(t.calls.length,2);assert.ok(reload.button('Add proposed objects'));assert.equal(reload.canvas().props.world.entities.length,0)
    reload.button(recoverLabel).props.onClick();await finished(reload);assert.equal(t.posts().length,1)
  }finally{h.close();reload?.close()}
})

test('paid proposal survives edits before and after completion; changed-world apply needs explicit confirmation',async()=>{
  const pending=deferred(),t=transport({pending}),confirmations=[];let accept=false
  const h=await harness({blueprintTransport:t.fetcher,confirm:message=>{confirmations.push(message);return accept}})
  try{
    await assistant(h);h.button(requestLabel).props.onClick();await h.settle()
    await h.rename('Changed during paid request');pending.resolve();await finished(h)
    assert.ok(h.button('Add proposed objects'));assert.match(h.text(),/proposal is kept for review/);assert.equal(h.canvas().props.world.entities.length,0)
    await h.rename('Edited again after completion');assert.ok(h.button('Add proposed objects'))
    h.button('Add proposed objects').props.onClick();await h.settle();assert.equal(h.canvas().props.world.entities.length,0);assert.equal(confirmations.length,1)
    accept=true;const apply=h.button('Add proposed objects').props.onClick;apply();apply();await h.settle()
    assert.equal(h.canvas().props.world.entities.length,[...t.records.values()][0].result.blueprint.objects.length)
    assert.equal(confirmations.length,2);assert.equal(t.posts().length,1)
  }finally{h.close()}
})

test('terminal attempt needs reset confirmation and then a separate explicit paid request',async()=>{
  for(const failed of [false,true]){
    const t=transport({failed}),confirmations=[];let approve=false
    const h=await harness({blueprintTransport:t.fetcher,confirm:message=>{confirmations.push(message);return approve}})
    try{
      await assistant(h);h.button(requestLabel).props.onClick();await finished(h);assert.ok(h.button(resetLabel))
      const old=[...h.recoveryStore.values()][0];h.button(resetLabel).props.onClick();await h.settle()
      assert.equal([...h.recoveryStore.values()][0],old);assert.equal(t.posts().length,1)
      approve=true;h.button(resetLabel).props.onClick();await h.settle();assert.equal(confirmations.length,2)
      assert.equal(h.recoveryStore.size,0);assert.equal(t.posts().length,1,'Reset never starts paid generation')
      h.button(requestLabel).props.onClick();await finished(h);assert.equal(t.posts().length,2)
      assert.notEqual(JSON.parse([...h.recoveryStore.values()][0]).recovery.id,JSON.parse(old).recovery.id)
    }finally{h.close()}
  }
})

test('account switch and unmount cannot display or apply a late result or unlock another operation',async()=>{
  const first=deferred(),second=deferred(),t1=transport({pending:first}),t2=transport({pending:second})
  const h=await harness({blueprintTransport:(path,init,actor)=>(actor===owner?t1:t2).fetcher(path,init,actor)})
  try{
    await assistant(h);h.button(requestLabel).props.onClick();await until(h,()=>t1.posts().length===1)
    const originalId=h.canvas().props.world.id
    await h.setOwner(other);await h.create();await assistant(h)
    assert.ok(!h.all().some(n=>n.type==='button'&&text(n)===recoverLabel),'Other account sees no original recovery')
    h.button(requestLabel).props.onClick();await until(h,()=>t2.posts().length===1)
    first.resolve();await h.settle();assert.equal(h.button('Waiting for one AI proposal…').props.disabled,true)
    assert.equal(h.canvas().props.world.entities.length,0);assert.ok(!h.all().some(n=>n.type==='button'&&text(n)==='Add proposed objects'))
    second.resolve();await finished(h);assert.ok(h.button('Add proposed objects'))
    await h.setOwner(owner);await h.open(originalId);await assistant(h);assert.ok(h.button(recoverLabel));assert.equal(t1.posts().length,1)
  }finally{h.close()}
  const pending=deferred(),t=transport({pending}),gone=await harness({blueprintTransport:t.fetcher})
  await assistant(gone);gone.button(requestLabel).props.onClick();await until(gone,()=>t.posts().length===1);gone.close();pending.resolve();await gone.settle()
  assert.equal(gone.canvas().props.world.entities.length,0);assert.equal(t.posts().length,1)
})

test('world switch retains original request under its own scope; recovering never applies it to the other world',async()=>{
  const t=transport({lose:true}),h=await harness({blueprintTransport:t.fetcher})
  try{
    await assistant(h);const id=h.canvas().props.world.id;h.button(requestLabel).props.onClick();await finished(h)
    h.button('＋ New game').props.onClick();await h.settle();await h.create();await assistant(h)
    assert.notEqual(h.canvas().props.world.id,id);assert.ok(!h.all().some(n=>n.type==='button'&&text(n)===recoverLabel))
    assert.equal(t.posts().length,1);await h.open(id);await assistant(h)
    h.button(recoverLabel).props.onClick();await finished(h);assert.ok(h.button('Add proposed objects'));assert.equal(h.canvas().props.world.entities.length,0);assert.equal(t.posts().length,1)
  }finally{h.close()}
})

test('changed pending inputs and terminal attempts cannot create another logical request through the scoped client',async()=>{
  const data=new Map(),t=transport({lose:true}),client=new ScopedBlueprintClient(storage(data),t.fetcher,owner,'world-a')
  const payload={prompt:'Private solar rover description',model:'luna',references:[{dataUrl:'private-image-fixture'}]},snapshot={privateWorld:'Original world'}
  await assert.rejects(client.submit(payload,snapshot),/Response lost/)
  const seed=client.current().id
  for(const changes of [{prompt:'Changed'},{model:'sol'},{references:[]}])await assert.rejects(client.submit({...payload,...changes},snapshot),/Different inputs/)
  assert.throws(()=>client.reset(true),/pending/)
  const reloaded=new ScopedBlueprintClient(storage(data),t.fetcher,owner,'world-a')
  await reloaded.submit(payload,{privateWorld:'Changed world'})
  assert.equal(reloaded.current().id,seed);assert.equal(reloaded.current().snapshotFingerprint,await blueprintFingerprint(snapshot))
  await assert.rejects(reloaded.submit({...payload,prompt:'New idea'},snapshot),/explicitly prepare/)
  assert.throws(()=>reloaded.reset(false),/Confirm/);assert.equal(t.posts().length,1)
  assert.equal(new ScopedBlueprintClient(storage(data),t.fetcher,other,'world-a').current(),null)
  assert.equal(new ScopedBlueprintClient(storage(data),t.fetcher,owner,'world-b').current(),null)
  assert.doesNotMatch([...data.values()].join(''),/Private solar|private-image|Original world/)
})

test('storage errors and inactive owner fail closed before a paid POST',async()=>{
  let calls=0;const fetcher=async()=>{calls++;throw new Error('Unexpected network')},payload={prompt:'Solar rover',model:'luna'}
  const blocked=new ScopedBlueprintClient({getItem:()=>null,setItem:()=>{throw new Error('Storage blocked')},removeItem:()=>{}},fetcher,owner,'world-a')
  await assert.rejects(blocked.submit(payload,{}),/Storage blocked/)
  let active=true;const switched=new ScopedBlueprintClient(storage(new Map()),fetcher,owner,'world-b',()=>active)
  const pending=switched.submit(payload,{});active=false;await assert.rejects(pending,/account or world changed/)
  assert.equal(calls,0)
})

test('a failed or superseded pre-request world save never starts a paid request',async()=>{
  const t=transport(),rejected=await harness({blueprintTransport:t.fetcher,writeWorld:async()=>{throw new Error('Save unavailable')}})
  try{await assistant(rejected);rejected.button(requestLabel).props.onClick();await finished(rejected);assert.equal(t.posts().length,0);assert.equal(rejected.recoveryStore.size,0);assert.match(rejected.text(),/Save unavailable/)}finally{rejected.close()}
  const pending=deferred(),edited=await harness({blueprintTransport:t.fetcher,writeWorld:async(_body,persist)=>{await pending.promise;return persist()}})
  try{
    await assistant(edited);edited.button(requestLabel).props.onClick();await edited.settle();await edited.rename('Edited before charge')
    pending.resolve();await finished(edited);assert.equal(t.posts().length,0);assert.match(edited.text(),/No generation was started/)
  }finally{edited.close()}
})

test('same-turn new-world gestures and an older world load cannot replace the active paid request scope',async()=>{
  const pending=deferred(),load=deferred(),t=transport({pending}),h=await harness({blueprintTransport:t.fetcher,readWorld:()=>load.promise})
  try{
    await h.save();await assistant(h);const original=h.canvas().props.world,begin=h.button('＋ New game').props.onClick
    await h.open('cccccccc-cccc-4ccc-8ccc-cccccccccccc')
    h.button(requestLabel).props.onClick();begin();await h.settle()
    load.resolve(Response.json({document:{...original,id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc'},revision:1,updatedAt:'2026-10-02T00:00:00Z'}));await h.settle()
    assert.equal(h.canvas().props.world.id,original.id);assert.ok(!h.all().some(n=>n.props.id==='new-world-title'))
    pending.resolve();await finished(h);assert.ok(h.button('Add proposed objects'));assert.equal(t.posts().length,1)
  }finally{h.close()}
})

test('typed no-charge refusal survives reload without recovery traffic or another paid attempt',async()=>{
  const data=new Map(),calls=[],fetcher=async(path,init)=>{calls.push({path,method:init?.method});return Response.json({noCharge:true,failureCode:'CREDITS_EXHAUSTED',error:'Untrusted provider detail'},{status:403})}
  const first=new ScopedBlueprintClient(storage(data),fetcher,owner,'world-a')
  await assert.rejects(first.submit({prompt:'Solar rover',model:'luna'},{}),/Not enough available points/)
  assert.equal(first.current().failureCode,'CREDITS_EXHAUSTED')
  const reload=new ScopedBlueprintClient(storage(data),fetcher,owner,'world-a')
  await assert.rejects(reload.recover(),/No provider generation was submitted/)
  assert.equal(calls.length,1);assert.equal(reload.current().state,'failed');assert.doesNotMatch([...data.values()].join(''),/Untrusted provider/)
})

test('scoped adapter rejects delayed results after owner or surface switches and preserves the original recovery',async()=>{
  for(const switchAt of ['before-response','after-receipt'])for(const changed of ['owner','surface']){
    const data=new Map(),started=deferred(),release=deferred(),t=transport()
    let activeOwner=owner,activeSurface='world-a'
    const switchScope=()=>{if(changed==='owner')activeOwner=other;else activeSurface='world-b'}
    const durable=storage(data),store={...durable,setItem(key,value){
      durable.setItem(key,value)
      // Simulate a scope change at the final persistence boundary, after the
      // pre-write guard. run() must still reject before exposing the result.
      if(switchAt==='after-receipt'&&JSON.parse(value).recovery.state==='completed')switchScope()
    }}
    const fetcher=async(path,init)=>{
      const response=await t.fetcher(path,init)
      if(init?.method==='POST'){started.resolve();await release.promise}
      return response
    }
    const original=new ScopedBlueprintClient(store,fetcher,owner,'world-a',()=>activeOwner===owner&&activeSurface==='world-a')
    const request=original.submit({prompt:'Private solar rover',model:'luna'},{revision:7})
    await started.promise
    const savedId=original.current().id
    const rejected=assert.rejects(request,/account or world changed/)
    if(switchAt==='before-response')switchScope()
    release.resolve();await rejected
    assert.equal(original.current().id,savedId)
    assert.equal(original.current().state,switchAt==='before-response'?'pending':'completed')
    assert.throws(()=>original.reset(true),/account or world changed/)
    assert.equal(new ScopedBlueprintClient(durable,fetcher,other,'world-a').current(),null)
    assert.equal(new ScopedBlueprintClient(durable,fetcher,owner,'world-b').current(),null)
    const restored=new ScopedBlueprintClient(durable,fetcher,owner,'world-a'),proposal=await restored.recover()
    assert.equal(proposal.result.requestId,await blueprintRequestId(savedId))
    assert.equal(proposal.snapshotFingerprint,await blueprintFingerprint({revision:7}))
    assert.equal(t.posts().length,1);assert.equal(t.calls.filter(c=>c.method==='GET').length,1)
  }
})
