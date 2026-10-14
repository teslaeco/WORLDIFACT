/**
 * Read-only public staging acceptance. No Oracle/OpenAI, no accounts, no
 * deployments or billing. One bounded full GET verifies 265MB ULTRA GLB.
 */
import { createHash } from 'node:crypto'
import { setTimeout as pause } from 'node:timers/promises'

const base='https://worldifact-ecomech-ultra-staging-20261014.xodobrox.workers.dev'
const fail=(message)=>{throw new Error('ECOMECH_PUBLIC_QA: '+message)}
const readyPaths=['/','/viewer.js','/report.json','/robot.glb','/downloads.json']
const checks=[]
async function limitedGet(path, init={}, max=300*1024*1024, timeout=240_000) {
 const result=await fetch(base+path,{redirect:'error',signal:AbortSignal.timeout(timeout),...init})
 const length=Number(result.headers.get('Content-Length')||0)
 if(length>max)fail('oversized source: '+path)
 return {result,length}
}
async function bytesOf(response,max){
 let size=0
 const sum=createHash('sha256')
 const prefix=[]
 const reader=response.body?.getReader()
 if(!reader)fail('no response stream')
 try{
  while(true){
   const next=await reader.read()
   if(next.done)break
   size+=next.value.length
   if(size>max)fail('download exceeded byte ceiling')
   sum.update(next.value)
   if(prefix.length<48)prefix.push(...next.value.subarray(0,48-prefix.length))
  }
 }finally{await reader.cancel().catch(()=>{})}
 return {size,sha256:sum.digest('hex'),prefix:Buffer.from(prefix)}
}
let ready=false
for(let attempt=1;attempt<=12;attempt++){
 try{
  const r=await limitedGet('/report.json',{},16_384,15_000)
  if(r.result.ok){
   const j=await r.result.json()
   if(j.revision==='ecomech-ultra-real-binary-staging-v1' &&
       j.model==='gpt-6-astra' && j.versions?.blenderDetailedTriangles===2737004 &&
       j.sourceSha256==='7e7f3aea755dfdd0ad957124d7e1dc33004905e0052fdab3d60b587f34cdc7b4')
     ready=true
  }
 }catch{}
 if(ready)break
 await pause(5_000)
}
if(!ready)fail('staging content not ready after bounded propagation retries')
for(const path of readyPaths){
 const {result}=await limitedGet(path,{method:'HEAD'},16_500_000,20_000)
 if(!result.ok)fail('HEAD '+path+' HTTP '+result.status)
 checks.push({path,head:result.status})
}
const downloads=await limitedGet('/downloads.json',{},90_000,20_000)
if(!downloads.result.ok)fail('no immutable downloads manifest')
const manifest=await downloads.result.json()
if(manifest.revision!=='worldifact-ecomech-ultra-chunked-v1' ||
   manifest.sourceJobId!=='6fa9be43-f371-4bcd-8fe7-7a3ea9967855')
 fail('manifest provenance mismatch')
const expectedLengths={
 glb:265629720, fbx:76315420, obj:258040895, blend:206443188
}
const magic={
 glb:b=>b.toString('ascii',0,4)==='glTF',
 fbx:b=>b.toString('ascii',0,18).includes('Kaydara FBX Binary'),
 obj:b=>b.toString('ascii',0,1)==='#' || b.toString('ascii',0,40).toLowerCase().includes('blender'),
 blend:b=>b.toString('ascii',0,7)==='BLENDER',
}
for(const [format,size] of Object.entries(expectedLengths)){
 const entry=manifest.downloads?.[format]
 if(!entry||entry.bytes!==size||!/^[a-f0-9]{64}$/.test(entry.sha256))
  fail(format+' missing, wrong size or unverifiable SHA')
 const head=await limitedGet('/downloads/'+format,{method:'HEAD'},size+1,30_000)
 if(head.result.status!==200 || head.length!==size ||
    head.result.headers.get('X-WORLDIFACT-Sha256')!==entry.sha256)
    fail(format+' HEAD metadata wrong')
 const part=await limitedGet('/downloads/'+format,{
  headers:{Range:'bytes=0-4095'}},4_096,40_000)
 if(part.result.status!==206 ||
     part.result.headers.get('Content-Range')!=='bytes 0-4095/'+size)
    fail(format+' RANGE 206 missing: '+JSON.stringify({
      status:part.result.status,contentLength:part.length,
      contentRange:part.result.headers.get('Content-Range'),
      transferEncoding:part.result.headers.get('Transfer-Encoding')}))
 const bytes=await bytesOf(part.result,4096)
 if(bytes.size!==4096||!magic[format](bytes.prefix))
    fail(format+' file magic mismatch')
 checks.push({format,head:200,range:206,bytes:size,sha256:entry.sha256})
}
const original=await limitedGet('/downloads/glb',{},expectedLengths.glb+1,240_000)
if(original.result.status!==200 ||
   original.length!==0 && original.length!==expectedLengths.glb)
 fail('full original GLB unavailable: HTTP '+original.result.status+' / declared '+original.length)
const actual=await bytesOf(original.result,expectedLengths.glb+1)
if(actual.size!==expectedLengths.glb||actual.sha256!==manifest.downloads.glb.sha256)
 fail('full 265MB SHA-256 mismatch')
checks.push({format:'GLB_FULL',bytes:actual.size,sha256:actual.sha256,result:'VERIFIED'})
console.log(JSON.stringify({revision:'ecomech-public-staging-verified-20261015',
 source:'OPENAI_ASTRA_ORIGINAL_PLUS_SEPARATELY_DISCLOSED_BLENDER',
 checks, paidApiRequests:0,clientCharge:0,productionModified:false,
 publicUrl:base+'/'},null,2))
