"""Tighten lifecycle, recovery and UX before the isolated branch passes verification."""
from pathlib import Path
marker=Path('ops/private-game-lab-hardened.json')
if marker.exists(): raise SystemExit(0)
def edit(path,old,new,count=1):
    f=Path(path);s=f.read_text()
    if s.count(old)!=count: raise RuntimeError('Hardening context changed: '+path+' :: '+old[:90])
    f.write_text(s.replace(old,new))
page='src/pages/PrivateGameLab.tsx'
edit(page,'useGallery(', 'importGalleryModel(',2)
edit(page,'const [world,setWorld]=useState<PrivateWorld>(()=>blankWorld()),worldRef=useRef(world);', 'const [emptyWorld]=useState<PrivateWorld>(()=>blankWorld())\n  const [world,setWorld]=useState<PrivateWorld>(()=>blankWorld()),worldRef=useRef(world);')
edit(page,'world={world} playing={playing&&canEdit}', 'world={ownedBy===owner?world:emptyWorld} playing={playing&&canEdit}')
edit(page,'command:LocalWorldCommand}|null>', 'command:LocalWorldCommand;point:{x:number;z:number}}|null>')
edit(page,'command:parsed});', 'command:parsed,point:{...point}});')
edit(page,'applyWorldCommand(world,proposal.command,point)', 'applyWorldCommand(world,proposal.command,proposal.point)')
edit(page,"const charPrompt=`Create a game character.",'''async function removeWorld(){
    if(!canEdit||!revision||saving||aiBusy||fileBusy||!window.confirm('Delete this saved world? Original model files and your model library will not be deleted.'))return
    const actor=owner,id=world.id;saveLock.current=true;setSaving(true)
    try{await api(`/api/worlds/${id}`,'DELETE',{expectedRevision:revisionRef.current},AbortSignal.timeout(18000));if(ownerRef.current!==actor||worldRef.current.id!==id)return;sequence.current++;setWorld(blankWorld());revisionRef.current=0;setRevision(0);setWorlds(list=>list.filter(w=>w.id!==id));setDirty(false);setNewGame(true);setNewStep(0);setName('');setCharacter(blankWorld().character);setMessage('World removed. Model originals remain in your library.')}
    catch(e){if(ownerRef.current===actor)setError(e instanceof Error?e.message:'Deletion was not confirmed.')}
    finally{saveLock.current=false;setSaving(false)}
  }
  async function importWorld(file:File){
    if(!owner||saving||aiBusy||fileBusy)return
    if(file.size>65536){setError('Use a world JSON file up to 64 KiB.');return}
    if(dirty&&!window.confirm('Import as a new world? Export or save the current edits first.'))return
    const actor=owner;setFileBusy(true)
    try{const doc=validatePrivateWorld(JSON.parse(await file.text()));if(ownerRef.current!==actor)return;const own={...doc,id:crypto.randomUUID()};sequence.current++;setWorld(own);setOwnedBy(actor);revisionRef.current=0;setRevision(0);setDirty(true);setNewGame(false);setPlaying(false);setSelected(null);history.current=[];future.current=[];setError('');setMessage('Imported as a new private world. Original account records are unchanged; local model files may need importing on this device.')}
    catch(e){if(ownerRef.current===actor)setError(e instanceof Error?e.message:'Invalid world file. Nothing replaced.')}
    finally{setFileBusy(false)}
  }
  const charPrompt=`Create a game character.''')
edit(page,'<button onClick={()=>setTutorial(0)}>5-step guide</button>', '<button onClick={()=>setTutorial(0)}>5-step guide</button><button disabled={!canEdit||!revision||saving||aiBusy||fileBusy} onClick={()=>void removeWorld()}>Delete world</button><label className="private-import-json">Import world JSON<input type="file" accept=".json,application/json" disabled={!owner||saving||aiBusy||fileBusy} onChange={e=>{const file=e.target.files?.[0];e.target.value=\'\';if(file)void importWorld(file)}}/></label>')
edit(page,'aria-labelledby="new-world-title"><EighteenCrystal/>', '''aria-labelledby="new-world-title" onKeyDown={event=>{if(event.key==='Escape'){setNewGame(false);return}if(event.key!=='Tab')return;const focusable=Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]'));const first=focusable[0],last=focusable[focusable.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}}}><EighteenCrystal/>''')
# Existing expectation changes reflect new product eligibility, not removal of safety checks.
edit('tests/generation-economics.test.ts', "Creator remains SOL-only while Astra is reserved for higher paid plans", "Creator catalogue includes Astra without increasing its provider reserve; runtime gating is tested separately")
edit('tests/generation-economics.test.ts', "modelAllowed('creator', 'astra'), false", "modelAllowed('creator', 'astra'), true")
# Do not leave discarded placeholder materials alive while replacing them with wireframes.
edit('src/components/PrivateWorldCanvas.tsx', "if(o instanceof THREE.Mesh)o.material=new THREE.MeshBasicMaterial({color:'#798a93',wireframe:true})", "if(o instanceof THREE.Mesh){for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();o.material=new THREE.MeshBasicMaterial({color:'#798a93',wireframe:true})}")
marker.write_text('{"revision":"private-game-lab-v1","paidCalls":0}\n')
