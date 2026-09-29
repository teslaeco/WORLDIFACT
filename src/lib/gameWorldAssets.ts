import { inspectGLB } from './glb.ts'
import { WORLD_ID } from './gameWorld.ts'
export type LocalGameAsset={id:string;name:string;sha256:string;bytes:number;triangles:number}
const MAX_BYTES=64*1024*1024, TOTAL_BYTES=192*1024*1024
function open(owner:string):Promise<IDBDatabase>{
  if(!WORLD_ID.test(owner))return Promise.reject(new Error('A verified account is required.'))
  return new Promise((resolve,reject)=>{const r=indexedDB.open(`worldifact-game-assets-${owner.toLowerCase()}`,1);r.onupgradeneeded=()=>r.result.createObjectStore('assets',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=r.onblocked=()=>reject(new Error('Local model library is unavailable. Keep your original files.'))})
}
export async function gameAssets(owner:string):Promise<LocalGameAsset[]>{const db=await open(owner);try{return await new Promise((resolve,reject)=>{const r=db.transaction('assets').objectStore('assets').getAll();r.onsuccess=()=>resolve(r.result.map(({blob:_blob,...meta})=>meta));r.onerror=()=>reject(new Error('Library unavailable.'))})}finally{db.close()}}
export async function putGameAsset(owner:string,name:string,blob:Blob):Promise<LocalGameAsset>{
  if(blob.size<20||blob.size>MAX_BYTES)throw new Error('Choose a complete GLB up to 64 MB.')
  const bytes=await blob.arrayBuffer(),report=inspectGLB(bytes)
  if(report.triangles<1||report.triangles>1_500_000||report.meshCount>6000)throw new Error('The model exceeds the mobile editor geometry limit.')
  const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('')
  const entry={id:crypto.randomUUID(),name:name.trim().slice(0,80)||'My model',sha256,bytes:blob.size,triangles:report.triangles}
  const db=await open(owner)
  try{return await new Promise((resolve,reject)=>{const tx=db.transaction('assets','readwrite'),store=tx.objectStore('assets'),r=store.getAll();let result=entry,reason='Local storage is full. No original was removed.'
    r.onsuccess=()=>{const same=r.result.find(v=>v.sha256===sha256);if(same){const {blob:_blob,...meta}=same;result=meta;return}if(r.result.length>=32||r.result.reduce((sum,v)=>sum+v.bytes,0)+blob.size>TOTAL_BYTES){reason='Device library limit reached (32 models / 192 MB). Keep your own backups.';tx.abort();return}store.add({...entry,blob})}
    tx.oncomplete=()=>resolve(result);tx.onerror=tx.onabort=()=>reject(new Error(reason))})}finally{db.close()}
}
export async function readGameAsset(owner:string,id:string):Promise<Blob>{
  if(!WORLD_ID.test(id))throw new Error('Invalid local model ID.')
  const db=await open(owner)
  try{return await new Promise((resolve,reject)=>{const r=db.transaction('assets').objectStore('assets').get(id);r.onsuccess=()=>r.result?.blob instanceof Blob?resolve(r.result.blob):reject(new Error('This model is stored on a different device. Import its original GLB here.'));r.onerror=()=>reject(new Error('Model file unavailable.'))})}finally{db.close()}
}
