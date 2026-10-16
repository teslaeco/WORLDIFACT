import { test } from 'node:test'
import assert from 'node:assert/strict'
import {inspectOnDemandGpu,GPU_CATALOG_PATH} from '../scripts/runpod-gpu-catalog-readonly.mjs'

const secret='NOT_REAL_RUNPOD_KEY_SECURE_ONLY'
const docs={
  '/v2/serverless':{endpoints:[],pagination:{hasNextPage:false}},
  '/v2/network-volumes':{networkVolumes:[],pagination:{hasNextPage:false}},
  '/v2/pods':{pods:[],pagination:{hasNextPage:false}},
  [GPU_CATALOG_PATH]:{gpus:[
    {name:'NVIDIA A100 80GB PCIe',memory:80,availability:'HIGH',price:{serverless:2.72},id:'PRIVATE_A'},
    {name:'NVIDIA H100 80GB',memory:80,availability:'MEDIUM',price:{serverless:4.79},id:'PRIVATE_H'},
    {name:'NVIDIA L4',memory:24,availability:'LOW',price:{serverless:1.33},id:'PRIVATE_L'},
    {name:'NVIDIA GeForce RTX 4090',memory:24,availability:'HIGH',price:{serverless:1.10}}
  ]}
}
const mock=(cfg=docs)=>{
 const requests=[]
 const fetcher=async(url,options)=>{
   const u=new URL(url)
   assert.equal(u.origin,'https://api.runpod.io')
   assert.equal(options.method,'GET')
   assert.equal(options.redirect,'error')
   assert.equal(options.headers.Authorization,'Bearer '+secret)
   assert.ok(!('body' in options))
   requests.push(u.pathname+u.search)
   return Response.json(cfg[u.pathname+u.search])
 }
 return {requests,fetcher}
}
test('only four read operations no billable requests, and sanitized A100/H100/L4 rates',async()=>{
 const m=mock()
 const result=await inspectOnDemandGpu(secret,m.fetcher)
 assert.equal(result.verified,true)
 assert.equal(result.GPUWorkerCreated,0)
 assert.equal(result.paidInference,0)
 assert.equal(result.accountInventory['/v2/serverless'].count,0)
 assert.deepEqual(m.requests,['/v2/serverless','/v2/network-volumes','/v2/pods',GPU_CATALOG_PATH])
 assert.deepEqual(result.availableGPUs.map(x=>x.kind),['A100','H100','L4'])
 for (const s of ['PRIVATE_A','PRIVATE_H','PRIVATE_L',secret])assert.ok(!JSON.stringify(result).includes(s))
})
test('missing secret refuses before a single network operation',async()=>{
 const m=mock()
 const report=await inspectOnDemandGpu('',m.fetcher)
 assert.equal(report.verified,false)
 assert.equal(m.requests.length,0)
})
test('unknown/nonJSON/extra-large GPU provider response never claims verified',async()=>{
 const cases=[
   () =>new Response('<html>secret</html>',{headers:{'content-type':'text/html'}}),
   () =>Response.json({bad:'shape'}),
   () =>Response.json({gpus:[{name:'PRIVATE_UNKNOWN',secret:'should not leak'}]}),
 ]
 for(const getResult of cases){
   const m=mock()
   const fetcher=async(url,opts)=>url.endsWith('/catalog/gpus?include=AVAILABILITY&product=SERVERLESS&count=1')
     ? getResult():m.fetcher(url,opts)
   const r=await inspectOnDemandGpu(secret,fetcher)
   if(getResult===cases[2]){assert.equal(r.verified,true);assert.equal(r.availableGPUs.length,0)}
   else {assert.equal(r.verified,false);assert.equal(r.reason,'GPU_CATALOG_UNVERIFIED')}
   assert.ok(!JSON.stringify(r).includes('should not leak'))
 })
})
test('untrusted paginated inventory blocks catalog read',async()=>{
 const m=mock({...docs,'/v2/serverless':{endpoints:[],pagination:{hasNextPage:true,nextCursor:'secret'}}})
 const r=await inspectOnDemandGpu(secret,m.fetcher)
 assert.equal(r.verified,false)
 assert.deepEqual(m.requests,['/v2/serverless','/v2/network-volumes','/v2/pods'])
 assert.ok(!JSON.stringify(r).includes('secret'))
})
