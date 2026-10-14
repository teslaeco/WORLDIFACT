import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

const el = (id: string) => document.getElementById(id)!
const viewport = el('viewport')
const fallback = el('fallback')
const progress = el('loading')
const sourceText = el('origin')
const stats = el('metrics')
const ground = new THREE.GridHelper(14,20,0x4a817b,0x243c47)
const scene = new THREE.Scene()
scene.background = new THREE.Color('#09111a')
scene.fog = new THREE.Fog('#09111a',12,30)
scene.add(new THREE.HemisphereLight(0x9de8fc,0x344526,2.3))
const key = new THREE.DirectionalLight(0xffffff,3.1);key.position.set(-4,9,8);scene.add(key)
const rim = new THREE.DirectionalLight(0x3ecbff,2.2);rim.position.set(7,5,-5);scene.add(rim)
const green = new THREE.DirectionalLight(0x47ff8a,1.4);green.position.set(-3,1,-4);scene.add(green)
const camera = new THREE.PerspectiveCamera(42,1,0.01,180)
camera.position.set(4,2,7)
let renderer: THREE.WebGLRenderer
try {
  const canvas = document.createElement('canvas')
  if (!canvas.getContext('webgl2')) throw Error('WebGL2 not available')
  renderer = new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'})
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5))
  renderer.outputColorSpace=THREE.SRGBColorSpace
  renderer.toneMapping=THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure=1.3
  viewport.append(canvas)
} catch {
  fallback.hidden=false
  progress.textContent='WebGL is unavailable in this mobile browser. You can still download the original GLB.'
  throw Error('WEBGL_NOT_AVAILABLE')
}
const controls = new OrbitControls(camera,renderer.domElement)
controls.enableDamping=true;controls.dampingFactor=.075
controls.minDistance=.35;controls.maxDistance=70
controls.autoRotate=false;controls.autoRotateSpeed=1.4
const resize=()=>{const w=Math.max(1,viewport.clientWidth),h=Math.max(1,viewport.clientHeight)
  camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false)}
new ResizeObserver(resize).observe(viewport)
let root: THREE.Object3D | null = null
let radius=3
let target=new THREE.Vector3()
let gridVisible=false
const mats=new Map<THREE.Mesh,THREE.Material|THREE.Material[]>()
const loader=new GLTFLoader()
const reset=()=>{
  if(!root)return
  camera.position.copy(target).add(new THREE.Vector3(radius*1.1,radius*.3,radius*2.35))
  controls.target.copy(target);controls.update()
}
async function init(){
  try{
    const response=await fetch('./report.json',{cache:'no-store'})
    if(response.ok){
      const report=await response.json()
      sourceText.textContent=report.provenance==='ORACLE_CONFIRMED'?
        'Oracle-confirmed GPT-6 Astra · Original GLB · UNREVIEWED':
        'Selected GPT-6 Astra · Oracle receipt not verified · UNREVIEWED'
      const g=report.originalGLB
      if(g) stats.textContent=[g.triangles.toLocaleString()+' triangles',g.meshes.toLocaleString()+' mesh definitions',
        g.materials+' materials',(g.bytes/1048576).toFixed(2)+' MiB',
        report.completion].join(' · ')
    }
  }catch{sourceText.textContent='Original job metadata unavailable. Provider not verified.'}
  loader.load('./robot.glb',gltf=>{
    root=gltf.scene
    const box=new THREE.Box3().setFromObject(root)
    if(box.isEmpty())throw Error('EMPTY_SCENE')
    box.getCenter(target)
    const dimensions=box.getSize(new THREE.Vector3())
    radius=Math.max(.1,dimensions.length()*.53)
    root.traverse(node=>{
      if((node as THREE.Mesh).isMesh){
        const mesh=node as THREE.Mesh
        mesh.frustumCulled=true
        mats.set(mesh,mesh.material)
        mesh.material=Array.isArray(mesh.material)?mesh.material.map(m=>m.clone()):mesh.material.clone()
      }
    })
    scene.add(root)
    ground.position.set(target.x,box.min.y-.015,target.z)
    ground.visible=false;scene.add(ground)
    reset();progress.hidden=true
    el('ready').textContent='Original GLB loaded. Drag to rotate; pinch to zoom.'
  },event=>{
    if(event.total) progress.textContent='Reading original 3D geometry · '+Math.round(event.loaded/event.total*100)+'%'
  },()=>{
    progress.textContent='The original GLB could not be loaded. Use Download GLB or report the job ID.'
    fallback.hidden=false
  })
}
el('orbit').addEventListener('click',()=>{
  controls.autoRotate=!controls.autoRotate
  el('orbit').textContent=controls.autoRotate?'Stop rotation':'Auto rotate'
})
el('wire').addEventListener('click',()=>{
  const on=el('wire').getAttribute('aria-pressed')!=='true'
  el('wire').setAttribute('aria-pressed',String(on))
  if(root)root.traverse(node=>{
    if(!(node as THREE.Mesh).isMesh)return
    const material=(node as THREE.Mesh).material
    for(const m of Array.isArray(material)?material:[material]) (m as THREE.MeshStandardMaterial).wireframe=on
  })
})
el('grid').addEventListener('click',()=>{
  gridVisible=!gridVisible
  ground.visible=gridVisible
  el('grid').setAttribute('aria-pressed',String(gridVisible))
})
el('reset').addEventListener('click',()=>{controls.autoRotate=false;el('orbit').textContent='Auto rotate';reset()})
el('front').addEventListener('click',()=>{camera.position.copy(target).add(new THREE.Vector3(0,0,radius*2.5));controls.update()})
el('rear').addEventListener('click',()=>{camera.position.copy(target).add(new THREE.Vector3(0,0,-radius*2.5));controls.update()})
el('left').addEventListener('click',()=>{camera.position.copy(target).add(new THREE.Vector3(-radius*2.5,0,0));controls.update()})
el('right').addEventListener('click',()=>{camera.position.copy(target).add(new THREE.Vector3(radius*2.5,0,0));controls.update()})
let animation=0
function tick(){animation=requestAnimationFrame(tick)
  if(document.visibilityState!=='visible')return
  controls.update();renderer.render(scene,camera)
}
window.addEventListener('pagehide',()=>{cancelAnimationFrame(animation);controls.dispose();renderer.dispose()})
resize();tick()
void init()
