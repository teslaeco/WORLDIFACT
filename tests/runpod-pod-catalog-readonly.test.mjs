import {test} from 'node:test'
import assert from 'node:assert/strict'
import {inspectSecurePodCatalog,POD_CATALOG_PATH} from '../scripts/runpod-pod-catalog-readonly.mjs'

const key='NOT_A_REAL_TEST_SECRET_RUNPOD_2026'
const fixture={
  '/v2/serverless':{endpoints:[],pagination:{hasNextPage:false}},
  '/v2/network-volumes':{networkVolumes:[],pagination:{hasNextPage:false}},
  '/v2/pods':{pods:[],pagination:{hasNextPage:false}},
  [POD_CATALOG_PATH]:{gpus:[
    {id:'NVIDIA L4',memory:24,availability:'NONE',price:{secure:.69},dataCenters:[]},
    {id:'NVIDIA GeForce RTX 4090',memory:24,availability:'MEDIUM',price:{secure:1.23},dataCenters:[{availability:'MEDIUM',id:'private-dc-id'}]},
    {id:'NVIDIA A100 80GB PCIe',memory:80,availability:'LOW',price:{secure:2.72},dataCenters:[{availability:'LOW'}]},
    {id:'NVIDIA H100 80GB HBM3',memory:80,availability:'HIGH',price:{secure:4.79},dataCenters:[{availability:'HIGH'}]},
    {id:'OTHER_PRIVATE_ID',memory:48,availability:'HIGH',price:{secure:123},dataCenters:[]}
  ]}
}
function mock(mapping=fixture){
  const requests=[]
  const fetcher=async(url,options)=>{
    const u=new URL(url)
    assert.equal(u.origin,'https://api.runpod.io')
    assert.equal(options.method,'GET')
    assert.equal(options.redirect,'error')
    assert.equal(options.headers.Authorization,'Bearer '+key)
    assert.ok(!('body' in options))
    requests.push(u.pathname+u.search)
    const output=mapping[u.pathname+u.search]
    if(!output)throw Error('MOCK_UNEXPECTED_URL')
    return Response.json(output)
  }
  return {requests,fetcher}
}
test('strictly four GET-only provider calls, inventory is empty and GPU catalog is sanitized',async()=>{
  const m=mock()
  const report=await inspectSecurePodCatalog(key,m.fetcher)
  assert.equal(report.verified,true)
  assert.equal(report.createdPods,0)
  assert.equal(report.paidGpuStarted,0)
  assert.equal(report.walletVerified,false)
  assert.deepEqual(m.requests,['/v2/serverless','/v2/network-volumes','/v2/pods',POD_CATALOG_PATH])
  assert.equal(report.categories.length,4)
  assert.ok(report.categories.some(g=>g.gpuClass==='L4_OR_RTX4090'&&g.datacenterAvailable&&g.secureUsdPerHour===1.23))
  for(const privateText of [key,'private-dc-id','OTHER_PRIVATE_ID'])assert.ok(!JSON.stringify(report).includes(privateText))
})
test('unknown secure prices remain null, never interpreted as zero',async()=>{
  const bad=structuredClone(fixture)
  bad[POD_CATALOG_PATH].gpus[1].price={community:.05}
  const report=await inspectSecurePodCatalog(key,mock(bad).fetcher)
  const item=report.categories.find(g=>g.datacenterAvailable&&g.gpuClass==='L4_OR_RTX4090')
  assert.equal(item.secureUsdPerHour,null)
  assert.equal(item.priceVerified,false)
})
test('missing secret refuses before provider access',async()=>{
  const m=mock()
  const report=await inspectSecurePodCatalog('',m.fetcher)
  assert.equal(report.verified,false)
  assert.equal(report.categories.length,0)
  assert.deepEqual(m.requests,[])
})
test('bad catalog and paginated inventory fail closed',async()=>{
  const wrong=structuredClone(fixture)
  wrong[POD_CATALOG_PATH]={bad:'shape'}
  assert.equal((await inspectSecurePodCatalog(key,mock(wrong).fetcher)).verified,false)
  const pages=structuredClone(fixture)
  pages['/v2/pods'].pagination.hasNextPage=true
  const m=mock(pages)
  assert.equal((await inspectSecurePodCatalog(key,m.fetcher)).verified,false)
  assert.equal(m.requests.length,3)
})
