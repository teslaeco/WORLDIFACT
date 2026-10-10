import { getVerifiedAccount, type AccountEnv } from './accounts.ts'
import { entitlementCall, type EntitlementEnv, type EntitlementStorage } from './entitlements.ts'

export interface PromotionEnv { WORLDIFACT_PROMOTIONS_ENABLED?: string; WORLDIFACT_PROMOTION_DEFINITIONS?: string }
export const PROMOTION_NAMESPACE = 'worldifact-promotions:v1'
interface Definition { id: string; sha256: string; accountId: string; points: number; startsAt: number; expiresAt: number; maxRedemptions: 1; purpose: 'tester' }
interface Claim { definition: Definition; acceptedAt: number }
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/
const HASH = /^[a-f0-9]{64}$/
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const reply = (v: unknown, status = 200) => Response.json(v, { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie', 'X-Content-Type-Options': 'nosniff' } })
export function promotionDefinitions(env: PromotionEnv): Definition[] | null {
  if (env.WORLDIFACT_PROMOTIONS_ENABLED !== 'true' || !env.WORLDIFACT_PROMOTION_DEFINITIONS || env.WORLDIFACT_PROMOTION_DEFINITIONS.length > 32768) return null
  try {
    const v: unknown = JSON.parse(env.WORLDIFACT_PROMOTION_DEFINITIONS)
    if (!Array.isArray(v) || v.length < 1 || v.length > 50) return null
    const fields = ['id', 'sha256', 'accountId', 'points', 'startsAt', 'expiresAt', 'maxRedemptions', 'purpose']
    if (v.some(d => !object(d) || Object.keys(d).length !== fields.length || Object.keys(d).some(k=>!fields.includes(k)) ||
      typeof d.id !== 'string' || !UUID.test(d.id) || typeof d.sha256 !== 'string' || !HASH.test(d.sha256) || typeof d.accountId !== 'string' || !UUID.test(d.accountId) ||
      !Number.isSafeInteger(d.points) || Number(d.points) < 1 || Number(d.points) > 1000 || !Number.isSafeInteger(d.startsAt) || Number(d.startsAt) <= 0 ||
      !Number.isSafeInteger(d.expiresAt) || Number(d.expiresAt) <= Number(d.startsAt) || Number(d.expiresAt) - Number(d.startsAt) > 31*86400000 || d.maxRedemptions !== 1 || d.purpose !== 'tester')) return null
    if (new Set(v.map(d=>d.id)).size !== v.length || new Set(v.map(d=>d.sha256)).size !== v.length) return null
    return v as Definition[]
  } catch { return null }
}
const same = (a: Definition, b: Definition) => ['id','sha256','accountId','points','startsAt','expiresAt','maxRedemptions','purpose'].every(k=>a[k as keyof Definition]===b[k as keyof Definition])
function validClaim(v: unknown): v is Claim {
  return object(v) && Object.keys(v).length === 2 && object(v.definition) && promotionDefinitions({WORLDIFACT_PROMOTIONS_ENABLED:'true',WORLDIFACT_PROMOTION_DEFINITIONS:JSON.stringify([v.definition])}) !== null &&
    Number.isSafeInteger(v.acceptedAt) && Number(v.acceptedAt) >= Number(v.definition.startsAt) && Number(v.acceptedAt) < Number(v.definition.expiresAt)
}
export async function promotionHash(code: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code))
  return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('')
}
/** Globally serialized claims. No account balance or provider funding exists here. */
export async function promotionRegistry(request: Request, storage: EntitlementStorage, env: PromotionEnv, now: number): Promise<Response> {
  if (request.method !== 'POST') return reply({error:'Use POST.'},405)
  const raw = await request.text(); if(raw.length>512)return reply({error:'Invalid claim.'},400)
  let input: Record<string, unknown>
  try { const v:unknown=JSON.parse(raw); if(!object(v))throw Error();input=v }catch{return reply({error:'Invalid claim.'},400)}
  const path = new URL(request.url).pathname
  if (!['/promo-claim','/promo-read'].includes(path) || Object.keys(input).some(k=>!['sha256','accountId','id'].includes(k)) || typeof input.accountId !== 'string' || !UUID.test(input.accountId)) return reply({error:'Invalid claim.'},400)
  const definitions=promotionDefinitions(env)
  if(!definitions)return reply({error:'Promotions inactive.'},503)
  const definition=definitions.find(d=>path==='/promo-claim'?d.sha256===input.sha256:d.id===input.id)
  if(!definition || definition.accountId!==input.accountId)return reply({error:'Code unavailable.'},403)
  return storage.transaction(async tx=>{
    const saved=await tx.get<Claim>('claim:'+definition.id), hashOwner=await tx.get<string>('hash:'+definition.sha256)
    if(hashOwner!==undefined && hashOwner!==definition.id)return reply({error:'Code unavailable.'},409)
    if(saved!==undefined){
      if(!validClaim(saved)||!same(saved.definition,definition))return reply({error:'Code unavailable.'},409)
      return reply({claim:saved,repeated:true})
    }
    if(path==='/promo-read'||now<definition.startsAt||now>=definition.expiresAt)return reply({error:'Code unavailable.'},403)
    const claim:Claim={definition,acceptedAt:now}
    await tx.put('hash:'+definition.sha256,definition.id);await tx.put('claim:'+definition.id,claim)
    return reply({claim,repeated:false})
  })
}
async function registry(env: EntitlementEnv, path: string, input: unknown) {
  if(!env.ACCOUNT_ENTITLEMENTS)throw Error('Registry unavailable')
  const ns=env.ACCOUNT_LEDGER_MODE==='sandbox'?PROMOTION_NAMESPACE+':sandbox':PROMOTION_NAMESPACE
  const r=await env.ACCOUNT_ENTITLEMENTS.get(env.ACCOUNT_ENTITLEMENTS.idFromName(ns)).fetch(new Request('https://entitlements.internal'+path,{method:'POST',body:JSON.stringify(input),signal:AbortSignal.timeout(5000)}))
  const v=await r.json() as {claim?:unknown}
  if(!r.ok||!validClaim(v.claim))throw Error('Code unavailable')
  return v.claim
}
/** Re-read the global claim; never trust browser points, email, role or a copied claim. */
export async function applyPromotion(request: Request, storage: EntitlementStorage, env: EntitlementEnv, boundAccount: string | null): Promise<Response> {
  if(request.method!=='POST'||!boundAccount)return reply({error:'Unauthorized.'},403)
  const text=await request.text();if(text.length>128)return reply({error:'Invalid request.'},400)
  let id:unknown
  try{const v:unknown=JSON.parse(text);if(!object(v)||Object.keys(v).length!==1)throw Error();id=v.id}catch{return reply({error:'Invalid request.'},400)}
  if(typeof id!=='string'||!UUID.test(id))return reply({error:'Invalid request.'},400)
  const claim=await registry(env,'/promo-read',{id,accountId:boundAccount})
  if(claim.definition.accountId!==boundAccount||claim.definition.id!==id)return reply({error:'Unauthorized.'},403)
  return storage.transaction(async tx=>{
    const key='promotion-grant:v1:'+id,previous=await tx.get<Claim>(key)
    if(previous!==undefined){if(!validClaim(previous)||!same(previous.definition,claim.definition)||previous.acceptedAt!==claim.acceptedAt)throw Error('Grant conflict');return reply({redeemed:true,repeated:true,points:claim.definition.points})}
    const balance=await tx.get<number>('balance')??0
    if(!Number.isSafeInteger(balance)||balance<0||await tx.get('billingHold')===true||!Number.isSafeInteger(balance+claim.definition.points))return reply({error:'Account review required.'},409)
    // Freeze the PRE-grant legacy provider reserve; internal points must never
    // become implicit API funding through the historical lazy-seed formula.
    const provider = await tx.get<number>('provider-budget-cents:v1')
    if (provider !== undefined && (!Number.isSafeInteger(provider) || provider < 0)) throw Error('Provider reserve unavailable')
    if (provider === undefined) await tx.put('provider-budget-cents:v1', Math.floor(balance * 7 / 10))
    await tx.put('balance',balance+claim.definition.points);await tx.put(key,claim)
    return reply({redeemed:true,repeated:false,points:claim.definition.points})
  })
}
async function readCode(request:Request):Promise<string>{
  if(!(request.headers.get('Content-Type')??'').startsWith('application/json'))throw Error('JSON required')
  const reader=request.body?.getReader();if(!reader)throw Error('Missing body')
  let text='',size=0;const decoder=new TextDecoder()
  try{for(;;){const r=await reader.read();if(r.done)break;size+=r.value.byteLength;if(size>256)throw Error('Body too large');text+=decoder.decode(r.value,{stream:true})}text+=decoder.decode()}finally{await reader.cancel().catch(()=>{})}
  const v:unknown=JSON.parse(text)
  if(!object(v)||Object.keys(v).length!==1||typeof v.code!=='string'||!/^[A-Za-z0-9_-]{12,128}$/.test(v.code))throw Error('Invalid code')
  return v.code
}
export async function promotionApi(request:Request,env:AccountEnv&EntitlementEnv,fetcher:typeof fetch):Promise<Response>{
  if(!['GET','POST'].includes(request.method))return reply({error:'Use GET or POST.'},405)
  if(request.headers.get('Sec-Fetch-Site')==='cross-site'||request.method==='POST'&&request.headers.get('Origin')!==new URL(request.url).origin||request.headers.has('Origin')&&request.headers.get('Origin')!==new URL(request.url).origin)return reply({error:'Same-origin required.'},403)
  try{
    const user=await getVerifiedAccount(request,env,fetcher);if(!user)return reply({error:'Sign in required.'},401)
    const limiter=env.ACCOUNT_LIMITER??env.GENERATION_LIMITER
    if(!limiter||!await limiter.limit({key:'account:promotions:'+user.id}).then(r=>r.success))return reply({error:'Promotion access unavailable.'},429)
    const definitions=promotionDefinitions(env)
    if(request.method==='GET')return reply({active:!!definitions?.some(d=>d.accountId===user.id.toLowerCase()&&Date.now()>=d.startsAt&&Date.now()<d.expiresAt),kind:'internal-points',providerFunding:false})
    if(!definitions)return reply({error:'Promotions inactive.'},503)
    const code=await readCode(request),claim=await registry(env,'/promo-claim',{sha256:await promotionHash(code),accountId:user.id.toLowerCase()})
    const applied=await entitlementCall(env,user.id,'/promo-apply',{id:claim.definition.id})
    return reply(applied)
  }catch{return reply({error:'Code unavailable or account review required. Retry the same code; do not purchase a replacement.'},409)}
}
