import * as T from 'three';
import {GLTFLoader} from './vendor/examples/jsm/loaders/GLTFLoader.js';
import {Octree} from './vendor/examples/jsm/math/Octree.js';
import {Capsule} from './vendor/examples/jsm/math/Capsule.js';
import {RoomEnvironment} from './vendor/examples/jsm/environments/RoomEnvironment.js';
import {ITEMS,TASKS,freshState,selectItem,takeBag,equipSuit,canExit,enterZone,requirement,perform,refill,restoreState} from './game-state.js';
import {makeAstronaut,makeInterior,makeExteriorTraining,makeTool,EXIT,mat} from './geometry.js';
import {attachJoystick,movementAxes,orbitOffset} from './controls.js';

const $=s=>document.getElementById(s);
let state=freshState(),renderer,scene,camera,astronaut,interior,exterior,nasa,insideTree,outsideTree;
let ready=false,outsideReady=false,nearest=null,selectedGoal='bag',holding=null,cycle=null,toolId=null,paused=false;
let camYaw=Math.PI,camPitch=.28,camDistance=5.4,firstPerson=false,showMap=false;
let last=performance.now(),elapsed=0,hudClock=0,drag=null,moveAmount=0,workUntil=0;
const keys=new Set(),velocity=new T.Vector3(),cap=new Capsule(),tmp=new T.Vector3(),raycaster=new T.Raycaster();
const orbitCenter=new T.Vector3(),mapCam=new T.PerspectiveCamera(45,1,.1,1000);
const earthConsolePos=[-1.65,-.25,6.5];
const bagPos=[1.7,-.7,4],suitPos=[-1.9,-.5,24],airlockPos=[0,0,26.9],spawnInside=[0,-.55,4.8],spawnOutside=[-5.2,-5.05,2.5];
const dynamic=[];let tether,earth,stars;
const view=$('view');
const isTouch=navigator.maxTouchPoints>0||matchMedia('(pointer:coarse)').matches;
document.body.classList.toggle('touch-mode',isTouch);
let stick={x:0,y:0,magnitude:0},joystick,actionPointer=null;
let cameraSnap=true;
const faded=new Map(),fadeMaterials=new WeakMap(),lookTouches=new Map();
const nameOf=id=>ITEMS.find(i=>i.id===id)?.name||id;
function say(msg){state.message=msg;$('message').textContent=msg;}
function safe(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function download(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1500);}
function progress(){return TASKS.filter(t=>state.tasks[t.id].done).length;}
function goals(){return [
 {id:'earth-console',name:'Terra computer — Nile River',zone:'inside',pos:earthConsolePos},
 {id:'bag',name:state.bag?'Parts rack':'Tool bag',zone:'inside',pos:bagPos},
 {id:'suit',name:'EVA suit locker',zone:'inside',pos:suitPos},
 {id:'airlock',name:state.zone==='inside'?'Airlock — exit':'Airlock — return',zone:state.zone,pos:state.zone==='inside'?airlockPos:EXIT},
 ...TASKS
 ];}
function syncVisuals(){
 if(!astronaut)return;
 astronaut.setEquipment(state.bag,state.suit,state.selected);
 interior.bag.visible=!state.bag;
 if(toolId!==state.selected){astronaut.toolMount.clear();toolId=state.selected;if(state.bag&&toolId!=='hand')astronaut.toolMount.add(makeTool(toolId));}
 for(const d of interior.doors){d.open=!!state.doors[d.z];d.leaves.forEach((o,i)=>o.position.x=(i===0?-1:1)*(d.open?2.35:.735));}
 for(const t of TASKS){const q=state.tasks[t.id],o=(t.zone==='inside'?interior:exterior).tasks[t.id];
  o.led.material=q.done?mat.green:mat.orange;
  if(t.kind==='torque')o.bolts.forEach((b,i)=>{b.material=i<q.step?mat.green:mat.silver;b.position.z=b.userData.initialZ-(i<q.step?.025:0);});
  else {const open=t.id==='fuse'?q.step>=3&&q.step<5:t.id==='filter'?q.step>=2&&q.step<4:t.id==='connector'?q.step>=3&&q.step<4:false;
   o.cover.position.x=open?1.1:0;o.cover.rotation.y=open ? .35 : 0;
   if(t.id==='seal'){o.cover.visible=q.step<3;const patch=o.internals.getObjectByName('sealed_patch');if(patch)patch.visible=q.step>=3;}
   if(t.id==='solar')o.group.userData.solarPanel.rotation.y=q.step>=4?0:.8;
   if(t.id==='fuse')o.internals.traverse(part=>{if(part.name==='cartridge')part.material=q.step>=4?mat.green:mat.blue;});
  }
 }
}
function drawInventory(){
 $('inventory').innerHTML=ITEMS.map(i=>`<button data-item="${i.id}" class="slot ${state.selected===i.id?'selected':''}" ${!state.bag&&i.id!=='hand'?'disabled':''} title="${safe(i.name)}"><kbd>${i.key}</kbd><span>${i.abbr}</span>${state.items[i.id]!==undefined?`<b>${state.items[i.id]}</b>`:''}</button>`).join('');
 $('bag-status').textContent=state.bag?`BAG · parts used: ${state.used}`:'BAG NOT COLLECTED';
 $('selected-tool').textContent=nameOf(state.selected);
 $('inventory-toggle').setAttribute('aria-label','Open inventory. Selected: '+nameOf(state.selected));
}
function drawMissions(){
 $('missions-list').innerHTML=TASKS.map((t,i)=>{const s=state.tasks[t.id],count=t.kind==='torque'?t.count:t.steps.length;return `<button class="mission ${selectedGoal===t.id?'targeted':''} ${s.done?'done':''}" data-goal="${t.id}"><span class="mission-index">${s.done?'✓':String(i+1).padStart(2,'0')}</span><span><strong>${safe(t.name)}</strong><small>${t.zone==='inside'?'INTERIOR':'EVA'} · ${s.step}/${count}</small></span><span class="aim">⌖</span></button>`;}).join('');
 $('completed').textContent=progress()+' / '+TASKS.length;
 if(progress()===TASKS.length)say('8/8 — all training tasks complete. Save your progress and return through the airlock.');
}
function updateHUD(){
 if(!ready)return;
 $('zone').textContent=state.zone==='inside'?'TRAINING INTERIOR':'EXTERIOR ISS MAP';
 $('suit-status').textContent=state.suit?'EVA SUIT ON':'CABIN CLOTHING';
 $('oxygen').textContent=state.zone==='outside'?Math.ceil(state.oxygen)+'%':'—';
 $('message').textContent=state.message;
 const p=astronaut.group.position;
 const goal=goals().find(g=>g.id===selectedGoal);
 if(goal){const same=goal.zone===state.zone,d=tmp.fromArray(goal.pos).distanceTo(p);$('goal-name').textContent=goal.name;$('goal-distance').textContent=same?d.toFixed(1)+' m':goal.zone==='outside'?'Go through the airlock':'Return inside';
  if(same){tmp.fromArray(goal.pos).project(showMap?mapCam:camera);const inView=tmp.z<1&&Math.abs(tmp.x)<.93&&Math.abs(tmp.y)<.83;
   $('goal-dot').hidden=!inView;$('goal-dot').style.left=(tmp.x*.5+.5)*100+'%';$('goal-dot').style.top=(-tmp.y*.5+.5)*100+'%';
   $('goal-arrow').style.transform=`rotate(${Math.atan2(tmp.x,-tmp.y)*180/Math.PI+90}deg)`;
  }else $('goal-dot').hidden=true;
 }
 document.body.classList.toggle('eva',state.zone==='outside');
 if(cycle){$('interaction-title').textContent='Airlock cycle';$('interaction-detail').textContent='Simplified training transition…';$('action').disabled=true;return;}
 $('action').disabled=!nearest||paused||showMap;
 if(nearest){$('interaction-title').textContent=nearest.name;let detail=nearest.hint;
  if(nearest.task){const r=requirement(state,nearest.id);detail=r.done?'Repair complete':`${r.hold?(isTouch?'Hold the button':'Hold E'):(isTouch?'Perform':'E')} · ${r.label} · ${nameOf(r.tool)}`;}
  $('interaction-detail').textContent=detail;
 }else{$('interaction-title').textContent='Fly to a station';$('interaction-detail').textContent=isTouch?'Left thumb: move · drag scene: camera':'WASD: move · Space / Ctrl: up, down · drag: camera';}
 $('safety-note').textContent=state.zone==='inside'?'Simplified interior layout inspired by the ISS.':'NASA VTAD: historical configuration. FORGE repair stations are training simulations.';
}
function findNearest(){
 if(!astronaut)return;const p=astronaut.group.position,candidates=[];
 const add=(id,name,pos,hint,task=false)=>{const d=tmp.fromArray(pos).distanceTo(p);if(d<2.35)candidates.push({id,name,pos,hint,task,d});};
 if(state.zone==='inside'){
  add('earth-console','Terra computer — Nile River',earthConsolePos,'E · open Earth observation');
  add('bag',state.bag?'Parts rack':'Tool bag',bagPos,state.bag?'E · refill parts':'E · collect bag');
  add('suit','EVA suit',suitPos,state.suit?'E · check equipment':'E · put on suit');
  for(const d of interior.doors)add('door'+d.z,'Module hatch',[0,0,d.z],state.doors[d.z]?'E · close hatch':'E · open hatch');
  add('airlock','EVA airlock',airlockPos,'E · begin exterior transition');
 }else add('airlock','EVA airlock',EXIT,'E · return inside');
 for(const t of TASKS.filter(t=>t.zone===state.zone&&!state.tasks[t.id].done))add(t.id,t.name,t.pos,'',true);
 nearest=candidates.sort((a,b)=>a.d-b.d)[0]||null;
}
function chooseTool(id){try{const r=selectItem(state,id);if(!r.ok)say(r.message);toolId=null;drawInventory();syncVisuals();updateHUD();if(r.ok&&isTouch)setInventory(false);}catch(e){say(e.message);}}
function beginAction(){
 if(!ready||paused||showMap||cycle||holding)return;
 findNearest();if(!nearest){say('Move closer to the bag, hatch, or training station.');return;}
 const n=nearest;
 if(n.id==='earth-console'){paused=true;resetKeys();$('earth-dialog').showModal();if(!$('earth-frame').getAttribute('src'))$('earth-frame').src='/apps/terra/index.html?mission=nile';return;}
 if(n.id==='bag'){if(state.bag)refill(state);else{takeBag(state);selectedGoal='rack';}toolId=null;drawInventory();syncVisuals();return;}
 if(n.id==='suit'){equipSuit(state);selectedGoal='airlock';syncVisuals();return;}
 if(n.id.startsWith('door')){const z=Number(n.id.slice(4));if(state.doors[z]&&Math.abs(astronaut.group.position.z-z)<1.1){say('Move away from the opening before closing the hatch.');return;}state.doors[z]=!state.doors[z];syncVisuals();say(state.doors[z]?'Hatch open.':'Hatch closed.');return;}
 if(n.id==='airlock'){
  if(state.zone==='inside'&&!outsideReady){say('The exterior map is still loading. Wait for the download to finish.');return;}
  if(state.zone==='inside'&&!canExit(state)){say('Collect the tool bag and put on the EVA suit from the locker by the airlock.');return;}
  cycle={end:performance.now()+2500,to:state.zone==='inside'?'outside':'inside'};velocity.set(0,0,0);say('The airlock is running a simplified training cycle.');return;
 }
 if(n.task){const r=requirement(state,n.id);
  if(r.hold){if(!state.bag||state.selected!==r.tool){perform(state,n.id,{distance:n.d,torque:0});return;}
   holding={id:n.id,value:0,index:state.tasks[n.id].step};$('torque').hidden=false;$('torque-label').textContent=isTouch?'Hold the button. Release in the green range.':'Hold E. Release in the 65–85% range.';
   const dir=tmp.fromArray(n.pos).sub(astronaut.group.position);astronaut.group.rotation.y=Math.atan2(-dir.x,-dir.z);
  }else{const result=perform(state,n.id,{distance:n.d});if(result.ok){workUntil=performance.now()+650;const dir=tmp.fromArray(n.pos).sub(astronaut.group.position);astronaut.group.rotation.y=Math.atan2(-dir.x,-dir.z);}syncVisuals();drawInventory();drawMissions();}
 }
}
function endAction(){if(!holding)return;const h=holding;holding=null;$('torque').hidden=true;const t=TASKS.find(t=>t.id===h.id),d=tmp.fromArray(t.pos).distanceTo(astronaut.group.position);perform(state,h.id,{distance:d,torque:h.value});syncVisuals();drawInventory();drawMissions();}
function switchZone(zone){
 if(!enterZone(state,zone).ok)return;
 interior.group.visible=zone==='inside';exterior.group.visible=zone==='outside';if(nasa)nasa.visible=zone==='outside';earth.visible=stars.visible=zone==='outside';tether.visible=zone==='outside';
 resetKeys();cameraSnap=true;astronaut.group.position.fromArray(zone==='inside'?[0,-.55,25]:spawnOutside);velocity.set(0,0,0);camYaw=zone==='inside'?Math.PI:0;camPitch=.28;firstPerson=false;showMap=false;
 $('map').setAttribute('aria-pressed','false');$('view-toggle').textContent='View: character';scene.background=new T.Color(zone==='inside'?0x0e2335:0x030916);
 state.doors[20]=false;syncVisuals();selectedGoal=zone==='outside'?'fuse':'bag';drawMissions();say(zone==='outside'?'EVA started. Follow the orange handrails to the training stations.':'You are inside. Repair progress and bag contents are preserved.');
}
function movement(dt){
 if(paused||showMap||cycle){velocity.set(0,0,0);moveAmount=0;return;}
 const forward=new T.Vector3(-Math.sin(camYaw),0,-Math.cos(camYaw));const right=new T.Vector3(Math.cos(camYaw),0,-Math.sin(camYaw));const input=new T.Vector3();
 const axes=movementAxes(keys,stick);input.addScaledVector(forward,axes.z).addScaledVector(right,axes.x);input.y=axes.y;moveAmount=axes.magnitude;
 const speed=state.zone==='inside'?2.15:(keys.has('ShiftLeft')?6:3.6);
 velocity.lerp(input.multiplyScalar(speed),1-Math.exp(-(moveAmount>0?11:22)*dt));
 if(moveAmount===0&&velocity.length()<.025)velocity.set(0,0,0);
 if(holding)velocity.multiplyScalar(.1);
 const p=astronaut.group.position;cap.start.copy(p).add(new T.Vector3(0,-.65,0));cap.end.copy(p).add(new T.Vector3(0,.85,0));cap.radius=.32;
 cap.translate(velocity.clone().multiplyScalar(dt));
 const tree=state.zone==='inside'?insideTree:outsideTree;
 if(tree)for(let i=0;i<3;i++){const hit=tree.capsuleIntersect(cap);if(!hit)break;cap.translate(hit.normal.clone().multiplyScalar(hit.depth+1e-4));const dot=velocity.dot(hit.normal);if(dot<0)velocity.addScaledVector(hit.normal,-dot);}
 const next=cap.start.clone().add(new T.Vector3(0,.65,0));
 if(state.zone==='inside'){
  next.x=T.MathUtils.clamp(next.x,-2.55,2.55);next.y=T.MathUtils.clamp(next.y,-1.02,.82);next.z=T.MathUtils.clamp(next.z,.42,27.52);
  for(const d of interior.doors)if(!state.doors[d.z]&&Math.abs(next.z-d.z)<.6){next.z=p.z<d.z?d.z-.61:d.z+.61;velocity.z=0;}
 }else if(next.length()>150){next.copy(p);velocity.set(0,0,0);say('Training-area boundary. Press R to return to the airlock entry point.');}
 p.copy(next);
 if(velocity.x**2+velocity.z**2>.04&&!holding){const target=Math.atan2(-velocity.x,-velocity.z),delta=T.MathUtils.euclideanModulo(target-astronaut.group.rotation.y+Math.PI,2*Math.PI)-Math.PI;astronaut.group.rotation.y+=delta*Math.min(1,dt*8);}
}
function animate(dt,now){
 if($('earth-dialog').open)return; // Pause the station, including its renderer, while using the computer.
 elapsed+=dt;
 document.body.classList.toggle('working',!!holding);
 if(cycle&&now>=cycle.end){const to=cycle.to;cycle=null;switchZone(to);}
 movement(dt);
 if(state.zone==='outside'&&!paused&&!showMap){state.oxygen=Math.max(0,state.oxygen-dt*.035);if(state.oxygen===0){switchZone('inside');say('The simulator reserve is depleted. EVA training ended and the astronaut was returned to the airlock.');}}
 if(holding){holding.value=Math.min(1.08,holding.value+dt*.38);$('torque-fill').style.width=Math.min(100,holding.value*100)+'%';$('torque-value').textContent=Math.round(holding.value*100)+'%';
  const t=TASKS.find(t=>t.id===holding.id),obj=(t.zone==='inside'?interior:exterior).tasks[t.id],b=obj.bolts[holding.index];if(b){b.rotateOnWorldAxis(new T.Vector3(0,0,1).applyQuaternion(obj.group.quaternion),dt*9);b.position.z=b.userData.initialZ-holding.value*.02;}
 }
 const working=holding||now<workUntil;
 const a=astronaut;a.animate(elapsed,moveAmount,working);
 a.toolMount.rotation.y=working?Math.sin(elapsed*14)*.4:0;
 if(state.zone==='outside'){const arr=tether.geometry.attributes.position.array;arr.set(EXIT,0);arr.set(a.group.position.toArray(),3);tether.geometry.attributes.position.needsUpdate=true;tether.geometry.computeBoundingSphere();}
 followCamera(dt);
 hudClock+=dt;if(hudClock>.12){hudClock=0;findNearest();updateHUD();}
 renderer.render(scene,showMap?mapCam:camera);
}
function restoreOccluders(){for(const [o,m] of faded)o.material=m;faded.clear();}
function followCamera(dt){
 restoreOccluders();
 const p=astronaut.group.position,look=p.clone().add(new T.Vector3(0,.50,0));
 interior.solids.getObjectByName('ceiling').visible=!showMap;
 if(showMap){const target=state.zone==='inside'?new T.Vector3(0,0,14):new T.Vector3(-9,0,4);mapCam.position.copy(target).add(new T.Vector3(0,state.zone==='inside'?43:85,1));mapCam.lookAt(target);return;}
 astronaut.group.visible=!firstPerson;
 if(firstPerson){camera.position.copy(p).add(new T.Vector3(0,.88,0));const d=new T.Vector3(-Math.sin(camYaw)*Math.cos(camPitch),-Math.sin(camPitch),-Math.cos(camYaw)*Math.cos(camPitch));camera.lookAt(camera.position.clone().add(d));return;}
 const distance=camDistance+(state.zone==='outside'?1.1:0);
 const offset=new T.Vector3(...orbitOffset(camYaw,camPitch,distance));
 const desired=look.clone().add(offset);
 if(cameraSnap){camera.position.copy(desired);cameraSnap=false;}else camera.position.lerp(desired,1-Math.exp(-12*dt));camera.lookAt(look);
 // Maintain framing. Occluding walls become translucent instead of pushing
 // the camera into the astronaut. Physics still uses the unchanged octree.
 if(state.zone==='inside'){
  const targets=[...interior.solids.children,...interior.doors.flatMap(d=>d.leaves)];
  const right=new T.Vector3(Math.cos(camYaw),0,-Math.sin(camYaw));
  for(const side of [-.4,0,.4]){
   const aim=look.clone().addScaledVector(right,side),direction=aim.clone().sub(camera.position);raycaster.set(camera.position,direction.clone().normalize());raycaster.far=direction.length()-.25;
   for(const hit of raycaster.intersectObjects(targets,true)){
    const o=hit.object;if(faded.has(o))continue;
    const original=o.material;let translucent=fadeMaterials.get(o);
    if(!translucent){translucent=original.clone();translucent.transparent=true;translucent.opacity=.10;translucent.depthWrite=false;fadeMaterials.set(o,translucent);}
    faded.set(o,original);o.material=translucent;
   }
  }
 }
}
function cancelAction(){holding=null;if($('torque'))$('torque').hidden=true;actionPointer=null;}
function resetKeys(){keys.clear();drag=null;lookTouches.clear();joystick?.reset();stick={x:0,y:0,magnitude:0};velocity.set(0,0,0);moveAmount=0;cancelAction();}
function setInventory(open){$('inventory-drawer').classList.toggle('expanded',open);$('inventory-toggle').setAttribute('aria-expanded',String(open));if(open)resetKeys();}
$('inventory-toggle').onclick=()=>setInventory(!$('inventory-drawer').classList.contains('expanded'));
joystick=attachJoystick($('joystick'),$('joystick-knob'),v=>{stick=v;});
setInventory(!isTouch);
window.addEventListener('blur',resetKeys);document.addEventListener('visibilitychange',()=>{if(document.hidden)resetKeys();});
document.addEventListener('keydown',e=>{
 if(e.target instanceof HTMLInputElement||e.target instanceof HTMLSelectElement||e.target instanceof HTMLTextAreaElement||$('earth-dialog').open||$('help-dialog').open||$('missions-dialog').open)return;
 if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
 keys.add(e.code);if(e.repeat)return;
 if(e.code==='KeyE')beginAction();if(e.code==='KeyV')toggleView();if(e.code==='KeyM')toggleMap();if(e.code==='KeyI')setInventory(!$('inventory-drawer').classList.contains('expanded'));
 if(e.code==='KeyR'&&ready){resetKeys();cameraSnap=true;astronaut.group.position.fromArray(state.zone==='inside'?spawnInside:spawnOutside);velocity.set(0,0,0);say('Returned to the entry point. Progress preserved.');}
 const i=ITEMS.find(i=>'Digit'+i.key===e.code);if(i)chooseTool(i.id);
});
document.addEventListener('keyup',e=>{keys.delete(e.code);if(e.code==='KeyE')endAction();});
$('action').addEventListener('pointerdown',e=>{if(actionPointer!==null)return;e.preventDefault();actionPointer=e.pointerId;$('action').setPointerCapture(e.pointerId);beginAction();});
$('action').addEventListener('pointerup',e=>{if(e.pointerId===actionPointer){actionPointer=null;endAction();}});
for(const event of ['pointercancel','lostpointercapture'])$('action').addEventListener(event,e=>{if(e.pointerId===actionPointer)cancelAction();});
$('action').addEventListener('keydown',e=>{if(e.code==='Enter'){e.preventDefault();if(!e.repeat)beginAction();}});
$('action').addEventListener('keyup',e=>{if(e.code==='Enter'){e.preventDefault();endAction();}});
$('inventory').addEventListener('click',e=>{const b=e.target.closest('[data-item]');if(b)chooseTool(b.dataset.item);});
$('missions-list').addEventListener('click',e=>{const b=e.target.closest('[data-goal]');if(b){selectedGoal=b.dataset.goal;drawMissions();$('missions-dialog').close();paused=false;showMap=false;say(TASKS.find(t=>t.id===selectedGoal).detail);}});
$('quick-bag').onclick=()=>{selectedGoal=state.zone==='inside'?'bag':'airlock';updateHUD();};
$('quick-suit').onclick=()=>{selectedGoal=state.zone==='inside'?'suit':'airlock';updateHUD();};
$('quick-earth').onclick=()=>{selectedGoal=state.zone==='inside'?'earth-console':'airlock';say('Fly to the Terra computer in the first module and press E or PERFORM.');updateHUD();};
$('quick-airlock').onclick=()=>{selectedGoal='airlock';updateHUD();};
function toggleView(){cameraSnap=true;firstPerson=!firstPerson;showMap=false;$('view-toggle').textContent=firstPerson?'View: eyes':'View: character';$('map').setAttribute('aria-pressed','false');}
function toggleMap(){resetKeys();showMap=!showMap;firstPerson=false;astronaut.group.visible=true;$('view-toggle').textContent='View: character';$('map').setAttribute('aria-pressed',String(showMap));if(showMap)say('Overview map. Press M to return to the astronaut.');}
$('view-toggle').onclick=toggleView;$('map').onclick=toggleMap;
$('missions').onclick=()=>{paused=true;resetKeys();drawMissions();$('missions-dialog').showModal();};
$('help').onclick=()=>{paused=true;resetKeys();$('help-dialog').showModal();};
for(const d of [$('help-dialog'),$('missions-dialog'),$('earth-dialog')]){d.addEventListener('close',()=>{resetKeys();paused=false;});d.querySelector('[data-close]').onclick=()=>d.close();}
$('save').onclick=()=>download(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),'Fix_ISS_progress_v2.json');
$('load').onclick=()=>$('load-file').click();
$('load-file').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{if(f.size>100000)throw Error('The file is too large.');const data=JSON.parse(await f.text());if(data.version!==2)throw Error('This is not a version 2 game save.');state=restoreState(data);switchZone('inside');astronaut.group.position.fromArray(spawnInside);toolId=null;syncVisuals();drawInventory();drawMissions();say('Repair progress and inventory loaded.');}catch(err){say('Could not load file: '+err.message);}e.target.value='';};
for(const b of document.querySelectorAll('[data-move]')){
 let id=null;
 b.onpointerdown=e=>{if(id!==null)return;e.preventDefault();id=e.pointerId;b.setPointerCapture(id);keys.add(b.dataset.move);b.classList.add('pressed');};
 const release=e=>{if(id===e.pointerId){id=null;keys.delete(b.dataset.move);b.classList.remove('pressed');}};
 for(const type of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(type,release);
}
view.addEventListener('contextmenu',e=>e.preventDefault());
view.addEventListener('pointerdown',e=>{
 if(e.target.tagName!=='CANVAS')return;e.preventDefault();view.setPointerCapture(e.pointerId);
 lookTouches.set(e.pointerId,{x:e.clientX,y:e.clientY});if(lookTouches.size===1)drag={id:e.pointerId,x:e.clientX,y:e.clientY};
});
view.addEventListener('pointermove',e=>{
 if(!lookTouches.has(e.pointerId))return;e.preventDefault();
 const old=[...lookTouches.values()];lookTouches.set(e.pointerId,{x:e.clientX,y:e.clientY});
 if(lookTouches.size===2){const now=[...lookTouches.values()],before=Math.hypot(old[0].x-old[1].x,old[0].y-old[1].y),after=Math.hypot(now[0].x-now[1].x,now[0].y-now[1].y);camDistance=T.MathUtils.clamp(camDistance+(before-after)*.012,4.6,9);drag=null;return;}
 if(!drag||drag.id!==e.pointerId){drag={id:e.pointerId,x:e.clientX,y:e.clientY};return;}
 const factor=e.pointerType==='touch'?.004:.0045;
 camYaw-=(e.clientX-drag.x)*factor;camPitch=T.MathUtils.clamp(camPitch+(e.clientY-drag.y)*factor,-.24,.85);drag={id:e.pointerId,x:e.clientX,y:e.clientY};
});
const releaseLook=e=>{lookTouches.delete(e.pointerId);if(drag?.id===e.pointerId)drag=null;};
for(const type of ['pointerup','pointercancel','lostpointercapture'])view.addEventListener(type,releaseLook);
view.addEventListener('wheel',e=>{e.preventDefault();camDistance=T.MathUtils.clamp(camDistance+e.deltaY*.004,4.6,9);},{passive:false});
async function loadNASA(){
 $('map-loading').hidden=false;$('map-loading').textContent='NASA ISS: loading model…';
 new GLTFLoader().load('./assets/iss-nasa.glb',gltf=>{
  nasa=gltf.scene;nasa.name='NASA_VTAD_ISS_HISTORICAL';nasa.visible=state.zone==='outside';scene.add(nasa);nasa.updateMatrixWorld(true);
  $('map-loading').textContent='NASA ISS: preparing collision…';
  new GLTFLoader().load('./assets/iss-collision.glb',collision=>{
   setTimeout(()=>{try{outsideTree=new Octree().fromGraphNode(collision.scene);outsideReady=true;$('map-loading').textContent='ISS MAP READY';$('map-loading').classList.add('ready');}catch(e){say('The model opened, but collision setup failed. EVA exit is paused.');$('map-loading').textContent='Map collision error';}},30);
  },undefined,()=>{say('The collision layer could not be loaded. Retry the ISS map.');$('map-loading').textContent='Collision download error';$('retry').hidden=false;});
 },e=>{if(e.lengthComputable)$('map-loading').textContent=`NASA ISS: ${Math.floor(e.loaded/e.total*100)}%`;},err=>{console.error(err);$('map-loading').textContent='ISS map could not be loaded';$('retry').hidden=false;});
}
$('retry').onclick=()=>{
 $('retry').hidden=true;
 if(nasa){
  scene.remove(nasa);
  nasa.traverse(o=>{
   if(!o.isMesh)return;
   o.geometry.dispose();
   const materials=Array.isArray(o.material)?o.material:[o.material];
   for(const m of materials){for(const value of Object.values(m))if(value?.isTexture)value.dispose();m.dispose();}
  });
  nasa=null;
 }
 outsideReady=false;loadNASA();
};
function registerTools(){
 if(!document.modelContext?.registerTool)return;
 const controller=new AbortController();
 const tools=[
 {name:'read_iss_game_state',title:'ISS game state',description:'Read the current zone, astronaut position, inventory, nearest station, and repair progress.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>({zone:state.zone,position:astronaut.group.position.toArray(),bag:state.bag,suit:state.suit,selected:state.selected,items:state.items,tasks:state.tasks,nearest:nearest?.id||null})},
 {name:'select_iss_tool',title:'Select tool',description:'Select an available tool from the same inventory used by the player. Does not perform a repair.',inputSchema:{type:'object',properties:{item:{type:'string',enum:ITEMS.map(i=>i.id)}},required:['item'],additionalProperties:false},execute:input=>{if(!input||typeof input.item!=='string'||Object.keys(input).some(k=>k!=='item'))throw Error('Invalid input');const r=selectItem(state,input.item);toolId=null;syncVisuals();drawInventory();return {...r,selected:state.selected};}},
 {name:'set_iss_navigation_goal',title:'Set navigation goal',description:'Select an existing station or airlock as the navigation target. Does not teleport the astronaut or perform repairs.',inputSchema:{type:'object',properties:{goal:{type:'string',enum:['bag','suit','airlock','earth-console',...TASKS.map(t=>t.id)]}},required:['goal'],additionalProperties:false},execute:input=>{if(!input||!goals().some(g=>g.id===input.goal)||Object.keys(input).some(k=>k!=='goal'))throw Error('Invalid goal');selectedGoal=input.goal;drawMissions();updateHUD();return {goal:selectedGoal};}}
 ];
 for(const t of tools)try{Promise.resolve(document.modelContext.registerTool(t,{signal:controller.signal})).catch(()=>{});}catch{}
 window.addEventListener('pagehide',()=>controller.abort(),{once:true});
}
function init(){
 try{
  scene=new T.Scene();scene.background=new T.Color(0x0e2335);camera=new T.PerspectiveCamera(72,1,.06,1800);camera.position.set(0,1.45,-.4);
  renderer=new T.WebGLRenderer({antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.65));renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.92;renderer.outputColorSpace=T.SRGBColorSpace;view.prepend(renderer.domElement);renderer.domElement.setAttribute('aria-label','3D map and controllable astronaut');
  scene.add(new T.HemisphereLight(0xd4eeff,0x334353,2.3));const sun=new T.DirectionalLight(0xfff1d1,2.3);sun.position.set(-25,50,35);scene.add(sun);
  const pmrem=new T.PMREMGenerator(renderer),room=new RoomEnvironment();scene.environment=pmrem.fromScene(room,.04).texture;room.dispose();pmrem.dispose();
  interior=makeInterior();exterior=makeExteriorTraining();scene.add(interior.group,exterior.group);exterior.group.visible=false;
  for(const z of [4,14,24]){const l=new T.PointLight(0xc6e9ff,8,13,1);l.position.set(0,1.5,z);interior.group.add(l);}
  interior.group.updateMatrixWorld(true);insideTree=new Octree().fromGraphNode(interior.solids);
  astronaut=makeAstronaut();astronaut.group.position.fromArray(spawnInside);astronaut.group.rotation.y=Math.PI;scene.add(astronaut.group);
  const pts=[];let seed=7362;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<1700;i++){const v=new T.Vector3(random()-.5,random()-.5,random()-.5).normalize().multiplyScalar(550);pts.push(v.x,v.y,v.z);}
  const starsGeo=new T.BufferGeometry();starsGeo.setAttribute('position',new T.Float32BufferAttribute(pts,3));stars=new T.Points(starsGeo,new T.PointsMaterial({color:0xcbdfff,size:.55,sizeAttenuation:true}));stars.visible=false;scene.add(stars);
  earth=new T.Mesh(new T.SphereGeometry(220,48,32),new T.MeshStandardMaterial({color:0x245a85,roughness:1,metalness:0}));earth.name='Stylized_planet_background';earth.position.set(20,-270,-90);earth.visible=false;scene.add(earth);
  const lineGeo=new T.BufferGeometry();lineGeo.setAttribute('position',new T.Float32BufferAttribute([...EXIT,...spawnOutside],3));tether=new T.Line(lineGeo,new T.LineBasicMaterial({color:0xdeb677}));tether.visible=false;scene.add(tether);
  const resize=()=>{const w=view.clientWidth,h=view.clientHeight;renderer.setSize(w,h);camera.aspect=mapCam.aspect=w/h;camera.updateProjectionMatrix();mapCam.updateProjectionMatrix();};new ResizeObserver(resize).observe(view);resize();
  ready=true;$('loading').hidden=true;syncVisuals();drawInventory();drawMissions();registerTools();loadNASA();
  renderer.setAnimationLoop(now=>{const dt=Math.min((now-last)/1000,.04);last=now;animate(dt,now);});
 }catch(e){console.error(e);$('loading').innerHTML='<strong>3D graphics could not start.</strong><p>Enable WebGL or open the game in an up-to-date browser.</p><small>'+safe(e.message)+'</small>';}
}
init();