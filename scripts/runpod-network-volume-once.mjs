/**
 * WORLDIFACT one-shot RunPod Network Volume installer.
 * Authenticated live REST v2; restricted to read catalog + ONE 256 GB STANDARD
 * volume creation. No Pod, endpoint, GPU inference or inference billing.
 *
 * Important: the volume incurs $0.07/GB/month even at 0 active GPU.
 * This program is only run on trusted main after an exact marker commit.
 */
import { pathToFileURL } from 'node:url'

export const ORIGIN = 'https://api.runpod.io'
export const VOLUME_NAME = 'WORLDIFACT-SHARED-MODELS-UE58'
export const VOLUME_GB = 256
export const STORAGE_USD_GB_MONTH = 0.07
export const MAX_STORAGE_30D_USD = 17.92
export const OWNER_SCREENSHOT_BALANCE_USD = 33.68
export const MIN_REMAINING_USD = 14

export class Refused extends Error {
  constructor(code) { super(code); this.code = code; this.name = 'WORLDIFACTRunPodRefusal' }
}
const requireTrue=(cond,code)=>{if(!cond)throw new Refused(code)}
const record=x=>!!x&&typeof x==='object'&&!Array.isArray(x)
const available=x=>['HIGH','MEDIUM','LOW'].includes(x)
const idFormat=/^[A-Z]{2}-[A-Z]{2}-[0-9]{1,3}$/
const volumeIdFormat=/^[a-zA-Z0-9_-]{5,80}$/

export function chooseDatacenter(centers, gpuCatalog) {
  requireTrue(record(centers)&&Array.isArray(centers.dataCenters)&&centers.dataCenters.length<1000,
    'DATACENTER_CATALOG_UNVERIFIED')
  requireTrue(record(gpuCatalog)&&Array.isArray(gpuCatalog.gpus)&&gpuCatalog.gpus.length<300,
    'SERVERLESS_GPU_CATALOG_UNVERIFIED')
  const gpus=gpuCatalog.gpus
  const candidates=centers.dataCenters.flatMap(dc=>{
    if (!record(dc) || !idFormat.test(dc.id) || dc.region!=='EUROPE' ||
      !Array.isArray(dc.networkVolumeTypes) || !dc.networkVolumeTypes.includes('STANDARD')) return []
    const supported=[]
    for(const name of ['H100','A100','L4']){
      const matching=gpus.filter(g=>record(g)&&typeof g.name==='string'&&
        g.name.toUpperCase().includes(name)&&Array.isArray(g.dataCenters)&&
        (name==='L4'||Number(g.memory)>=80)&&
        g.dataCenters.some(x=>x.id===dc.id&&available(x.availability))&&
        typeof g.price?.serverless==='number'&&g.price.serverless>0&&g.price.serverless<=6)
      if(matching.length)supported.push(name)
    }
    if(!supported.includes('A100')&&!supported.includes('H100'))return []
    return [{id:dc.id,region:dc.region,gpus:supported,
      score:10*(supported.includes('A100')?1:0)+
        10*(supported.includes('H100')?1:0)+
        2*(supported.includes('L4')?1:0)}]
  })
  candidates.sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id))
  requireTrue(candidates.length>0,'NO_EUROPE_DATACENTER_WITH_80GB_GPU_AND_STANDARD_STORAGE')
  return candidates[0]
}

export function approvedStorageBudget(){
  const raw=VOLUME_GB*STORAGE_USD_GB_MONTH
  const estimated=Math.round(raw*100)/100
  requireTrue(estimated<=MAX_STORAGE_30D_USD &&
    OWNER_SCREENSHOT_BALANCE_USD-estimated>=MIN_REMAINING_USD,
    'STORAGE_EXPOSURE_OVER_APPROVED_BALANCE')
  return estimated
}

const allowedGet=new Set(['/v2/network-volumes','/v2/catalog/datacenters'])
const gpuPath='/v2/catalog/gpus?include=AVAILABILITY&product=SERVERLESS&count=1'
async function call(key,method,path,body,fetcher){
  requireTrue(method==='GET'?(allowedGet.has(path)||path===gpuPath):
    method==='POST'&&path==='/v2/network-volumes'&&record(body),
    'UNAPPROVED_RUNPOD_OPERATION')
  const url=ORIGIN+path
  let res
  try {
    res=await fetcher(url,{method,redirect:'error',signal:AbortSignal.timeout(14000),
      headers:{Authorization:'Bearer '+key,Accept:'application/json',
        ...(method==='POST'?{'Content-Type':'application/json'}:{})},
      ...(method==='POST'?{body:JSON.stringify(body)}:{})})
  } catch {
    throw new Refused(method==='POST'?
      'VOLUME_CREATE_UNCERTAIN_DO_NOT_RETRY':'PROVIDER_READ_TIMEOUT')
  }
  if(!res.ok || (method==='POST'&&res.status!==201)){
    await res.body?.cancel().catch(()=>{})
    throw new Refused(method==='POST'?
      'VOLUME_CREATE_UNCONFIRMED_DO_NOT_RETRY':'PROVIDER_READ_DENIED')
  }
  requireTrue(res.headers.get('content-type')?.toLowerCase().includes('application/json'),
    'PROVIDER_RESPONSE_NOT_JSON')
  try {
    // Error bodies, provider IDs and account data are never logged to Actions.
    let n=0,parts=[]
    const reader=res.body?.getReader()
    requireTrue(!!reader,'PROVIDER_RESPONSE_MISSING')
    for(;;){
      const chunk=await reader.read()
      if(chunk.done)break
      n+=chunk.value.length
      requireTrue(n<=2000000,'PROVIDER_RESPONSE_OVERSIZED')
      parts.push(chunk.value)
    }
    const bytes=new Uint8Array(n);let offset=0
    for(const part of parts){bytes.set(part,offset);offset+=part.length}
    return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))
  } catch {
    throw new Refused(method==='POST'?
      'VOLUME_CREATE_UNCONFIRMED_DO_NOT_RETRY':'PROVIDER_RESPONSE_INVALID')
  }
}

export async function provisionSharedStorage({apiKey,authorization,mode='CREATE'},fetcher=fetch){
  requireTrue(authorization==='CREATE-WORLDIFACT-256GB-ONCE',
    'EXPLICIT_OWNER_STORAGE_AUTHORIZATION_REQUIRED')
  requireTrue(mode==='INSPECT'||mode==='CREATE','INVALID_EXECUTION_MODE')
  requireTrue(typeof apiKey==='string'&&apiKey.length>=12&&!/\s/.test(apiKey),
    'MISSING_SCOPED_RUNPOD_KEY')
  const expectedMonthly=approvedStorageBudget()
  // First GET account inventory and verify pagination, not just the first page.
  const stock=await call(apiKey,'GET','/v2/network-volumes',undefined,fetcher)
  requireTrue(record(stock)&&Array.isArray(stock.networkVolumes)&&
    stock.pagination?.hasNextPage===false,'NETWORK_VOLUME_INVENTORY_INCOMPLETE')
  const previous=stock.networkVolumes.filter(x=>x?.name===VOLUME_NAME)
  requireTrue(previous.length===0,'SHARED_VOLUME_ALREADY_EXISTS_DO_NOT_DUPLICATE')
  requireTrue(!stock.networkVolumes.some(x=>x?.size>=512),
    'EXISTING_LARGE_VOLUME_REQUIRES_BUDGET_REVIEW')
  const centers=await call(apiKey,'GET','/v2/catalog/datacenters',undefined,fetcher)
  const cards=await call(apiKey,'GET',gpuPath,undefined,fetcher)
  const chosen=chooseDatacenter(centers,cards)
  const plan={name:VOLUME_NAME,size:VOLUME_GB,dataCenter:chosen.id,type:'STANDARD'}
  if(mode==='INSPECT')return {
    status:'READ_ONLY_READY',dataCenter:chosen.id,gpusAtDatacenter:chosen.gpus,
    type:'STANDARD',sizeGB:VOLUME_GB,maxEstimated30DaysUsd:expectedMonthly,
    gpuWorkersStarted:0,podsCreated:0,created:false
  }
  // At most one side-effecting call. Network timeout may have created a volume;
  // NEVER retry without a fresh authenticated GET inventory.
  const created=await call(apiKey,'POST','/v2/network-volumes',plan,fetcher)
  requireTrue(record(created)&&volumeIdFormat.test(created.id)&&
    created.name===VOLUME_NAME&&created.size===VOLUME_GB&&
    created.dataCenter===chosen.id&&created.type==='STANDARD',
    'CREATE_RECEIPT_INVALID_INSPECT_ACCOUNT_BEFORE_RETRY')
  return{
    status:'CREATED_VERIFIED',volumeId:created.id,dataCenter:created.dataCenter,
    name:VOLUME_NAME,type:'STANDARD',sizeGB:VOLUME_GB,
    maxEstimated30DaysUsd:expectedMonthly,
    gpusAtDatacenter:chosen.gpus,
    consoleUrl:'https://console.runpod.io/storage',
    gpuWorkersStarted:0,podsCreated:0,
    endpointCreated:false,requiresMonthlyFunding:true
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try {
    const result=await provisionSharedStorage({
      apiKey:process.env.RUNPOD_API_KEY,
      authorization:process.env.WORLDIFACT_VOLUME_APPROVAL,
      mode:process.env.WORLDIFACT_VOLUME_MODE||'CREATE'
    })
    process.stdout.write(JSON.stringify(result)+'\n')
  }catch(e){
    process.stdout.write(JSON.stringify({status:'NOT_VERIFIED',
      reason:e instanceof Refused?e.code:'UNKNOWN_SAFE_FAILURE'})+'\n')
    process.exitCode=2
  }
}
