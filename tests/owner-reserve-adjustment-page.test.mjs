import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { setImmediate as tick } from 'node:timers/promises'
import React from 'react'
import ts from 'typescript'
import { requestOwnerReserveAdjustment } from '../src/lib/ownerReserveAdjustmentClient.ts'
import { OWNER_RESERVE_ADJUSTMENT_APPROVAL } from '../src/lib/ownerReserveAdjustment.ts'

const pageUrl = new URL('../src/pages/OwnerReserveAdjustmentPage.tsx', import.meta.url), localRequire = createRequire(pageUrl)
const code = ts.transpileModule(await readFile(pageUrl, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText
const fixture = (status = 'preview') => ({ revision: 'owner-reserve-adjustment-v1', status, approvalId: OWNER_RESERVE_ADJUSTMENT_APPROVAL, amountCents: 112,
  before: { reserveCents: 63, points: 1440, heldPoints: 0 }, after: { reserveCents: 175, points: 1440, heldPoints: 0 }, generationStarted: false,
  appliedAt: status === 'preview' ? null : Date.parse('2026-10-07T06:40:00Z') })
const text = node => node == null || typeof node === 'boolean' ? '' : Array.isArray(node) ? node.map(text).join('') : React.isValidElement(node) ? text(node.props.children) : String(node)
const elements = tree => { const result = []; const walk = node => { if (Array.isArray(node)) node.forEach(walk); else if (React.isValidElement(node)) { result.push(node); walk(node.props.children) } }; walk(tree); return result }
const deferred = () => { let resolve, reject; const promise = new Promise((yes,no) => { resolve=yes; reject=no }); return { promise, resolve, reject } }

async function harness(answer = (_count, init) => Response.json(fixture(init.method === 'POST' ? 'applied' : 'preview'))) {
  let cursor = 0, dirty = true, tree, nextTimer = 0
  const slots = [], effects = [], calls = [], timers = new Map()
  const window = new EventTarget(), document = new EventTarget(); document.visibilityState = 'visible'
  window.setTimeout = callback => { timers.set(++nextTimer, callback); return nextTimer }; window.clearTimeout = id => timers.delete(id)
  const react = { ...React,
    useRef(initial) { const i=cursor++; if (!slots[i]) slots[i]={current:initial}; return slots[i] },
    useState(initial) { const i=cursor++; if (!slots[i]) slots[i]={value:initial}; return [slots[i].value, update => { const next=typeof update==='function'?update(slots[i].value):update; if (!Object.is(next,slots[i].value)) { slots[i].value=next;dirty=true } }] },
    useEffect(callback,deps) { const i=cursor++, prior=slots[i]; if (!prior || deps.some((v,j)=>!Object.is(v,prior.deps[j]))) { const slot={deps,cleanup:prior?.cleanup};slots[i]=slot;effects.push(()=>{slot.cleanup?.();slot.cleanup=callback()}) } },
  }
  const fetcher = async (path,init) => { calls.push({path,init}); return answer(calls.length,init,path) }
  const module={exports:{}}; let account={user:{id:'fixture-owner'},loading:false}
  runInNewContext(code,{module,exports:module.exports,window,document,AbortController,console,Date,Error,require(id) {
    if(id==='react')return react;if(id==='react/jsx-runtime')return localRequire(id)
    if(id==='../lib/account')return {useAccount:()=>account}
    if(id==='../lib/ownerReserveAdjustmentClient')return {requestOwnerReserveAdjustment:(apply,signal)=>requestOwnerReserveAdjustment(apply,signal,fetcher)}
    if(id.endsWith('.css'))return {};throw Error('Unexpected dependency '+id)
  }},{filename:pageUrl.pathname,timeout:1000})
  const settle=async()=>{for(let i=0;i<10;i++){if(dirty){dirty=false;cursor=0;tree=module.exports.OwnerReserveAdjustmentContent()}while(effects.length)effects.shift()();await tick()}}
  const button = label => elements(tree).find(node=>node.type==='button'&&text(node).includes(label))
  await settle()
  return {calls,settle,text:()=>text(tree),button,
    async click(label,double=false){const selected=button(label);assert.ok(selected);assert.equal(selected.props.disabled,false);selected.props.onClick();if(double)selected.props.onClick();await settle()},
    async focus(){window.dispatchEvent(new Event('focus'));await settle()},
    async timeout(){for(const callback of [...timers.values()])callback();await settle()},
    wrapper(next){account=next;return module.exports.default()},
    close(){for(const slot of slots)slot?.cleanup?.()},
  }
}

test('page entry reads once; only explicit apply performs one fixed POST even on double click',async()=>{
 const pending=deferred(), h=await harness((_,init)=>init.method==='POST'?pending.promise:Response.json(fixture()))
 try {
  assert.equal(h.calls.length,1);assert.equal(h.calls[0].init.method,'GET');assert.equal(h.calls[0].init.body,undefined)
  assert.match(h.text(),/1,440 points, 0 held points and \$0.63/);assert.match(h.text(),/does not start a model/)
  await h.click('Apply approved',true);assert.equal(h.calls.length,2);assert.equal(h.calls[1].path,'/api/account/owner-reserve-adjustment')
  assert.equal(h.calls[1].init.method,'POST');assert.deepEqual(JSON.parse(h.calls[1].init.body),{approvalId:OWNER_RESERVE_ADJUSTMENT_APPROVAL})
  pending.resolve(Response.json(fixture('applied')));await h.settle();assert.match(h.text(),/Adjustment recorded/);assert.equal(h.button('Apply approved'),undefined)
  assert.match(h.text(),/audit values, not a fresh balance/);assert.equal(h.calls.length,2)
 }finally{h.close()}
})

test('lost POST response is not retried; a manual GET finds the original immutable application',async()=>{
 const h=await harness((count,init)=>init.method==='POST'?Promise.reject(new Error('lost response')):Response.json(fixture(count>2?'already-applied':'preview')))
 try{await h.click('Apply approved');assert.match(h.text(),/result is unconfirmed/);assert.equal(h.calls.length,2);assert.equal(h.button('Apply approved'),undefined)
 await h.click('Read adjustment');assert.equal(h.calls.length,3);assert.equal(h.calls[2].init.method,'GET');assert.match(h.text(),/Adjustment already recorded/);assert.equal(h.button('Apply approved'),undefined)
 }finally{h.close()}
})

test('timeout and focus discard late results without retry or generation',async()=>{
 const pending=deferred(),h=await harness((_,init)=>init.method==='POST'?pending.promise:Response.json(fixture()))
 try{await h.click('Apply approved');await h.timeout();assert.match(h.text(),/may have completed/);assert.equal(h.calls.length,2)
 pending.resolve(Response.json(fixture('applied')));await h.settle();assert.doesNotMatch(h.text(),/Adjustment recorded/)
 await h.focus();assert.match(h.text(),/session may have changed/);assert.equal(h.calls.length,2);assert.equal(h.button('Apply approved'),undefined)
 }finally{h.close()}
})

test('account wrapper hides previous evidence during session lookup or logout and keys content to identity',async()=>{
 const h=await harness();try{
 const signed=h.wrapper({user:{id:'owner-one'},loading:false});assert.equal(signed.key,'owner-one')
 const other=h.wrapper({user:{id:'owner-two'},loading:false});assert.equal(other.key,'owner-two')
 assert.match(text(h.wrapper({user:{id:'owner-one'},loading:true})),/Checking the current account/)
 assert.match(text(h.wrapper({user:null,loading:false})),/Sign in/)
 }finally{h.close()}
})

test('client rejects unsafe responses, errors and expanded private payloads without retry',async()=>{
 for(const response of [Response.json({error:'PRIVATE'},{status:401}),Response.json({error:'PRIVATE'},{status:403}),Response.json({code:'BASELINE_CHANGED'},{status:409}),Response.json({...fixture(),customer:'PRIVATE'}),new Response('x'.repeat(4097),{headers:{'content-type':'application/json'}}),new Response('<html>PRIVATE</html>',{headers:{'content-type':'text/html'}})]){
  let calls=0;await assert.rejects(requestOwnerReserveAdjustment(false,new AbortController().signal,async(_path,init)=>{calls++;assert.equal(init.redirect,'error');assert.equal(init.credentials,'same-origin');return response}),error=>!error.message.includes('PRIVATE'));assert.equal(calls,1)
 }
 let calls=0;await assert.rejects(requestOwnerReserveAdjustment(true,new AbortController().signal,async()=>{calls++;return Response.json(fixture())}),/not confirmed/);assert.equal(calls,1)
})

test('direct account route mounts the manual page without a billing return query',async()=>{
 const app=await readFile(new URL('../src/App.tsx',import.meta.url),'utf8')
 assert.match(app,/<Route path="\/account\/owner-reserve-adjustment" element=\{<OwnerReserveAdjustmentPage \/>\} \/>/)
 const page=await readFile(pageUrl,'utf8')
 assert.doesNotMatch(page,/billing\/checkout|billing\/recover|studio\/jobs|reconcile|window\.location\s*=/)
})
