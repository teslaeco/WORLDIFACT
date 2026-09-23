import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { parseRim, mountRim } from '../src/lib/vehicleRims.ts'
import { createWorldObject, disposeObject } from '../src/lib/worldGeometry.ts'
import { meadowBlueprint } from '../src/lib/blueprint.ts'
const car=()=>createWorldObject({...meadowBlueprint().objects[0],x:0,z:0,rotation:0})

test('stock tyre has an actual open centre and the exact imported mesh reaches all four rotating mounts',()=>{
 const rover=car(),original=new THREE.Group(),geometry=new THREE.TorusGeometry(.8,.08,8,32),material=new THREE.MeshStandardMaterial({color:0x334455})
 const mesh=new THREE.Mesh(geometry,material);mesh.name='OwnerMesh';original.add(mesh)
 const positions=geometry.attributes.position.array.slice(),index=geometry.index!.array.slice()
 const attachment=mountRim(rover,original),wheels=rover.children.filter(o=>o.name==='wheel')
 for(const wheel of wheels){
   const tyre=wheel.getObjectByName('hollow-wheel-tyre')!
   rover.updateMatrixWorld(true)
   const start=wheel.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(5,0,0))
   assert.equal(new THREE.Raycaster(start,new THREE.Vector3(-1,0,0)).intersectObject(tyre).length,0,'solid tire cylinder must not hide the rim openings')
   const mounted=wheel.getObjectByName('OwnerMesh') as THREE.Mesh
   assert.equal(mounted.geometry,geometry);assert.equal(mounted.material,material)
   assert.equal(wheel.getObjectByName('stock-wheel-disc')!.visible,false)
   assert.equal(wheel.getObjectByName('stock-wheel-hub')!.visible,false)
   const probe=new THREE.Vector3(.8,0,0);const before=mounted.localToWorld(probe.clone())
   wheel.rotation.x=.75;rover.updateMatrixWorld(true)
   assert.ok(mounted.localToWorld(probe.clone()).distanceTo(before)>.05,'actual imported rim rotates with its gameplay wheel')
 }
 assert.deepEqual(geometry.attributes.position.array,positions);assert.deepEqual(geometry.index!.array,index)
 attachment.dispose();for(const wheel of wheels){assert.equal(wheel.getObjectByName('owner-original-rim'),undefined);assert.equal(wheel.getObjectByName('stock-wheel-disc')!.visible,true)}
 disposeObject(rover);disposeObject(original)
})

test('rim validation refuses non-wheel shape and non-GLB inputs without touching existing wheels',async()=>{
 const rover=car(),cube=new THREE.Mesh(new THREE.BoxGeometry(1,1,1))
 assert.throws(()=>mountRim(rover,cube),/rim alone/)
 assert.ok(rover.children.filter(o=>o.name==='wheel').every(w=>!w.getObjectByName('owner-original-rim')))
 await assert.rejects(()=>parseRim(new TextEncoder().encode('<html>Login</html>').buffer))
 disposeObject(rover);disposeObject(cube)
})

test('offset and axis transforms preserve original rim topology, units-relative proportions and materials',()=>{
 for(const axis of [0,1,2]){
   const rover=car(),source=new THREE.Group(),mesh=new THREE.Mesh(new THREE.TorusGeometry(4,.12,8,32))
   if(axis===0)mesh.rotation.y=Math.PI/2;if(axis===1)mesh.rotation.x=Math.PI/2
   source.position.set(2,3,-4);source.add(mesh)
   const attachment=mountRim(rover,source);rover.updateMatrixWorld(true)
   for(const wheel of rover.children.filter(o=>o.name==='wheel')){
     const box=new THREE.Box3().setFromObject(wheel.getObjectByName('owner-original-rim')!),size=box.getSize(new THREE.Vector3())
     assert.ok(Math.abs(size.y-.96)<.015 && Math.abs(size.z-.96)<.015)
     assert.ok(size.x<.06)
   }
   attachment.dispose();disposeObject(source);disposeObject(rover)
 }
})
