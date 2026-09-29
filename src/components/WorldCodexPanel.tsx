import { useMemo, useState } from 'react'
import { codexWorldTask, isMoveTreesCommand, moveTreesFromRiver } from '../lib/editorTools'
import type { PrivateWorld } from '../lib/privateWorld'

type Props={world:PrivateWorld;selected:string|null;request:string;disabled:boolean;onChange:(world:PrivateWorld)=>void;onMessage:(message:string)=>void}
export default function WorldCodexPanel(p:Props){
  const [show,setShow]=useState(false),[proposal,setProposal]=useState<{before:string;world:PrivateWorld}|null>(null)
  const task=useMemo(()=>codexWorldTask(p.world,p.request||'Improve the selected game element while preserving existing work.',p.selected),[p.world,p.request,p.selected])
  const trees=isMoveTreesCommand(p.request)
  function download(){const url=URL.createObjectURL(new Blob([task],{type:'text/markdown'}));const a=document.createElement('a');a.href=url;a.download='WORLDIFACT-CODEX-TASK.md';a.click();setTimeout(()=>URL.revokeObjectURL(url),3000)}
  async function copy(){try{await navigator.clipboard.writeText(task);p.onMessage('The Codex task was copied. No agent or paid request was started.')}catch{setShow(true);p.onMessage('Clipboard unavailable. Select the instruction text or download the file.')}}
  return <section className="world-codex-panel" aria-label="Scoped Codex and MCP task">
    <div className="editor-agent-stages"><span>1 · Plan</span><span>2 · Validate</span><span>3 · Apply</span></div>
    {trees&&<div className="private-proposal"><strong>Move trees off the river · 0 points</strong><p>Only starter trees intersecting the river and its bank are moved. Imported originals and terrain remain intact.</p><button disabled={p.disabled} onClick={()=>setProposal({before:JSON.stringify(p.world),world:moveTreesFromRiver(p.world)})}>Preview tree relocation</button>{proposal&&<><p>{proposal.world.entities.filter((e,i)=>e.x!==p.world.entities[i]?.x).length} trees will move.</p><button disabled={p.disabled} onClick={()=>{if(proposal.before!==JSON.stringify(p.world)){setProposal(null);p.onMessage('World changed; preview the relocation again.');return}p.onChange(proposal.world);setProposal(null);p.onMessage('Trees moved clear of the river. One Undo step; zero API calls.')}}>Apply tree relocation</button></>}</div>}
    <h3>Codex / MCP instruction</h3><p className="private-fine">A task is generated from this world, the selected object and your command. This panel prepares instructions; it does not claim to run remote Codex. Detailed character generation uses the actual guarded Forge pipeline in Character.</p>
    <div className="editor-transform-row"><button onClick={()=>setShow(v=>!v)}>{show?'Hide task':'Show generated task'}</button><button onClick={()=>void copy()}>Copy Codex instruction</button><button onClick={download}>Download task</button></div>
    {show&&<textarea className="editor-codex-task" aria-label="Generated Codex instruction" readOnly value={task} rows={14}/>}
    <a href="https://froge-mpc-2-studio.terraformingplanet.chatgpt.site/" target="_blank" rel="noopener noreferrer">Open original Forge MPC 2 Studio ↗</a>
    <small>Opening the original studio does not transfer your session, private world, files or API keys.</small>
  </section>
}
