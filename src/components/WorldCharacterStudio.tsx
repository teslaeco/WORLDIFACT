import { useEffect, useMemo, useRef, useState } from 'react'
import { checkStudio, StudioCoordinator, type ReceiptStore, type SavedStudioJob } from '../lib/studioClient'
import { STUDIO_POLL_MS, studioPointsPending, validateStudioInput, type StudioJob, type StudioStatus } from '../lib/studioProtocol'
import { saveStudioModel } from '../lib/studioArchive'
import { listWorldAssets, storeWorldAsset, type WorldAsset } from '../lib/privateWorldAssets'
import { characterGenerationPrompt } from '../lib/editorTools'
import { useGenerationQuote } from '../lib/useGenerationQuote'
import { detailedUnavailable } from '../lib/detailedStudio'
import { STUDIO_PRICING, type StudioBudgetTier } from '../lib/studioPricing'
import { hasStudioBudgetConsent, studioBudgetFailureAdvice, studioBudgetSelection, studioTiersReady } from '../lib/studioTierSelection'
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
  const [saved,setSaved]=useState<SavedStudioJob|null>(null),[job,setJob]=useState<StudioJob|null>(null),[busy,setBusy]=useState(false),[retry,setRetry]=useState(0),[error,setError]=useState(''),[notice,setNotice]=useState(''),[status,setStatus]=useState<StudioStatus|null>(null),[files,setFiles]=useState<WorldAsset[]>([])
  const [budgetTier,setBudgetTier]=useState<StudioBudgetTier>('standard')
  const [acceptedBudgetRevision,setAcceptedBudgetRevision]=useState<object|null>(null)
  const tiersReady=studioTiersReady(status),selectedTier=tiersReady?budgetTier:undefined
  const prompt=characterGenerationPrompt(p.world)
  const draftBudgetRevision=useMemo(()=>({owner:p.owner,worldId:p.world.id,prompt,budgetTier,tiersReady,pricingRevision:status?.pricingRevision}),[p.owner,p.world.id,prompt,budgetTier,tiersReady,status?.pricingRevision])
  const budgetAccepted=hasStudioBudgetConsent(budgetTier,acceptedBudgetRevision,draftBudgetRevision)
  const selectedPoints=selectedTier?STUDIO_PRICING[selectedTier].points:250
  const accountQuote=useGenerationQuote('astra',busy,true,selectedTier),quote=accountQuote.quote
  const runtimeProblem=detailedUnavailable(status,0)
  const fundingBlocked=quote.state==='blocked'&&quote.reason==='PROVIDER_BUDGET_EXHAUSTED'
  const binding=useRef({worldId:p.world.id,characterSnapshot:''})
  const bindingKey=`worldifact-character-binding:v1:${p.owner}:${p.world.id}`
  async function refresh(){accountQuote.refresh();try{const value=await checkStudio();if(alive.current)setStatus(value)}catch{if(alive.current)setStatus(null)}}
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
      if(studioPointsPending(value)){setNotice(value.detail);accountQuote.refresh();return}
      if(value.reconciliationRequired){setNotice(value.detail);if(value.state==='succeeded'&&value.downloadAllowed){void loadResult(record,value);return}timer=setTimeout(poll,60_000);return}
      if(value.state==='succeeded'){void loadResult(record,value);return}
      if(terminal(value.state)){setNotice('The character job did not complete. The prior character and recovery receipt are preserved.');return}
    }catch(e){if(closed)return;failures++;setError(e instanceof Error?e.message:'Status check failed.');timer=setTimeout(poll,Math.min(120_000,5_000*(2**Math.min(failures,5))));return}
      timer=setTimeout(poll,STUDIO_POLL_MS)
    }timer=setTimeout(poll,800);return()=>{closed=true;if(timer)clearTimeout(timer)}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[saved?.receipt.id,retry])
  async function generate(){
    if(p.disabled||lock.current||!client.current||(saved&&!terminal(job?.state))||quote.state!=='credits'||runtimeProblem||(budgetTier==='extended'&&(!tiersReady||!budgetAccepted)))return
    lock.current=true;setBusy(true);setError('');const api=client.current,id=p.world.id,actor=p.owner
    binding.current={worldId:id,characterSnapshot:JSON.stringify(p.world.character)}
    try{const input=validateStudioInput({worldId:'ai-game-lab',prompt,purpose:'game',textureMaxSize:4096,photos:[],...(selectedTier?studioBudgetSelection(selectedTier,budgetAccepted):{})});const result=await api.start(input,record=>{if(alive.current&&latest.current.world.id===id&&latest.current.owner===actor){window.localStorage.setItem(bindingKey,JSON.stringify({...binding.current,jobId:record.receipt.id}));setSaved(record);setJob(null);setAcceptedBudgetRevision(null)}},'',true,quote.fundingSource);if(alive.current)setJob(result)}
    catch(e){if(alive.current)setError(e instanceof Error?e.message:'Generation did not confirm; recover the saved receipt.')}
    finally{lock.current=false;if(alive.current){setBusy(false);void refresh()}}
  }
  return <section className="world-character-studio" aria-label="Character studio">
    <span className="private-eyebrow">YOUR CHARACTER</span><h2>A character in your world</h2><p>Your procedural preview is visible in Edit and Play. Clothes, hair and colors follow supported description presets; it is not an AI-generated detailed mesh.</p>
    <button onClick={p.onFocus}>Focus character</button><label>Use a library GLB as character<select value={p.world.character.assetId??''} disabled={p.disabled||busy} onChange={e=>p.onSetAsset(e.target.value||null)}><option value="">Procedural preview · no AI cost</option>{files.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
    <details open><summary>Generate a detailed character here</summary><p>Astra → existing Codex runner → Blender MCP → your GLB. The existing account, job receipt and spend guards remain authoritative; no unmetered agent loop.</p>{!tiersReady&&budgetTier==='extended'&&<div role="status"><p>The selected 500-point budget is no longer available. Choose the standard budget explicitly to continue when it is available.</p><button disabled={busy||p.disabled} onClick={()=>{setBudgetTier('standard');setAcceptedBudgetRevision(null)}}>Use standard model budget · 250 points</button></div>}{tiersReady&&<fieldset disabled={busy||p.disabled}><legend>Detailed character budget</legend><label htmlFor="character-budget-tier">Points for one explicit attempt</label><select id="character-budget-tier" value={budgetTier} onChange={e=>{setBudgetTier(e.target.value as StudioBudgetTier);setAcceptedBudgetRevision(null)}}><option value="standard">Standard model budget · 250 points</option><option value="extended">Extended model budget · 500 points</option></select><p>Standard is the budget for one model, not your membership plan. Pro members can keep the 250-point budget. Higher complexity may need the 500-point budget. This is not a measurement of this character; a higher budget does not guarantee completion or quality.</p>{budgetTier==='extended'&&<label htmlFor="character-budget-consent"><input id="character-budget-consent" type="checkbox" checked={budgetAccepted} onChange={e=>setAcceptedBudgetRevision(e.target.checked?draftBudgetRevision:null)}/>I explicitly accept 500 points for one attempt with this character description.</label>}<p>No automatic upgrade, paid retry or additional debit. Editing the description requires a new 500-point acceptance.</p></fieldset>}<GenerationCostNotice model="astra" busy={busy} detailed budgetTier={selectedTier} accountQuote={accountQuote}/>{runtimeProblem&&<p role="status">{runtimeProblem}</p>}<button className="private-primary" type="button" disabled={fundingBlocked?p.disabled||busy||!accountQuote.canRefresh:p.disabled||busy||!client.current||quote.state!=='credits'||!!runtimeProblem||(budgetTier==='extended'&&(!tiersReady||!budgetAccepted))||!!saved&&!terminal(job?.state)} onClick={()=>{if(fundingBlocked){if(!p.disabled&&!busy&&accountQuote.canRefresh)void refresh();return}void generate()}}>{fundingBlocked?accountQuote.checking?'Checking generation funding…':'Check generation funding · no charge':busy?'Working on this character…':budgetTier==='extended'&&!tiersReady?'Review model budget availability':`Generate character · ${selectedPoints} points`}</button>{quote?.state!=='credits'&&<p className="private-fine">{quote?.message??'Checking detailed generation availability. No request has been bought.'}</p>}<button disabled={busy} onClick={()=>void refresh()}>Refresh availability</button></details>
    <p><a href="/account/generation-funding" target="_blank" rel="noopener noreferrer">Review held points and saved account request IDs</a></p>
    {saved&&<div className="private-proposal"><strong>Character job: {job?.state??'checking'}</strong><p>{job?.detail??'Receipt saved; waiting for server confirmation.'}</p><p>{(job?.pricing??saved.pricing)?`Original job: ${(job?.pricing??saved.pricing)!.points} points · ${(job?.pricing??saved.pricing)!.tier} model budget. Recovery does not change this price.`:'Original job price is retained by the server; recovery does not apply the next draft’s price.'}</p><button disabled={busy} onClick={()=>job?.state==='succeeded'?void loadResult(saved,job):setRetry(v=>v+1)}>Recover this character job · no new generation</button></div>}
    {status?.newJobPolicy==='legacy-usd175-v1'&&<p>New character models use 250 points on success and the original USD 1.75 API budget. A failed model can still incur API costs. Recovered jobs keep their saved terms.</p>}
    {studioBudgetFailureAdvice(job,tiersReady)&&<p>{studioBudgetFailureAdvice(job,tiersReady)}</p>}
    {notice&&<p role="status">{notice}</p>}{error&&<p className="private-error" role="alert">{error}</p>}
    <p className="private-fine">Generated results are checked as GLB before import. Static models do not become rigged merely by selecting them; existing animation clips are reused where present.</p>
  </section>
}
