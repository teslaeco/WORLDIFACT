import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { inspectGLB } from './glb.ts'
import { disposeObject } from './worldGeometry.ts'
export const RIM_TRIANGLE_LIMIT=200_000
/** Exact owner-supplied GLB only. Screenshots are not substituted for original 3D geometry. */
export async function parseRim(bytes:ArrayBuffer) {
  const audit=inspectGLB(bytes)
  if(audit.renderedTriangles<1||audit.renderedTriangles>RIM_TRIANGLE_LIMIT)throw new Error('Use the original self-contained GAME rim GLB with at most 200,000 rendered triangles per wheel.')
  const manager=new THREE.LoadingManager()
  manager.setURLModifier(url=>{if(/^(data:|blob:)/.test(url))return url;throw new Error('Rim textures and buffers must be embedded in the GLB.')})
  const gltf=await new GLTFLoader(manager).parseAsync(bytes,'')
  let animated=false;gltf.scene.traverse(o=>{if(o instanceof THREE.SkinnedMesh)animated=true})
  if(animated){disposeObject(gltf.scene);throw new Error('Use a static rim mesh, not a rigged character.')}
  return gltf.scene
}
export function mountRim(car:THREE.Group,original:THREE.Object3D){
  const wheels=car.children.filter(o=>o.name==='wheel')
  if(wheels.length!==4)throw new Error('This vehicle does not expose four wheel mounts.')
  original.updateWorldMatrix(true,true)
  const bounds=new THREE.Box3().setFromObject(original),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3())
  if(!size.toArray().every(Number.isFinite)||Math.max(...size.toArray())<.001)throw new Error('The rim has invalid dimensions.')
  const axis=[0,1,2].sort((a,b)=>size.getComponent(a)-size.getComponent(b))[0]
  const planeAxes=[0,1,2].filter(i=>i!==axis)
  const diameter=Math.max(...planeAxes.map(i=>size.getComponent(i))),thickness=size.getComponent(axis)
  if(thickness>diameter*.70)throw new Error('Select the rim alone. The file does not have a clear wheel axle.')
  // Scale uniformly: never flatten, decimate or fill the openings of the source model.
  const fit=.96/diameter,sourceAxis=new THREE.Vector3().setComponent(axis,1),mounted:THREE.Group[]=[]
  for(const wheel of wheels){
    const holder=new THREE.Group();holder.name='owner-original-rim'
    const centred=new THREE.Group();const mesh=original.clone(true);mesh.position.sub(center);centred.add(mesh)
    centred.scale.setScalar(fit);holder.add(centred)
    holder.quaternion.setFromUnitVectors(sourceAxis,new THREE.Vector3(Math.sign(wheel.position.x),0,0))
    holder.position.x=Math.sign(wheel.position.x)*(.225-thickness*fit*.5)
    wheel.add(holder);mounted.push(holder)
    // The tyre and its rotation remain intact; the old solid disc/hub no longer cover the rim holes.
    for(const child of wheel.children)if(child.name==='stock-wheel-disc'||child.name==='stock-wheel-hub')child.visible=false
  }
  return {dispose(){for(const holder of mounted)holder.removeFromParent();for(const wheel of wheels)for(const child of wheel.children)if(child.name==='stock-wheel-disc'||child.name==='stock-wheel-hub')child.visible=true}}
}
