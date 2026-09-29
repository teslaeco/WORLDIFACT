import { getVerifiedAccount, type AccountEnv } from './accounts.ts'
import { ACCOUNT_ID, type EntitlementEnv } from './entitlements.ts'
import { WORLD_ID, WORLD_LIMITS } from '../src/lib/privateWorld.ts'
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'private, no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff'}})
export async function privateWorldApi(request:Request,env:AccountEnv&EntitlementEnv,fetcher:typeof fetch=fetch):Promise<Response|null>{
  const url=new URL(request.url)
  if(url.pathname!=='/api/worlds'&&!url.pathname.startsWith('/api/worlds/'))return null
  if(url.search)return json({error:'Query-based owner selection is not supported.'},400)
  const suffix=url.pathname.slice('/api/worlds'.length).replace(/^\//,'')
  const action=!suffix?(request.method==='GET'?'list':request.method==='POST'?'save':null):suffix==='library'?(request.method==='POST'?'library':null):WORLD_ID.test(suffix)?({GET:'read',PUT:'save',DELETE:'remove'} as Record<string,string>)[request.method]:null
  if(!action)return json({error:'Unsupported world route or method.'},405)
  if(request.method!=='GET'&&request.headers.get('Origin')!==url.origin || request.headers.has('Origin')&&request.headers.get('Origin')!==url.origin)return json({error:'Same-origin world access required.'},403)
  try{
    const user=await getVerifiedAccount(request,env,fetcher)
    if(!user||!ACCOUNT_ID.test(user.id))return json({error:'Sign in to edit your own worlds.'},401)
    if(!env.ACCOUNT_ENTITLEMENTS||!env.ACCOUNT_LIMITER)return json({error:'Private world storage is unavailable.'},503)
    if(env.ACCOUNT_LEDGER_MODE!==undefined&&!['live','sandbox'].includes(env.ACCOUNT_LEDGER_MODE))return json({error:'Private world storage is unavailable.'},503)
    if(!(await env.ACCOUNT_LIMITER.limit({key:`world:${user.id}`})).success)return json({error:'Please wait before saving again. Your draft is preserved.'},429)
    let body:Record<string,unknown>={}
    if(request.method!=='GET'){
      if(!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'Use application/json.'},415)
      if(Number(request.headers.get('content-length'))>WORLD_LIMITS.bytes+512)return json({error:'World file is too large.'},413)
      const reader=request.body?.getReader();if(!reader)return json({error:'Missing world data.'},400)
      const chunks:Uint8Array[]=[];let size=0
      while(true){const item=await reader.read();if(item.done)break;size+=item.value.length;if(size>WORLD_LIMITS.bytes+512){await reader.cancel();return json({error:'World file is too large.'},413)}chunks.push(item.value)}
      const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length}
      try{body=JSON.parse(new TextDecoder().decode(bytes))}catch{return json({error:'Invalid JSON.'},400)}
      if(!body||Array.isArray(body)||typeof body!=='object'||Object.keys(body).some(key=>!['document','expectedRevision','ids'].includes(key)))return json({error:'Do not supply an owner or arbitrary operation.'},400)
    }
    const id=action==='save'&&!suffix?(body.document as {id?:unknown})?.id:suffix
    const prefix=env.ACCOUNT_LEDGER_MODE==='sandbox'?'account:sandbox:v1':'account:v1'
    // Identity comes ONLY from the verified session, never from client world data.
    const object=env.ACCOUNT_ENTITLEMENTS.get(env.ACCOUNT_ENTITLEMENTS.idFromName(`${prefix}:${user.id.toLowerCase()}`))
    const response=await object.fetch(new Request('https://entitlements.internal/private-worlds',{method:'POST',body:JSON.stringify({...body,action,id}),signal:AbortSignal.timeout(8000)}))
    if(!response.ok)return json({error:'Private world storage is unavailable. Keep your draft.'},503)
    const result=await response.json() as {ok?:boolean;code?:number}
    return json(result,result.ok?200:[400,404,409,413].includes(result.code??0)?result.code:503)
  }catch{return json({error:'Private world storage is temporarily unavailable. Keep your draft and try again.'},503)}
}
