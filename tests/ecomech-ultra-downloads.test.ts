import { test } from 'node:test'
import assert from 'node:assert/strict'
import ultra from '../server/ecomechUltraDownloads.ts'

const bytes=new Uint8Array(90).map((_,i)=>i%251)
bytes.set([103,108,84,70],0)
const account='6fa9be43-f371-4bcd-8fe7-7a3ea9967855'
const parts=[bytes.slice(0,40),bytes.slice(40,70),bytes.slice(70)]
const pathNames=parts.map((_,i)=>'/chunks/glb-'+String(i).padStart(3,'0')+'.part')
const manifest={
 revision:'worldifact-ecomech-ultra-chunked-v1',sourceJobId:account,
 downloads:{glb:{name:'ECOMECH_ASTRA_BLENDER_ULTRA_GAME.glb',bytes:bytes.length,
  sha256:'a'.repeat(64),mime:'model/gltf-binary',
  parts:parts.map((p,i)=>({path:pathNames[i],bytes:p.length,sha256:'b'.repeat(64)}))}}
}
function environment({change}: {change?: (value: typeof manifest)=>unknown}={}){
 const calls: string[]=[]
 const parsed=change?change(structuredClone(manifest)):manifest
 const ASSETS={
  async fetch(req:Request){
   const path=new URL(req.url).pathname
   calls.push(path)
   if(path==='/downloads.json')return Response.json(parsed)
   const index=pathNames.indexOf(path)
   if(index>=0)return new Response(parts[index],{headers:{'Content-Type':'application/octet-stream'}})
   return new Response('Not found',{status:404})
  }
 }
 return {env:{ASSETS},calls}
}
const link='https://worldifact-ecomech-ultra-staging-20261014.xodobrox.workers.dev/downloads/glb'
test('large public GET streams original chunk bytes in order without a synthetic model',async()=>{
 const e=environment()
 const resp=await ultra.fetch(new Request(link),e.env)
 assert.equal(resp.status,200)
 assert.equal(resp.headers.get('Content-Length'),'90')
 assert.equal(resp.headers.get('Accept-Ranges'),'bytes')
 assert.equal(resp.headers.get('X-WORLDIFACT-Sha256'),'a'.repeat(64))
 assert.equal(resp.headers.get('X-WORLDIFACT-Provenance'),'ASTRA-ORIGINAL-PLUS-BLENDER-DETAIL')
 assert.deepEqual(new Uint8Array(await resp.arrayBuffer()),bytes)
 assert.deepEqual(e.calls,['/downloads.json',...pathNames])
})
test('byte ranges work across multiple physical static chunks and HEAD stays byte-free',async()=>{
 const e=environment()
 const mid=await ultra.fetch(new Request(link,{headers:{Range:'bytes=29-80'}}),e.env)
 assert.equal(mid.status,206)
 assert.equal(mid.headers.get('Content-Range'),'bytes 29-80/90')
 assert.deepEqual(new Uint8Array(await mid.arrayBuffer()),bytes.slice(29,81))
 const head=await ultra.fetch(new Request(link,{method:'HEAD'}),e.env)
 assert.equal(head.status,200)
 assert.equal(head.headers.get('Content-Length'),'90')
 assert.deepEqual(e.calls,['/downloads.json',...pathNames,'/downloads.json'])
 const bad=await ultra.fetch(new Request(link,{headers:{Range:'bytes=9000-'}}),e.env)
 assert.equal(bad.status,416)
 assert.equal(bad.headers.get('Content-Range'),'bytes */90')
})
test('unknown files, malformed paths, fake manifest ownership and mutation are never downloadable',async()=>{
 const e=environment()
 assert.equal((await ultra.fetch(new Request(link.replace('/glb','/private-backups')),e.env)).status,404)
 assert.equal((await ultra.fetch(new Request(link,{method:'POST'}),e.env)).status,405)
 for(const change of [
  (v: typeof manifest)=>({...v,sourceJobId:'different-user'}),
  (v: typeof manifest)=>({...v,downloads:{glb:{...v.downloads.glb,bytes:99}}}),
  (v: typeof manifest)=>({...v,downloads:{glb:{...v.downloads.glb,parts:[]}}}),
  (v: typeof manifest)=>({...v,downloads:{glb:{...v.downloads.glb,parts:[
   {...v.downloads.glb.parts[0],path:'/../other.bin'},...v.downloads.glb.parts.slice(1)]}}}),
 ]){
  const x=environment({change})
  const result=await ultra.fetch(new Request(link),x.env)
  assert.ok(result.status>=400)
 }
})
