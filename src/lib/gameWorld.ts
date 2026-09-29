import { KINDS, validateBlueprint, type AssetKind, type WorldBlueprint } from './blueprint.ts'

/** Portable DATA, never executable code. Owner identity is derived by the server. */
export const WORLD_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
export const WORLD_LIMITS = Object.freeze({ projects: 8, objects: 80, terrain: 64, bytes: 96_000, radius: 40, history: 30 })
export const CONTROL_ACTIONS = ['jump', 'fly', 'sprint', 'reset'] as const
export type ControlAction = typeof CONTROL_ACTIONS[number]
export type Point = { x: number; z: number }
export type TerrainEdit = Point & { radius: number; strength: number }
export type GameObject = Point & { id: string; name: string; kind: AssetKind | 'local-model'; assetId: string | null; y: number; scale: number; rotation: number; color: string }
export type GameCharacter = { name: string; description: string; outfit: string; lettering: string; hair: string; body: string; style: string; color: string }
export type GameWorld = {
  version: 1; id: string; name: string; revision: number; updatedAt: string;
  character: GameCharacter; playerModelId: string | null; objects: GameObject[];
  terrain: TerrainEdit[]; sky: 'day' | 'stars'; grass: 'balanced' | 'lush';
  controls: { action: ControlAction; label: string }[];
}
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const exact = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k))
const finite = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max
const text = (v: unknown, max: number, empty = false): v is string => typeof v === 'string' && (empty || !!v.trim()) && v.length <= max && !/[\u0000-\u0008\u000b-\u001f\u007f]/.test(v)
const color = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)
const fail = (): never => { throw new Error('Invalid world data. Only bounded game settings and local assets are accepted.') }
export function validateGameWorld(value: unknown): GameWorld {
  if (!record(value) || !exact(value, ['version','id','name','revision','updatedAt','character','playerModelId','objects','terrain','sky','grass','controls']) || value.version !== 1 || !text(value.id,36) || !WORLD_ID.test(value.id) || !text(value.name,80) || !Number.isSafeInteger(value.revision) || !finite(value.revision,0,1e9) || !text(value.updatedAt,30) || !Number.isFinite(Date.parse(value.updatedAt)) || !['day','stars'].includes(String(value.sky)) || !['balanced','lush'].includes(String(value.grass))) return fail()
  const c = value.character
  if (!record(c) || !exact(c,['name','description','outfit','lettering','hair','body','style','color']) || !text(c.name,60) || !text(c.description,1000,true) || !text(c.outfit,200,true) || !text(c.lettering,80,true) || !text(c.hair,100,true) || !text(c.body,100,true) || !text(c.style,100,true) || !color(c.color)) return fail()
  if (!Array.isArray(value.objects) || value.objects.length > WORLD_LIMITS.objects || !Array.isArray(value.terrain) || value.terrain.length > WORLD_LIMITS.terrain || !Array.isArray(value.controls) || value.controls.length > CONTROL_ACTIONS.length) return fail()
  const ids = new Set<string>(), assets = new Set<string>(), actions = new Set<string>()
  for (const o of value.objects) {
    if (!record(o) || !exact(o,['id','name','kind','assetId','x','y','z','scale','rotation','color']) || !text(o.id,36) || !WORLD_ID.test(o.id) || ids.has(o.id) || !text(o.name,80) || ![...KINDS,'local-model'].includes(String(o.kind)) || !finite(o.x,-40,40) || !finite(o.z,-40,40) || !finite(o.y,-5,30) || !finite(o.scale,.1,8) || !finite(o.rotation,0,360) || !color(o.color)) return fail()
    if (o.kind === 'local-model') { if (!text(o.assetId,36) || !WORLD_ID.test(o.assetId)) return fail(); assets.add(o.assetId) }
    else if (o.assetId !== null) return fail()
    ids.add(o.id)
  }
  if (assets.size > 16 || (value.playerModelId !== null && (typeof value.playerModelId !== 'string' || !ids.has(value.playerModelId)))) return fail()
  for (const t of value.terrain) if (!record(t) || !exact(t,['x','z','radius','strength']) || !finite(t.x,-40,40) || !finite(t.z,-40,40) || !finite(t.radius,2,14) || !finite(t.strength,-8,8)) return fail()
  for (const button of value.controls) {
    if (!record(button) || !exact(button,['action','label']) || !CONTROL_ACTIONS.includes(button.action as ControlAction) || !text(button.label,30) || actions.has(String(button.action))) return fail()
    actions.add(String(button.action))
  }
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > WORLD_LIMITS.bytes) return fail()
  return structuredClone(value) as unknown as GameWorld
}
export function newGameWorld(name: string, character?: Partial<GameCharacter>): GameWorld {
  return validateGameWorld({ version:1, id:crypto.randomUUID(), name:name.trim(), revision:0, updatedAt:new Date().toISOString(),
    character:{ name:'Explorer',description:'',outfit:'Comfortable exploration clothes',lettering:'',hair:'Brown',body:'Balanced',style:'Stylized',color:'#67dcc0',...character },
    playerModelId:null, objects:[],terrain:[],sky:'day',grass:'balanced',controls:[] })
}
export const riverCenter = (z: number) => 6 * Math.sin(z * .052) + 2 * Math.sin(z * .12)
export function groundHeight(x: number, z: number, edits: readonly TerrainEdit[] = []) {
  const distance = Math.abs(x - riverCenter(z))
  let h = distance < 2.8 ? -.95 + .18 * distance : .07 + .13 * Math.sin(x * .12) * Math.cos(z * .09)
  if (distance >= 2.8 && distance < 4.5) h = -.5 + (distance - 2.8) / 1.7 * .58
  for (const t of edits) h += t.strength * Math.exp(-((x-t.x)**2+(z-t.z)**2)/(t.radius*t.radius*.5))
  return Math.max(-9,Math.min(16,h))
}
export function addWorldObject(world: GameWorld, kind: GameObject['kind'], point: Point, assetId: string | null = null, name = kind as string): GameWorld {
  return validateGameWorld({ ...world, objects:[...world.objects,{id:crypto.randomUUID(),name,kind,assetId,x:point.x,z:point.z,y:0,scale:1,rotation:0,color:'#8ac9a0'}] })
}
export function mergeWorldBlueprint(world: GameWorld, value: WorldBlueprint): GameWorld {
  const blueprint = validateBlueprint(value)
  return validateGameWorld({ ...world, objects:[...world.objects,...blueprint.objects.map(o => ({...o,id:crypto.randomUUID(),assetId:null,y:0}))] })
}
export type AssistantProposal = { label: string; command: 'hill'|'valley'|'stars'|'day'|'grass'|'control'|'template'; action?: ControlAction; kind?: AssetKind }
/** Explicit local command vocabulary. Unsupported requests never execute arbitrary text. */
export function proposeWorldCommand(input: string): AssistantProposal | null {
  if (!text(input,1000)) return null
  const s = input.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ł/g,'l')
  if (/\b(gwiazdy|gwiazd|stars|night|noc|kosmos)\b/.test(s)) return {label:'Show stars and night sky',command:'stars'}
  if (/\b(day|dzien|slonce|sun)\b/.test(s)) return {label:'Restore daylight',command:'day'}
  if (/\b(doline|dolina|valley|dig|wykop)\b/.test(s)) return {label:'Dig a valley at the selected point',command:'valley'}
  if (/\b(gore|gora|mountain|hill)\b/.test(s)) return {label:'Raise a mountain at the selected point',command:'hill'}
  if (/\b(trawa|trawe|grass)\b/.test(s)) return {label:'Use lush grass within the device limit',command:'grass'}
  for (const [action,pattern] of [['jump',/\b(jump|skok|skoku|skakanie)\b/],['fly',/\b(fly|flight|latanie|latania|lec)\b/],['sprint',/\b(sprint|run|bieg|bieganie)\b/],['reset',/\b(reset|respawn|odrodzenie)\b/]] as const)
    if (pattern.test(s)) return {label:`Add a working ${action} button`,command:'control',action}
  for (const [kind,pattern] of [['tree',/\b(tree|drzewo|drzewka)\b/],['rock',/\b(rock|skala|kamien)\b/],['habitat',/\b(house|habitat|dom|budynek)\b/],['solar-array',/\b(solar|panel|panele|fotowoltaika)\b/],['mcc-cabinet',/\b(mcc|cabinet|szafa)\b/],['rover',/\b(rover|lazik|pojazd)\b/]] as const)
    if (pattern.test(s)) return {label:`Place a ${kind} at the selected point`,command:'template',kind}
  return null
}
export function applyWorldProposal(world: GameWorld, proposal: AssistantProposal, point: Point): GameWorld {
  if (proposal.command === 'template' && proposal.kind && KINDS.includes(proposal.kind)) return addWorldObject(world,proposal.kind,point)
  if (proposal.command === 'control' && proposal.action && CONTROL_ACTIONS.includes(proposal.action)) return validateGameWorld({...world,controls:[...world.controls.filter(c=>c.action!==proposal.action),{action:proposal.action,label:proposal.action[0].toUpperCase()+proposal.action.slice(1)}]})
  if (proposal.command === 'stars' || proposal.command === 'day') return validateGameWorld({...world,sky:proposal.command === 'stars'?'stars':'day'})
  if (proposal.command === 'grass') return validateGameWorld({...world,grass:'lush'})
  if (proposal.command === 'hill' || proposal.command === 'valley') return validateGameWorld({...world,terrain:[...world.terrain,{...point,radius:7,strength:proposal.command==='hill'?4:-3}]})
  throw new Error('Unsupported editor action.')
}
export function characterPrompt(c: GameCharacter) {
  return `Create a game character: ${c.name}. Appearance: ${c.description}. Outfit: ${c.outfit}. Lettering: ${c.lettering || 'none'}. Hair: ${c.hair}. Silhouette: ${c.body}. Style: ${c.style}. Main color: ${c.color}. Full body, neutral standing pose, separate limbs, clean materials. GAME asset only; no manufacturing approval.`.slice(0,2000)
}
export const GAME_TUTORIAL = [
  {tab:'world',title:'1. Name your world',text:'New game creates YOUR empty meadow and river, not the shared portal world. Describe your character; the first mannequin is a local preview, not an AI generation.'},
  {tab:'create',title:'2. Create a 3D model',text:'Open Create. Describe a scene with Luna or Sol and check its point cost before sending. For a detailed character or image-based model, open AI Shop. No API request runs when you move the camera.'},
  {tab:'library',title:'3. Bring your models',text:'Open Library, refresh your owned completed models or import a GLB you own. Select Add, then tap a ground point to place it. Model files stay on this device; world settings can be saved to your account.'},
  {tab:'terrain',title:'4. Shape and play',text:'Tap a point, raise a mountain or dig a valley. Select an object to move, turn, resize or use it as your player. Undo is free. Play tests movement with keyboard or the touch controls.'},
  {tab:'assistant',title:'5. Tell the assistant',text:'Try “add jump button”, “show stars”, or “wykop dolinę”. Review the proposed action, then apply it. The local assistant never runs arbitrary code or launches paid agents. Save your world and export a backup.'},
] as const
