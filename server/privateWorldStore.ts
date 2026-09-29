import { validatePrivateWorld, WORLD_ID, WORLD_LIMITS, type SavedWorld } from '../src/lib/privateWorld.ts'
import type { EntitlementStorage } from './entitlements.ts'
const json = (body:unknown) => Response.json(body, { headers:{'Cache-Control':'private, no-store'} })
const fail = (code:number,error:string) => json({ok:false,code,error})
/** Internal only, dispatched INSIDE the verified account's existing Durable Object. */
export async function privateWorldStore(request:Request, storage:EntitlementStorage, now:number):Promise<Response> {
  let input: Record<string,unknown>
  try {
    if (Number(request.headers.get('content-length')) > WORLD_LIMITS.bytes+512) return fail(413,'World is too large.')
    const reader = request.body?.getReader(); if (!reader) return fail(400,'World data is missing.')
    const chunks: Uint8Array[]=[]; let size=0
    while (true) { const item=await reader.read(); if(item.done) break; size+=item.value.byteLength; if(size>WORLD_LIMITS.bytes+512){await reader.cancel(); return fail(413,'World is too large.')} chunks.push(item.value) }
    const bytes=new Uint8Array(size); let offset=0; for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
    input=JSON.parse(new TextDecoder().decode(bytes))
    if(!input||Array.isArray(input)||typeof input!=='object'||Object.keys(input).some(k=>!['action','id','document','expectedRevision','ids'].includes(k))) return fail(400,'Invalid world request.')
  } catch { return fail(400,'Invalid world JSON.') }
  try {
    const indexKey='private-world-index:v1'
    if(input.action==='library') {
      if(!Array.isArray(input.ids)||input.ids.length>60||input.ids.some(id=>typeof id!=='string'||!WORLD_ID.test(id)))return fail(400,'Invalid library selection.')
      const sub=await storage.get<{active:boolean;until:number}>('subscription')
      const held=await storage.get<boolean>('billingHold')===true || (await storage.get<number>('balance')??0)<0
      const allowed:string[]=[]
      for(const id of input.ids as string[]) {
        const job=await storage.get<{state:string;profile:string}>(`job:${id}`)
        if(!held && job?.state==='completed' && (job.profile==='fast'||sub?.active&&sub.until>now)) allowed.push(id)
      }
      return json({ok:true,ids:allowed})
    }
    if(input.action==='list') {
      const ids=await storage.get<string[]>(indexKey)??[]
      const entries=[]
      for(const id of ids){const item=await storage.get<SavedWorld|null>(`private-world:${id}`); if(item) entries.push({id,name:item.document.name,revision:item.revision,updatedAt:item.updatedAt})}
      return json({ok:true,worlds:entries})
    }
    if(typeof input.id!=='string'||!WORLD_ID.test(input.id))return fail(400,'Invalid world identifier.')
    const id=input.id.toLowerCase(), key=`private-world:${id}`
    if(input.action==='read') {const world=await storage.get<SavedWorld|null>(key);return world?json({ok:true,...world}):fail(404,'World not found in your account.')}
    if(!['save','remove'].includes(String(input.action)))return fail(400,'Unsupported world action.')
    if(!Number.isSafeInteger(input.expectedRevision)||Number(input.expectedRevision)<0)return fail(400,'A world revision is required.')
    const document=input.action==='save'?validatePrivateWorld(input.document):null
    if(document && document.id!==id)return fail(400,'World identifier mismatch.')
    return await storage.transaction(async tx=>{
      const previous=await tx.get<SavedWorld|null>(key)
      const known=await tx.get<number>(`private-world-revision:${id}`)??previous?.revision??0
      if(input.expectedRevision!==known)return fail(409,'This world changed in another tab. Reload before saving; your draft is preserved.')
      if(input.action==='remove'&&!previous)return fail(404,'World not found in your account.')
      let ids=await tx.get<string[]>(indexKey)??[]
      if(!ids.includes(id)&&document&&ids.length>=WORLD_LIMITS.worlds)return fail(409,'Your eight-world storage limit is reached. Export or remove a world first.')
      const revision=known+1
      const next=document?{document,revision,updatedAt:new Date(now).toISOString()}:null
      await tx.put(key,next);await tx.put(`private-world-revision:${id}`,revision)
      ids=document?[...new Set([...ids,id])]:ids.filter(value=>value!==id)
      await tx.put(indexKey,ids)
      return json({ok:true,...(next??{removed:true,revision})})
    })
  }catch(error){return fail(400,error instanceof Error?error.message:'World validation failed.')}
}
