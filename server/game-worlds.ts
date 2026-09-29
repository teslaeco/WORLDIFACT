import { getVerifiedAccount, type AccountEnv } from './accounts.ts'
import { ACCOUNT_ID, userJobAccess, type EntitlementEnv } from './entitlements.ts'
import { WORLD_LIMITS } from '../src/lib/gameWorld.ts'
const reply=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'private, no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff'}})
async function boundedText(request:Request,max:number) {
  if (Number(request.headers.get('content-length'))>max) throw new Error('oversize')
  const reader=request.body?.getReader();if(!reader)throw new Error('body')
  const parts:Uint8Array[]=[];let size=0
  try { while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max)throw new Error('oversize');parts.push(value)} }
  catch(e){await reader.cancel();throw e}
  const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length}
  return new TextDecoder().decode(bytes)
}
/** Only same-account metadata. No AI, URLs, remote execution or binary uploads. */
export async function gameWorldApi(request:Request,env:AccountEnv&EntitlementEnv,fetcher:typeof fetch=fetch):Promise<Response|null>{
  const url=new URL(request.url),path=url.pathname
  if(path!=='/api/game-worlds'&&path!=='/api/game-worlds/library-access')return null
  if(!['GET','POST'].includes(request.method)||path.endsWith('library-access')&&request.method!=='POST')return reply({error:'Unsupported method.'},405)
  if(request.method==='POST'&&request.headers.get('origin')!==url.origin)return reply({error:'Same-origin access required.'},403)
  if(request.headers.get('sec-fetch-site')==='cross-site')return reply({error:'Cross-site access denied.'},403)
  if(url.search)return reply({error:'Owner IDs and query overrides are not accepted.'},400)
  if(request.method==='POST'&&!request.headers.get('content-type')?.startsWith('application/json'))return reply({error:'Use application/json.'},415)
  try{
    if(!env.ACCOUNT_ENTITLEMENTS||!env.ACCOUNT_LIMITER)return reply({error:'Account world storage is unavailable.'},503)
    const user=await getVerifiedAccount(request,env,fetcher)
    if(!user||!ACCOUNT_ID.test(user.id))return reply({error:'Sign in to edit your own worlds.'},401)
    const rate=await env.ACCOUNT_LIMITER.limit({key:`game-world:${user.id}`})
    if(!rate.success)return reply({error:'Please wait before saving again. Your local draft is preserved.'},429)
    const raw=request.method==='POST'?await boundedText(request,WORLD_LIMITS.bytes+256):undefined
    if(path.endsWith('library-access')){
      const v=JSON.parse(raw!)
      if(!v||typeof v!=='object'||Object.keys(v).join(',')!=='ids'||!Array.isArray(v.ids)||v.ids.length>32||!v.ids.every((id:unknown)=>typeof id==='string'&&ACCOUNT_ID.test(id)))return reply({error:'Use up to 32 model IDs.'},400)
      const owned:string[]=[]
      // Sequential checks bound internal concurrency and never return another account's metadata.
      for(const id of new Set<string>(v.ids)){const access=await userJobAccess(env,user.id,id);if(access.owned&&access.state==='completed')owned.push(id)}
      return reply({ids:owned})
    }
    const prefix=env.ACCOUNT_LEDGER_MODE==='sandbox'?'account:sandbox:v1':'account:v1'
    const object=env.ACCOUNT_ENTITLEMENTS.get(env.ACCOUNT_ENTITLEMENTS.idFromName(`${prefix}:${user.id.toLowerCase()}`))
    const response=await object.fetch(new Request('https://entitlements.internal/game-worlds',{method:request.method,...(raw===undefined?{}:{body:raw}),signal:AbortSignal.timeout(5000)}))
    return new Response(response.body,{status:response.status,headers:{'Content-Type':'application/json','Cache-Control':'private, no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff'}})
  }catch{return reply({error:'World storage is temporarily unavailable. Export your local draft; do not discard it.'},503)}
}
