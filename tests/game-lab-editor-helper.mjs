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
import * as scopedBlueprint from '../src/lib/scopedBlueprintClient.ts'
import * as blueprintRequest from '../src/lib/blueprintRequest.ts'
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
async function harness({ blueprintTransport,recoveryStore=new Map(),confirm=()=>true,autoCreate=true,initialOwner=owner,durableStores=new Map(),writeWorld,archiveEntries,verified=false, readModel, readWorld, verifyLibrary, archivePrompt=prompt, assetName=prompt }={}) {
  const slots=[],effects=[],timers=new Map(),calls=[],stores=durableStores,assetWrites=[],navigations=[]
  let cursor=0,dirty=true,tree,serial=0,account=initialOwner,assets=[]
  const react={...React,lazy:()=>function CanvasStub(){return null},
    useState(initial){const i=cursor++;if(!slots[i])slots[i]={value:typeof initial==='function'?initial():initial};return[slots[i].value,action=>{const next=typeof action==='function'?action(slots[i].value):action;if(!Object.is(next,slots[i].value)){slots[i].value=next;dirty=true}}]},
    useRef(initial){const i=cursor++;if(!slots[i])slots[i]={ref:{current:initial}};return slots[i].ref},
    useEffect(fn,deps){const i=cursor++,prior=slots[i];if(!prior||!deps||deps.some((v,j)=>!Object.is(v,prior.deps?.[j]))){const next={deps,cleanup:prior?.cleanup};slots[i]=next;effects.push(()=>{next.cleanup?.();next.cleanup=fn()})}},
  }
  const fetcher=async(path,init={})=>{
    const method=init.method||'GET',body=init.body?JSON.parse(init.body):undefined;calls.push({path,method,body,owner:account,headers:new Headers(init.headers)})
    if(path.startsWith('/api/blueprint')&&blueprintTransport)return blueprintTransport(path,init,account)
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
    window:Object.assign(events,{confirm,localStorage:{getItem:key=>recoveryStore.get(key)??null,setItem:(key,value)=>recoveryStore.set(key,value),removeItem:key=>recoveryStore.delete(key)}}),document:Object.assign(documentEvents,{visibilityState:'visible'}),setTimeout:timeout,clearTimeout:id=>timers.delete(id),
    require(id){
      if(id==='react')return react
      if(id==='react/jsx-runtime')return localRequire(id)
      if(id==='react-router-dom')return {Link:()=>null,useNavigate:()=>((...args)=>navigations.push(args))}
      if(id==='../lib/account')return {useAccount:()=>({user:account?{id:account}:null,loading:false})}
      if(id==='../lib/privateWorld')return world
      if(id==='../lib/gameLabLibrary')return library
      if(id==='../lib/modelCatalog')return models
      if(id==='../lib/scopedBlueprintClient')return scopedBlueprint
      if(id==='../lib/blueprintRequest')return blueprintRequest
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
  return {calls,assetWrites,archive,recoveryStore,settle,button,canvas,events,timers,stores,navigations,node,
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

export { harness, owner, other, modelId, assetId, replacementId, prompt, deferred, nodes, text }
