import { WORLD_ID } from './gameWorld.ts'
const KEY='worldifact-game-character-brief:v1'
export function storeGameBrief(owner:string,prompt:string){if(!WORLD_ID.test(owner)||!prompt.trim()||prompt.length>2000)throw new Error('Invalid character brief.');sessionStorage.setItem(KEY,JSON.stringify({owner,prompt,at:Date.now()}))}
export function takeGameBrief(owner:string):string|null{try{const raw=sessionStorage.getItem(KEY);if(!raw||raw.length>4096)return null;const v=JSON.parse(raw);if(v.owner!==owner||typeof v.prompt!=='string'||v.prompt.length>2000||!Number.isFinite(v.at)||v.at>Date.now()||Date.now()-v.at>3600000)return null;sessionStorage.removeItem(KEY);return v.prompt}catch{return null}}
