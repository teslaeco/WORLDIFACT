import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ENDPOINT_NAME, EPHEMERAL_WORKER_DISK_GB, Refused, approvedInputs, pickA100,
  requestedEndpoint, provisionOnce
} from '../scripts/runpod-provision-on-demand.mjs'

const img = 'ghcr.io/teslaeco/worldifact-runpod3d@sha256:' + 'a'.repeat(64)
const key = 'fixture-SECRET-DO-NOT-LOG-runpod-testing'
const options = {
  confirmation: 'PROVISION-WORLDIFACT-FLEX',
  image: img,
  reviewedImage: img,
  licensesReviewed: 'true',
  cudaParityVerified: 'true',
  modelWeightsVerified: 'true',
  accountBoundR2Verified: 'true',
  apiKey: key
}
const noEndpoints = { endpoints: [], pagination: { hasNextPage: false, nextCursor: null } }
const gpuCatalog = { gpus: [
  { name: 'NVIDIA A100 80GB PCIe', pool: 'AMPERE_80', memory: 80,
    availability: 'HIGH', price: { serverless: 2.72 } },
  { name: 'NVIDIA H100 80GB', pool: 'HOPPER_80', memory: 80,
    availability: 'HIGH', price: { serverless: 4.79 } },
  { name: 'NVIDIA RTX 4090', pool: 'ADA_24', memory: 24,
    availability: 'HIGH', price: { serverless: 1.10 } }
] }

function fakeAccount({post = null, existing = noEndpoints, catalog = gpuCatalog} = {}) {
  const calls = []
  const fetcher = async (url, init) => {
    const u = new URL(url)
    calls.push({ url, method: init.method, body: init.body })
    assert.equal(u.origin, 'https://api.runpod.io')
    assert.equal(init.headers.Authorization, 'Bearer ' + key)
    assert.equal(init.redirect, 'error')
    if (init.method === 'GET' && u.pathname === '/v2/serverless')
      return Response.json(existing)
    if (init.method === 'GET' && u.pathname === '/v2/catalog/gpus')
      return Response.json(catalog)
    assert.equal(init.method, 'POST')
    assert.equal(u.pathname, '/v2/serverless')
    const body = JSON.parse(init.body)
    return post ? post(body) : Response.json({ ...body, id: 'goodend123' }, {status:201})
  }
  return { fetcher, calls }
}

test('absent explicit permission refuses before network and every paid action', async () => {
  for (const field of ['confirmation', 'reviewedImage', 'licensesReviewed',
    'cudaParityVerified', 'modelWeightsVerified', 'accountBoundR2Verified']) {
    const o = { ...options, [field]: 'false' }
    const { fetcher, calls } = fakeAccount()
    await assert.rejects(provisionOnce(o, fetcher), Refused)
    assert.equal(calls.length, 0)
  }
})

test('rejects tags and non-worldifact or non-immutable images', () => {
  for (const image of ['runpod/pytorch:latest', 'ghcr.io/teslaeco/other@sha256:' + 'a'.repeat(64),
    'ghcr.io/teslaeco/worldifact-runpod3d:latest', 'https://evil.example/image']) {
    assert.throws(() => approvedInputs({...options,image,reviewedImage:image}), Refused)
  }
})

test('configuration never provisions Pods or always-on GPUs', () => {
  const request = requestedEndpoint(img, 'AMPERE_80')
  assert.equal(request.type, 'QUEUE')
  assert.deepEqual(request.workers, {min:0,max:1,idleTimeout:5})
  assert.equal(request.gpu.count, 1)
  assert.equal(request.timeout, 120000)
  assert.equal(EPHEMERAL_WORKER_DISK_GB, 100)
  assert.equal(request.disk, EPHEMERAL_WORKER_DISK_GB)
  assert.equal(request.env.ENABLE_RUNPOD_WORKER, 'false')
  assert.deepEqual(request.mounts, {network:[],global:[]})
  assert.ok(!('networkVolumes' in request), 'No persistent RunPod volume may be created')
  assert.ok(!('templateId' in request), 'No provider template may override storage policy')
  assert.equal(request.flashboot, 'OFF')
  assert.ok(!('ports' in request))
})

test('A100 GPU selection requires verified 80GB and price below ceiling', () => {
  assert.deepEqual(pickA100(gpuCatalog), {pool:'AMPERE_80',pricePerHour:2.72})
  assert.throws(()=>pickA100({gpus:[{...gpuCatalog.gpus[0],
    price:{serverless: 4.30}}]}), /A100_80GB/)
  assert.throws(()=>pickA100({gpus:[{...gpuCatalog.gpus[0],
    availability: 'NONE'}]}), /A100_80GB/)
  assert.throws(()=>pickA100({gpus:[]}), /A100_80GB/)
})

test('one exclusively authorized POST creates disabled-on-arrival 0-active endpoint', async () => {
  const account = fakeAccount()
  const result = await provisionOnce(options, account.fetcher)
  assert.equal(result.status,'CREATED_MIN_ZERO_DISABLED')
  assert.equal(result.endpointId,'goodend123')
  assert.equal(result.endpointName,ENDPOINT_NAME)
  assert.equal(result.activeWorkers,0)
  assert.equal(result.maxWorkers,1)
  assert.equal(result.idleTimeoutSeconds,5)
  assert.equal(result.paidInferenceRequested,false)
  assert.equal(result.productionTrafficChanged,false)
  assert.deepEqual(account.calls.map(call=>call.method),['GET','GET','POST'])
  const output=JSON.stringify(result)
  assert.ok(!output.includes(key))
  assert.ok(!output.includes(img))
})

test('existing identical endpoint refuses, never creates duplicate', async () => {
  const c=fakeAccount({existing:{
    endpoints:[{name:ENDPOINT_NAME,id:'already123'}],
    pagination:{hasNextPage:false}
  }})
  await assert.rejects(provisionOnce(options,c.fetcher),
    /WORLDIFACT_ENDPOINT_ALREADY_EXISTS_INSPECT_BEFORE_RETRY/)
  assert.equal(c.calls.length,1)
  assert.equal(c.calls[0].method,'GET')
})

test('unreviewed paginated inventory fails closed with no POST',async()=>{
  const c=fakeAccount({existing:{...noEndpoints,
    pagination:{hasNextPage:true,nextCursor:'PRIVATE_CURSOR'}}})
  await assert.rejects(provisionOnce(options,c.fetcher),
    /ACCOUNT_ENDPOINT_INVENTORY_INCOMPLETE/)
  assert.equal(c.calls.length,1)
})

test('unknown POST response is not retried, including transient timeouts', async () => {
  const c=fakeAccount({post:()=>{throw Error('SECRET_TIMEOUT')}})
  await assert.rejects(provisionOnce(options,c.fetcher),
    /ENDPOINT_CREATE_RESULT_UNKNOWN_DO_NOT_RETRY/)
  assert.equal(c.calls.filter(x=>x.method==='POST').length,1)
})

test('resource settings in provider receipt must exactly match, never claim success', async()=>{
  const c=fakeAccount({post:body=>Response.json({...body,
    id:'badwork12',workers:{...body.workers,min:1}},{status:201})})
  await assert.rejects(provisionOnce(options,c.fetcher),
    /CREATION_UNCONFIRMED_OR_BAD_SETTINGS_INSPECT_PROVIDER_NO_RETRY/)
  assert.equal(c.calls.filter(x=>x.method==='POST').length,1)
})

test('bad account permission does not POST or disclose private body',async()=>{
  const calls=[]
  const result=provisionOnce(options,async(url,init)=>{
    calls.push(url)
    return new Response('Bearer '+key+' internal private failure',{status:403})
  })
  await assert.rejects(result,/PROVIDER_READ_FAILED/)
  assert.equal(calls.length,1)
})

test('provider response with persistent network volume is never accepted',async()=>{
  const c=fakeAccount({post:body=>Response.json({...body,id:'badvol123',mounts:{
    network:[{volumeId:'permanent-disk'}],global:[]}}, {status:201})})
  await assert.rejects(provisionOnce(options,c.fetcher),
    /CREATION_UNCONFIRMED_OR_BAD_SETTINGS_INSPECT_PROVIDER_NO_RETRY/)
  assert.equal(c.calls.filter(x=>x.method==='POST').length,1)
})

test('provider response with too-small ephemeral disk is never accepted',async()=>{
  const c=fakeAccount({post:body=>Response.json({...body,id:'badstor123',disk:20}, {status:201})})
  await assert.rejects(provisionOnce(options,c.fetcher),
    /CREATION_UNCONFIRMED_OR_BAD_SETTINGS_INSPECT_PROVIDER_NO_RETRY/)
  assert.equal(c.calls.filter(x=>x.method==='POST').length,1)
})
