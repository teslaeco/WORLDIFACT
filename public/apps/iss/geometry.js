import * as T from 'three';
import {TASKS} from './game-state.js';
import {makeDetailedAstronaut,makeDetailedBag} from './astronaut.js';
export const mat={
 white:new T.MeshStandardMaterial({color:0xe7e9e5,roughness:.63,metalness:.08}),
 silver:new T.MeshStandardMaterial({color:0xa8b6bd,roughness:.3,metalness:.7}),
 dark:new T.MeshStandardMaterial({color:0x203344,roughness:.65}),
 blue:new T.MeshStandardMaterial({color:0x32658a,roughness:.6}),
 orange:new T.MeshStandardMaterial({color:0xe28431,roughness:.65}),
 visor:new T.MeshStandardMaterial({color:0x8d5c23,metalness:.85,roughness:.17}),
 rubber:new T.MeshStandardMaterial({color:0x20282e,roughness:.9}),
 gold:new T.MeshStandardMaterial({color:0xcdb066,metalness:.65,roughness:.38}),
 red:new T.MeshStandardMaterial({color:0xd4684d,roughness:.55}),
 green:new T.MeshStandardMaterial({color:0x6bdeb2,emissive:0x1d8a68,emissiveIntensity:.55}),
 light:new T.MeshStandardMaterial({color:0xc1efff,emissive:0x83bcdf,emissiveIntensity:1.8}),
 screen:new T.MeshStandardMaterial({color:0x0c3550,emissive:0x164f70,emissiveIntensity:.4}),
 skin:new T.MeshStandardMaterial({color:0xb98f72,roughness:.9})
};
export function box(parent,name,size,pos,material=mat.white){const o=new T.Mesh(new T.BoxGeometry(...size),material);o.name=name;o.position.set(...pos);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}
export function sphere(parent,name,size,pos,material=mat.white){const o=new T.Mesh(new T.SphereGeometry(1,24,16),material);o.name=name;o.scale.set(...size);o.position.set(...pos);o.castShadow=true;parent.add(o);return o;}
export function rod(parent,name,a,b,r=.035,material=mat.silver,segments=10){const va=new T.Vector3(...a),vb=new T.Vector3(...b),v=vb.clone().sub(va);const o=new T.Mesh(new T.CylinderGeometry(r,r,v.length(),segments),material);o.name=name;o.position.copy(va).add(vb).multiplyScalar(.5);o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),v.normalize());parent.add(o);return o;}
export function ring(parent,name,r,tube,pos,material=mat.silver){const o=new T.Mesh(new T.TorusGeometry(r,tube,8,32),material);o.name=name;o.position.set(...pos);parent.add(o);return o;}
export function sign(parent,text,pos,width=1.8,height=.26){
 if(typeof document==='undefined')return null;
 const c=document.createElement('canvas');c.width=1024;c.height=160;const x=c.getContext('2d');x.fillStyle='#132b3d';x.fillRect(0,0,1024,160);x.fillStyle='#d1edf6';x.font='bold 62px sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillText(text,512,80,960);
 const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;const o=new T.Mesh(new T.PlaneGeometry(width,height),new T.MeshBasicMaterial({map:tex,side:T.DoubleSide}));o.position.set(...pos);parent.add(o);return o;
}
export function makeTool(id){const g=new T.Group();g.name='Tool_'+id;
 if(id==='wrench'){
  box(g,'shaft',[.035,.3,.025],[0,0,0],mat.silver);ring(g,'box_end',.063,.021,[0,.2,0]);
  box(g,'jaw_left',[.027,.095,.04],[-.046,-.2,0],mat.silver);box(g,'jaw_right',[.027,.095,.04],[.046,-.2,0],mat.silver);box(g,'jaw_root',[.11,.03,.04],[0,-.158,0],mat.silver);
 }else if(id==='driver'){
  box(g,'grip',[.09,.19,.08],[0,-.07,0],mat.blue);rod(g,'shank',[0,.02,0],[0,.25,0],.014);box(g,'tip',[.035,.025,.014],[0,.26,0],mat.silver);
 }else if(id==='meter'){
  box(g,'case',[.18,.27,.07],[0,0,0],mat.orange);box(g,'display',[.13,.09,.008],[0,.055,-.04],mat.screen);sphere(g,'selector',[.04,.04,.014],[0,-.055,-.05],mat.rubber);
  rod(g,'probe_red',[.1,-.1,0],[.16,.16,0],.009,mat.red);rod(g,'probe_black',[-.1,-.1,0],[-.16,.16,0],.009,mat.rubber);
 }else if(id==='fuse'){
  box(g,'cartridge',[.15,.24,.075],[0,0,0],mat.blue);for(const x of [-.048,.048])rod(g,'contact',[x,-.12,0],[x,-.19,0],.012,mat.gold);
 }else if(id==='filter'){
  box(g,'frame',[.26,.32,.06],[0,0,0],mat.silver);for(let i=0;i<8;i++)box(g,'pleat',[.018,.27,.075],[-.1+i*.029,0,0],mat.white);
 }else if(id==='patch'){
  box(g,'patch',[.23,.26,.02],[0,0,0],mat.gold);box(g,'backing',[.18,.2,.02],[0,0,-.02],mat.white);
 }else if(id==='connector'){
  rod(g,'plug',[0,-.12,0],[0,.12,0],.055,mat.blue);rod(g,'pins',[0,.12,0],[0,.17,0],.035,mat.gold);
 }else if(id==='parts')g.add(makeNut());
 return g;
}
export function makeNut(){const s=new T.Shape();for(let i=0;i<6;i++){const x=Math.cos(i*Math.PI/3)*.08,y=Math.sin(i*Math.PI/3)*.08;if(i===0)s.moveTo(x,y);else s.lineTo(x,y);}s.closePath();const h=new T.Path();h.absarc(0,0,.036,0,Math.PI*2,true);s.holes.push(h);const g=new T.ExtrudeGeometry(s,{depth:.045,bevelEnabled:true,bevelSegments:1,steps:1,bevelSize:.003,bevelThickness:.003});return new T.Mesh(g,mat.silver);}
export const makeBag=makeDetailedBag;
export const makeAstronaut=makeDetailedAstronaut;
function hatch(parent,z,name){const group=new T.Group();group.position.z=z;parent.add(group);group.name=name;
 for(const x of [-2.27,2.27])box(group,'bulkhead_side',[1.46,4,.25],[x,0,0],mat.silver);
 for(const y of [-1.83,1.83])box(group,'bulkhead_top',[3.1,.34,.25],[0,y,0],mat.silver);
 const leaves=[];for(const side of [-1,1]){const leaf=box(group,'hatch_leaf',[1.46,3.25,.16],[side*.735,0,0],mat.white);box(leaf,'handle',[.08,.45,.09],[-side*.5,0,-.14],mat.orange);leaves.push(leaf);}
 sign(group,name,[0,1.51,-.15],2.2,.2)?.rotateY(Math.PI);return {group,leaves,z,open:false};
}
export function makeStationTask(t){const g=new T.Group();g.name='TRAINING_'+t.id;g.position.fromArray(t.pos);g.userData={training:true,taskId:t.id};
 box(g,'frame',[1.3,1.05,.23],[0,0,0],mat.silver);box(g,'face',[1.18,.94,.04],[0,0,.14],mat.dark);
 const cover=box(g,'cover',[1.07,.77,.04],[0,0,.36],mat.white);const bolts=[];
 const count=t.kind==='torque'?t.count:4;
 for(let i=0;i<count;i++){const x=(i%2===0?-.43:.43),y=i<2?.3:-.3;let b;
  if(t.id==='nuts'){b=makeNut();b.position.set(x,y,.43);g.add(b);rod(g,'stud',[x,y,.16],[x,y,.55],.034,mat.silver);}
  else {b=rod(g,'bolt_'+i,[x,y,.365],[x,y,.45],.06,mat.silver,6);if(t.id==='rack'){box(b,'screw_slot',[.075,.005,.012],[0,.044,0],mat.dark);box(b,'screw_slot',[.012,.005,.075],[0,.044,0],mat.dark);}}
  b.name='interactive_fastener_'+i;b.userData.initialZ=b.position.z;bolts.push(b);
 }
 const led=sphere(g,'status_lamp',[.055,.055,.03],[.49,.44,.22],mat.orange);
 sign(g,t.name.toUpperCase(),[0,.68,.1],2.05,.21);
 const internals=new T.Group();internals.position.z=.20;g.add(internals);
 if(t.id==='fuse')for(let i=0;i<3;i++){const p=makeTool('fuse');p.position.set(-.3+i*.3,0,0);internals.add(p);}
 if(t.id==='filter'){const f=makeTool('filter');f.scale.setScalar(2);internals.add(f);}
 if(t.id==='seal'){ring(internals,'test_chamber',.25,.055,[0,0,0],mat.gold);box(internals,'sealed_patch',[.27,.27,.035],[0,0,.06],mat.gold).visible=false;}
 if(t.id==='connector'){const c=makeTool('connector');c.rotation.z=Math.PI/2;c.scale.setScalar(1.7);internals.add(c);}
 if(t.id==='solar'){const p=box(g,'training_solar_panel',[1.4,1.1,.045],[0,1.5,.05],mat.blue);for(let i=0;i<5;i++)box(p,'cell_line',[.012,1.06,.012],[-.55+i*.27,0,.03],mat.silver);p.rotation.y=.8;g.userData.solarPanel=p;}
 return {group:g,cover,bolts,led,internals};
}
export function makeInterior(){const group=new T.Group();group.name='FORGE_Training_Interior';const solids=new T.Group();group.add(solids);const interact=[];
 box(solids,'floor',[6,.18,28],[0,-2.09,14],mat.dark);box(solids,'ceiling',[6,.18,28],[0,2.09,14],mat.white);
 for(const x of [-3,3])box(solids,'sidewall',[.18,4.2,28],[x,0,14],mat.white);
 box(solids,'end_wall',[6,4.2,.18],[0,0,-.09],mat.white);box(solids,'airlock_end',[6,4.2,.18],[0,0,28.09],mat.white);
 for(let z=0;z<=28;z+=2){
  for(const x of [-2.83,2.83]){box(group,'rib',[.12,4,.1],[x,0,z],mat.silver);rod(group,'handrail',[x*.87,.65,z+.2],[x*.87,.65,z+1.5],.036,mat.orange);}
  for(const x of [-1.8,1.8])box(group,'ceiling_light',[.05,.03,1.25],[x,1.97,z+.6],mat.light);
  box(group,'floor_track',[.05,.014,1.1],[0,-1.99,z+.6],mat.blue);
 }
 for(const x of [-2.58,2.58])for(const z of [2,5,8,12,15,18]){
  box(solids,'equipment_rack',[.66,2.8,1.7],[x,-.4,z],mat.white);
  const faceX=x>0?x-.34:x+.34;
  for(const y of [-1.15,-.4,.35]){box(group,'rack_panel',[.025,.59,1.45],[faceX,y,z],mat.silver);for(let i=0;i<4;i++)box(group,'vent_slot',[.03,.023,.65],[faceX+(x>0?-.018:.018),y-.17+i*.09,z],mat.dark);}
  for(const zz of [-.6,.6])rod(group,'rack_grip',[faceX+(x>0?-.05:.05),-.5,z+zz],[faceX+(x>0?-.05:.05),-.1,z+zz],.035,mat.blue);
 }
 // Cable bundles, straps and stowage bags make the playable interior legible.
 for(let i=0;i<4;i++)rod(group,'cable_bundle',[2.72,1.58+i*.055,.3],[2.72,1.58+i*.055,27.5],.018,i===0?mat.red:mat.dark);
 for(const z of [3.5,6.5,13,17]){box(group,'stowage_soft_case',[.65,.45,.5],[-2.35,1.25,z],mat.white);box(group,'stowage_blue_strap',[.69,.05,.51],[-2.35,1.25,z],mat.blue);}
 // Terra observation terminal, in the first module between equipment racks.
 const terminal=new T.Group();terminal.name='Terra_Observation_Computer';terminal.position.set(-2,-.15,6.5);terminal.rotation.y=Math.PI/2;solids.add(terminal);
 box(terminal,'console_body',[1.15,1.1,.38],[0,-.35,0],mat.dark);
 box(terminal,'earth_monitor',[1.05,.7,.08],[0,.48,.05],mat.silver);
 box(terminal,'earth_screen',[.93,.58,.025],[0,.48,.104],mat.screen);
 box(terminal,'keyboard',[.94,.08,.48],[0,-.02,.30],mat.blue);
 sign(terminal,'TERRA / EARTH OBSERVATION',[0,.48,.122],.89,.14);
 sign(terminal,'NILE RIVER MISSION',[0,1.02,.06],1.7,.2);
 const doors=[hatch(group,10,'LABORATORY'),hatch(group,20,'EVA AIRLOCK')];
 group.updateMatrixWorld(true);
 for(const d of doors)for(const o of [...d.group.children])if(o.name.startsWith('bulkhead_'))solids.attach(o);
 const bag=makeBag();bag.position.set(1.7,-.85,4);group.add(bag);sign(group,'TOOL BAG',[1.5,-.1,4],1.9,.2)?.rotateY(Math.PI);
 const locker=box(solids,'suit_locker',[.6,2.7,1.6],[-2.6,-.2,24],mat.blue);
 const mannequin=makeAstronaut();mannequin.group.position.set(-1.9,-.55,24);mannequin.setEquipment(false,true);mannequin.group.rotation.y=Math.PI/2;group.add(mannequin.group);
 sign(group,'EVA SUIT',[-1.8,1,24],1.5,.2)?.rotateY(Math.PI);
 ring(group,'airlock_portal',1.2,.12,[0,0,27.85],mat.silver);sign(group,'EXTERIOR EXIT',[0,1.48,27.75],2.4,.22)?.rotateY(Math.PI);
 const tasks={};for(const t of TASKS.filter(t=>t.zone==='inside')){const o=makeStationTask(t);o.group.rotation.y=t.pos[0]<0?Math.PI/2:-Math.PI/2;group.add(o.group);tasks[t.id]=o;}
 return {group,solids,doors,bag,mannequin,tasks};
}
export const EXIT=[-5.2,-4.7,0];
export function makeExteriorTraining(){const group=new T.Group();group.name='FORGE_Exterior_Training_Overlay';const tasks={};
 const portal=new T.Group();portal.position.fromArray(EXIT);group.add(portal);ring(portal,'training_entry',.9,.09,[0,0,0],mat.blue);sign(portal,'RETURN TO AIRLOCK',[0,1.3,0],2.2,.25);
 rod(group,'training_rail',[-8,-5.9,-.4],[-28,-5.9,-.4],.05,mat.orange);
 for(let x=-8;x>=-28;x-=2){rod(group,'rail_stanchion',[x,-5.9,-.4],[x,-6.7,-.4],.035);rod(group,'rail_tie',[x,-6.7,-.4],[x+1,-5.9,-.4],.025);}
 rod(group,'second_rail',[-8,-5.9,4.2],[-24,-5.9,4.2],.05,mat.orange);
 for(const t of TASKS.filter(t=>t.zone==='outside')){const o=makeStationTask(t);group.add(o.group);tasks[t.id]=o;rod(group,'task_mount',[t.pos[0],-5.9,t.pos[2]],[t.pos[0],t.pos[1]-.5,t.pos[2]],.045);}
 return {group,tasks,portal};
}