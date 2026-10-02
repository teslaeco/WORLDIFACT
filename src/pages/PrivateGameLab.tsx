import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAccount } from '../lib/account'
import { applyWorldCommand, blankWorld, newEntity, parseWorldCommand, validatePrivateWorld, WORLD_LIMITS, worldAssetName, type EntityKind, type LocalWorldCommand, type PrivateWorld, type SavedWorld, type WorldCharacter, type WorldControl } from '../lib/privateWorld'
import { listStudioModels, readStudioModel, STUDIO_ARCHIVE_EVENT, STUDIO_ARCHIVE_SIGNAL_KEY, type StudioArchiveEntry } from '../lib/studioArchive'
import { mergeGameLabArchive } from '../lib/gameLabLibrary'
import { listWorldAssets, storeWorldAsset, type WorldAsset } from '../lib/privateWorldAssets'
import EighteenCrystal from '../components/EighteenCrystal'
import GenerationCostNotice from '../components/GenerationCostNotice'
import { validateGenerationResult, type GenerationResult } from '../lib/blueprint'
import { MODEL_CATALOG, type DraftModel } from '../lib/modelCatalog'
import WorldSelectionToolbar from '../components/WorldSelectionToolbar'
import WorldCharacterStudio from '../components/WorldCharacterStudio'
import WorldCodexPanel from '../components/WorldCodexPanel'
import { transformEntity, type TransformMode } from '../lib/editorTools'
import './PrivateGameLab.css'
import './EditorPolish.css'
const Canvas=lazy(()=>import('../components/PrivateWorldCanvas'))
type WorldSummary={id:string;name:string;revision:number;updatedAt:string}
type GameLabArchiveEntry=StudioArchiveEntry&{accountVerified:boolean}
type Tool='select'|'place'|'mountain'|'valley'
const STEPS=[
  {title:'1 · Name your world',text:'Choose New game. Name the world and describe the character: outfit, hair, colors, style and label. These descriptions are saved without an AI call. The preview character is a local placeholder.'},
  {title:'2 · Create a 3D model',text:'Open Create 3D model to use AI Shop. Choose Luna, Sol or Astra and review the points before generating. An AI request is never started by entering this editor.'},
  {title:'3 · Add a saved model',text:'In Library, choose an owned saved GLB or import your own embedded GLB. Choose Add to world to place it at the marker immediately. Select the object to move, rotate or scale it. Model files stay on this device; their placement is saved to your account.'},
  {title:'4 · Shape and control',text:'Tap Mountain or Valley, then tap the ground. Undo is available. Tell the local assistant “add jump button”, “add sprint” or “show stars”; review its proposal and Apply. These edits cost zero API credits.'},
  {title:'5 · Play and save',text:'Press Play to test WASD / arrows and touch controls. Stop returns to the editor. Save world stores only your account’s world. Export JSON keeps a backup; original GLB files must be backed up separately.'},
]
function downloadJSON(value:unknown,name:string){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000)}
async function api(path:string,method='GET',body?:unknown,signal?:AbortSignal){const r=await fetch(path,{method,cache:'no-store',redirect:'error',headers:body===undefined?{}:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal});if(!r.headers.get('content-type')?.includes('application/json'))throw new Error('The server did not confirm this operation.');const data=await r.json();if(!r.ok||data.ok===false)throw new Error(data.error||'Operation failed; your draft is preserved.');return data}
export default function PrivateGameLab(){
  const {user,loading}=useAccount(),owner=user?.id??null,ownerRef=useRef(owner);ownerRef.current=owner
  const [emptyWorld]=useState<PrivateWorld>(()=>blankWorld())
  const [world,setWorld]=useState<PrivateWorld>(()=>blankWorld()),worldRef=useRef(world);worldRef.current=world
  const [ownedBy,setOwnedBy]=useState<string|null>(null),[revision,setRevision]=useState(0),revisionRef=useRef(0)
  const [worlds,setWorlds]=useState<WorldSummary[]>([]),[assets,setAssets]=useState<WorldAsset[]>([]),[gallery,setGallery]=useState<GameLabArchiveEntry[]>([])
  const [selected,setSelected]=useState<string|null>(null),[point,setPoint]=useState({x:-8,z:0}),[tool,setTool]=useState<Tool>('select'),[radius,setRadius]=useState(7)
  const [kind,setKind]=useState<EntityKind>('tree'),[assetId,setAssetId]=useState<string|null>(null)
  const [playing,setPlaying]=useState(false),[message,setMessage]=useState('A fresh meadow and river. No shared portal-world assets are loaded.'),[error,setError]=useState('')
  const [dirty,setDirty]=useState(false),[saving,setSaving]=useState(false),saveLock=useRef(false),[fileBusy,setFileBusy]=useState(false),fileOperation=useRef<symbol|null>(null),libraryRequest=useRef(0),worldLoad=useRef(0)
  const history=useRef<PrivateWorld[]>([]),future=useRef<PrivateWorld[]>([]),sequence=useRef(0),[historyTick,setHistoryTick]=useState(0)
  const [newGame,setNewGame]=useState(true),[newStep,setNewStep]=useState(0),[name,setName]=useState(''),[character,setCharacter]=useState<WorldCharacter>(()=>blankWorld().character)
  const [tutorial,setTutorial]=useState<number|null>(null),[tab,setTab]=useState<'build'|'library'|'assistant'|'character'>('build')
  const [command,setCommand]=useState(''),[proposal,setProposal]=useState<{worldId:string;sequence:number;command:LocalWorldCommand;point:{x:number;z:number}}|null>(null)
  const [aiModel,setAiModel]=useState<DraftModel>('luna'),[aiPrompt,setAiPrompt]=useState(''),[aiBusy,setAiBusy]=useState(false),aiLock=useRef(false),aiAbort=useRef<AbortController|null>(null)
  const [aiResult,setAiResult]=useState<{worldId:string;sequence:number;result:GenerationResult}|null>(null)
  const [transformMode,setTransformMode]=useState<TransformMode>('select'),[snap,setSnap]=useState(0),[focusVersion,setFocusVersion]=useState(0),[focusCharacterVersion,setFocusCharacterVersion]=useState(0)
  const canEdit=!!owner&&ownedBy===owner&&!newGame&&!loading
  const selectedEntity=world.entities.find(e=>e.id===selected)
  useEffect(()=>{
    const controller=new AbortController();aiAbort.current?.abort();fileOperation.current=null;libraryRequest.current++;worldLoad.current++;setFileBusy(false);setNewStep(0);setName('');setCharacter(blankWorld().character);setSelected(null);setAssetId(null);setKind('tree');setTool('select');sequence.current++;setWorld(blankWorld());setOwnedBy(owner);setRevision(0);revisionRef.current=0;setDirty(false);setAssets([]);setGallery([]);setWorlds([]);setNewGame(true);setPlaying(false);history.current=[];future.current=[];setProposal(null);setAiResult(null)
    if(owner)void api('/api/worlds','GET',undefined,controller.signal).then(v=>{if(!controller.signal.aborted&&ownerRef.current===owner)setWorlds(v.worlds)}).catch(e=>{if(!controller.signal.aborted)setError(e.message)})
    return()=>{controller.abort();aiAbort.current?.abort();fileOperation.current=null;libraryRequest.current++;worldLoad.current++}
  },[owner])
  const change=(next:PrivateWorld)=>{
    if(!canEdit||ownerRef.current!==owner||worldRef.current.id!==next.id)return false
    try{const valid=validatePrivateWorld(next);history.current=[...history.current.slice(-19),worldRef.current];future.current=[];sequence.current++;worldRef.current=valid;setWorld(valid);setDirty(true);setError('');setAiResult(null);setProposal(null);setHistoryTick(t=>t+1);return true}catch(e){setError(e instanceof Error?e.message:'This edit could not be applied.');return false}
  }
  const undo=(redo=false)=>{if(!canEdit)return;const from=redo?future:history,to=redo?history:future;const next=from.current.pop();if(next){to.current.push(worldRef.current);sequence.current++;setWorld(next);setDirty(true);setHistoryTick(t=>t+1)}}
  async function save(){
    if(!owner||ownedBy!==owner||saveLock.current||newGame)return
    const snapshot=worldRef.current,version=sequence.current,capturedOwner=owner
    saveLock.current=true;setSaving(true);setError('')
    try{const valid=validatePrivateWorld(snapshot);const result=await api(`/api/worlds/${valid.id}`,'PUT',{document:valid,expectedRevision:revisionRef.current},AbortSignal.timeout(18000)) as SavedWorld
      if(ownerRef.current!==capturedOwner||worldRef.current.id!==valid.id)return
      revisionRef.current=result.revision;setRevision(result.revision);if(sequence.current===version)setDirty(false)
      setWorlds(list=>[{id:valid.id,name:valid.name,revision:result.revision,updatedAt:result.updatedAt},...list.filter(w=>w.id!==valid.id)])
      setMessage(sequence.current===version?'Saved privately to your account. Embedded model files remain on this device.':'Snapshot saved. Your newer edits are still waiting to be saved.')
    }catch(e){if(ownerRef.current===capturedOwner)setError(e instanceof Error?e.message:'Save was not confirmed.')}finally{saveLock.current=false;setSaving(false)}
  }
  // Quiet autosave after editing stops, not an API/model loop. Errors require an explicit retry.
  useEffect(()=>{if(!dirty||saving||error||!canEdit)return;const timer=setTimeout(()=>void save(),8000);return()=>clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[world,saving,dirty,error,canEdit])
  useEffect(()=>{const warn=(e:BeforeUnloadEvent)=>{if(dirty){e.preventDefault();e.returnValue=''}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn)},[dirty])
  async function openWorld(id:string){if(!owner||saving||aiBusy||fileBusy||fileOperation.current)return;if(dirty&&!window.confirm('Open another world without saving the current edits? Export JSON first to keep a backup.'))return;const actor=owner,version=sequence.current,request=++worldLoad.current
    try{const result=await api(`/api/worlds/${id}`,'GET',undefined,AbortSignal.timeout(18000)) as SavedWorld;if(ownerRef.current!==actor||worldLoad.current!==request)return;if(sequence.current!==version){setMessage('Your world changed while another world was opening. Save these edits, then open the other world again.');return}const doc=validatePrivateWorld(result.document);sequence.current++;setWorld(doc);setOwnedBy(actor);setRevision(result.revision);revisionRef.current=result.revision;setDirty(false);setNewGame(false);setPlaying(false);setSelected(null);history.current=[];future.current=[];setError('');setMessage('Your private world is open. Missing local model files can be imported on this device.')}catch(e){setError(e instanceof Error?e.message:'Cannot open this world.')}
  }
  const beginNew=()=>{if(saving||aiBusy||fileOperation.current)return;if(dirty&&!window.confirm('Start a new world? Save or export the current world first to keep your changes.'))return;sequence.current++;setPlaying(false);setName('');setCharacter(blankWorld().character);setNewStep(0);setNewGame(true)}
  const finishNew=()=>{if(!owner)return;try{const doc=validatePrivateWorld({...blankWorld(),name:name.trim(),character});setWorld(doc);setOwnedBy(owner);revisionRef.current=0;setRevision(0);setDirty(true);sequence.current++;history.current=[];future.current=[];setSelected(null);setNewGame(false);setTutorial(0);setTab('character');setFocusCharacterVersion(v=>v+1);setError('');setMessage('Your character preview is now visible. Generate a detailed character explicitly in Character; no AI was charged by creating this world.')}catch(e){setError(e instanceof Error?e.message:'Check the world name and character fields.')}}
  async function refreshLibrary(){
    if(!owner)return
    const actor=owner,request=++libraryRequest.current
    const current=()=>ownerRef.current===actor&&libraryRequest.current===request
    try{
      const [local,archive]=await Promise.all([listWorldAssets(actor),listStudioModels()])
      if(!current())return
      // Render local bytes before the optional account badge lookup completes.
      setAssets(local);setGallery(previous=>mergeGameLabArchive(archive,previous.filter(item=>item.accountVerified).map(item=>item.id)))
      try{
        const result=await api('/api/worlds/library','POST',{ids:archive.slice(0,60).map(v=>v.id)},AbortSignal.timeout(18000))
        if(current())setGallery(mergeGameLabArchive(archive,Array.isArray(result.ids)?result.ids:[]))
      }catch{
        // Device bytes stay visible; this never grants cloud download rights.
      }
    }catch(e){if(current())setError(e instanceof Error?e.message:'Library unavailable.')}
  }
  useEffect(()=>{
    if(tab!=='library'||!owner)return
    let closed=false
    const update=()=>{if(!closed)void refreshLibrary()}
    const storage=(event:StorageEvent)=>{if(event.key===STUDIO_ARCHIVE_SIGNAL_KEY)update()}
    const visible=()=>{if(document.visibilityState==='visible')update()}
    update()
    window.addEventListener('worldifact-private-library',update)
    window.addEventListener(STUDIO_ARCHIVE_EVENT,update)
    window.addEventListener('storage',storage)
    window.addEventListener('focus',update)
    window.addEventListener('pageshow',update)
    document.addEventListener('visibilitychange',visible)
    return()=>{closed=true;window.removeEventListener('worldifact-private-library',update);window.removeEventListener(STUDIO_ARCHIVE_EVENT,update);window.removeEventListener('storage',storage);window.removeEventListener('focus',update);window.removeEventListener('pageshow',update);document.removeEventListener('visibilitychange',visible)}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[tab,owner])
  const place=(target=point,asset?:WorldAsset)=>{
    if(!canEdit||playing||ownerRef.current!==owner)return false
    const selectedAsset=asset??(assetId?assets.find(a=>a.id===assetId):undefined)
    if((asset||kind==='asset')&&!selectedAsset){setError('Choose a model from your library first.');return false}
    const e=newEntity(asset?'asset':kind,target.x,target.z,asset?asset.id:kind==='asset'?assetId:null)
    if(e.assetId)e.name=worldAssetName(selectedAsset?.name??'My model')
    if(!change({...worldRef.current,entities:[...worldRef.current.entities,e]}))return false
    setSelected(e.id);setTool('select');setTransformMode('move');setFocusVersion(v=>v+1)
    setMessage(`Added ${e.name} to your world. Move, rotate or scale the selected object; Save world keeps this placement.`)
    return true
  }
  const replaceAsset=(asset:WorldAsset,entityId:string)=>{
    if(!canEdit||playing||ownerRef.current!==owner)return false
    const entity=worldRef.current.entities.find(e=>e.id===entityId&&e.kind==='asset')
    if(!entity){setError('The selected model changed. Select it again before replacing its device file.');return false}
    if(!change({...worldRef.current,entities:worldRef.current.entities.map(e=>e.id===entityId?{...e,assetId:asset.id,name:worldAssetName(asset.name)}:e)}))return false
    setSelected(entityId);setTool('select');setTransformMode('move');setFocusVersion(v=>v+1)
    setMessage('Model file linked to the selected object. Its position, scale and rotation are unchanged. Save world to keep the new link.')
    return true
  }
  const addAsset=(asset:WorldAsset)=>{if(place(point,asset)){setAssetId(asset.id);setKind('asset')}}
  async function importModel(read:()=>Promise<Blob>,label:string,replaceId?:string){
    if(!owner||!canEdit||playing||fileOperation.current)return
    const actor=owner,id=worldRef.current.id,target={...point},operation=Symbol('model-import')
    fileOperation.current=operation;setFileBusy(true);setError('')
    const current=()=>fileOperation.current===operation&&ownerRef.current===actor&&worldRef.current.id===id
    try{
      const blob=await read();if(!current())return
      const item=await storeWorldAsset(actor,label,blob);if(!current())return
      const local=await listWorldAssets(actor);if(!current())return
      setAssets(local);if(replaceId?replaceAsset(item,replaceId):place(target,item)){setAssetId(item.id);setKind('asset')}
    }catch(e){if(current())setError(e instanceof Error?e.message:'The model could not be imported.')}
    finally{if(fileOperation.current===operation){fileOperation.current=null;setFileBusy(false)}}
  }
  async function importGalleryModel(entry:GameLabArchiveEntry,replaceId?:string){
    await importModel(async()=>{
      if(entry.accountVerified){
        const permitted=await api('/api/worlds/library','POST',{ids:[entry.id]},AbortSignal.timeout(18000))
        if(!Array.isArray(permitted.ids)||!permitted.ids.includes(entry.id))throw new Error('This account-verified model is no longer downloadable. The local GLB was not deleted.')
      }
      // Explicit device-file use does not assert cloud ownership or call AI.
      return readStudioModel(entry.id)
    },entry.prompt,replaceId)
  }
  const pick=(target:{x:number;z:number},entityId:string|null)=>{setPoint(target);if(!canEdit)return;if(tool==='select'){setSelected(entityId);if(entityId)setTransformMode('move')}else if(tool==='place')place(target);else change({...worldRef.current,terrain:[...worldRef.current.terrain,{id:crypto.randomUUID(),...target,radius,strength:tool==='mountain'?4:-3}]})}
  const control=(value:WorldControl)=>change({...world,controls:world.controls.includes(value)?world.controls.filter(c=>c!==value):[...world.controls,value]})
  const propose=()=>{const parsed=parseWorldCommand(command);if(!parsed){setProposal(null);setMessage('Local commands include: add jump button, add sprint, add interaction, show stars, show day, dig valley, add mountain, add tree. No remote agent was called.');return}setProposal({worldId:world.id,sequence:sequence.current,command:parsed,point:{...point}});setMessage('Review the proposed edit below. Nothing has changed yet; cost: 0 points.')}
  async function askAI(){if(!canEdit||aiLock.current||aiPrompt.trim().length<3||aiPrompt.length>1600)return;aiLock.current=true;setAiBusy(true);setError('');setAiResult(null);const actor=owner,id=world.id,version=sequence.current,model=aiModel;const controller=new AbortController();aiAbort.current=controller;const timer=setTimeout(()=>controller.abort(),40000)
    try{const r=await api('/api/blueprint','POST',{worldId:'ai-game-lab',model,mode:'live',prompt:`Design at most eight compact objects for a private game world. Do not generate code or start external tools. World: ${world.name}. Desired additions: ${aiPrompt}`},controller.signal);const result=validateGenerationResult(r);if(result.mode!=='LIVE'||result.model!==MODEL_CATALOG[model].model)throw new Error('A verified AI result was not returned; no automatic retry will run.');if(ownerRef.current!==actor||worldRef.current.id!==id||sequence.current!==version){setMessage('Your world changed while AI was working. The result was not applied.');return}setAiResult({worldId:id,sequence:version,result});setMessage('AI proposal received. Review the object list before applying. No existing model will be replaced.')}
    catch(e){if(ownerRef.current===actor)setError(e instanceof Error&&e.name==='AbortError'?'AI response timed out. Billing may be uncertain; no automatic retry was started.':e instanceof Error?e.message:'AI proposal failed.')}
    finally{clearTimeout(timer);aiLock.current=false;setAiBusy(false)}
  }
  const applyAI=()=>{if(!aiResult||aiResult.worldId!==world.id||aiResult.sequence!==sequence.current){setError('This proposal belongs to an older world revision.');return}const entities=aiResult.result.blueprint.objects.map(o=>({...newEntity(o.kind as EntityKind,o.x,o.z),name:o.name,color:o.color,scale:o.scale,rotation:o.rotation}));change({...world,entities:[...world.entities,...entities]});setMessage('AI-designed procedural objects added. Their geometry is a preview, not a manufactured or detailed Oracle asset.')}
  async function removeWorld(){
    if(!canEdit||!revision||saving||aiBusy||fileBusy||!window.confirm('Delete this saved world? Original model files and your model library will not be deleted.'))return
    const actor=owner,id=world.id;saveLock.current=true;setSaving(true)
    try{await api(`/api/worlds/${id}`,'DELETE',{expectedRevision:revisionRef.current},AbortSignal.timeout(18000));if(ownerRef.current!==actor||worldRef.current.id!==id)return;sequence.current++;setWorld(blankWorld());revisionRef.current=0;setRevision(0);setWorlds(list=>list.filter(w=>w.id!==id));setDirty(false);setNewGame(true);setNewStep(0);setName('');setCharacter(blankWorld().character);setMessage('World removed. Model originals remain in your library.')}
    catch(e){if(ownerRef.current===actor)setError(e instanceof Error?e.message:'Deletion was not confirmed.')}
    finally{saveLock.current=false;setSaving(false)}
  }
  async function importWorld(file:File){
    if(!owner||saving||aiBusy||fileBusy||fileOperation.current)return
    if(file.size>WORLD_LIMITS.bytes){setError('Use a world JSON file up to 96 KiB.');return}
    if(dirty&&!window.confirm('Import as a new world? Export or save the current edits first.'))return
    const actor=owner;setFileBusy(true)
    try{const doc=validatePrivateWorld(JSON.parse(await file.text()));if(ownerRef.current!==actor)return;const own={...doc,id:crypto.randomUUID()};sequence.current++;setWorld(own);setOwnedBy(actor);revisionRef.current=0;setRevision(0);setDirty(true);setNewGame(false);setPlaying(false);setSelected(null);history.current=[];future.current=[];setError('');setMessage('Imported as a new private world. Original account records are unchanged; local model files may need importing on this device.')}
    catch(e){if(ownerRef.current===actor)setError(e instanceof Error?e.message:'Invalid world file. Nothing replaced.')}
    finally{setFileBusy(false)}
  }
  const charPrompt=`Create a game character. Appearance: ${world.character.description}. Outfit: ${world.character.outfit}. Hair: ${world.character.hair}, ${world.character.hairColor}. Style: ${world.character.style}. Clothing text: ${world.character.label}. Outfit color: ${world.character.outfitColor}. Use separate GAME and validation-required MAKE plans.`
  return <main className="private-lab" data-private-world-owner={ownedBy===owner&&owner?'authenticated':'none'}>
    <header className="private-top"><Link to="/world" className="private-brand">WORLDIFACT <span>← Portal meadow</span></Link><nav aria-label="Creation tools"><Link to="/shop">Create 3D model</Link><Link to="/account/models">My models</Link><Link to="/account/credits">Plans & points</Link></nav></header>
    <section className="private-hero"><EighteenCrystal/><div><span className="private-eyebrow">GAME LAB · YOUR UNIVERSE</span><h1>Create your world.</h1><p>A fresh meadow. A living river. Your next game.</p></div><button className="private-primary" onClick={beginNew} disabled={saving||aiBusy||fileBusy}>＋ New game</button></section>
    <div className="private-workbar"><label>World name<input aria-label="World name" maxLength={80} value={world.name} disabled={!canEdit||playing} onChange={e=>change({...world,name:e.target.value||'My new world'})}/></label><div className="private-save-state" role="status">{!owner?'Sign in to save':saving?'Saving…':dirty?'Unsaved edits':revision?`Saved · revision ${revision}`:'New world'}</div><button onClick={()=>void save()} disabled={!canEdit||saving||!dirty}>Save world</button><button onClick={()=>downloadJSON(world,`${world.name.replace(/[^a-z0-9_-]/gi,'_')}.world.json`)}>Export JSON</button><button onClick={()=>setTutorial(0)}>5-step guide</button><button disabled={!canEdit||!revision||saving||aiBusy||fileBusy} onClick={()=>void removeWorld()}>Delete world</button><label className="private-import-json">Import world JSON<input type="file" accept=".json,application/json" disabled={!owner||saving||aiBusy||fileBusy} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void importWorld(file)}}/></label><select aria-label="Open my saved world" value="" onChange={e=>void openWorld(e.target.value)} disabled={!owner||saving||aiBusy||fileBusy}><option value="">My worlds ({worlds.length}/{WORLD_LIMITS.worlds})</option>{worlds.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
    <div className="private-editor-grid"><section className="private-stage" aria-label="Your private world editor"><div className="private-stage-toolbar"><div><button aria-pressed={!playing} onClick={()=>setPlaying(false)}>Edit</button><button className={playing?'private-playing':''} disabled={!canEdit||fileBusy} onClick={()=>{setPlaying(v=>!v);setMessage('Play test: WASD / arrows, Space to jump, Shift to sprint, E to interact. Touch controls are below.')}}>{playing?'■ Stop':'▶ Play'}</button></div><div><button disabled={!canEdit||!history.current.length} data-history-revision={historyTick} onClick={()=>undo()}>↶ Undo</button><button disabled={!canEdit||!future.current.length} onClick={()=>undo(true)}>Redo ↷</button><button disabled={!canEdit} aria-pressed={world.night} onClick={()=>change({...world,night:!world.night})}>{world.night?'☀ Day':'✦ Stars'}</button></div></div>
      <WorldSelectionToolbar world={world} selected={selected} point={point} mode={transformMode} snap={snap} disabled={!canEdit||playing} onSelect={id=>{setSelected(id);setTool('select');setTransformMode('move')}} onMode={mode=>{setTransformMode(mode);setTool('select')}} onSnap={setSnap} onChange={change} onFocus={()=>setFocusVersion(v=>v+1)} onError={setError}/>
      <Suspense fallback={<div className="private-loading">Preparing your meadow…</div>}><Canvas owner={owner&&ownedBy===owner?owner:null} world={ownedBy===owner?world:emptyWorld} playing={playing&&canEdit} point={point} selected={selected} onPick={pick} onMessage={setMessage} transformMode={canEdit&&!playing?transformMode:'select'} snap={snap} focusVersion={focusVersion} focusCharacterVersion={focusCharacterVersion} onTransform={(id,value)=>{if(!canEdit)return;try{change(transformEntity(worldRef.current,id,value,snap))}catch(e){setError(e instanceof Error?e.message:'Transform not applied.')}}}/></Suspense>
      <div className="private-coordinate">MARKER <b>X {point.x.toFixed(1)} · Z {point.z.toFixed(1)}</b><span>{world.entities.length} objects · resource-budgeted preview · {world.terrain.length}/{WORLD_LIMITS.terrain} terrain edits</span></div>
      <p className="private-status" role="status">{message}</p>{error&&<p className="private-error" role="alert">{error}</p>}
    </section><aside className="private-sidebar"><nav className="private-tabs" aria-label="Editor panels">{(['build','library','character','assistant'] as const).map(t=><button key={t} aria-pressed={tab===t} onClick={()=>setTab(t)}>{t==='build'?'Build':t==='library'?'Library':t==='character'?'Character':'Assistant'}</button>)}</nav>
      {tab==='build'&&<div className="private-panel"><span className="private-eyebrow">LOCAL TOOLS · 0 API COST</span><h2>Shape your world</h2><div className="private-tool-grid">{(['select','place','mountain','valley'] as const).map(t=><button key={t} aria-pressed={tool===t} disabled={!canEdit||playing} onClick={()=>setTool(t)}>{t==='select'?'⌖ Select point':t==='place'?'＋ Place model':t==='mountain'?'△ Mountain':'▽ Valley'}</button>)}</div><label>Brush radius · {radius} m<input type="range" min="2" max="14" value={radius} onChange={e=>setRadius(Number(e.target.value))}/></label><p className="private-fine">Choose a terrain tool and tap the ground. River flow stays connected. Undo restores the prior terrain.</p><label>Starter object<select value={kind} onChange={e=>{setKind(e.target.value as EntityKind);setAssetId(null)}}><option value="tree">Tree</option><option value="rock">Rock</option><option value="cabin">Cabin</option><option value="lamp">Light</option><option value="crate">Crate</option>{assetId&&<option value="asset">Selected library model</option>}</select></label><button disabled={!canEdit||playing} onClick={()=>place()}>Add at marker · 0 points</button>
      <h3>Game controls</h3>{(['jump','sprint','interact'] as const).map(v=><label key={v} className="private-toggle"><input type="checkbox" checked={world.controls.includes(v)} disabled={!canEdit} onChange={()=>control(v)}/>{v==='jump'?'Jump · Space':v==='sprint'?'Sprint · Shift':'Interact · E'}</label>)}
      {selectedEntity&&<section className="private-inspector"><h3>Selected: {selectedEntity.name}</h3>{(['x','z','scale','rotation','elevation'] as const).map(k=><label key={k}>{k}<input type="number" value={selectedEntity[k]} step={k==='scale'?.1:1} min={k==='scale'?.1:k==='elevation'?0:k==='rotation'?-360:-40} max={k==='scale'?8:k==='elevation'?20:k==='rotation'?360:40} disabled={!canEdit} onChange={e=>change({...world,entities:world.entities.map(o=>o.id===selected?{...o,[k]:Number(e.target.value)}:o)})}/></label>)}<button disabled={!canEdit} onClick={()=>{change({...world,entities:world.entities.filter(o=>o.id!==selected)});setSelected(null)}}>Remove from world</button></section>}
      <details><summary>Your character brief</summary><p>{world.character.description||'Local preview character. Add a description with New game.'}</p><p>{world.character.outfit} · {world.character.hair} · {world.character.style}</p><Link to="/shop" state={{worldPrompt:charPrompt}}>Create detailed character in AI Shop →</Link><p className="private-fine">Opening AI Shop does not buy a generation. Review the model and points there.</p></details></div>}
      {tab==='library'&&<div className="private-panel"><span className="private-eyebrow">YOUR FILES · DEVICE LIBRARY</span><h2>Add your models</h2><p className="private-fine">Add to world places one copy at the marker immediately. Select it to move, rotate or scale it.</p><p className="private-fine">World layout saves to your account. GLB files stay in this browser. Other accounts cannot open your world through the server API. Keep original file backups.</p><button disabled={!owner||fileBusy} onClick={()=>void refreshLibrary()}>Refresh library</button><label>Import embedded GLB · up to 50 MB<input type="file" accept=".glb,model/gltf-binary" disabled={!canEdit||playing||fileBusy} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void importModel(async()=>file,file.name)}}/></label>{selectedEntity?.kind==='asset'&&<label>Replace selected model with GLB<input type="file" accept=".glb,model/gltf-binary" disabled={!canEdit||playing||fileBusy} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void importModel(async()=>file,file.name,selectedEntity.id)}}/></label>}<p className="private-fine">Select a missing object and use Replace selected model to restore its file on this device without losing its placement.</p><p className="private-fine">No four-model placement cap. The editor uses lightweight proxies when the rendering budget is full; every placement is retained. Use optimized GAME copies for smooth editing.</p>{assets.map(a=><article className="private-asset" key={a.id}><strong>{a.name}</strong><small>{(a.bytes/1e6).toFixed(1)} MB · YOUR DEVICE</small><button disabled={!canEdit||playing||fileBusy} onClick={()=>addAsset(a)}>Add to world</button>{selectedEntity?.kind==='asset'&&<button disabled={!canEdit||playing||fileBusy} onClick={()=>replaceAsset(a,selectedEntity.id)}>Replace selected model</button>}</article>)}<h3>Generated models on this device</h3>{gallery.length?gallery.map(a=><article className="private-asset" key={a.id}><strong>{a.prompt.slice(0,100)}</strong><small>{(a.byteLength/1e6).toFixed(1)} MB · {a.accountVerified?'ACCOUNT VERIFIED':'DEVICE ARCHIVE'} · original preserved</small><button disabled={!canEdit||playing||fileBusy} onClick={()=>void importGalleryModel(a)}>{fileBusy?'Importing…':a.accountVerified?'Add saved model to world':'Add local GLB to world'}</button>{selectedEntity?.kind==='asset'&&<button disabled={!canEdit||playing||fileBusy} onClick={()=>void importGalleryModel(a,selectedEntity.id)}>Replace selected model</button>}</article>):<p>No generated GLB models are stored in this browser yet. New completed Shop models appear here automatically after they are saved locally.</p>}<Link to="/shop">Generate a new 3D model →</Link></div>}
      {tab==='character'&&owner&&ownedBy===owner&&<div className="private-panel"><WorldCharacterStudio key={owner+world.id} owner={owner} world={world} disabled={!canEdit||playing} onFocus={()=>setFocusCharacterVersion(v=>v+1)} onSetAsset={id=>change({...worldRef.current,character:{...worldRef.current.character,assetId:id}})} onReady={(id,snapshot,asset)=>{if(!canEdit||worldRef.current.id!==id||JSON.stringify(worldRef.current.character)!==snapshot){setMessage('Character is in your library. This world changed, so select the model explicitly in Character.');return}change({...worldRef.current,character:{...worldRef.current.character,assetId:asset.id}});setFocusCharacterVersion(v=>v+1)}}/></div>}
      {tab==='assistant'&&<div className="private-panel"><span className="private-eyebrow">LOCAL ASSISTANT · NO MODEL CALL</span><h2>Build by command</h2><p>Describe one supported edit, review it, then Apply. Local commands are rules, not a live Codex agent.</p><label>Command<textarea value={command} maxLength={500} onChange={e=>setCommand(e.target.value)} placeholder="Add a jump button / Dodaj przycisk skoku"/></label><div className="private-chip-row">{['Add jump button','Add sprint','Dig valley','Add mountain','Show stars'].map(s=><button key={s} disabled={!canEdit} onClick={()=>setCommand(s)}>{s}</button>)}</div><button disabled={!canEdit} onClick={propose}>Preview edit · 0 points</button>{proposal&&<div className="private-proposal"><strong>Proposed: {proposal.command.kind}</strong><p>{proposal.command.kind==='terrain'?`Terrain strength ${proposal.command.strength} at marker`:proposal.command.kind==='control'?`Add ${proposal.command.control} control`:proposal.command.kind==='object'?`Place ${proposal.command.object} at marker`:`Switch to ${proposal.command.value?'stars':'daylight'}`}</p><button disabled={!canEdit} onClick={()=>{if(proposal.worldId!==world.id||proposal.sequence!==sequence.current){setError('World changed; preview this command again.');return}change(applyWorldCommand(world,proposal.command,proposal.point));setMessage('Local edit applied. API cost: 0.')}}>Apply to my world</button><button onClick={()=>setProposal(null)}>Discard</button></div>}
      <WorldCodexPanel world={world} selected={selected} request={command} disabled={!canEdit||playing} onChange={change} onMessage={setMessage}/>
      <details className="private-ai"><summary>AI design proposal · optional paid request</summary><p>A single bounded Luna/Sol request can propose objects. No autonomous agent loop, shell or remote MCP server is started.</p><label>AI model<select disabled={aiBusy} value={aiModel} onChange={e=>setAiModel(e.target.value as DraftModel)}><option value="luna">GPT-6 Luna · 15 points</option><option value="sol">GPT-6 Sol · 50 points</option></select></label><GenerationCostNotice model={aiModel} busy={aiBusy}/><label>Desired additions<textarea maxLength={1600} value={aiPrompt} disabled={aiBusy} onChange={e=>setAiPrompt(e.target.value)} placeholder="A small solar research station beside the river, with two trees and a rover"/></label><button disabled={!canEdit||aiBusy||aiPrompt.trim().length<3} onClick={()=>void askAI()}>{aiBusy?'Waiting for one AI proposal…':`Request once · ${MODEL_CATALOG[aiModel].creditsPerGeneration} points if credit-funded`}</button>{aiResult&&<div className="private-proposal"><strong>{aiResult.result.blueprint.title}</strong><ul>{aiResult.result.blueprint.objects.map(o=><li key={o.id}>{o.name} · {o.kind}</li>)}</ul><button onClick={applyAI} disabled={!canEdit}>Add proposed objects</button><button onClick={()=>setAiResult(null)}>Keep existing world only</button></div>}</details>
      <button onClick={()=>downloadJSON({world,tools:['place_model','sculpt_terrain','set_sky','set_controls'],instructions:'Operate on this owned world only. Propose validated scene edits. No deployment, payment, shell or paid tool without separate approval.'},'worldifact-codex-world-brief.json')}>Export brief for Codex / MCP</button><p className="private-fine">External Codex/MCP execution is not connected here. Exporting a brief costs nothing and does not start an agent.</p></div>}
    </aside></div>
    {newGame&&<div className="private-modal-backdrop"><section className="private-modal" role="dialog" aria-modal="true" aria-labelledby="new-world-title" onKeyDown={event=>{if(event.key==='Escape'){setNewGame(false);return}if(event.key!=='Tab')return;const focusable=Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]'));const first=focusable[0],last=focusable[focusable.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}}}><EighteenCrystal/><span className="private-eyebrow">NEW GAME · ZERO API COST TO START</span><h2 id="new-world-title">{newStep===0?'Name your world.':'Describe your character.'}</h2>{newStep===0?<><label>World name<input autoFocus maxLength={80} value={name} onChange={e=>setName(e.target.value)} placeholder="Riverlight — my first game"/></label><p>You start with only a meadow and river, not the shared WORLDIFACT portal map.</p>{worlds.length>0&&<label>Or open your world<select value="" onChange={e=>void openWorld(e.target.value)}><option value="">Select your saved world</option>{worlds.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label>}<button className="private-primary" disabled={!owner||name.trim().length<1} onClick={()=>setNewStep(1)}>Next · create your character</button></>:<><label>Appearance and silhouette<textarea maxLength={800} value={character.description} onChange={e=>setCharacter({...character,description:e.target.value.replace(/[\r\n]+/g,' ')})} placeholder="Describe appearance, proportions and personality"/></label><div className="private-character-grid">{(['outfit','hair','style','label'] as const).map(k=><label key={k}>{k==='label'?'Clothing text':k}<input maxLength={k==='label'?40:k==='outfit'?160:100} value={character[k]} onChange={e=>setCharacter({...character,[k]:e.target.value})}/></label>)}<label>Hair color<input type="color" value={character.hairColor} onChange={e=>setCharacter({...character,hairColor:e.target.value})}/></label><label>Outfit color<input type="color" value={character.outfitColor} onChange={e=>setCharacter({...character,outfitColor:e.target.value})}/></label></div><p className="private-fine">This saves a character brief and a simple local preview. A detailed AI model is a separate explicit generation in AI Shop.</p><button onClick={()=>setNewStep(0)}>Back</button><button className="private-primary" disabled={!owner} onClick={finishNew}>Create my world · no API charge</button></>}{!owner&&<Link to="/login">Sign in to create and save your own worlds →</Link>}<button className="private-text-button" onClick={()=>setNewGame(false)}>Explore the empty editor</button>{error&&<p role="alert">{error}</p>}</section></div>}
    {tutorial!==null&&!newGame&&<section className="private-tutorial" role="dialog" aria-label="Five-step game creation guide"><button className="private-tour-close" aria-label="Close tutorial" onClick={()=>setTutorial(null)}>×</button><span className="private-eyebrow">QUICK START · {tutorial+1} / 5</span><h2>{STEPS[tutorial].title}</h2><p>{STEPS[tutorial].text}</p><div className="private-tour-dots">{STEPS.map((s,i)=><button key={s.title} aria-label={`Tutorial step ${i+1}`} aria-current={tutorial===i?'step':undefined} onClick={()=>setTutorial(i)}>{i+1}</button>)}</div><button disabled={tutorial===0} onClick={()=>setTutorial(t=>Math.max(0,(t??0)-1))}>Previous</button><button className="private-primary" onClick={()=>tutorial===4?setTutorial(null):setTutorial(t=>(t??0)+1)}>{tutorial===4?'Start building':'Next'}</button></section>}
  </main>
}
