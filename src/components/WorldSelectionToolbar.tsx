import { useState } from 'react'
import { duplicateEntity, transformEntity, type TransformMode } from '../lib/editorTools'
import type { PrivateWorld } from '../lib/privateWorld'

type Props={world:PrivateWorld;selected:string|null;point:{x:number;z:number};mode:TransformMode;snap:number;disabled:boolean;onSelect:(id:string|null)=>void;onMode:(mode:TransformMode)=>void;onSnap:(snap:number)=>void;onChange:(world:PrivateWorld)=>void;onFocus:()=>void;onError:(message:string)=>void}
export default function WorldSelectionToolbar(p:Props){
  const [search,setSearch]=useState(''),entity=p.world.entities.find(e=>e.id===p.selected)
  function run(action:()=>PrivateWorld){try{p.onChange(action())}catch(e){p.onError(e instanceof Error?e.message:'Edit not applied.')}}
  return <section className="editor-selection-bar" aria-label="Object selection and transform tools">
    <div className="editor-selection-heading"><strong>{entity?entity.name:'Select an object'}</strong><span>Local edits · 0 AI points</span></div>
    <div className="editor-transform-row">{(['select','move','rotate','scale'] as const).map(mode=><button key={mode} disabled={p.disabled} aria-pressed={p.mode===mode} onClick={()=>p.onMode(mode)}>{mode==='select'?'⌖ Select':mode==='move'?'↔ Move':mode==='rotate'?'↻ Rotate':'⤢ Scale'}</button>)}<label>Snap<select aria-label="Grid snapping" value={p.snap} onChange={e=>p.onSnap(Number(e.target.value))}><option value={0}>Off</option><option value={.25}>0.25 m</option><option value={.5}>0.5 m</option><option value={1}>1 m</option><option value={2}>2 m</option></select></label></div>
    <div className="editor-transform-row"><button disabled={p.disabled||!entity} onClick={p.onFocus}>Focus selection</button><button disabled={p.disabled||!entity} onClick={()=>entity&&run(()=>transformEntity(p.world,entity.id,{x:p.point.x,z:p.point.z},p.snap))}>Move to marker</button><button disabled={p.disabled||!entity} onClick={()=>entity&&run(()=>duplicateEntity(p.world,entity.id))}>Duplicate</button><button disabled={p.disabled||!entity} onClick={()=>entity&&run(()=>transformEntity(p.world,entity.id,{elevation:0}))}>Place on ground</button></div>
    <p className="private-fine">Tap an object, choose Move and drag an axis or its ground-plane handle. Rotate and Scale work the same way. One gesture is one Undo step.</p>
    <details><summary>Scene objects · {p.world.entities.length}</summary><input aria-label="Find scene object" placeholder="Find a placed object" maxLength={100} value={search} onChange={e=>setSearch(e.target.value)}/><select size={5} aria-label="Select placed object" value={p.selected??''} disabled={p.disabled} onChange={e=>p.onSelect(e.target.value||null)}><option value="">No selection</option>{p.world.entities.filter(e=>e.name.toLowerCase().includes(search.toLowerCase())).map(e=><option key={e.id} value={e.id}>{e.name} · {e.kind}</option>)}</select></details>
  </section>
}
