import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setImmediate as nextTick } from 'node:timers/promises'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import React from 'react'
import * as world from '../src/lib/privateWorld.ts'
import * as library from '../src/lib/gameLabLibrary.ts'
import * as models from '../src/lib/modelCatalog.ts'
import * as blueprint from '../src/lib/blueprint.ts'
import * as editor from '../src/lib/editorTools.ts'
import { privateWorldStore } from '../server/privateWorldStore.ts'

const owner = '11111111-1111-4111-8111-111111111111'
const other = '22222222-2222-4222-8222-222222222222'
const modelId = '33333333-3333-4333-8333-333333333333'
const assetId = '44444444-4444-4444-8444-444444444444'
const replacementId = '55555555-5555-4555-8555-555555555555'
const prompt = 'Golden rover\nFour wheels\r\n\tSolar roof'
const deferred = () => { let resolve, reject; const promise = new Promise((yes,no) => { resolve=yes; reject=no }); return { promise, resolve, reject } }
function nodes(tree) {
  const all=[];const walk=n=>{if(Array.isArray(n))n.forEach(walk);else if(React.isValidElement(n)){all.push(n);walk(n.props.children)}};walk(tree);return all
}
function text(n) { return n==null||typeof n==='boolean'?'':Array.isArray(n)?n.map(text).join(''):React.isValidElement(n)?text(n.props.children):String(n) }
// Actual editor hooks and handlers + actual world persistence/validation. No
// DOM, WebGL or service is exercised; local-byte adapters are deterministic.
async function harness({ autoCreate=true,initialOwner=owner,durableStores=new Map(),writeWorld,archiveEntries,verified=false, readModel, readWorld, verifyLibrary, archivePrompt=prompt, assetName=prompt }={}) {
  const slots=[],effects=[],timers=new Map(),calls=[],stores=durableStores,assetWrites=[],navigations=[]
  let cursor=0,dirty=true,tree,serial=0,account=initialOwner,assets=[]
  const react={...React,lazy:()=>function CanvasStub(){return null},
    useState(initial){const i=cursor++;if(!slots[i])slots[i]={value:typeof initial==='function'?initial():initial};return[slots[i].value,action=>{const next=typeof action==='function'?action(slots[i].value):action;if(!Object.is(next,slots[i].value)){slots[i].value=next;dirty=true}}]},
    useRef(initial){const i=cursor++;if(!slots[i])slots[i]={ref:{current:initial}};return slots[i].ref},
    useEffect(fn,deps){const i=cursor++,prior=slots[i];if(!prior||!deps||deps.some((v,j)=>!Object.is(v,prior.deps?.[j]))){const next={deps,cleanup:prior?.cleanup};slots[i]=next;effects.push(()=>{next.cleanup?.();next.cleanup=fn()})}},
  }
  const fetcher=async(path,init={})=>{
    const method=init.method||'GET',body=init.body?JSON.parse(init.body):undefined;calls.push({path,method,body,owner:account})
    if(path==='/api/worlds/library')return verifyLibrary?verifyLibrary(body,calls):Response.json({ids:verified?[modelId]:[]})
    assert.match(path,/^\/api\/worlds(?:\/[a-f0-9-]+)?$/,'No generation or other network endpoint may be used')
    if(method==='GET'&&path.startsWith('/api/worlds/')&&readWorld)return readWorld(path.split('/')[3])
    if(!stores.has(account))stores.set(account,new Map());const data=stores.get(account)
    const storage={get:async key=>data.get(key),put:async(key,value)=>{data.set(key,structuredClone(value))},transaction:async fn=>fn(storage)}
    const id=path.split('/')[3],input=method==='PUT'?{action:'save',id,...body}:id?{action:'read',id}:{action:'list'}
    const persist=()=>privateWorldStore(new Request('https://internal/private-worlds',{method:'POST',body:JSON.stringify(input)}),storage,1790924400000)
    return method==='PUT'&&writeWorld?writeWorld(body,persist):persist()
  }
  const events=new EventTarget(),documentEvents=new EventTarget()
  const url=new URL('../src/pages/PrivateGameLab.tsx',import.meta.url),module={exports:{}},localRequire=createRequire(url)
  const source=await readFile(url,'utf8'),code=ts.transpileModule(source,{fileName:url.pathname,compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText
  const timeout=(fn,delay)=>{const id=++serial;timers.set(id,{fn,delay});return id}
  const archive=archiveEntries??[{id:modelId,prompt:archivePrompt,savedAt:'2026-10-02T06:00:00Z',byteLength:500,sha256:'a'.repeat(64),review:'UNREVIEWED'}]
  runInNewContext(code,{module,exports:module.exports,crypto:globalThis.crypto,fetch:fetcher,AbortSignal,AbortController,Blob,Symbol,Error,console,
    window:Object.assign(events,{confirm:()=>true}),document:Object.assign(documentEvents,{visibilityState:'visible'}),setTimeout:timeout,clearTimeout:id=>timers.delete(id),
    require(id){
      if(id==='react')return react
      if(id==='react/jsx-runtime')return localRequire(id)
      if(id==='react-router-dom')return {Link:()=>null,useNavigate:()=>((...args)=>navigations.push(args))}
      if(id==='../lib/account')return {useAccount:()=>({user:account?{id:account}:null,loading:false})}
      if(id==='../lib/privateWorld')return world
      if(id==='../lib/gameLabLibrary')return library
      if(id==='../lib/modelCatalog')return models
      if(id==='../lib/blueprint')return blueprint
      if(id==='../lib/editorTools')return editor
      if(id==='../lib/studioArchive')return {STUDIO_ARCHIVE_EVENT:'archive',STUDIO_ARCHIVE_SIGNAL_KEY:'signal',listStudioModels:async()=>archive,readStudioModel:readModel||(async()=>new Blob(['fixture']))}
      if(id==='../lib/privateWorldAssets')return {listWorldAssets:async who=>assets.filter(a=>a.owner===who),storeWorldAsset:async(who,name,blob)=>{assetWrites.push({owner:who,name,blob});const item={id:assetWrites.length===1?assetId:replacementId,owner:who,name:assetName,bytes:blob.size,sha256:'a'.repeat(64)};assets=[item];return item}}
      if(id.endsWith('.css'))return {}
      if(id.startsWith('../components/'))return {__esModule:true,default:()=>null}
      throw new Error('Unexpected dependency '+id)
    }
  },{filename:url.pathname,timeout:1000})
  const Component=module.exports.default
  const settle=async()=>{for(let i=0;i<16;i++){if(dirty){dirty=false;cursor=0;tree=Component()}while(effects.length)effects.shift()();await nextTick()}}
  const node=predicate=>{const value=nodes(tree).find(predicate);assert.ok(value,'Expected editor control');return value}
  const button=label=>node(n=>n.type==='button'&&text(n)===label)
  const canvas=()=>node(n=>n.props.onPick&&n.props.world)
  const start=async()=>{node(n=>n.type==='input'&&n.props.placeholder==='Riverlight — my first game').props.onChange({target:{value:'Model test world'}});await settle();button('Next · create your character').props.onClick();await settle();button('Create my world · no API charge').props.onClick();await settle();button('Library').props.onClick();await settle()}
  await settle();if(autoCreate)await start()
  return {calls,assetWrites,archive,settle,button,canvas,events,timers,stores,navigations,node,
    all:()=>nodes(tree),
    text:()=>text(tree),
    async setOwner(id){account=id;dirty=true;await settle()},
    clearDeviceAssets(){assets=[]},
    async create(){await start()},
    async rename(name){node(n=>n.props['aria-label']==='World name').props.onChange({target:{value:name}});await settle()},
    async save(){button('Save world').props.onClick();await settle()},
    async open(id){node(n=>n.type==='select'&&n.props['aria-label']==='Open my saved world').props.onChange({target:{value:id}});await settle()},
    close(){for(const slot of slots)slot?.cleanup?.();timers.clear()},
  }
}

test('multi-line generated GLB adds from Library in one action and survives world save/reopen',async()=>{
  const h=await harness()
  try{
    h.button('Add local GLB to world').props.onClick();await h.settle()
    const doc=h.canvas().props.world,entity=doc.entities[0]
    assert.equal(doc.entities.length,1,'Use model must place it, not only change a hidden selector')
    assert.equal(entity.assetId,assetId);assert.equal(entity.name,'Golden rover Four wheels Solar roof')
    assert.deepEqual([entity.x,entity.z],[-8,0]);assert.equal(h.canvas().props.selected,entity.id)
    assert.equal(h.assetWrites[0].name,prompt,'Original prompt is not changed')
    assert.equal(h.archive[0].prompt,prompt)
    assert.match(h.text(),/Added Golden rover/);assert.doesNotMatch(h.text(),/Invalid world text/)
    await h.save();await h.open(doc.id)
    assert.deepEqual(h.canvas().props.world.entities,[entity]);assert.equal(h.canvas().props.world.entities[0].assetId,assetId)
    assert.ok(h.calls.every(c=>!c.path.includes('/studio')&&!c.path.includes('/blueprint')))
  }finally{h.close()}
})

test('double import clicks share one locked operation and error leaves scene unchanged',async()=>{
  const read=deferred(),h=await harness({readModel:()=>read.promise})
  try{
    const click=h.button('Add local GLB to world').props.onClick;click();click();await h.settle()
    assert.equal(h.button('Importing…').props.disabled,true)
    read.resolve(new Blob(['one model']));await h.settle()
    assert.equal(h.assetWrites.length,1);assert.equal(h.canvas().props.world.entities.length,1)
  }finally{h.close()}
  const failed=await harness({readModel:async()=>{throw new Error('Original GLB is unavailable')}})
  try{failed.button('Add local GLB to world').props.onClick();await failed.settle();assert.equal(failed.canvas().props.world.entities.length,0);assert.equal(failed.assetWrites.length,0);assert.match(failed.text(),/Original GLB is unavailable/)}finally{failed.close()}
})

test('pending old-account import cannot store or place a model in the next account',async()=>{
  const read=deferred(),h=await harness({readModel:()=>read.promise})
  try{
    h.button('Add local GLB to world').props.onClick();await h.settle();await h.setOwner(other);await h.create()
    read.resolve(new Blob(['old account bytes']));await h.settle()
    assert.equal(h.assetWrites.length,0);assert.equal(h.canvas().props.world.entities.length,0)
  }finally{h.close()}
})

test('unmounted imports and revoked verified downloads cannot mutate the world',async()=>{
  const read=deferred(),h=await harness({readModel:()=>read.promise})
  h.button('Add local GLB to world').props.onClick();await h.settle();h.close();read.resolve(new Blob(['late']));await nextTick();assert.equal(h.assetWrites.length,0)
  let checks=0
  const revoked=await harness({verifyLibrary:async()=>Response.json({ids:++checks===1?[modelId]:[]})})
  try{revoked.button('Add saved model to world').props.onClick();await revoked.settle();assert.equal(revoked.assetWrites.length,0);assert.equal(revoked.canvas().props.world.entities.length,0);assert.match(revoked.text(),/no longer downloadable/)}finally{revoked.close()}
})

test('local library appears before slow server verification and older refresh cannot replace newer state',async()=>{
  const first=deferred(),second=deferred();let checks=0
  const h=await harness({verifyLibrary:()=>++checks===1?first.promise:second.promise})
  try{
    assert.ok(h.button('Add local GLB to world'))
    h.button('Refresh library').props.onClick();await h.settle();second.resolve(Response.json({ids:[modelId]}));await h.settle();assert.ok(h.button('Add saved model to world'))
    first.resolve(Response.json({ids:[]}));await h.settle();assert.ok(h.button('Add saved model to world'),'Late stale lookup must not downgrade a newer verification')
  }finally{h.close()}
})

test('explicit relink restores a missing model reference without losing saved transforms',async()=>{
  const h=await harness()
  try{
    h.button('Add local GLB to world').props.onClick();await h.settle()
    const original=h.canvas().props.world.entities[0]
    h.canvas().props.onTransform(original.id,{x:9,z:7,elevation:2,rotation:35,scale:1.4});await h.settle()
    await h.save();h.clearDeviceAssets();await h.open(h.canvas().props.world.id);h.canvas().props.onPick({x:9,z:7},original.id);await h.settle()
    const replacement=h.all().find(n=>n.type==='input'&&n.props.type==='file'&&nodes(h.all().find(n=>n.type==='label'&&text(n).includes('Replace selected model with GLB'))).includes(n))
    assert.ok(replacement)
    const file=new Blob(['replacement']);file.name='Restored vehicle.glb';replacement.props.onChange({target:{files:[file],value:'chosen'}});await h.settle()
    const after=h.canvas().props.world.entities
    assert.equal(after.length,1);assert.equal(after[0].id,original.id);assert.equal(after[0].assetId,replacementId);assert.notEqual(after[0].assetId,original.assetId)
    assert.deepEqual([after[0].x,after[0].z,after[0].elevation,after[0].rotation,after[0].scale],[9,7,2,35,1.4])
    await h.save();await h.open(h.canvas().props.world.id);assert.equal(JSON.stringify(h.canvas().props.world.entities),JSON.stringify(after))
  }finally{h.close()}
})

test('model scene labels repair old control characters and keep UTF-8 content bounded',()=>{
  for(const value of [prompt,'\n\t\u0000',' '.repeat(20)+'ą model '+ 'x'.repeat(150)]){
    const name=world.worldAssetName(value);assert.ok(name.length>0&&name.length<=100);assert.ok([...name].every(c=>c.charCodeAt(0)>=32))
    assert.doesNotThrow(()=>world.validatePrivateWorld({...world.blankWorld(),entities:[{...world.newEntity('asset',0,0,assetId),name}]}))
  }
})


test('a late open-world response cannot overwrite a model added while navigation was pending',async()=>{
  const read=deferred(),h=await harness({readWorld:()=>read.promise})
  try{
    const currentId=h.canvas().props.world.id,otherWorld=world.blankWorld('Previously saved world')
    await h.open(otherWorld.id)
    h.button('Add local GLB to world').props.onClick();await h.settle()
    read.resolve(Response.json({document:otherWorld,revision:1,updatedAt:'2026-10-02T06:00:00Z'}));await h.settle()
    assert.equal(h.canvas().props.world.id,currentId);assert.equal(h.canvas().props.world.entities.length,1)
    assert.match(h.text(),/changed while another world was opening/)
  }finally{h.close()}
})

function shopClick(link,overrides={}) {
  const event={button:0,defaultPrevented:false,preventDefault(){this.defaultPrevented=true},...overrides}
  assert.equal(typeof link.props.onClick,'function','Every Shop entry must save through the real navigation handler')
  link.props.onClick(event)
  return event
}
const shopLink=(h,label)=>h.node(n=>n.props.to==='/shop'&&text(n)===label)
const worldWrites=h=>h.calls.filter(c=>c.method==='PUT')

test('every Shop entry saves a just-created world before navigation and the saved world reopens after remount',async()=>{
  for(const label of ['Create 3D model','Generate a new 3D model →','Create detailed character in AI Shop →']){
    const pending=deferred(),h=await harness({writeWorld:async(_body,persist)=>{await pending.promise;return persist()}})
    let reopened
    try{
      if(label.includes('character')){h.button('Build').props.onClick();await h.settle()}
      const doc=h.canvas().props.world,link=shopLink(h,label),expectedState=link.props.state
      assert.ok([...h.timers.values()].some(t=>t.delay===8000),'The quiet autosave has not run')
      assert.equal(shopClick(link).defaultPrevented,true)
      // Duplicate same-tick and re-rendered link clicks must share one write and one departure.
      shopClick(link);await h.settle();shopClick(shopLink(h,label));await h.settle()
      assert.equal(worldWrites(h).length,1);assert.equal(h.navigations.length,0)
      pending.resolve();await h.settle()
      assert.equal(h.navigations.length,1);assert.equal(h.navigations[0][0],'/shop')
      assert.equal(JSON.stringify(h.navigations[0][1]),JSON.stringify(expectedState?{state:expectedState}:undefined))
      assert.equal(h.stores.get(owner).get(`private-world:${doc.id}`).document.id,doc.id)
      h.close()
      reopened=await harness({autoCreate:false,durableStores:h.stores});await reopened.open(doc.id)
      assert.equal(JSON.stringify(reopened.canvas().props.world),JSON.stringify(doc))
      assert.equal(worldWrites(reopened).length,0)
    }finally{h.close();reopened?.close()}
  }
})

test('Shop departure stays in the editor on rejected, conflicting, or malformed saves and allows an explicit retry',async()=>{
  for(const failure of [()=>{throw new Error('Network unavailable')},()=>Response.json({ok:false,error:'This world changed in another tab. Reload before saving; your draft is preserved.'}),body=>Response.json({document:{...body.document,name:'Another snapshot'},revision:body.expectedRevision+1,updatedAt:'2026-10-02T06:00:00Z'})]){
    let attempt=0
    const h=await harness({writeWorld:(body,persist)=>++attempt===1?failure(body):persist()})
    try{
      const before=JSON.stringify(h.canvas().props.world)
      shopClick(shopLink(h,'Create 3D model'));await h.settle()
      assert.equal(h.navigations.length,0);assert.equal(JSON.stringify(h.canvas().props.world),before)
      assert.match(h.text(),/Unsaved edits/);assert.ok(h.all().some(n=>n.props.role==='alert'))
      assert.equal(worldWrites(h).length,1,'No automatic retry after an error')
      assert.ok(![...h.timers.values()].some(t=>t.delay===8000),'A failed save does not restart autosave')
      shopClick(shopLink(h,'Create 3D model'));await h.settle()
      assert.equal(worldWrites(h).length,2);assert.equal(h.navigations.length,1)
    }finally{h.close()}
  }
})

test('edits made during a Shop save keep the newer draft in the editor until a fresh departure request',async()=>{
  const pending=deferred(),h=await harness({writeWorld:async(_body,persist)=>{await pending.promise;return persist()}})
  try{
    shopClick(shopLink(h,'Create 3D model'));await h.settle()
    await h.rename('Keep my newer edit')
    pending.resolve();await h.settle()
    assert.equal(h.navigations.length,0);assert.match(h.text(),/Your world changed while saving/)
    assert.equal(h.canvas().props.world.name,'Keep my newer edit');assert.match(h.text(),/Unsaved edits/)
    assert.equal(worldWrites(h).length,1)
    shopClick(shopLink(h,'Create 3D model'));await h.settle()
    assert.equal(h.navigations.length,1);assert.equal(worldWrites(h).length,2)
    assert.equal(h.stores.get(owner).get(`private-world:${h.canvas().props.world.id}`).document.name,'Keep my newer edit')
  }finally{h.close()}
})

test('Shop waits for an existing autosave and only writes again when that save predates the clicked revision',async()=>{
  for(const newerBeforeClick of [false,true]){
    const pending=deferred(),h=await harness({writeWorld:async(_body,persist)=>{await pending.promise;return persist()}})
    try{
      const timer=[...h.timers.values()].find(t=>t.delay===8000);assert.ok(timer);timer.fn();await h.settle()
      if(newerBeforeClick)await h.rename('Edited after autosave began')
      shopClick(shopLink(h,'Create 3D model'));await h.settle()
      assert.equal(worldWrites(h).length,1);assert.equal(h.navigations.length,0)
      pending.resolve();await h.settle()
      assert.equal(h.navigations.length,1);assert.equal(worldWrites(h).length,newerBeforeClick?2:1)
      assert.equal(h.stores.get(owner).get(`private-world:${h.canvas().props.world.id}`).document.name,h.canvas().props.world.name)
    }finally{h.close()}
  }
})

test('same-turn edits are included even when the Shop click uses the previous rendered handler',async()=>{
  const h=await harness()
  try{
    await h.save();const link=shopLink(h,'Create 3D model')
    h.node(n=>n.props['aria-label']==='World name').props.onChange({target:{value:'Immediate latest edit'}})
    shopClick(link);await h.settle()
    assert.equal(h.navigations.length,1);assert.equal(worldWrites(h).length,2)
    assert.equal(worldWrites(h)[1].body.document.name,'Immediate latest edit')
  }finally{h.close()}
})

test('clean saved worlds, untouched onboarding, and signed-out browsing open Shop without a save',async()=>{
  for(const options of [{},{autoCreate:false},{autoCreate:false,initialOwner:null}]){
    const h=await harness(options)
    try{
      if(options.autoCreate!==false)await h.save()
      const before=worldWrites(h).length
      shopClick(shopLink(h,'Create 3D model'));await h.settle()
      assert.equal(h.navigations.length,1);assert.equal(worldWrites(h).length,before)
    }finally{h.close()}
  }
})

test('unfinished New game setup must be completed or closed before Shop navigation',async()=>{
  const h=await harness({autoCreate:false})
  try{
    h.node(n=>n.props.placeholder==='Riverlight — my first game').props.onChange({target:{value:'Do not lose this setup'}});await h.settle()
    shopClick(shopLink(h,'Create 3D model'));await h.settle()
    assert.equal(h.navigations.length,0);assert.equal(worldWrites(h).length,0)
    assert.match(h.text(),/Finish creating your world or close the New game dialog/)
    assert.equal(h.node(n=>n.props.placeholder==='Riverlight — my first game').props.value,'Do not lose this setup')
    h.button('Explore the empty editor').props.onClick();await h.settle()
    shopClick(shopLink(h,'Create 3D model'));await h.settle();assert.equal(h.navigations.length,1)
  }finally{h.close()}
})

test('an account switch invalidates pending Shop departure and old completions cannot unlock a newer save',async()=>{
  const first=deferred(),second=deferred(),pendingWrites=[first.promise,second.promise]
  const h=await harness({writeWorld:async(_body,persist)=>{await pendingWrites.shift();return persist()}})
  try{
    shopClick(shopLink(h,'Create 3D model'));await h.settle()
    await h.setOwner(other);await h.create()
    const currentId=h.canvas().props.world.id
    shopClick(shopLink(h,'Create 3D model'));await h.settle()
    first.resolve();await h.settle()
    assert.equal(h.navigations.length,0);assert.equal(h.canvas().props.world.id,currentId);assert.match(h.text(),/Saving…/)
    shopClick(shopLink(h,'Create 3D model'));await h.settle();assert.equal(worldWrites(h).length,2)
    second.resolve();await h.settle()
    assert.equal(h.navigations.length,1);assert.equal(h.stores.get(other).get(`private-world:${currentId}`).document.id,currentId)
  }finally{h.close()}
})

test('signing out and back in cannot revive an old pending Shop departure',async()=>{
  const pending=deferred(),h=await harness({writeWorld:async(_body,persist)=>{await pending.promise;return persist()}})
  try{
    shopClick(shopLink(h,'Create 3D model'));await h.settle();await h.setOwner(null);await h.setOwner(owner);await h.create()
    const id=h.canvas().props.world.id
    pending.resolve();await h.settle()
    assert.equal(h.navigations.length,0);assert.equal(h.canvas().props.world.id,id);assert.match(h.text(),/Unsaved edits/)
  }finally{h.close()}
})

test('unmounting while the world saves cancels delayed Shop navigation',async()=>{
  const pending=deferred(),h=await harness({writeWorld:async(_body,persist)=>{await pending.promise;return persist()}})
  shopClick(shopLink(h,'Create 3D model'));await h.settle();h.close();pending.resolve()
  for(let i=0;i<8;i++)await nextTick()
  assert.equal(h.navigations.length,0)
})

test('pending GLB placement blocks Shop until the model has reached the world',async()=>{
  const read=deferred(),h=await harness({readModel:()=>read.promise})
  try{
    h.button('Add local GLB to world').props.onClick();await h.settle()
    shopClick(shopLink(h,'Create 3D model'));await h.settle()
    assert.equal(h.navigations.length,0);assert.equal(worldWrites(h).length,0)
    read.resolve(new Blob(['model']));await h.settle()
    shopClick(shopLink(h,'Create 3D model'));await h.settle()
    assert.equal(h.navigations.length,1);assert.equal(worldWrites(h)[0].body.document.entities.length,1)
  }finally{h.close()}
})

test('modified Shop link gestures preserve browser new-tab behavior without forcing this editor to leave',async()=>{
  const h=await harness()
  try{
    for(const overrides of [{ctrlKey:true},{metaKey:true},{shiftKey:true},{altKey:true},{button:1}])assert.equal(shopClick(shopLink(h,'Create 3D model'),overrides).defaultPrevented,false)
    await h.settle();assert.equal(h.navigations.length,0);assert.equal(worldWrites(h).length,0)
  }finally{h.close()}
})

test('procedural archive entries stay local-only and never enter the detailed-job account verification request',async()=>{
  const procedural={id:'blueprint:'+'a'.repeat(64),source:'blueprint',prompt:'Procedural solar roof',savedAt:'2026-10-02T06:00:00Z',byteLength:500,sha256:'a'.repeat(64),review:'UNREVIEWED',generation:{model:'gpt-6-sol'}}
  const detailed={...procedural,id:modelId,source:'studio',prompt:'Detailed rover'}
  const spoofed={...procedural,id:replacementId,prompt:'Procedural with a detailed-shaped ID'}
  const h=await harness({archiveEntries:[procedural,detailed,spoofed],verifyLibrary:async()=>Response.json({ids:[procedural.id,detailed.id,spoofed.id]})})
  try{
    assert.equal(h.calls.filter(c=>c.path==='/api/worlds/library').length,1)
    assert.deepEqual(h.calls.find(c=>c.path==='/api/worlds/library').body.ids,[modelId])
    assert.match(h.text(),/PROCEDURAL · gpt-6-sol/)
    const localButtons=h.all().filter(n=>n.type==='button'&&text(n)==='Add local GLB to world')
    assert.equal(localButtons.length,2);assert.ok(h.button('Add saved model to world'))
    localButtons[0].props.onClick();await h.settle()
    assert.equal(h.assetWrites.length,1);assert.equal(h.canvas().props.world.entities.length,1)
    assert.equal(h.calls.filter(c=>c.path==='/api/worlds/library').length,1,'Procedural import only reads local GLB bytes')
  }finally{h.close()}
})

test('Shop departure invalidates an older open-world request before it can replace the saved draft',async()=>{
  const load=deferred(),save=deferred(),h=await harness({readWorld:()=>load.promise,writeWorld:async(_body,persist)=>{await save.promise;return persist()}})
  try{
    const id=h.canvas().props.world.id,otherWorld=world.blankWorld('Another saved world')
    await h.open(otherWorld.id)
    shopClick(shopLink(h,'Create 3D model'));await h.settle()
    load.resolve(Response.json({document:otherWorld,revision:1,updatedAt:'2026-10-02T06:00:00Z'}));await h.settle()
    assert.equal(h.canvas().props.world.id,id);assert.equal(h.navigations.length,0)
    save.resolve();await h.settle()
    assert.equal(h.navigations.length,1);assert.equal(worldWrites(h)[0].body.document.id,id)
  }finally{h.close()}
})
