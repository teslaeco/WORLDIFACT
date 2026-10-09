import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { setImmediate as tick } from 'node:timers/promises'
import React from 'react'
import ts from 'typescript'
import { requestFailedHoldWaiver } from '../src/lib/failedHoldWaiver.ts'
import { FAILED_HOLD_WAIVER_APPROVAL } from '../src/lib/failedHoldWaiver.ts'

const pageUrl = new URL('../src/pages/FailedHoldWaiverPage.tsx', import.meta.url), localRequire = createRequire(pageUrl)
const code = ts.transpileModule(await readFile(pageUrl, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText
const fixture = (status = 'preview') => ({ revision: 'failed-hold-waiver-20261009-v1', status, approvalId: FAILED_HOLD_WAIVER_APPROVAL, releasedPoints: 1000,
  before: { balance: 1190, held: 1000, available: 190 }, after: { balance: 1190, held: 0, available: 1190 }, providerLiabilityCents: 324,
  preservesProviderLiability: true, generationStarted: false, appliedAt: status === 'preview' ? null : Date.parse('2026-10-09T03:40:00Z') })
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
  const module={exports:{}}
  runInNewContext(code,{module,exports:module.exports,window,document,AbortController,console,Date,Error,require(id) {
    if(id==='react')return react;if(id==='react/jsx-runtime')return localRequire(id)
    if(id==='../lib/failedHoldWaiver')return {requestFailedHoldWaiver:(apply,signal)=>requestFailedHoldWaiver(apply,signal,fetcher)}
    if(id.endsWith('.css'))return {};throw Error('Unexpected dependency '+id)
  }},{filename:pageUrl.pathname,timeout:1000})
  const settle=async()=>{for(let i=0;i<10;i++){if(dirty){dirty=false;cursor=0;tree=module.exports.default()}while(effects.length)effects.shift()();await tick()}}
  const button = label => elements(tree).find(node=>node.type==='button'&&text(node).includes(label))
  await settle()
  return {calls,settle,text:()=>text(tree),button,
    async click(label,double=false){const selected=button(label);assert.ok(selected);assert.equal(selected.props.disabled,false);selected.props.onClick();if(double)selected.props.onClick();await settle()},
    async focus(){window.dispatchEvent(new Event('focus'));await settle()},
    async timeout(){for(const callback of [...timers.values()])callback();await settle()},
    close(){for(const slot of slots)slot?.cleanup?.()},
  }
}

test('page entry reads once; only explicit apply performs one fixed POST even on double click',async()=>{
 const pending=deferred(), h=await harness((_,init)=>init.method==='POST'?pending.promise:Response.json(fixture()))
 try {
  assert.equal(h.calls.length,1);assert.equal(h.calls[0].init.method,'GET');assert.equal(h.calls[0].init.body,undefined)
  assert.match(h.text(),/1,190 total points, 1,000 held and 190 available/);assert.match(h.text(),/does not generate a model/)
  await h.click('Release the approved',true);assert.equal(h.calls.length,2);assert.equal(h.calls[1].path,'/api/account/failed-hold-waiver')
  assert.equal(h.calls[1].init.method,'POST');assert.deepEqual(JSON.parse(h.calls[1].init.body),{approvalId:FAILED_HOLD_WAIVER_APPROVAL})
  pending.resolve(Response.json(fixture('applied')));await h.settle();assert.match(h.text(),/Waiver recorded/);assert.equal(h.button('Release the approved'),undefined)
  assert.match(h.text(),/original audit values; later spending/);assert.equal(h.calls.length,2)
 }finally{h.close()}
})

test('lost POST response is not retried; a manual GET finds the original immutable application',async()=>{
 const h=await harness((count,init)=>init.method==='POST'?Promise.reject(new Error('lost response')):Response.json(fixture(count>2?'already-applied':'preview')))
 try{await h.click('Release the approved');assert.match(h.text(),/result is unconfirmed/);assert.equal(h.calls.length,2);assert.equal(h.button('Release the approved'),undefined)
 await h.click('Read waiver');assert.equal(h.calls.length,3);assert.equal(h.calls[2].init.method,'GET');assert.match(h.text(),/Waiver already recorded/);assert.equal(h.button('Release the approved'),undefined)
 }finally{h.close()}
})

test('timeout and focus discard late results without retry or generation',async()=>{
 const pending=deferred(),h=await harness((_,init)=>init.method==='POST'?pending.promise:Response.json(fixture()))
 try{await h.click('Release the approved');await h.timeout();assert.match(h.text(),/may have completed/);assert.equal(h.calls.length,2)
 pending.resolve(Response.json(fixture('applied')));await h.settle();assert.doesNotMatch(h.text(),/Waiver recorded/)
 await h.focus();assert.match(h.text(),/session may have changed/);assert.equal(h.calls.length,2);assert.equal(h.button('Release the approved'),undefined)
 }finally{h.close()}
})

test('client rejects unsafe responses, errors and expanded private payloads without retry',async()=>{
 for(const response of [Response.json({error:'PRIVATE'},{status:401}),Response.json({error:'PRIVATE'},{status:403}),Response.json({code:'BASELINE_CHANGED'},{status:409}),Response.json({...fixture(),customer:'PRIVATE'}),new Response('x'.repeat(4097),{headers:{'content-type':'application/json'}}),new Response('<html>PRIVATE</html>',{headers:{'content-type':'text/html'}})]){
  let calls=0;await assert.rejects(requestFailedHoldWaiver(false,new AbortController().signal,async(_path,init)=>{calls++;assert.equal(init.redirect,'error');assert.equal(init.credentials,'same-origin');return response}),error=>!error.message.includes('PRIVATE'));assert.equal(calls,1)
 }
 let calls=0;await assert.rejects(requestFailedHoldWaiver(true,new AbortController().signal,async()=>{calls++;return Response.json(fixture())}),/could not be verified/);assert.equal(calls,1)
})

test('waiver route mounts outside account and billing effects and exposes no generation call',async()=>{
 const main=await readFile(new URL('../src/main.tsx',import.meta.url),'utf8')
 assert.match(main,/const failedHoldWaiver = window\.location\.pathname === '\/account\/failed-hold-waiver'/)
 assert.match(main,/failedHoldWaiver \? <FailedHoldWaiverPage \/> : <AccountProvider>/)
 const page=await readFile(pageUrl,'utf8')
 assert.doesNotMatch(page,/billing\/checkout|billing\/recover|studio\/jobs|recoverHeldPoints|window\.location\s*=|useAccount/)
})
