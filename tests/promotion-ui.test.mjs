import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
const url=new URL('../src/components/PromotionRedemption.tsx',import.meta.url),require=createRequire(url)
const code=ts.transpileModule(readFileSync(url,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText
const tick=()=>new Promise(resolve=>setImmediate(resolve))
function nodes(n){if(!n||typeof n!=='object')return[];return[n,...[n.props?.children].flat(Infinity).flatMap(nodes)]}
function harness(request){
 let cursor=0,dirty=true,tree,refreshes=0;const slots=[],effects=[],calls=[]
 const react={useState(v){const i=cursor++;if(!slots[i])slots[i]={value:v};return[slots[i].value,v=>{slots[i].value=typeof v==='function'?v(slots[i].value):v;dirty=true}]},useRef(v){const i=cursor++;return(slots[i]??={ref:{current:v}}).ref},useEffect(fn,deps){const i=cursor++;if(!slots[i]){slots[i]={deps};effects.push(()=>{slots[i].cleanup=fn()})}}}
 const module={exports:{}};runInNewContext(code,{module,exports:module.exports,Number,Error,require(id){if(id==='react')return react;if(id==='react/jsx-runtime')return require(id);if(id==='../lib/account')return{accountRequest:async(path,body)=>{calls.push({path,body});return request(path,body)}};throw Error(id)}},{filename:url.pathname})
 const settle=async()=>{for(let i=0;i<6;i++){if(dirty){cursor=0;dirty=false;tree=module.exports.default({accountId:'fixture-account',onRedeemed:async()=>{refreshes++}})}while(effects.length)effects.shift()();await tick()}}
 return{settle,calls,get nodes(){return nodes(tree)},get refreshes(){return refreshes},enter(value){nodes(tree).find(n=>n.type==='input').props.onChange({target:{value}})},click(){return nodes(tree).find(n=>n.type==='button').props.onClick()},close(){slots.forEach(s=>s?.cleanup?.())}}
}
test('inactive or malformed availability keeps redemption disabled without posting the code',async()=>{
 for(const response of [{active:false},{active:true},{active:true,kind:'stripe',providerFunding:true}]){
 const h=harness(async()=>response);await h.settle();assert.equal(h.nodes.find(n=>n.type==='fieldset').props.disabled,true);assert.equal(h.calls.length,1);h.close()
 }
})
test('duplicate clicks submit once and a verified success clears the private code and refreshes balance',async()=>{
 let resolve;const pending=new Promise(r=>{resolve=r})
 const h=harness(async(_p,body)=>body?pending:{active:true,kind:'internal-points',providerFunding:false})
 await h.settle();h.enter('TEST_ONLY_NOT_A_REAL_CODE');await h.settle();h.click();h.click();await h.settle()
 assert.equal(h.calls.filter(c=>c.body).length,1)
 resolve({redeemed:true,repeated:false,points:1000});await h.settle()
 assert.equal(h.nodes.find(n=>n.type==='input').props.value,'');assert.equal(h.refreshes,1);h.close()
})
test('late response after account unmount cannot refresh another account or publish a success',async()=>{
 let resolve;const pending=new Promise(r=>{resolve=r})
 const h=harness(async(_p,body)=>body?pending:{active:true,kind:'internal-points',providerFunding:false});await h.settle()
 h.enter('TEST_ONLY_NOT_A_REAL_CODE');await h.settle();h.click();h.close();resolve({redeemed:true,repeated:false,points:1000});await h.settle();assert.equal(h.refreshes,0)
})

test('celebration requires a new confirmed grant; repeats and failures never celebrate',async()=>{
 for(const response of [{redeemed:true,repeated:false,points:1000},{redeemed:true,repeated:true,points:1000},{redeemed:false,points:1000}]){
  const h=harness(async(_p,body)=>body?response:{active:true,kind:'internal-points',providerFunding:false})
  await h.settle();h.enter('TEST_ONLY_NOT_A_REAL_CODE');await h.settle();h.click();await h.settle()
  assert.equal(h.nodes.some(n=>n.props?.className==='promo-burst'),response.redeemed===true&&response.repeated===false)
  h.close()
 }
})
