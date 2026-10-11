import test from 'node:test'
import assert from 'node:assert/strict'
import { deflateSync } from 'node:zlib'
import { createHash, randomBytes } from 'node:crypto'
import { imageRuntime } from '../scripts/image-runtime-harness.mjs'
const hash = value => createHash('sha256').update(value).digest('hex')
function png() {
  const crc = bytes => {let v=0xffffffff;for(const b of bytes){v^=b;for(let i=0;i<8;i++)v=(v>>>1)^((v&1)?0xedb88320:0)}return(v^0xffffffff)>>>0}
  const chunk=(kind,data)=>{const b=Buffer.alloc(12+data.length);b.writeUInt32BE(data.length);b.write(kind,4);data.copy(b,8);b.writeUInt32BE(crc(b.subarray(4,-4)),b.length-4);return b}
  const header=Buffer.alloc(13);header.writeUInt32BE(1024);header.writeUInt32BE(1024,4);header[8]=8;header[9]=2
  const raw=randomBytes((1024*3+1)*1024);for(let y=0;y<1024;y++)raw[y*(1024*3+1)]=0
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))])
}
const input = () => ({id:crypto.randomUUID(),prompt:'Earth in space',model:'gpt-image-2.5-flare',acceptedPoints:5,revision:'image-5-v2'})
function legacy(points, changes={}) {
 const body={...input(),acceptedPoints:points,revision:points===25?'image-25-v1':'image-5-v2'}
 return {id:body.id,prompt:body.prompt,model:body.model,at:Date.parse('2026-10-10T23:52:00Z'),updatedAt:Date.parse('2026-10-10T23:52:00.100Z'),state:'uncertain',points,settlement:'held',fingerprint:hash(JSON.stringify({...body,points,size:'1024x1024',quality:'medium',format:'png'})),detail:`The provider outcome could not be confirmed. ${points} points remain held for review; no second image request was sent.`,...changes}
}
test('native Cloudflare runtime rejects the historical option before dispatch, recovers only proven legacy holds, and saves a full-size PNG once',{timeout:60000},async t=>{
 const bytes=png();assert.ok(bytes.length>3*1024*1024)
 let calls=0,mode='success'
 const runtime=await imageRuntime(async request=>{
   calls++;assert.equal(request.url,'https://api.openai.com/v1/images/generations');assert.equal(request.method,'POST');assert.ok(!request.url.includes('untrusted.invalid'))
   if(mode==='redirect')return new Response(null,{status:307,headers:{Location:'https://untrusted.invalid/key-collector'}})
   return Response.json({data:[{b64_json:bytes.toString('base64')}],usage:{input_tokens:30,output_tokens:439,total_tokens:469}})
 });t.after(()=>runtime.close())
 assert.deepEqual(await runtime.call('/fixture-old-transport').then(r=>r.json()),{rejected:true});assert.equal(calls,0)
 const old=legacy(25),oldFive=legacy(5)
 await runtime.call('/fixture-seed',{'balance':199,'customer-reserved-credits:v1':70,'image-index:v1':[old.id,oldFive.id],['image-job:v1:'+old.id]:old,['image-job:v1:'+oldFive.id]:oldFive})
 const recovered=await Promise.all(Array.from({length:5},()=>runtime.call('/images').then(r=>r.json())))
 for(const reply of recovered)for(const job of reply.jobs){assert.equal(job.settlement,'released');assert.equal(job.recovery,'legacy-redirect-before-dispatch')}
 assert.deepEqual(await runtime.call('/fixture-inspect').then(r=>r.json()),{balance:199,held:40});assert.equal(calls,0)
 const body=input(),result=await runtime.call('/images',body).then(r=>r.json())
 assert.equal(result.job.state,'completed',JSON.stringify(result));assert.equal(result.job.points,5);assert.equal(result.job.bytes,bytes.length);assert.equal(calls,1)
 const file=await runtime.call('/images/'+body.id+'/file');assert.equal(hash(Buffer.from(await file.arrayBuffer())),hash(bytes))
 await runtime.call('/images',body);assert.equal(calls,1)
 assert.deepEqual(await runtime.call('/fixture-inspect').then(r=>r.json()),{balance:194,held:40})
 mode='redirect';const redirected=await runtime.call('/images',input()).then(r=>r.json())
 assert.equal(redirected.job.state,'uncertain');assert.deepEqual(redirected.job.diagnostic,{stage:'response',status:307});assert.equal(calls,2)
 await runtime.call('/images');assert.equal(calls,2)
 assert.deepEqual(await runtime.call('/fixture-inspect').then(r=>r.json()),{balance:194,held:45})
})
test('legacy recovery refuses new transport, provider evidence, changed fingerprints, out-of-window rows and insufficient holds',{timeout:60000},async t=>{
 let calls=0;const runtime=await imageRuntime(()=>{calls++;throw Error('Unexpected provider call')});t.after(()=>runtime.close())
 for(const changes of [{transportRevision:'image-manual-v1'},{providerRequestId:'req_known'},{usage:{input_tokens:1,output_tokens:1,total_tokens:2}},{fingerprint:'0'.repeat(64)},{at:Date.parse('2026-10-12T00:00:00Z')},{state:'processing'},{detail:'Different failure'}]){
  const job=legacy(25,changes);await runtime.call('/fixture-seed',{'balance':199,'customer-reserved-credits:v1':25,'image-index:v1':[job.id],['image-job:v1:'+job.id]:job})
  const result=await runtime.call('/images').then(r=>r.json());assert.equal(result.jobs[0].settlement,'held');assert.deepEqual(await runtime.call('/fixture-inspect').then(r=>r.json()),{balance:199,held:25})
 }
 const job=legacy(25);await runtime.call('/fixture-seed',{'balance':199,'customer-reserved-credits:v1':24,'image-index:v1':[job.id],['image-job:v1:'+job.id]:job})
 await runtime.call('/images');assert.deepEqual(await runtime.call('/fixture-inspect').then(r=>r.json()),{balance:199,held:24});assert.equal(calls,0)
})
