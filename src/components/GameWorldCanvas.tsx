import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js'
import { createWorldObject, disposeObject } from '../lib/worldGeometry'
import { loadPortalSculpture, rotatePortalSculpture, PORTAL_SCULPTURE_POSTER_URL } from '../lib/portalSculpture'
import { groundHeight, riverCenter, type GameWorld, type Point, type ControlAction } from '../lib/gameWorld'
import { readGameAsset } from '../lib/gameWorldAssets'
import { inspectGLB } from '../lib/glb'

export type GameInput = { forward:boolean; back:boolean; left:boolean; right:boolean; sprint:boolean; fly:boolean; jump:number; reset:number }
export const emptyGameInput = ():GameInput => ({forward:false,back:false,left:false,right:false,sprint:false,fly:false,jump:0,reset:0})
type Props={ world:GameWorld|null; owner:string; play:boolean; point:Point; selected:string|null; input:React.RefObject<GameInput>; onPoint:(point:Point,id:string|null)=>void; onError:(message:string)=>void }
const seed=(i:number)=>{const x=Math.sin(i*127.1+311.7)*43758.5453;return x-Math.floor(x)}
function stars(){const positions=new Float32Array(1800*3);for(let i=0;i<1800;i++){const az=seed(i+1)*Math.PI*2,el=seed(i+700)*Math.PI*.48,r=140+seed(i+81)*50;positions.set([Math.cos(az)*Math.cos(el)*r,Math.sin(el)*r+5,Math.sin(az)*Math.cos(el)*r],i*3)}const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(positions,3));return new THREE.Points(geo,new THREE.PointsMaterial({color:'#e5f0ff',size:.42,transparent:true,opacity:.88,depthWrite:false}))}
function landscape(world:GameWorld){
  const root=new THREE.Group();root.name='My meadow and river'
  const geo=new THREE.PlaneGeometry(80,80,100,100);geo.rotateX(-Math.PI/2)
  const pos=geo.attributes.position
  for(let i=0;i<pos.count;i++)pos.setY(i,groundHeight(pos.getX(i),pos.getZ(i),world.terrain))
  geo.computeVertexNormals()
  const colors=new Float32Array(pos.count*3),tmp=new THREE.Color()
  for(let i=0;i<pos.count;i++){const x=pos.getX(i),z=pos.getZ(i),shore=Math.abs(x-riverCenter(z))<4.1;tmp.set(shore?'#acaa78':'#429151').multiplyScalar(.87+.22*seed(i));colors.set(tmp.toArray(),i*3)}
  geo.setAttribute('color',new THREE.BufferAttribute(colors,3))
  const ground=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.95}));ground.receiveShadow=true;ground.name='editable-ground';root.add(ground)
  const blade=new THREE.PlaneGeometry(.095,.62,1,2);blade.translate(0,.31,0)
  const mobile=typeof matchMedia!=='undefined'&&matchMedia('(max-width: 800px)').matches
  const count=world.grass==='lush'?(mobile?5000:10500):(mobile?3000:6500)
  const grass=new THREE.InstancedMesh(blade,new THREE.MeshStandardMaterial({color:'#73b75c',side:THREE.DoubleSide,roughness:1}),count)
  const dummy=new THREE.Object3D();let used=0
  for(let i=0;i<count*2&&used<count;i++){const x=(seed(i+22)-.5)*79,z=(seed(i+303)-.5)*79;if(Math.abs(x-riverCenter(z))<4.4)continue;const y=groundHeight(x,z,world.terrain);if(y<-.1)continue;dummy.position.set(x,y,z);dummy.rotation.set(0,seed(i+33)*6.28,0);dummy.scale.set(1,.55+seed(i+92)*.95,1);dummy.updateMatrix();grass.setMatrixAt(used,dummy.matrix);tmp.setHSL(.23+seed(i+188)*.1,.46,.28+seed(i+234)*.16);grass.setColorAt(used++,tmp)}
  grass.count=used;grass.instanceMatrix.needsUpdate=true;if(grass.instanceColor)grass.instanceColor.needsUpdate=true;root.add(grass)
  const riverGeo=new THREE.PlaneGeometry(5.6,80,12,160);riverGeo.rotateX(-Math.PI/2)
  const rp=riverGeo.attributes.position;for(let i=0;i<rp.count;i++){rp.setX(i,rp.getX(i)+riverCenter(rp.getZ(i)));rp.setY(i,-.25)}riverGeo.computeVertexNormals()
  const water=new THREE.Mesh(riverGeo,new THREE.MeshPhysicalMaterial({color:'#4fc8d1',metalness:.35,roughness:.18,transparent:true,opacity:.83,clearcoat:1,side:THREE.DoubleSide}));water.name='animated-river';root.add(water)
  return {root,ground,water}
}
function mannequin(color:string){const g=new THREE.Group();const mat=new THREE.MeshStandardMaterial({color,roughness:.68}),skin=new THREE.MeshStandardMaterial({color:'#d5ad8c',roughness:.8});const body=new THREE.Mesh(new THREE.CapsuleGeometry(.22,.55,4,10),mat);body.position.y=.95;g.add(body);const head=new THREE.Mesh(new THREE.SphereGeometry(.2,12,10),skin);head.position.y=1.6;g.add(head);for(const x of [-.13,.13]){const leg=new THREE.Mesh(new THREE.CapsuleGeometry(.085,.45,3,8),mat);leg.position.set(x,.32,0);g.add(leg)}g.traverse(n=>{if(n instanceof THREE.Mesh)n.castShadow=true});return g}
export default function GameWorldCanvas(props:Props){
  const host=useRef<HTMLDivElement>(null),current=useRef(props),update=useRef<(()=>void)|null>(null)
  const [failed,setFailed]=useState(false)
  current.current=props
  useEffect(()=>{update.current?.()},[props.world,props.point,props.selected,props.play])
  useEffect(()=>{
    const element=host.current;if(!element)return
    let renderer:THREE.WebGLRenderer
    try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'})}catch{setFailed(true);return}
    renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;element.appendChild(renderer.domElement)
    const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(48,1,.1,500)
    camera.position.set(24,20,27)
    const orbit=new OrbitControls(camera,renderer.domElement);orbit.enableDamping=true;orbit.maxPolarAngle=Math.PI*.48;orbit.minDistance=2;orbit.maxDistance=80;orbit.target.set(0,0,0)
    const hemisphere=new THREE.HemisphereLight('#e4f7ff','#355333',2.2),sun=new THREE.DirectionalLight('#fff0c6',3.2)
    sun.position.set(25,42,18);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-35,right:35,top:35,bottom:-35,near:1,far:110});scene.add(hemisphere,sun)
    const sky=new THREE.Mesh(new THREE.SphereGeometry(220,24,12),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{night:{value:0}},vertexShader:'varying vec3 p;void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec3 p;uniform float night;void main(){float h=clamp(normalize(p).y*.7+.2,0.,1.);vec3 day=mix(vec3(.75,.9,.86),vec3(.12,.4,.7),h);vec3 dark=mix(vec3(.055,.055,.15),vec3(.002,.008,.03),h);gl_FragColor=vec4(mix(day,dark,night),1.);}'}));scene.add(sky)
    const starField=stars();scene.add(starField)
    const marker=new THREE.Mesh(new THREE.TorusGeometry(.55,.045,6,30),new THREE.MeshBasicMaterial({color:'#ffdf86',depthTest:false}));marker.rotation.x=Math.PI/2;marker.renderOrder=10;scene.add(marker)
    const models=new THREE.Group(),player=new THREE.Group();scene.add(models,player)
    let land:ReturnType<typeof landscape>|null=null,landKey='',objectsKey='',characterKey='',closed=false,version=0,sculpture:THREE.Group|null=null
    const assetCache=new Map<string,Promise<THREE.Object3D>>(),ownedAssets=new Set<THREE.Object3D>()
    let renderedObjectGroups:THREE.Object3D[]=[],privateGeometry:THREE.Object3D[]=[],lastJump=0,lastReset=0,velocity=0,previous=0,elapsed=0
    const load=(id:string)=>{let value=assetCache.get(id);if(!value){value=readGameAsset(current.current.owner,id).then(async blob=>{const bytes=await blob.arrayBuffer();const report=inspectGLB(bytes);if(report.triangles>1_500_000)throw new Error('Model geometry is too large.');const data=await new GLTFLoader().parseAsync(bytes,'');if(closed){disposeObject(data.scene);throw new Error('Editor closed.')}ownedAssets.add(data.scene);return data.scene});assetCache.set(id,value)}return value}
    const rebuild=()=>{
      const {world,point,selected,play}=current.current
      starField.visible=!world||world.sky==='stars';(sky.material as THREE.ShaderMaterial).uniforms.night.value=starField.visible?1:0
      hemisphere.intensity=starField.visible?.55:2.2;sun.intensity=starField.visible?.55:3.2
      marker.visible=!!world&&!play;marker.position.set(point.x,groundHeight(point.x,point.z,world?.terrain)+.14,point.z)
      if(!world){marker.visible=false;camera.position.set(5,3,7);orbit.target.set(0,0,0);orbit.maxDistance=14;return}
      const terrainKey=JSON.stringify([world.terrain,world.grass]);if(terrainKey!==landKey){landKey=terrainKey;if(land){scene.remove(land.root);disposeObject(land.root)}land=landscape(world);scene.add(land.root)}
      const ck=JSON.stringify([world.character.color,world.playerModelId]);if(ck!==characterKey){characterKey=ck;for(const child of [...player.children]){player.remove(child);if(child.userData.localMannequin)disposeObject(child)}const body=mannequin(world.character.color);body.userData.localMannequin=true;player.add(body);if(world.playerModelId){const object=world.objects.find(o=>o.id===world.playerModelId);if(object?.assetId){const expected=ck;load(object.assetId).then(source=>{if(closed||characterKey!==expected)return;player.remove(body);disposeObject(body);const copy=cloneSkeleton(source),b=new THREE.Box3().setFromObject(copy),size=b.getSize(new THREE.Vector3());const wrapper=new THREE.Group();wrapper.add(copy);copy.position.sub(b.getCenter(new THREE.Vector3()));copy.position.y+=size.y/2;wrapper.scale.setScalar(1.8/Math.max(size.y,.01));player.add(wrapper)}).catch(()=>current.current.onError('The player model is missing on this device. The local mannequin remains visible.'))}}}
      player.visible=play;orbit.enablePan=!play
      const key=JSON.stringify([world.objects,selected,world.playerModelId,world.terrain,play]);if(key===objectsKey)return;objectsKey=key;const myVersion=++version
      for(const obj of renderedObjectGroups)models.remove(obj);renderedObjectGroups=[];for(const obj of privateGeometry)disposeObject(obj);privateGeometry=[]
      const add=(obj:THREE.Object3D,o:GameWorld['objects'][number],own=false)=>{if(closed||myVersion!==version){if(own)disposeObject(obj);return}const wrapper=new THREE.Group();wrapper.userData.worldObjectId=o.id;wrapper.add(obj);wrapper.position.set(o.x,groundHeight(o.x,o.z,world.terrain)+o.y,o.z);wrapper.rotation.y=o.rotation*Math.PI/180;wrapper.scale.setScalar(o.scale);models.add(wrapper);renderedObjectGroups.push(wrapper);if(own)privateGeometry.push(obj);if(o.id===selected&&!play){const outline=new THREE.BoxHelper(wrapper,'#ffd77b');models.add(outline);renderedObjectGroups.push(outline);privateGeometry.push(outline)}}
      let loadedBytes=0
      for(const o of world.objects){if(play&&o.id===world.playerModelId)continue
        if(o.kind!=='local-model'){const obj=createWorldObject({id:o.id,name:o.name,kind:o.kind,x:0,z:0,scale:1,rotation:0,color:o.color});add(obj,o,true)}
        else if(o.assetId){load(o.assetId).then(source=>{if(myVersion!==version||closed)return;let triangles=0;source.traverse(n=>{if(n instanceof THREE.Mesh)triangles+=(n.geometry.index?.count??n.geometry.attributes.position?.count??0)/3});loadedBytes+=triangles;if(loadedBytes>2_000_000){current.current.onError('The visible model budget is two million triangles. Reduce the scene before adding more high-detail models.');return}add(cloneSkeleton(source),o)}).catch(()=>{if(!closed&&myVersion===version)current.current.onError(`Import the original GLB for “${o.name}” on this device. World settings are preserved.`)})}
      }
    }
    update.current=rebuild;rebuild()
    if(!current.current.world)loadPortalSculpture(['#a779ff','#57f3d9'],3.7).then(model=>{if(closed){disposeObject(model);return}sculpture=model;scene.add(model)}).catch(()=>{if(!closed)setFailed(true)})
    const resize=()=>{const w=element.clientWidth,h=element.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix()};const observer=new ResizeObserver(resize);observer.observe(element);resize()
    const raycaster=new THREE.Raycaster(),ndc=new THREE.Vector2();let down:Point|null=null
    const pointerDown=(e:PointerEvent)=>{down={x:e.clientX,z:e.clientY}}
    const pointerUp=(e:PointerEvent)=>{const first=down;down=null;if(!first||Math.hypot(e.clientX-first.x,e.clientY-first.z)>6||!land||current.current.play)return;const r=renderer.domElement.getBoundingClientRect();ndc.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);raycaster.setFromCamera(ndc,camera);const hit=raycaster.intersectObject(land.ground)[0];if(!hit)return;const mh=raycaster.intersectObject(models,true)[0];let target=mh?.object;let id:string|null=null;while(target){if(typeof target.userData.worldObjectId==='string'){id=target.userData.worldObjectId;break}target=target.parent??undefined}current.current.onPoint({x:Math.max(-39,Math.min(39,hit.point.x)),z:Math.max(-39,Math.min(39,hit.point.z))},id)}
    renderer.domElement.addEventListener('pointerdown',pointerDown);renderer.domElement.addEventListener('pointerup',pointerUp)
    const key=(e:KeyboardEvent,pressed:boolean)=>{if(!current.current.play||['INPUT','TEXTAREA','SELECT'].includes((e.target as HTMLElement)?.tagName))return;const v=current.current.input.current,map:Record<string,'forward'|'back'|'left'|'right'>={KeyW:'forward',ArrowUp:'forward',KeyS:'back',ArrowDown:'back',KeyA:'left',ArrowLeft:'left',KeyD:'right',ArrowRight:'right'};if(map[e.code]){v[map[e.code]]=pressed;e.preventDefault()}if(e.repeat)return;if(e.code==='Space'&&pressed&&current.current.world?.controls.some(c=>c.action==='jump')){v.jump++;e.preventDefault()}if(e.code==='KeyF'&&pressed&&current.current.world?.controls.some(c=>c.action==='fly'))v.fly=!v.fly;if(e.code==='ShiftLeft'&&current.current.world?.controls.some(c=>c.action==='sprint'))v.sprint=pressed}
    const kd=(e:KeyboardEvent)=>key(e,true),ku=(e:KeyboardEvent)=>key(e,false),clear=()=>{current.current.input.current=emptyGameInput()}
    window.addEventListener('keydown',kd);window.addEventListener('keyup',ku);window.addEventListener('blur',clear)
    const visibility=()=>{if(document.hidden)clear()};document.addEventListener('visibilitychange',visibility)
    renderer.setAnimationLoop(ms=>{
      if(document.hidden){previous=ms;return}const dt=Math.min(.04,previous?(ms-previous)/1000:0);previous=ms;elapsed+=dt
      const {world,play,input}=current.current
      if(sculpture&&!matchMedia('(prefers-reduced-motion: reduce)').matches)rotatePortalSculpture(sculpture,elapsed*.22)
      if(land){const p=land.water.geometry.attributes.position;for(let i=0;i<p.count;i++)p.setY(i,-.25+.028*Math.sin(p.getZ(i)*2+elapsed*1.5+p.getX(i)*.9));p.needsUpdate=true}
      if(play&&world){const v=input.current;if(v.reset!==lastReset){lastReset=v.reset;player.position.set(-9,0,0);velocity=0}const fx=Number(v.right)-Number(v.left),fz=Number(v.back)-Number(v.forward),length=Math.hypot(fx,fz),speed=(v.sprint?9:4)*dt
        if(length){const x=THREE.MathUtils.clamp(player.position.x+fx/length*speed,-39,39),z=THREE.MathUtils.clamp(player.position.z+fz/length*speed,-39,39);player.position.x=x;player.position.z=z;player.rotation.y=Math.atan2(fx,fz)}
        const y=Math.max(groundHeight(player.position.x,player.position.z,world.terrain),-.28)
        if(v.jump!==lastJump){lastJump=v.jump;if(player.position.y<=y+.1)velocity=6}
        if(v.fly){player.position.y=Math.min(y+6,player.position.y+3*dt);velocity=0}else{velocity-=15*dt;player.position.y=Math.max(y,player.position.y+velocity*dt);if(player.position.y===y)velocity=0}
        const target=new THREE.Vector3(player.position.x,player.position.y+1,player.position.z),delta=target.clone().sub(orbit.target);camera.position.add(delta);orbit.target.copy(target)
      }
      orbit.update();renderer.render(scene,camera)
    })
    return()=>{closed=true;version++;update.current=null;renderer.setAnimationLoop(null);observer.disconnect();orbit.dispose();renderer.domElement.removeEventListener('pointerdown',pointerDown);renderer.domElement.removeEventListener('pointerup',pointerUp);window.removeEventListener('keydown',kd);window.removeEventListener('keyup',ku);window.removeEventListener('blur',clear);document.removeEventListener('visibilitychange',visibility);models.clear();for(const g of privateGeometry)disposeObject(g);for(const source of ownedAssets)disposeObject(source);for(const child of [...player.children])if(child.userData.localMannequin)disposeObject(child);player.clear();if(land)disposeObject(land.root);if(sculpture)disposeObject(sculpture);disposeObject(starField);disposeObject(marker);disposeObject(sky);renderer.dispose();renderer.domElement.remove()}
  },[props.world?.id,props.owner])
  return <div className={`game-canvas ${props.world?'':'game-cosmos'}`} ref={host} aria-label={props.world?'Your private editable meadow and river':'Space with the original rotating FORGE sculpture'}>
    {failed&&<div className="game-webgl-fallback">{!props.world&&<img src={PORTAL_SCULPTURE_POSTER_URL} alt="Original FORGE sculpture"/>}<p>3D rendering is unavailable here. World settings and backups remain usable.</p></div>}
  </div>
}
export function triggerGameControl(input:GameInput,action:ControlAction,pressed:boolean){if(action==='jump'&&pressed)input.jump++;if(action==='fly'&&pressed)input.fly=!input.fly;if(action==='sprint')input.sprint=pressed;if(action==='reset'&&pressed)input.reset++}
