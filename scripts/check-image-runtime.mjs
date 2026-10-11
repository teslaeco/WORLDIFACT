import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { imageRuntime } from './image-runtime-harness.mjs'
if (!process.env.OPENAI_API_KEY) throw Error('Existing server API key is required')
const expected={model:'gpt-image-2.5-flare',prompt:'A realistic blue and green Earth floating in black space. No text.',n:1,size:'1024x1024',quality:'medium',output_format:'png'}
let calls=0
const runtime=await imageRuntime(async request=>{
 if(++calls!==1||request.url!=='https://api.openai.com/v1/images/generations'||request.method!=='POST')throw Error('One-request provider boundary refused')
 const payload=await request.json();assert.deepEqual(payload,expected)
 return fetch(request.url,{method:'POST',redirect:'manual',signal:AbortSignal.timeout(180000),headers:{'Content-Type':'application/json',Authorization:`Bearer ${process.env.OPENAI_API_KEY}`},body:JSON.stringify(payload)})
},process.env.OPENAI_API_KEY)
try {
 await runtime.call('/fixture-seed',{balance:5})
 const input={id:crypto.randomUUID(),prompt:expected.prompt,model:expected.model,acceptedPoints:5,revision:'image-5-v2'}
 const response=await runtime.call('/images',input);const result=await response.json()
 if(response.status!==200||result.job?.state!=='completed')throw Error(`Image runtime check failed: ${JSON.stringify({state:result.job?.state,diagnostic:result.job?.diagnostic,providerCalls:calls})}`)
 const file=await runtime.call('/images/'+input.id+'/file');assert.equal(file.status,200)
 const bytes=Buffer.from(await file.arrayBuffer());assert.equal(createHash('sha256').update(bytes).digest('hex'),result.job.sha256)
 await runtime.call('/images',input);assert.equal(calls,1)
 assert.deepEqual(await runtime.call('/fixture-inspect').then(r=>r.json()),{balance:0,held:0})
 const usage=result.job.usage
 console.log(JSON.stringify({realImageGenerated:true,nativeRuntime:true,model:expected.model,providerCalls:calls,bytes:bytes.length,sha256:result.job.sha256,usage,estimatedApiUsd:usage?(usage.input_tokens*5+usage.output_tokens*30)/1000000:null,customerAccountsTouched:0,replayProviderCalls:0}))
} catch(error){console.error(error instanceof Error?error.message:'Image runtime check failed');process.exitCode=1}
finally{await runtime.close()}
