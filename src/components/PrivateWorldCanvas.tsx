import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { createWorldObject } from '../lib/worldGeometry'
import type { AssetKind } from '../lib/blueprint'
import { loadWorldAsset } from '../lib/privateWorldAssets'
import { inspectGLB } from '../lib/glb'
import { riverCenter, terrainHeight, type PrivateWorld, type WorldEntity } from '../lib/privateWorld'

type Point = {x:number;z:number}
export type WorldCanvasProps = { owner:string|null; world:PrivateWorld; playing:boolean; selected:string|null; point:Point; onPick:(point:Point,entityId:string|null)=>void; onMessage:(message:string)=>void }
function release(root:THREE.Object3D){const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();root.traverse(o=>{if(o instanceof THREE.Mesh||o instanceof THREE.Points||o instanceof THREE.LineSegments){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);for(const value of Object.values(m))if(value instanceof THREE.Texture)textures.add(value)}}});textures.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());geometries.forEach(g=>g.dispose())}
function primitive(e:WorldEntity):THREE.Group{
  if(['rover','habitat','solar-array','sculpture','mcc-cabinet'].includes(e.kind)) return createWorldObject({...e,kind:e.kind as AssetKind,x:0,z:0,scale:1,rotation:0})
  const root=new THREE.Group(), paint=new THREE.MeshStandardMaterial({color:e.color,roughness:.8}), timber=new THREE.MeshStandardMaterial({color:'#805a39',roughness:.92})
  const add=(geometry:THREE.BufferGeometry,material:THREE.Material,x=0,y=0,z=0)=>{const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;root.add(m);return m}
  if(e.kind==='tree'){add(new THREE.CylinderGeometry(.18,.32,2.7,7),timber,0,1.35);for(let i=0;i<3;i++)add(new THREE.IcosahedronGeometry(1.35-i*.2,1),paint,(i%2-.5)*.55,2.6+i*.55,0)}
  else if(e.kind==='rock'){const m=add(new THREE.IcosahedronGeometry(1,1),paint,0,.55);m.scale.set(1.35,.8,.9);m.rotation.set(.2,.3,.1);timber.dispose()}
  else if(e.kind==='cabin'){add(new THREE.BoxGeometry(3,2.4,2.7),paint,0,1.2);const roof=add(new THREE.ConeGeometry(2.6,1.2,4),timber,0,3);roof.rotation.y=Math.PI/4;add(new THREE.BoxGeometry(.65,1.5,.06),timber,0,.75,1.38);const glass=new THREE.MeshStandardMaterial({color:'#94d5d2',roughness:.16,metalness:.3,emissive:'#254d53',emissiveIntensity:.2});add(new THREE.BoxGeometry(.6,.7,.05),glass,-.9,1.5,1.38)}
  else if(e.kind==='lamp'){add(new THREE.CylinderGeometry(.08,.12,2.8,8),timber,0,1.4);const glass=new THREE.MeshStandardMaterial({color:'#ffe6a1',emissive:'#ffd67a',emissiveIntensity:1});add(new THREE.SphereGeometry(.28,12,8),glass,0,2.85);paint.dispose()}
  else{add(new THREE.BoxGeometry(1.6,1.6,1.6),paint,0,.8);timber.dispose()}
  return root
}
function avatar(world:PrivateWorld){const root=new THREE.Group();const cloth=new THREE.MeshStandardMaterial({color:world.character.outfitColor,roughness:.75}),hair=new THREE.MeshStandardMaterial({color:world.character.hairColor,roughness:.8}),skin=new THREE.MeshStandardMaterial({color:'#c6916e',roughness:.8});const part=(g:THREE.BufferGeometry,m:THREE.Material,x:number,y:number,z=0)=>{const p=new THREE.Mesh(g,m);p.position.set(x,y,z);p.castShadow=true;root.add(p);return p};part(new THREE.CapsuleGeometry(.24,.45,4,8),cloth,0,1.05);part(new THREE.SphereGeometry(.23,16,12),skin,0,1.73);part(new THREE.SphereGeometry(.24,12,8,0,Math.PI*2,0,Math.PI*.52),hair,0,1.77);part(new THREE.CapsuleGeometry(.09,.38,3,7),cloth,-.14,.4);part(new THREE.CapsuleGeometry(.09,.38,3,7),cloth,.14,.4);part(new THREE.CapsuleGeometry(.07,.32,3,7),skin,-.34,1.02);part(new THREE.CapsuleGeometry(.07,.32,3,7),skin,.34,1.02);return root}
export default function PrivateWorldCanvas(props:WorldCanvasProps){
  const container=useRef<HTMLDivElement>(null),latest=useRef(props),draw=useRef<((world:PrivateWorld)=>void)|null>(null),keys=useRef(new Set<string>())
  const [error,setError]=useState('')
  latest.current=props
  useEffect(()=>{
    const host=container.current;if(!host)return
    let renderer:THREE.WebGLRenderer
    try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'low-power'});setError('')}catch{setError('3D is unavailable on this device. Your world, inspector, library and save controls still work.');return}
    let alive=true,raf=0,frame=0,last=0,clock=0,jump=0,vertical=0,interact=false
    const scene=new THREE.Scene();scene.background=new THREE.Color('#b8d8e9');scene.fog=new THREE.Fog('#badadf',45,125)
    const camera=new THREE.PerspectiveCamera(48,1,.1,180);camera.position.set(22,22,28)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap
    renderer.domElement.tabIndex=0;renderer.domElement.setAttribute('aria-label','Private world canvas. Drag to orbit, tap to select a point or object.');host.appendChild(renderer.domElement)
    const orbit=new OrbitControls(camera,renderer.domElement);orbit.target.set(0,0,0);orbit.enableDamping=true;orbit.maxPolarAngle=Math.PI*.47;orbit.minDistance=5;orbit.maxDistance=95
    const hemi=new THREE.HemisphereLight('#d9eefc','#526c3c',2);scene.add(hemi)
    const sun=new THREE.DirectionalLight('#fff2ce',2.5);sun.position.set(25,40,15);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-35;sun.shadow.camera.right=35;sun.shadow.camera.top=35;sun.shadow.camera.bottom=-35;scene.add(sun)
    const earthGeo=new THREE.PlaneGeometry(84,84,112,112);earthGeo.rotateX(-Math.PI/2)
    const colors=new Float32Array(earthGeo.attributes.position.count*3);earthGeo.setAttribute('color',new THREE.BufferAttribute(colors,3))
    const earth=new THREE.Mesh(earthGeo,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.95}));earth.receiveShadow=true;scene.add(earth)
    const riverGeo=new THREE.BufferGeometry();const rp:number[]=[],ru:number[]=[],ri:number[]=[]
    for(let i=0;i<=128;i++){const z=-43+i*86/128;for(const side of [-1,1]){rp.push(riverCenter(z)+side*2.3,-.22,z);ru.push((side+1)/2,i/12)}if(i<128){const a=i*2;ri.push(a,a+2,a+1,a+1,a+2,a+3)}}
    riverGeo.setAttribute('position',new THREE.Float32BufferAttribute(rp,3));riverGeo.setAttribute('uv',new THREE.Float32BufferAttribute(ru,2));riverGeo.setIndex(ri);riverGeo.computeVertexNormals()
    const waterMat=new THREE.ShaderMaterial({uniforms:{time:{value:0},night:{value:0}},vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:'varying vec2 vUv; uniform float time; uniform float night; void main(){float wave=sin(vUv.y*7.0-time*1.4+sin(vUv.x*24.0+time)*.4); float glint=pow(max(0.0,wave),18.0); float edge=pow(abs(vUv.x-.5)*2.0,8.0); vec3 c=mix(vec3(.06,.36,.40),vec3(.30,.70,.65),vUv.x); c+=glint*vec3(.48,.56,.49)*.4+edge*.12; c=mix(c,c*.27+vec3(.01,.02,.04),night); gl_FragColor=vec4(c,1.0);}',side:THREE.DoubleSide});scene.add(new THREE.Mesh(riverGeo,waterMat))
    const blade=new THREE.BufferGeometry();blade.setAttribute('position',new THREE.Float32BufferAttribute([-.035,0,0,.035,0,0,.04,.5,.045],3));blade.computeVertexNormals()
    const grass=new THREE.InstancedMesh(blade,new THREE.MeshStandardMaterial({color:'#58a754',side:THREE.DoubleSide,roughness:1}),10000);grass.frustumCulled=false;scene.add(grass)
    const patches:Point[]=[];let seed=18934;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296}
    for(let i=0;i<10000;i++){const x=(random()-.5)*78,z=(random()-.5)*78;patches.push({x,z})}
    const starGeo=new THREE.BufferGeometry();const stars:number[]=[];for(let i=0;i<900;i++){const az=random()*Math.PI*2,el=.1+random()*1.45;stars.push(Math.cos(az)*Math.cos(el)*100,Math.sin(el)*100,Math.sin(az)*Math.cos(el)*100)}starGeo.setAttribute('position',new THREE.Float32BufferAttribute(stars,3));const sky=new THREE.Points(starGeo,new THREE.PointsMaterial({color:'#e2eaff',size:.24,sizeAttenuation:true}));sky.visible=false;scene.add(sky)
    const marker=new THREE.Mesh(new THREE.RingGeometry(.55,.72,36),new THREE.MeshBasicMaterial({color:'#ffd77d',side:THREE.DoubleSide,depthTest:false}));marker.rotation.x=-Math.PI/2;marker.renderOrder=5;scene.add(marker)
    const selection=new THREE.Box3Helper(new THREE.Box3(),new THREE.Color('#ffe7a1'));selection.visible=false;scene.add(selection)
    const items=new THREE.Group();scene.add(items)
    let player=avatar(latest.current.world);const playerAt=new THREE.Vector3(-8,0,10);scene.add(player);player.visible=false
    const cached=new Map<string,THREE.Group>(),pending=new Set<string>();let previousCharacter=''
    const rebuild=(world:PrivateWorld)=>{
      if(!alive)return
      scene.background=new THREE.Color(world.night?'#090f26':'#b8d8e9');scene.fog=new THREE.Fog(world.night?'#101d35':'#badadf',45,125);hemi.intensity=world.night?.55:2;sun.intensity=world.night?.3:2.5;sky.visible=world.night;waterMat.uniforms.night.value=world.night?1:0
      const p=earthGeo.attributes.position;const c=new THREE.Color();for(let i=0;i<p.count;i++){const x=p.getX(i),z=p.getZ(i),y=terrainHeight(x,z,world.terrain);p.setY(i,y);const bank=Math.abs(x-riverCenter(z));c.set(bank<3.7?'#9b9874':y>7?'#93a58a':'#5c9855');c.multiplyScalar(.94+.06*Math.sin(x*2.3+z*.7));c.toArray(colors,i*3)}p.needsUpdate=true;earthGeo.attributes.color.needsUpdate=true;earthGeo.computeVertexNormals();earthGeo.computeBoundingSphere()
      const dummy=new THREE.Object3D();for(let i=0;i<patches.length;i++){const {x,z}=patches[i];const wet=Math.abs(x-riverCenter(z))<3.4;dummy.position.set(x,terrainHeight(x,z,world.terrain),z);dummy.scale.setScalar(wet?0:.55+(i%9)/9);dummy.rotation.y=i*2.4;dummy.updateMatrix();grass.setMatrixAt(i,dummy.matrix)}grass.instanceMatrix.needsUpdate=true
      for(const child of [...items.children]){items.remove(child);if(!child.userData.sharedAsset)release(child)}
      const assetCount=world.entities.filter(e=>e.kind==='asset').length
      for(const e of world.entities){
        let group:THREE.Group
        const asset=e.assetId?cached.get(e.assetId):null
        if(asset){group=asset.clone(true);group.userData.sharedAsset=true}
        else{group=primitive(e);if(e.kind==='asset'){group.name='Model awaiting device file';group.children.forEach(o=>{if(o instanceof THREE.Mesh){for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();o.material=new THREE.MeshBasicMaterial({color:'#798a93',wireframe:true})}})}}
        group.position.set(e.x,terrainHeight(e.x,e.z,world.terrain)+e.elevation,e.z);group.scale.multiplyScalar(e.scale);group.rotation.y=e.rotation*Math.PI/180;group.userData.entityId=e.id;items.add(group)
        if(e.assetId&&!asset&&!pending.has(e.assetId)&&latest.current.owner&&assetCount<=4){
          const assetId=e.assetId,owner=latest.current.owner;pending.add(assetId)
          void loadWorldAsset(owner,assetId).then(b=>b.arrayBuffer()).then(async bytes=>{
            const info=inspectGLB(bytes);if(info.renderedTriangles>750000)throw new Error('This model is too complex for the four-model interactive editor. Keep the original and use a lighter GAME copy.')
            const manager=new THREE.LoadingManager();manager.setURLModifier(url=>{if(url.startsWith('blob:')||url.startsWith('data:'))return url;throw new Error('Only embedded model resources are supported.')})
            const gltf=await new GLTFLoader(manager).parseAsync(bytes,'')
            if(!alive||latest.current.owner!==owner){release(gltf.scene);return}
            const box=new THREE.Box3().setFromObject(gltf.scene),size=box.getSize(new THREE.Vector3());const extent=Math.max(size.x,size.y,size.z);if(!Number.isFinite(extent)||extent<=0||extent>1e6){release(gltf.scene);throw new Error('Invalid model dimensions.')}
            const center=box.getCenter(new THREE.Vector3()),root=new THREE.Group();gltf.scene.position.sub(new THREE.Vector3(center.x,box.min.y,center.z));root.add(gltf.scene);root.scale.setScalar(3/extent);cached.set(assetId,root);rebuild(latest.current.world)
          }).catch(e=>{if(alive)latest.current.onMessage(e instanceof Error?e.message:'Model is not available on this device.')})
        }
      }
      const character=JSON.stringify(world.character);if(character!==previousCharacter){scene.remove(player);release(player);player=avatar(world);scene.add(player);previousCharacter=character}
    }
    draw.current=rebuild;rebuild(latest.current.world)
    const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();let down={x:0,y:0}
    const pointerDown=(e:PointerEvent)=>{down={x:e.clientX,y:e.clientY}}
    const pick=(e:PointerEvent)=>{if(latest.current.playing||Math.hypot(e.clientX-down.x,e.clientY-down.y)>6)return;const rect=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);ray.setFromCamera(pointer,camera);const hits=ray.intersectObjects([items,earth],true);if(!hits.length)return;const h=hits[0];let o:THREE.Object3D|null=h.object;let id:string|null=null;while(o){if(o.userData.entityId){id=String(o.userData.entityId);break}o=o.parent}latest.current.onPick({x:Math.max(-40,Math.min(40,h.point.x)),z:Math.max(-40,Math.min(40,h.point.z))},id)}
    const downKey=(event:KeyboardEvent)=>{if(!latest.current.playing||(event.target instanceof HTMLElement&&/INPUT|TEXTAREA|SELECT/.test(event.target.tagName)))return;if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','ShiftLeft','KeyE'].includes(event.code)){event.preventDefault();keys.current.add(event.code)}}
    const upKey=(event:KeyboardEvent)=>keys.current.delete(event.code);const blur=()=>keys.current.clear()
    const lost=(e:Event)=>{e.preventDefault();cancelAnimationFrame(raf);setError('3D context paused. Save your work, then reload this page to restore the preview.')}
    renderer.domElement.addEventListener('pointerdown',pointerDown);renderer.domElement.addEventListener('pointerup',pick);renderer.domElement.addEventListener('webglcontextlost',lost);window.addEventListener('keydown',downKey);window.addEventListener('keyup',upKey);window.addEventListener('blur',blur)
    const size=()=>{const r=host.getBoundingClientRect();renderer.setSize(Math.max(1,r.width),Math.max(1,r.height));camera.aspect=r.width/Math.max(1,r.height);camera.updateProjectionMatrix()};const observer=new ResizeObserver(size);observer.observe(host);size()
    const animate=(now:number)=>{if(!alive)return;raf=requestAnimationFrame(animate);if(document.hidden||now-frame<32)return;const dt=Math.min(.05,(now-last)/1000||.016);last=now;frame=now;clock+=dt;const w=latest.current.world;waterMat.uniforms.time.value=clock
      marker.visible=!latest.current.playing;marker.position.set(latest.current.point.x,terrainHeight(latest.current.point.x,latest.current.point.z,w.terrain)+.08,latest.current.point.z)
      const chosen=items.children.find(c=>c.userData.entityId===latest.current.selected);selection.visible=!!chosen&&!latest.current.playing;if(chosen)selection.box.setFromObject(chosen)
      player.visible=latest.current.playing
      if(latest.current.playing){const k=keys.current,forward=(k.has('KeyW')||k.has('ArrowUp')?1:0)-(k.has('KeyS')||k.has('ArrowDown')?1:0),side=(k.has('KeyD')||k.has('ArrowRight')?1:0)-(k.has('KeyA')||k.has('ArrowLeft')?1:0);const speed=w.controls.includes('sprint')&&k.has('ShiftLeft')?8:4;const ahead=new THREE.Vector3().subVectors(orbit.target,camera.position).setY(0).normalize(),right=new THREE.Vector3(-ahead.z,0,ahead.x);const move=ahead.multiplyScalar(forward).add(right.multiplyScalar(side));if(move.lengthSq()>0){move.normalize().multiplyScalar(speed*dt);const old=playerAt.clone();playerAt.x=Math.max(-39,Math.min(39,playerAt.x+move.x));playerAt.z=Math.max(-39,Math.min(39,playerAt.z+move.z));const delta=playerAt.clone().sub(old);camera.position.add(delta);orbit.target.add(delta);player.rotation.y=Math.atan2(move.x,move.z);player.children.slice(3,7).forEach((part,i)=>{part.rotation.x=Math.sin(clock*9+i%2*Math.PI)*.4})}else player.children.slice(3,7).forEach(p=>{p.rotation.x=0})
        if(w.controls.includes('jump')&&k.has('Space')&&jump<=0){vertical=5.8;k.delete('Space')}vertical-=14*dt;jump=Math.max(0,jump+vertical*dt);if(jump===0)vertical=0;player.position.set(playerAt.x,terrainHeight(playerAt.x,playerAt.z,w.terrain)+jump,playerAt.z)
        if(w.controls.includes('interact')&&k.has('KeyE')&&!interact){const near=w.entities.find(e=>Math.hypot(e.x-playerAt.x,e.z-playerAt.z)<4);latest.current.onMessage(near?`Interacting with ${near.name}. Add further behavior in a future scripted build.`:'Move within four meters of an object to interact.');interact=true}if(!k.has('KeyE'))interact=false
      }else{keys.current.clear();jump=0}
      orbit.update();renderer.render(scene,camera)
    };raf=requestAnimationFrame(animate)
    return()=>{alive=false;cancelAnimationFrame(raf);draw.current=null;observer.disconnect();window.removeEventListener('keydown',downKey);window.removeEventListener('keyup',upKey);window.removeEventListener('blur',blur);renderer.domElement.removeEventListener('pointerdown',pointerDown);renderer.domElement.removeEventListener('pointerup',pick);renderer.domElement.removeEventListener('webglcontextlost',lost);orbit.dispose();for(const child of [...items.children])if(child.userData.sharedAsset)items.remove(child);release(scene);cached.forEach(release);renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();keys.current.clear()}
  },[props.owner])
  useEffect(()=>{draw.current?.(props.world)},[props.world])
  const hold=(key:string)=>({onPointerDown:(e:React.PointerEvent<HTMLButtonElement>)=>{e.currentTarget.setPointerCapture(e.pointerId);keys.current.add(key)},onPointerUp:()=>keys.current.delete(key),onPointerCancel:()=>keys.current.delete(key),onLostPointerCapture:()=>keys.current.delete(key)})
  return <div className="private-canvas-shell"><div ref={container} className="private-canvas"/>{error&&<p className="private-canvas-error" role="alert">{error}</p>}{!props.playing&&<div className="private-canvas-hint">Drag to orbit · pinch to zoom · tap to mark a point</div>}{props.playing&&<div className="private-game-controls"><div className="private-move-pad"><button aria-label="Move forward" {...hold('KeyW')}>↑</button><button aria-label="Move left" {...hold('KeyA')}>←</button><button aria-label="Move back" {...hold('KeyS')}>↓</button><button aria-label="Move right" {...hold('KeyD')}>→</button></div><div>{props.world.controls.includes('jump')&&<button {...hold('Space')}>Jump</button>}{props.world.controls.includes('sprint')&&<button {...hold('ShiftLeft')}>Sprint</button>}{props.world.controls.includes('interact')&&<button {...hold('KeyE')}>Interact</button>}</div></div>}</div>
}
