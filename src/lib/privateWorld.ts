export const WORLD_SCHEMA = 1 as const
export const WORLD_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
export const WORLD_LIMITS = Object.freeze({ worlds: 8, entities: 48, terrain: 64, bytes: 65536, radius: 42 })
export type WorldControl = 'jump' | 'sprint' | 'interact'
export type EntityKind = 'tree' | 'rock' | 'cabin' | 'lamp' | 'crate' | 'asset'
export type WorldEntity = { id: string; kind: EntityKind; name: string; x: number; z: number; elevation: number; scale: number; rotation: number; color: string; assetId: string | null }
export type TerrainEdit = { id: string; x: number; z: number; radius: number; strength: number }
export type WorldCharacter = { description: string; outfit: string; hair: string; style: string; label: string; hairColor: string; outfitColor: string }
export type PrivateWorld = { schema: 1; id: string; name: string; character: WorldCharacter; entities: WorldEntity[]; terrain: TerrainEdit[]; controls: WorldControl[]; night: boolean }
export type SavedWorld = { document: PrivateWorld; revision: number; updatedAt: string }
const record = (v: unknown): Record<string, unknown> => { if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('Invalid world data.'); return v as Record<string, unknown> }
function keys(v: Record<string, unknown>, allowed: string[]) { if (Object.keys(v).some(k => !allowed.includes(k))) throw new Error('Unknown world field. Scripts, URLs and owner overrides are not accepted.') }
function text(v: unknown, max: number, min = 0) { if (typeof v !== 'string' || v.trim().length < min || v.length > max || /[\u0000-\u001f]/.test(v)) throw new Error('Invalid world text.'); return v.trim() }
function num(v: unknown, min: number, max: number) { if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw new Error('World value exceeds its limit.'); return v }
function id(v: unknown) { if (typeof v !== 'string' || !WORLD_ID.test(v)) throw new Error('Invalid world identifier.'); return v.toLowerCase() }
function color(v: unknown) { if (typeof v !== 'string' || !/^#[0-9a-f]{6}$/i.test(v)) throw new Error('Use a six-digit color.'); return v }
export function blankWorld(name = 'My new world'): PrivateWorld {
  return { schema: 1, id: crypto.randomUUID(), name, character: { description: '', outfit: '', hair: '', style: '', label: '', hairColor: '#453228', outfitColor: '#21b8a6' }, entities: [], terrain: [], controls: ['jump'], night: false }
}
export function validatePrivateWorld(input: unknown): PrivateWorld {
  const v = record(input); keys(v, ['schema','id','name','character','entities','terrain','controls','night'])
  if (v.schema !== 1 || typeof v.night !== 'boolean') throw new Error('Unsupported world schema.')
  const c = record(v.character); keys(c, ['description','outfit','hair','style','label','hairColor','outfitColor'])
  if (!Array.isArray(v.entities) || v.entities.length > WORLD_LIMITS.entities || !Array.isArray(v.terrain) || v.terrain.length > WORLD_LIMITS.terrain || !Array.isArray(v.controls) || v.controls.length > 3) throw new Error('World complexity limit reached.')
  const entities: WorldEntity[] = v.entities.map(raw => {
    const e = record(raw); keys(e, ['id','kind','name','x','z','elevation','scale','rotation','color','assetId'])
    if (!['tree','rock','cabin','lamp','crate','asset'].includes(String(e.kind))) throw new Error('Unsupported object kind.')
    if ((e.kind === 'asset') !== (typeof e.assetId === 'string')) throw new Error('Invalid model reference.')
    if (e.kind !== 'asset' && e.assetId !== null) throw new Error('Unexpected model reference.')
    return { id: id(e.id), kind: e.kind as EntityKind, name: text(e.name, 100, 1), x: num(e.x,-40,40), z: num(e.z,-40,40), elevation: num(e.elevation,0,20), scale: num(e.scale,0.1,8), rotation: num(e.rotation,-360,360), color: color(e.color), assetId: e.kind === 'asset' ? id(e.assetId) : null }
  })
  const terrain = v.terrain.map(raw => { const t = record(raw); keys(t,['id','x','z','radius','strength']); return { id: id(t.id), x: num(t.x,-40,40), z: num(t.z,-40,40), radius: num(t.radius,1,16), strength: num(t.strength,-8,8) } })
  if (new Set(entities.map(e => e.id)).size !== entities.length || new Set(terrain.map(t => t.id)).size !== terrain.length) throw new Error('Duplicate world object identifier.')
  const controls = v.controls.map(value => { if (!['jump','sprint','interact'].includes(String(value))) throw new Error('Unsupported game control.'); return value as WorldControl })
  if (new Set(controls).size !== controls.length) throw new Error('Duplicate game controls.')
  const result: PrivateWorld = { schema: 1, id: id(v.id), name: text(v.name,80,1), night: v.night,
    character: { description: text(c.description,800), outfit: text(c.outfit,160), hair: text(c.hair,100), style: text(c.style,100), label: text(c.label,40), hairColor: color(c.hairColor), outfitColor: color(c.outfitColor) }, entities, terrain, controls }
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > WORLD_LIMITS.bytes) throw new Error('World file is too large.')
  return result
}
export function riverCenter(z: number) { return Math.sin(z / 12) * 5 }
export function terrainHeight(x: number, z: number, edits: readonly TerrainEdit[]) {
  const distance = Math.abs(x - riverCenter(z))
  // Keep the river channel connected even when sculpting its banks.
  const bank = Math.min(1, Math.max(0,(distance - 2.2) / 2.8))
  let h = distance < 2.8 ? -0.9 + 0.9 * Math.pow(distance / 2.8, 2) : 0
  for (const edit of edits) { const d = Math.hypot(x-edit.x,z-edit.z)/edit.radius; if (d < 1) h += edit.strength * Math.pow(1-d*d,2) * bank }
  return Math.max(-9, Math.min(12,h))
}
export function newEntity(kind: EntityKind, x: number, z: number, assetId: string | null = null): WorldEntity {
  return { id: crypto.randomUUID(), kind, name: kind === 'asset' ? 'My model' : kind[0].toUpperCase()+kind.slice(1), x, z, elevation:0, scale:1, rotation:0, color: kind === 'tree' ? '#488f52' : '#b1c3b5', assetId }
}
export type LocalWorldCommand = { kind:'control'; control:WorldControl } | { kind:'night'; value:boolean } | { kind:'terrain'; strength:number } | { kind:'object'; object: Exclude<EntityKind,'asset'> }
export function parseWorldCommand(value: string): LocalWorldCommand | null {
  if (value.length > 500) return null
  const s = value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ł/g,'l').trim()
  // No eval, remote tools or arbitrary code. Unknown commands require an explicit edit.
  if (/^(add|enable|dodaj|wlacz).*(jump|skok)/.test(s)) return { kind:'control', control:'jump' }
  if (/^(add|enable|dodaj|wlacz).*(sprint|run|biega)/.test(s)) return { kind:'control', control:'sprint' }
  if (/^(add|enable|dodaj|wlacz).*(interact|interaction|interakc)/.test(s)) return { kind:'control', control:'interact' }
  if (/^(show|pokaz|wlacz).*(star|gwiazd|noc)/.test(s)) return { kind:'night', value:true }
  if (/^(show|pokaz|wlacz).*(day|dzien|slonce)/.test(s)) return { kind:'night', value:false }
  if (/^(dig|create|wykop|dodaj).*(valley|dolin)/.test(s)) return { kind:'terrain', strength:-3 }
  if (/^(add|raise|create|postaw|dodaj).*(mountain|hill|gor[eay]|gore)/.test(s)) return { kind:'terrain', strength:4 }
  for (const [term, kind] of [['tree|drzew','tree'],['rock|skale|kamien','rock'],['house|cabin|dom','cabin'],['lamp|swiatlo','lamp'],['crate|skrzyn','crate']] as const)
    if (new RegExp('^(add|place|postaw|dodaj).*('+term+')').test(s)) return { kind:'object', object:kind }
  return null
}
export function applyWorldCommand(world: PrivateWorld, command: LocalWorldCommand, point: { x:number; z:number }): PrivateWorld {
  let next = structuredClone(world)
  if (command.kind === 'control') next.controls = [...new Set([...next.controls, command.control])]
  if (command.kind === 'night') next.night = command.value
  if (command.kind === 'object') next.entities.push(newEntity(command.object,point.x,point.z))
  if (command.kind === 'terrain') next.terrain.push({ id:crypto.randomUUID(), ...point, radius:7, strength:command.strength })
  next = validatePrivateWorld(next); return next
}
