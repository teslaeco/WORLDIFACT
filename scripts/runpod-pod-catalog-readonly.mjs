/** RunPod Secure POD GPU capacity observation, GET-only. Never rents hardware.
 * No account identifiers, raw vendor responses, credentials or datacenter IDs leave this process.
 */
import {pathToFileURL} from 'node:url'
import {runReadOnlyPreflight} from './runpod-readonly-preflight.mjs'

export const POD_CATALOG_PATH='/v2/catalog/gpus?include=AVAILABILITY&product=POD&count=1&cloud=SECURE'
const ORIGIN='https://api.runpod.io'
const AVAIL=new Set(['HIGH','MEDIUM','LOW'])
function klass(id){
  const value=String(id||'').toUpperCase()
  if(value==='NVIDIA L4'||value==='NVIDIA GEFORCE RTX 4090')return 'L4_OR_RTX4090'
  if(value.startsWith('NVIDIA A100')&&value.includes('80GB'))return 'A100_80'
  if(value.startsWith('NVIDIA H100')&&(value.includes('80GB')||value.includes('94GB')))return 'H100_80_PLUS'
  return null
}
async function boundedJSON(response){
  if(!response.ok||!response.headers.get('content-type')?.toLowerCase().includes('json'))throw Error('PROVIDER_RESPONSE_UNVERIFIED')
  const reader=response.body?.getReader()
  if(!reader)throw Error('NO_PROVIDER_BODY')
  const chunks=[];let n=0
  try{
    for(;;){
      const part=await reader.read()
      if(part.done)break
      n+=part.value.byteLength
      if(n>300000)throw Error('OVERSIZED_PROVIDER_RESPONSE')
      chunks.push(part.value)
    }
  }finally{await reader.cancel().catch(()=>{})}
  const b=new Uint8Array(n);let at=0
  for(const part of chunks){b.set(part,at);at+=part.length}
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(b))
}
export async function inspectSecurePodCatalog(apiKey,fetcher=fetch){
  const result={revision:'worldifact-secure-pod-catalog-readonly-v1',verified:false,method:'GET_ONLY',
    createdPods:0,createdEndpoints:0,createdNetworkVolumes:0,paidGpuStarted:0,
    walletVerified:false,invoiceVerified:false,capacityIsNotReservation:true,
    pricesAreEstimatesNotHardSpendCaps:true,categories:[]}
  const account=await runReadOnlyPreflight(apiKey,fetcher)
  if(!account.verified){result.reason='ACCOUNT_INVENTORY_UNVERIFIED';return result}
  result.inventory=Object.fromEntries(Object.entries(account.checks).map(([key,value])=>[key,{count:value.count}]))
  let response
  try{
    response=await fetcher(ORIGIN+POD_CATALOG_PATH,{method:'GET',redirect:'error',signal:AbortSignal.timeout(12000),
      headers:{Authorization:'Bearer '+apiKey,Accept:'application/json'}})
    const raw=await boundedJSON(response)
    if(!raw||!Array.isArray(raw.gpus)||raw.gpus.length>400)throw Error('INVALID_CATALOG')
    const items=[]
    for(const gpu of raw.gpus){
      if(!gpu||typeof gpu!=='object'||Array.isArray(gpu))continue
      const cls=klass(gpu.id)
      if(!cls)continue
      const memory=gpu.memory,price=gpu.price?.secure
      const av=gpu.availability
      const centers=Array.isArray(gpu.dataCenters)?gpu.dataCenters:[]
      const centerAvailable=centers.some(c=>AVAIL.has(c?.availability))
      const priceValid=typeof price==='number'&&Number.isFinite(price)&&price>0&&price<30
      const memValid=typeof memory==='number'&&Number.isFinite(memory)&&memory>0&&memory<=200
      items.push({gpuClass:cls,memoryGB:memValid?memory:null,
        secureUsdPerHour:priceValid?price:null,
        aggregateAvailability:AVAIL.has(av)?av:'NONE_OR_UNKNOWN',
        datacenterAvailable:centerAvailable,
        priceVerified:priceValid})
    }
    result.categories=items
    result.verified=true
    return result
  }catch{result.reason='POD_CATALOG_UNVERIFIED';return result}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const report=await inspectSecurePodCatalog(process.env.RUNPOD_API_KEY)
  process.stdout.write(JSON.stringify(report,null,2)+'\n')
  if(!report.verified)process.exitCode=2
}
