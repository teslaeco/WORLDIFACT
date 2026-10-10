import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { setImmediate as tick } from 'node:timers/promises'
import React from 'react'
import ts from 'typescript'
import * as planPayment from '../src/lib/planPayment.ts'
import { CreditToolsPanel } from './credit-tools-helper.mjs'

const url = new URL('../src/pages/CreditsPage.tsx', import.meta.url), localRequire = createRequire(url)
const compiled = ts.transpileModule(await readFile(url, 'utf8'), { fileName: url.pathname,
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText
const text = node => node == null || typeof node === 'boolean' ? '' : Array.isArray(node) ? node.map(text).join('') : React.isValidElement(node) ? text(node.props.children) : String(node)
const elements = tree => { const result=[]; const walk=node=>{if(Array.isArray(node))node.forEach(walk);else if(React.isValidElement(node)){result.push(node);walk(node.props.children)}};walk(tree);return result }

// Executes the actual account-keyed page and its effects with inert payment APIs.
async function harness() {
  let owner='owner-a', plan='pro', cursor=0, dirty=true, tree, key
  const slots=[], effects=[], calls=[], events=new EventTarget()
  const react={...React,
    useState(initial){const i=cursor++;if(!slots[i])slots[i]={value:typeof initial==='function'?initial():initial};return[slots[i].value,update=>{const next=typeof update==='function'?update(slots[i].value):update;if(!Object.is(next,slots[i].value)){slots[i].value=next;dirty=true}}]},
    useRef(initial){const i=cursor++;if(!slots[i])slots[i]={ref:{current:initial}};return slots[i].ref},
    useCallback(callback,deps){const i=cursor++,old=slots[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps?.[j])))slots[i]={value:callback,deps};return slots[i].value},
    useEffect(callback,deps){const i=cursor++,old=slots[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps?.[j]))){const next={deps,cleanup:old?.cleanup};slots[i]=next;effects.push(()=>{next.cleanup?.();next.cleanup=callback()})}},
  }
  const accountRequest=async(path,body)=>{
    calls.push({path,body:body===undefined?undefined:JSON.parse(JSON.stringify(body))})
    if(path==='/api/account/entitlements')return{credits:4500,subscription:{active:true,plan,expiresAt:null},free:{fastRemaining:2},billingReview:false}
    if(path==='/api/billing/status')return{portalReady:true,checkoutReady:true,topupReady:true,subscriptionInterval:'month',plans:Object.fromEntries(['creator','pro','studio'].map(id=>[id,{checkoutReady:true}]))}
    if(path==='/api/billing/paypal/status')return{ready:false}
    if(path==='/api/billing/plan-payment')return{state:'review'}
    throw new Error('Unexpected API '+path)
  }
  const module={exports:{}}
  runInNewContext(compiled,{module,exports:module.exports,window:events,URL,console,require(id){
    if(id==='react')return react
    if(id==='react/jsx-runtime')return localRequire(id)
    if(id==='react-router-dom')return{Link:'a',useSearchParams:()=>[new URLSearchParams(),()=>{}]}
    if(id==='../lib/account')return{useAccount:()=>({user:{id:owner,displayName:owner},loading:false}),accountRequest}
    if(id==='../lib/paymentError')return{paymentErrorMessage:()=> 'Fixture error'}
    if(id==='../lib/planPayment')return planPayment
    if(id==='../components/BillingRecovery')return{__esModule:true,default:()=>null}
    // Redemption has its own lifecycle suite; this harness covers membership selection.
    if(id==='../components/PromotionRedemption')return{__esModule:true,default:()=>null}
    if(id==='../components/CreditToolsPanel')return{__esModule:true,default:CreditToolsPanel}
    if(id.endsWith('.css'))return{}
    throw new Error('Unexpected dependency '+id)
  }},{filename:url.pathname,timeout:1000})
  const settle=async()=>{for(let i=0;i<12;i++){if(dirty){dirty=false;const content=module.exports.default();if(key!==content.key){for(const slot of slots)slot?.cleanup?.();slots.length=0;key=content.key}cursor=0;tree=content.type(content.props)}while(effects.length)effects.shift()();await tick()}}
  const featured=()=>elements(tree).filter(n=>n.type==='article'&&n.props.className?.includes('credits-featured')).map(n=>text(elements(n).find(c=>c.type==='h2')))
  const refresh=async()=>{const button=elements(tree).find(n=>n.type==='button'&&text(n)==='Refresh balance');assert.ok(button);button.props.onClick();await settle()}
  await settle()
  return{calls,featured,refresh,text:()=>text(tree),async upgrade(value){plan=value;await refresh()},async choose(value){const article=elements(tree).find(n=>n.type==='article'&&n.props['aria-label']===`Open secure billing for ${value}`);assert.ok(article);const button=elements(article).find(n=>n.type==='button');button.props.onClick();await settle()},async account(id,value){owner=id;plan=value;dirty=true;await settle()},close(){for(const slot of slots)slot?.cleanup?.()}}
}

test('confirmed Pro membership is selected and named, and follows a later verified upgrade',async()=>{
  const h=await harness();try{
    assert.deepEqual(h.featured(),['Pro ASTRA']);assert.match(h.text(),/MEMBERSHIPPro ASTRA/)
    assert.match(h.text(),/PRO · YOUR ACTIVE PLAN/)
    await h.upgrade('studio');assert.deepEqual(h.featured(),['Studio ASTRA']);assert.match(h.text(),/MEMBERSHIPStudio ASTRA/)
    assert.equal(h.calls.filter(c=>c.body!==undefined).length,0,'Balance refresh cannot open or change a subscription')
  }finally{h.close()}
})
test('explicit offer choice survives refresh, while another account gets its own confirmed active plan',async()=>{
  const h=await harness();try{
    await h.choose('Creator SOL');assert.deepEqual(h.featured(),['Creator SOL'])
    assert.deepEqual(h.calls.filter(c=>c.body!==undefined),[{path:'/api/billing/plan-payment',body:{plan:'creator'}}])
    await h.upgrade('studio');assert.deepEqual(h.featured(),['Creator SOL']);assert.match(h.text(),/MEMBERSHIPStudio ASTRA/)
    await h.account('owner-b','pro');assert.deepEqual(h.featured(),['Pro ASTRA']);assert.match(h.text(),/MEMBERSHIPPro ASTRA/)
    assert.equal(h.calls.filter(c=>c.body!==undefined).length,1)
  }finally{h.close()}
})
