/**
 * Public read-only transport for the original Astra GLB plus separately labeled
 * Blender geometry refinement. No credentials or customer/account resources.
 * Cloudflare static assets <=25 MiB; actual files split into <=18 MiB chunks.
 */
interface AssetBinding { fetch(request: Request): Promise<Response> }
interface Env { ASSETS: AssetBinding }
interface Part { path: string; bytes: number; sha256: string }
interface Entry { name: string; bytes: number; sha256: string; mime: string; parts: Part[] }
interface Manifest { revision: string; sourceJobId: string; downloads: Record<string, Entry> }
const allowed=new Set(['glb','fbx','obj','blend','mtl'])
const digest=/^[0-9a-f]{64}$/
const chunk=/^\/chunks\/(?:glb|fbx|obj|blend|mtl)-[0-9]{3}\.part$/
const respond=(error:string,status:number)=>Response.json({error},{status})
async function getManifest(request:Request,env:Env):Promise<Manifest>{
 const url=new URL('/downloads.json',request.url)
 const result=await env.ASSETS.fetch(new Request(url))
 if(!result.ok)throw Error('Missing static manifest')
 const m=await result.json() as Manifest
 if(!m || m.revision!=='worldifact-ecomech-ultra-chunked-v1' ||
   m.sourceJobId!=='6fa9be43-f371-4bcd-8fe7-7a3ea9967855' || !m.downloads)
   throw Error('Invalid staging manifest')
 return m
}
function valid(entry:Entry,key:string):boolean{
 if(!entry || !/^[A-Za-z0-9._-]{4,150}$/.test(entry.name) ||
    !Number.isSafeInteger(entry.bytes)||entry.bytes<1||entry.bytes>1024*1024*1024 ||
    typeof entry.mime!=='string'||!/^[a-z]+\/[a-z0-9.+-]+$/.test(entry.mime) ||
    !digest.test(entry.sha256)||!Array.isArray(entry.parts) ||
    entry.parts.length<1||entry.parts.length>64)return false
 let total=0
 for(const p of entry.parts){
   if(!p||!chunk.test(p.path)||!p.path.startsWith('/chunks/'+key+'-')||
      !Number.isSafeInteger(p.bytes)||p.bytes<1||p.bytes>18*1024*1024||
      !digest.test(p.sha256))return false
   total+=p.bytes
 }
 return total===entry.bytes
}
function rangeHeader(request:Request,total:number){
 const value=request.headers.get('Range')
 if(!value)return {start:0,end:total-1,partial:false}
 const m=/^bytes=(\d+)-(\d*)$/.exec(value)
 if(!m)return null
 const start=Number(m[1]),end=m[2]?Number(m[2]):total-1
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=total||end<start)return null
 return {start,end:Math.min(total-1,end),partial:true}
}
export default {
 async fetch(request:Request,env:Env):Promise<Response>{
  const path=new URL(request.url).pathname
  if(!path.startsWith('/downloads/'))return env.ASSETS.fetch(request)
  if(request.method!=='GET'&&request.method!=='HEAD')return respond('Method not allowed',405)
  const key=path.substring('/downloads/'.length)
  if(!allowed.has(key))return respond('Unknown test file',404)
  let manifest:Manifest
  try{manifest=await getManifest(request,env)}catch{return respond('Test source manifest not ready',503)}
  const file=manifest.downloads[key]
  if(!valid(file,key))return respond('Original binary chunks missing',503)
  const selected=rangeHeader(request,file.bytes)
  if(!selected)return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+file.bytes}})
  const headers=new Headers({
   'Content-Type':file.mime,
   'Content-Disposition':'attachment; filename="'+file.name+'"',
   'Content-Length':String(selected.end-selected.start+1),
   'Cache-Control':'public, max-age=3600, immutable',
   'Accept-Ranges':'bytes',
   'X-WORLDIFACT-Sha256':file.sha256,
   'X-WORLDIFACT-Provenance':'ASTRA-ORIGINAL-PLUS-BLENDER-DETAIL',
   'X-Content-Type-Options':'nosniff'
  })
  if(selected.partial)headers.set('Content-Range','bytes '+selected.start+'-'+selected.end+'/'+file.bytes)
  const status=selected.partial?206:200
  if(request.method==='HEAD')return new Response(null,{status,headers})
  let next=0,offset=0
  const stream=new ReadableStream<Uint8Array>({
   async pull(controller){
    while(next<file.parts.length){
     const segment=file.parts[next++]
     const begin=offset,finish=offset+segment.bytes-1
     offset+=segment.bytes
     if(finish<selected.start||begin>selected.end)continue
     try{
      const url=new URL(segment.path,request.url)
      const resp=await env.ASSETS.fetch(new Request(url))
      if(!resp.ok)throw Error('Unavailable immutable file chunk')
      const data=new Uint8Array(await resp.arrayBuffer())
      if(data.byteLength!==segment.bytes)throw Error('Original segment changed')
      const from=Math.max(0,selected.start-begin)
      const to=Math.min(data.byteLength,selected.end-begin+1)
      controller.enqueue(data.subarray(from,to))
      return
     }catch{controller.error(new Error('Original download temporarily unavailable'));return}
    }
    controller.close()
   }
  })
  return new Response(stream,{status,headers})
 }
}
