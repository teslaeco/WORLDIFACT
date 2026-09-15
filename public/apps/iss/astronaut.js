import * as T from 'three';
import {RoundedBoxGeometry} from './vendor/examples/jsm/geometries/RoundedBoxGeometry.js';

// Original FORGE suit. All geometry is editable; the left glove and handle
// share a wrist coordinate frame, so animation cannot detach their contact.
const material=(color,roughness=.65,metalness=0)=>new T.MeshStandardMaterial({color,roughness,metalness});
const M={cloth:material(0xe3e8e8,.87),panel:material(0xcbd5d9,.74),seam:material(0x899da5,.82),rubber:material(0x253440,.88),blue:material(0x235873,.63),orange:material(0xcb7735,.87),edge:material(0xe7aa63,.72),metal:material(0x9bafb8,.32,.72),visor:material(0xae8036,.15,.88),skin:material(0xbe967e,.82),lip:material(0x95685b,.86),eyes:material(0xe5e7de,.48),iris:material(0x426073,.36),pupil:material(0x101d24,.32),cap:material(0x394b58,.95),screen:material(0x12354a,.45)};
const GLOVE_RADIUS=.0115,HANDLE_RADIUS=.014,GRIP_RADIUS=.026;
export const GRIP={center:[0,-.14,-.05],radius:GRIP_RADIUS,fingerRadius:GLOVE_RADIUS,handleRadius:HANDLE_RADIUS,fingerX:[-.048,-.016,.016,.048]};
function mesh(p,name,geo,mat=M.cloth,pos=[0,0,0]){const m=new T.Mesh(geo,mat);m.name=name;m.position.fromArray(pos);m.castShadow=m.receiveShadow=true;p.add(m);return m;}
function smoothBox(p,n,size,pos,mat=M.cloth,r=.018){return mesh(p,n,new RoundedBoxGeometry(...size,3,r),mat,pos);}
function oval(p,n,size,pos,mat=M.cloth){const m=mesh(p,n,new T.SphereGeometry(1,32,24),mat,pos);m.scale.fromArray(size);return m;}
function tube(p,n,points,r,mat=M.cloth){const curve=new T.CatmullRomCurve3(points.map(a=>new T.Vector3(...a)));return mesh(p,n,new T.TubeGeometry(curve,Math.max(12,points.length*5),r,8,false),mat);}
function bar(p,n,a,b,r,mat=M.metal){const v=new T.Vector3(...b).sub(new T.Vector3(...a));const m=mesh(p,n,new T.CylinderGeometry(r,r,v.length(),12),mat,new T.Vector3(...a).add(new T.Vector3(...b)).multiplyScalar(.5).toArray());m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),v.normalize());return m;}
function hoop(p,n,r,t,y,mat=M.rubber,sx=1,sz=1){const m=mesh(p,n,new T.TorusGeometry(r,t,8,36),mat,[0,y,0]);m.rotation.x=Math.PI/2;m.scale.set(sx,sz,1);return m;}
function garment(p,name,rings,mat=M.cloth){
 const v=[],ix=[],uv=[],N=40;
 for(let j=0;j<rings.length;j++){const [y,rx,rz,cx=0,cz=0]=rings[j];for(let i=0;i<=N;i++){const a=i/N*Math.PI*2;const ripple=1+.006*Math.sin(i*.9+j*.75);v.push(cx+rx*Math.cos(a)*ripple,y,cz+rz*Math.sin(a)*ripple);uv.push(i/N,j/(rings.length-1));if(j&&i){const a=j*(N+1)+i;ix.push(a,a-1,a-N-1,a-1,a-N-2,a-N-1);}}}
 for(const j of [0,rings.length-1]){const [y,rx,rz,cx=0,cz=0]=rings[j],center=v.length/3;v.push(cx,y,cz);uv.push(.5,.5);const base=j*(N+1);for(let i=0;i<N;i++)ix.push(...(j===0?[center,base+i+1,base+i]:[center,base+i,base+i+1]));}
 const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(v,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geo.setIndex(ix);geo.computeVertexNormals();
 // Profile rings run from bottom to top; outside faces need the inverse winding.
 const ind=geo.index.array;for(let i=0;i<ind.length;i+=3)[ind[i+1],ind[i+2]]=[ind[i+2],ind[i+1]];geo.computeVertexNormals();
 return mesh(p,name,geo,mat);
}
function face(parent){
 const head=new T.Group();head.name='Head_and_communications_cap';head.position.y=.865;parent.add(head);
 garment(head,'face_contour',[[-.185,.035,.04,0,-.023],[-.163,.075,.072,0,-.016],[-.13,.105,.089],[-.065,.126,.11],[.015,.134,.123],[.08,.137,.124],[.15,.109,.10],[.187,.052,.057],[.193,.001,.001]],M.skin);
 garment(head,'communications_cap',[[.075,.145,.133],[.102,.139,.128],[.155,.117,.109],[.19,.065,.068],[.205,.003,.003]],M.cap);
 tube(head,'cap_center_seam',[[0,.207,0],[0,.19,.069],[0,.154,.111],[0,.075,.135]],.003,M.seam);
 for(const s of [-1,1]){
  oval(head,'ear',[.024,.047,.026],[s*.131,-.03,.009],M.skin);
  smoothBox(head,'headset_pad',[.022,.074,.065],[s*.148,.008,.023],M.rubber,.012);
  oval(head,'eye_white',[.031,.017,.012],[s*.050,.020,-.110],M.eyes);
  oval(head,'iris',[.011,.013,.006],[s*.048,.02,-.121],M.iris);
  oval(head,'pupil',[.005,.008,.003],[s*.048,.02,-.126],M.pupil);
  tube(head,'upper_eyelid',[[s*.020,.023,-.116],[s*.048,.036,-.118],[s*.079,.025,-.109]],.004,M.skin);
  tube(head,'eyebrow',[[s*.022,.054,-.112],[s*.046,.058,-.119],[s*.076,.047,-.109]],.0045,M.cap);
 }
 oval(head,'nose_bridge',[.018,.041,.021],[0,-.004,-.119],M.skin);
 oval(head,'nose_tip',[.025,.015,.021],[0,-.035,-.140],M.skin);
 tube(head,'mouth',[[-.034,-.094,-.087],[0,-.098,-.101],[.034,-.094,-.087]],.004,M.lip);
 tube(head,'microphone_arm',[[.148,-.026,.01],[.160,-.069,-.07],[.105,-.11,-.145],[.058,-.103,-.152]],.006,M.rubber);
 smoothBox(head,'microphone',[.026,.015,.016],[.047,-.103,-.152],M.cap,.006);
 return head;
}
function makeHelmet(parent){
 const g=new T.Group();g.name='EVA_helmet';g.position.y=.89;parent.add(g);
 oval(g,'composite_helmet_shell',[.249,.258,.231],[0,.018,.014]);
 const v=[],ix=[];const nx=44,ny=30;
 function at(u,v,extra=0){const a=-1.02+u*2.04,b=-.67+v*1.29;return [(.249+extra)*Math.sin(a)*Math.cos(b),.018+(.255+extra)*Math.sin(b),.014-(.254+extra)*Math.cos(a)*Math.cos(b)];}
 for(let y=0;y<=ny;y++)for(let x=0;x<=nx;x++){v.push(...at(x/nx,y/ny));if(x&&y){const a=y*(nx+1)+x;ix.push(a,a-nx-1,a-1,a-1,a-nx-1,a-nx-2);}}
 const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(v,3));geo.setIndex(ix);geo.computeVertexNormals();M.visor.side=T.DoubleSide;mesh(g,'curved_gold_visor',geo,M.visor);
 for(const edge of [0,1]){tube(g,'visor_upper_lower_seal',Array.from({length:22},(_,i)=>at(i/21,edge,.003)),.009,M.rubber);tube(g,'visor_side_seal',Array.from({length:16},(_,i)=>at(edge,i/15,.003)),.009,M.rubber);}
 for(const s of [-1,1]){smoothBox(g,'helmet_hinge',[.044,.077,.063],[s*.239,.04,.014],M.metal,.014);smoothBox(g,'helmet_lamp',[.057,.037,.054],[s*.148,.210,-.054],M.rubber,.012);smoothBox(g,'lamp_lens',[.036,.024,.009],[s*.148,.210,-.084],M.eyes,.006);}
 return g;
}
function makeHand(parent,sign){
 const g=new T.Group();g.name=sign<0?'Left_wrist':'Right_wrist';parent.add(g);
 smoothBox(g,'glove_palm',[.129,.12,.057],[0,-.045,-.009],M.cloth,.025);
 smoothBox(g,'palm_reinforcement',[.099,.075,.013],[0,-.05,-.042],M.panel,.008);
 const open=new T.Group(),closed=new T.Group();open.name='Open_fingers';closed.name='Curled_fingers';g.add(open,closed);
 const samples=[];
 for(const [i,x] of GRIP.fingerX.entries()){
  const len=[.083,.105,.100,.078][i];tube(open,'open_finger_'+i,[[x,-.094,-.018],[x,-.13,-.028],[x,-.094-len,-.025]],GLOVE_RADIUS,M.cloth);
  const pts=[];for(let j=0;j<=20;j++){const a=-j/20*4.15;pts.push([x,GRIP.center[1]+GRIP_RADIUS*Math.cos(a),GRIP.center[2]+GRIP_RADIUS*Math.sin(a)]);}
  tube(closed,'gripping_finger_'+i,[[x,-.094,-.018],...pts],GLOVE_RADIUS,M.cloth);
  tube(closed,'finger_reinforcement_'+i,pts.slice(6,14),.0120,M.panel);
  samples.push(...pts.map(p=>({position:p,radius:GLOVE_RADIUS})));
 }
 const ts=-sign;
 tube(open,'open_thumb',[[ts*.058,-.017,-.017],[ts*.085,-.053,-.020],[ts*.090,-.09,-.027]],.015,M.cloth);
 tube(closed,'opposed_thumb',[[ts*.056,-.022,-.014],[ts*.078,-.059,-.049],[ts*.072,-.110,-.079],[ts*.05,-.132,-.076]],.013,M.cloth);
 closed.visible=false;
 const grip=new T.Group();grip.name=sign<0?'Left_hand_grip':'Right_hand_grip';grip.position.fromArray(GRIP.center);g.add(grip);
 g.userData.gripSamples=samples;
 return {group:g,open,closed,grip};
}
export function makeDetailedBag(){
 const g=new T.Group();g.name='FORGE_soft_tool_bag';g.userData.handleCenter=[0,.31,0];
 smoothBox(g,'fabric_bag',[.45,.33,.23],[0,0,0],M.orange,.039);
 smoothBox(g,'reinforced_base',[.465,.040,.242],[0,-.148,0],M.rubber,.012);
 smoothBox(g,'zip_lid',[.452,.049,.231],[0,.16,0],M.rubber,.015);
 for(const s of [-1,1]){
  smoothBox(g,'webbing_strap',[.030,.318,.243],[s*.154,.014,0],M.blue,.008);
  bar(g,'handle_upright',[s*.132,.18,0],[s*.115,.31,0],HANDLE_RADIUS,M.rubber);
  smoothBox(g,'outer_pocket',[.114,.17,.035],[s*.082,-.012,-.127],M.orange,.014);
  tube(g,'pocket_stitch',[[s*.082-.043,.063,-.15],[s*.082-.043,-.079,-.15],[s*.082+.043,-.079,-.15],[s*.082+.043,.063,-.15]],.002,M.edge);
 }
 const handle=bar(g,'HANDLE_CONTACT_BAR',[-.115,.31,0],[.115,.31,0],HANDLE_RADIUS,M.rubber);handle.userData.contactRadius=HANDLE_RADIUS;
 for(let i=0;i<8;i++)bar(g,'handle_grip_ridge',[-.094+i*.027,.31,-.014],[-.094+i*.027,.31,.014],.002,M.seam);
 smoothBox(g,'bag_label',[.085,.039,.004],[0,.09,-.141],M.panel,.004);
 // Miniature tools sit in sewn pockets; they do not enter the grip space.
 bar(g,'pocket_driver_shaft',[-.082,-.006,-.157],[-.082,.10,-.157],.008,M.metal);
 smoothBox(g,'pocket_driver_grip',[.030,.064,.025],[-.082,.115,-.158],M.blue,.008);
 bar(g,'pocket_wrench_shaft',[.080,-.007,-.16],[.080,.115,-.16],.011,M.metal);
 bar(g,'wrench_jaw_left',[.059,.11,-.16],[.059,.144,-.16],.008,M.metal);bar(g,'wrench_jaw_right',[.101,.11,-.16],[.101,.144,-.16],.008,M.metal);
 return g;
}
export function makeDetailedAstronaut(){
 const g=new T.Group();g.name='FORGE_Astronaut_v3';g.userData={provenance:'Original FORGE EVA training character, articulated hands',heightApproxMeters:2.1};
 garment(g,'continuous_torso',[[.015,.166,.127],[.055,.205,.145],[.14,.224,.152],[.25,.235,.161],[.38,.262,.174],[.49,.284,.168],[.555,.268,.145],[.605,.214,.131],[.628,.146,.12]]);
 garment(g,'waist_and_pelvis',[[-.116,.122,.093],[-.09,.191,.128],[-.025,.214,.142],[.035,.207,.143],[.085,.194,.133]],M.panel);
 for(const s of [-1,1]){
  tube(g,'torso_side_seam',[[s*.203,.1,-.09],[s*.234,.26,-.108],[s*.252,.44,-.118],[s*.224,.566,-.098]],.004,M.seam);
  smoothBox(g,'shoulder_webbing',[.042,.24,.018],[s*.197,.463,-.150],M.blue,.007).rotation.z=s*.18;
 }
 hoop(g,'sealed_neck_ring',.15,.028,.632,M.metal,1.04,.86);hoop(g,'neck_soft_seal',.135,.017,.677,M.rubber);
 garment(g,'neck_inside_collar',[[.585,.090,.082],[.65,.095,.084],[.72,.074,.075],[.77,.071,.077]],M.skin);
 garment(g,'inner_neck_liner',[[.59,.120,.108],[.665,.119,.105],[.69,.098,.090]],M.cap);
 smoothBox(g,'chest_console',[.263,.187,.067],[0,.379,-.174],M.panel,.028);
 smoothBox(g,'console_face',[.224,.145,.023],[0,.383,-.214],M.rubber,.014);
 smoothBox(g,'console_screen',[.118,.047,.009],[-.032,.413,-.229],M.screen,.007);
 for(let i=0;i<3;i++)smoothBox(g,'screen_indicator',[.012+i*.005,.008,.002],[-.072+i*.030,.413,-.235],M.edge,.002);
 for(let i=0;i<3;i++){bar(g,'console_knob',[-.067+i*.066,.352,-.231],[-.067+i*.066,.352,-.249],.016,i===0?M.orange:M.metal);}
 smoothBox(g,'upper_chest_patch',[.085,.039,.012],[.12,.536,-.146],M.blue,.007);
 for(const s of [-1,1]){const port=hoop(g,'umbilical_port',.032,.012,.132,M.metal);port.rotation.x=0;port.position.set(s*.126,.132,-.147);}
 tube(g,'life_support_hose',[[.15,.133,-.158],[.252,.061,-.187],[.303,.038,-.019],[.286,.204,.168],[.204,.312,.262]],.022,M.rubber);
 const head=face(g),helmet=makeHelmet(g),pack=new T.Group();pack.name='EVA_backpack';g.add(pack);
 smoothBox(pack,'life_support_unit',[.417,.575,.23],[0,.359,.259],M.cloth,.058);
 smoothBox(pack,'backpack_service_panel',[.327,.366,.017],[0,.394,.383],M.panel,.017);
 smoothBox(pack,'backpack_top_cap',[.375,.073,.26],[0,.652,.255],M.rubber,.023);
 for(const x of [-.142,.142])smoothBox(pack,'backpack_rail',[.029,.42,.036],[x,.392,.401],M.blue,.009);
 for(let i=0;i<4;i++)smoothBox(pack,'backpack_louvre',[.16,.009,.012],[0,.486-i*.034,.398],M.seam,.004);
 const arms=[],forearms=[],hands=[],legs=[],shins=[];
 for(const s of [-1,1]){
  const arm=new T.Group();arm.name=s<0?'Arm_L':'Arm_R';arm.position.set(s*.289,.535,0);arm.rotation.z=s*.13;g.add(arm);arms.push(arm);
  garment(arm,'tailored_upper_sleeve',[[-.31,.078,.079,s*.012],[-.266,.094,.087,s*.010],[-.185,.100,.100],[-.09,.108,.112],[.01,.114,.11],[.048,.071,.077],[.073,.029,.037],[.079,.001,.001]]);
  smoothBox(arm,'shoulder_patch',[.017,.089,.097],[s*.11,-.094,0],M.blue,.008);
  const forearm=new T.Group();forearm.name='Elbow_'+s;forearm.position.set(s*.012,-.31,0);arm.add(forearm);forearms.push(forearm);
  hoop(forearm,'elbow_flex_ring',.079,.014,.001,M.rubber);
  garment(forearm,'tailored_forearm',[[-.30,.065,.063],[-.27,.077,.077],[-.205,.078,.079],[-.11,.089,.083],[-.019,.082,.080],[.016,.074,.073]]);
  for(let i=0;i<3;i++)hoop(forearm,'elbow_fabric_fold',.084-i*.001,.005,-.039-i*.020,M.panel);
  hoop(forearm,'wrist_lock',.069,.016,-.283,M.metal);hoop(forearm,'wrist_seal',.067,.010,-.305,M.rubber);
  const hand=makeHand(forearm,s);hand.group.position.y=-.315;hands.push(hand);
  const leg=new T.Group();leg.name=s<0?'Leg_L':'Leg_R';leg.position.set(s*.122,-.078,0);g.add(leg);legs.push(leg);
  garment(leg,'thigh_fabric',[[-.395,.089,.101],[-.323,.100,.111],[-.19,.112,.119],[-.045,.119,.126],[.03,.095,.100]]);
  const shin=new T.Group();shin.name='Knee_'+s;shin.position.y=-.397;leg.add(shin);shins.push(shin);
  hoop(shin,'knee_flex',.084,.013,0,M.rubber,1,1.1);
  garment(shin,'shin_fabric',[[-.356,.080,.092],[-.27,.087,.102],[-.142,.092,.103],[-.014,.088,.10],[.022,.083,.094]]);
  smoothBox(shin,'knee_reinforcement',[.14,.12,.021],[0,.025,-.100],M.panel,.033);
  for(let i=0;i<3;i++)hoop(shin,'ankle_fabric_fold',.088,.005,-.23-i*.023,M.panel,1,1.12);
  smoothBox(shin,'shaped_boot',[.205,.164,.317],[0,-.374,-.050],M.cloth,.055);
  smoothBox(shin,'reinforced_toecap',[.197,.079,.132],[0,-.383,-.158],M.panel,.027);
  smoothBox(shin,'boot_sole',[.213,.038,.326],[0,-.455,-.052],M.rubber,.012);
  for(let i=0;i<5;i++)smoothBox(shin,'sole_tread',[.191,.008,.016],[0,-.477,-.172+i*.060],M.seam,.003);
  tube(leg,'leg_seam',[[s*.076,-.036,-.100],[s*.076,-.175,-.094],[s*.060,-.335,-.081]],.0035,M.seam);
 }
 const bag=makeDetailedBag();bag.name='carried_tool_bag';bag.position.set(0,-.31,0);hands[0].grip.add(bag);
 const toolMount=new T.Group();toolMount.name='Tool_Mount';toolMount.rotation.x=-Math.PI/2;hands[1].grip.add(toolMount);
 helmet.visible=pack.visible=bag.visible=false;
 const api={group:g,helmet,pack,bag,head,arms,forearms,hands,legs,shins,toolMount};
 api.setEquipment=(hasBag,hasSuit,tool='hand')=>{bag.visible=hasBag;helmet.visible=pack.visible=hasSuit;head.visible=!hasSuit;hands[0].open.visible=!hasBag;hands[0].closed.visible=hasBag;hands[1].open.visible=tool==='hand';hands[1].closed.visible=tool!=='hand';};
 api.animate=(time,moving,working)=>{
  const wave=Math.sin(time*3.6)*moving;
  for(let i=0;i<2;i++){const s=i?1:-1,carry=i===0&&bag.visible;arms[i].rotation.z=s*(carry?.25:.13);arms[i].rotation.x=carry?.055+wave*.026:i===1&&working?.87:wave*s*.16-.08;forearms[i].rotation.x=carry?.06:i===1&&working?.55:.10;legs[i].rotation.x=wave*s*.14;shins[i].rotation.x=-Math.max(0,-wave*s)*.11;}
 };
 api.animate(0,0,false);return api;
}
