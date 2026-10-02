import { useEffect, useRef, useState } from 'react'
import { StudioCoordinator, type ReceiptStore, type SavedStudioJob } from '../lib/studioClient'
import { STUDIO_POLL_MS, validateStudioInput, type StudioJob } from '../lib/studioProtocol'
import { saveStudioModel } from '../lib/studioArchive'
import { listWorldAssets, storeWorldAsset, type WorldAsset } from '../lib/privateWorldAssets'
import { characterGenerationPrompt } from '../lib/editorTools'
import { quoteGeneration, type GenerationQuote } from '../lib/generationQuote'
import type { PrivateWorld } from '../lib/privateWorld'
import GenerationCostNotice from './GenerationCostNotice'

export function characterReceiptStore(storage:ReceiptStore,owner:string,worldId:string):ReceiptStore {
  const prefix=`worldifact-character:v2:${owner.toLowerCase()}:${worldId}:`
  return {getItem:key=>storage.getItem(prefix+key),setItem:(key,value)=>storage.setItem(prefix+key,value),removeItem:key=>storage.removeItem(prefix+key)}
}
type Props={owner:string;world:PrivateWorld;disabled:boolean;onReady:(worldId:string,characterSnapshot:string,asset:WorldAsset)=>void;onSetAsset:(id:string|null)=>void;onFocus:()=>void}
const terminal=(state?:string)=>['succeeded','failed','cancelled'].includes(state??'')
export default function WorldCharacterStudio(p:Props){
  const latest=useRef(p);latest.current=p
  const client=useRef<StudioCoordinator|null>(null),alive=useRef(false),lock=useRef(false)
  const [saved,setSaved]=useState<SavedStudioJob|null>(null),[job,setJob]=useState<StudioJob|null>(null),[busy,setBusy]=useState(false),[retry,setRetry]=useState(0),[error,setError]=useState(''),[notice,setNotice]=useState(''),[quote,setQuote]=useState<GenerationQuote|null>(null),[files,setFiles]=useState<WorldAsset[]>([])
  const binding=useRef({worldId:p.world.id,characterSnapshot:''})
  const bindingKey=`worldifact-character-binding:v1:${p.owner}:${p.world.id}`
  async function refresh(){try{const [a,b]=await Promise.all([fetch('/api/account/entitlements',{cache:'no-store',signal:AbortSignal.timeout(15000)}),fetch('/api/billing/status',{cache:'no-store',signal:AbortSignal.timeout(15000)})]);if(!a.ok||!b.ok)throw new Error('Account availability could not be confirmed.');const q=quoteGeneration('astra',await a.json(),await b.json(),true,true);if(alive.current)setQuote(q)}catch{if(alive.current)setQuote(null)}}
  useEffect(()=>{alive.current=true;let closed=false;try{client.current=new StudioCoordinator(characterReceiptStore(window.localStorage,p.owner,p.world.id));const restored=client.current.restore();setSaved(restored);if(restored){try{const b=JSON.parse(window.localStorage.getItem(bindingKey)??'null');if(b?.jobId===restored.receipt.id&&b.worldId===p.world.id&&typeof b.characterSnapshot==='string')binding.current=b}catch{/* No speculative automatic adoption. */}}if(restored)setNotice('An existing character job was recovered. Checking it does not buy another generation.')}catch(e){setError(e instanceof Error?e.message:'Recovery storage is unavailable.')}
    void refresh();void listWorldAssets(p.owner).then(v=>{if(!closed)setFiles(v)}).catch(()=>{})
    return()=>{closed=true;alive.current=false;client.current=null}
    // Component is keyed by owner and world; recovery never submits a model request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[p.owner,p.world.id])
  async function loadResult(record:SavedStudioJob,value:StudioJob){
    if(lock.current||!client.current)return
    if(value.downloadAllowed===false){setNotice('The completed character is preserved. This account cannot download it yet.');return}
    lock.current=true;setBusy(true)
    const actor=p.owner,id=p.world.id,api=client.current,captured={...binding.current}
    try{const blob=await api.artifact('model',record);const asset=await storeWorldAsset(actor,'Character · '+p.world.name,blob);await saveStudioModel(record,blob)
      if(!alive.current||latest.current.owner!==actor||latest.current.world.id!==id)return
      setFiles(await listWorldAssets(actor));setNotice('The actual generated GLB is in your library. Original files are preserved.');latest.current.onReady(captured.worldId,captured.characterSnapshot,asset)
    }catch(e){if(alive.current)setError(e instanceof Error?e.message:'The model could not be loaded. Recover this same job; do not generate again.')}
    finally{lock.current=false;if(alive.current)setBusy(false)}
  }
  useEffect(()=>{
    if(!saved||!client.current)return
    const api=client.current,record=saved;let closed=false,failures=0,timer:ReturnType<typeof setTimeout>|undefined
    async function poll(){if(closed)return;if(lock.current){timer=setTimeout(poll,STUDIO_POLL_MS);return}try{const value=await api.poll(record);if(closed)return;setJob(value);setError('');failures=0
      if(value.reconciliationRequired){setNotice(value.detail);if(value.state==='succeeded'&&value.downloadAllowed){void loadResult(record,value);return}timer=setTimeout(poll,60_000);return}
      if(value.state==='succeeded'){void loadResult(record,value);return}
      if(terminal(value.state)){setNotice('The character job did not complete. The prior character and recovery receipt are preserved.');return}
    }catch(e){if(closed)return;failures++;setError(e instanceof Error?e.message:'Status check failed.');timer=setTimeout(poll,Math.min(120_000,5_000*(2**Math.min(failures,5))));return}
      timer=setTimeout(poll,STUDIO_POLL_MS)
    }timer=setTimeout(poll,800);return()=>{closed=true;if(timer)clearTimeout(timer)}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[saved?.receipt.id,retry])
  async function generate(){
    if(p.disabled||lock.current||!client.current||(saved&&!terminal(job?.state))||quote?.state!=='credits')return
    lock.current=true;setBusy(true);setError('');const api=client.current,id=p.world.id,actor=p.owner
    binding.current={worldId:id,characterSnapshot:JSON.stringify(p.world.character)}
    try{const input=validateStudioInput({worldId:'ai-game-lab',prompt:characterGenerationPrompt(p.world),purpose:'game',textureMaxSize:4096,photos:[]});const result=await api.start(input,record=>{if(alive.current&&latest.current.world.id===id&&latest.current.owner===actor){window.localStorage.setItem(bindingKey,JSON.stringify({...binding.current,jobId:record.receipt.id}));setSaved(record);setJob(null)}},'',true);if(alive.current)setJob(result)}
    catch(e){if(alive.current)setError(e instanceof Error?e.message:'Generation did not confirm; recover the saved receipt.')}
    finally{lock.current=false;if(alive.current){setBusy(false);void refresh()}}
  }
  return <section className="world-character-studio" aria-label="Character studio">
    <span className="private-eyebrow">YOUR CHARACTER</span><h2>A character in your world</h2><p>Your procedural preview is visible in Edit and Play. Clothes, hair and colors follow supported description presets; it is not an AI-generated detailed mesh.</p>
    <button onClick={p.onFocus}>Focus character</button><label>Use a library GLB as character<select value={p.world.character.assetId??''} disabled={p.disabled||busy} onChange={e=>p.onSetAsset(e.target.value||null)}><option value="">Procedural preview · no AI cost</option>{files.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
    <details open><summary>Generate a detailed character here</summary><p>Astra → existing Codex runner → Blender MCP → your GLB. The existing account, job receipt and spend guards remain authoritative; no unmetered agent loop.</p><GenerationCostNotice model="astra" busy={busy} detailed/><button className="private-primary" disabled={p.disabled||busy||!client.current||quote?.state!=='credits'||!!saved&&!terminal(job?.state)} onClick={()=>void generate()}>{busy?'Working on this character…':'Generate character · 250 points'}</button>{quote?.state!=='credits'&&<p className="private-fine">{quote?.message??'Checking detailed generation availability. No request has been bought.'}</p>}<button disabled={busy} onClick={()=>void refresh()}>Refresh availability</button></details>
    {saved&&<div className="private-proposal"><strong>Character job: {job?.state??'checking'}</strong><p>{job?.detail??'Receipt saved; waiting for server confirmation.'}</p><button disabled={busy} onClick={()=>job?.state==='succeeded'?void loadResult(saved,job):setRetry(v=>v+1)}>Recover this character job · no new generation</button></div>}
    {notice&&<p role="status">{notice}</p>}{error&&<p className="private-error" role="alert">{error}</p>}
    <p className="private-fine">Generated results are checked as GLB before import. Static models do not become rigged merely by selecting them; existing animation clips are reused where present.</p>
  </section>
}
