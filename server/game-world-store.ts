import { validateGameWorld, WORLD_ID, WORLD_LIMITS, type GameWorld } from '../src/lib/gameWorld.ts'
import type { EntitlementStorage } from './entitlements.ts'
const reply = (v: unknown,status=200) => Response.json(v,{status,headers:{'Cache-Control':'private, no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff'}})
const INDEX = 'game-worlds:index:v1'
export async function worldStore(request: Request, storage: EntitlementStorage, now: number): Promise<Response | null> {
  const path = new URL(request.url).pathname
  if (path !== '/game-worlds') return null
  if (request.method === 'GET') {
    return storage.transaction(async s => {
      const ids = await s.get<string[]>(INDEX) ?? []
      if (!Array.isArray(ids) || ids.length > WORLD_LIMITS.projects || !ids.every(id=>WORLD_ID.test(id))) throw new Error('Invalid world index')
      const worlds = await Promise.all(ids.map(id=>s.get<GameWorld>(`game-world:${id}`)))
      return reply({worlds:worlds.filter(Boolean).map(v=>validateGameWorld(v)),storage:'ACCOUNT_METADATA_DEVICE_MODELS'})
    })
  }
  if (request.method !== 'POST') return reply({error:'Use GET or POST.'},405)
  try {
    const raw=await request.text()
    if (new TextEncoder().encode(raw).length > WORLD_LIMITS.bytes+256) return reply({error:'World is too large.'},413)
    const input=JSON.parse(raw)
    if (!input || typeof input!=='object' || Object.keys(input).sort().join(',')!=='expectedRevision,world' || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision<0) return reply({error:'Invalid save.'},400)
    const world=validateGameWorld(input.world)
    if (world.revision!==input.expectedRevision) return reply({error:'Revision mismatch. Reload before saving.'},409)
    return await storage.transaction(async s=>{
      const ids=await s.get<string[]>(INDEX)??[]
      if (!Array.isArray(ids)||ids.length>WORLD_LIMITS.projects||!ids.every(id=>WORLD_ID.test(id))) throw new Error('Invalid world index')
      const prior=ids.includes(world.id)?await s.get<GameWorld>(`game-world:${world.id}`):undefined
      if ((!prior && input.expectedRevision!==0)||(prior && prior.revision!==input.expectedRevision)) return reply({error:'The saved world changed in another tab. Export your local version, then reload.'},409)
      if (!prior && ids.length>=WORLD_LIMITS.projects) return reply({error:'Eight cloud worlds are supported. Export a backup before starting another.'},409)
      const saved=validateGameWorld({...world,revision:(prior?.revision??0)+1,updatedAt:new Date(now).toISOString()})
      await s.put(`game-world:${world.id}`,saved)
      if (!prior) await s.put(INDEX,[...ids,world.id])
      return reply({world:saved,storage:'ACCOUNT_METADATA_DEVICE_MODELS'})
    })
  } catch { return reply({error:'World could not be saved. No billing or other world was changed.'},400) }
}
