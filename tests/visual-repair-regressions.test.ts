import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { readFile } from 'node:fs/promises'
import { avatarBodyBounds, bindStaticAvatar } from '../src/lib/avatarLocomotion.ts'
import { WALK_SPEED, gaitFrequency, gaitStance, footCycle } from '../src/lib/avatarPose.ts'
import { createSandField } from '../src/lib/desertTerrain.ts'
import { createDesertScene } from '../src/lib/desertScene.ts'
import { createBackhoe } from '../src/lib/backhoe.ts'
import { excavationCamera } from '../src/lib/excavationCamera.ts'
import { createSolarVehicle } from '../src/lib/solarVehicle.ts'
import { disposeObject } from '../src/lib/worldGeometry.ts'

function named(mesh:THREE.Mesh,name:string,parent:THREE.Object3D,x=0,y=0,z=0){mesh.name=name;mesh.position.set(x,y,z);parent.add(mesh);return mesh}

test('body centering does not let an asymmetric head shift one complete leg across the skeleton midline',()=>{
 const root=new THREE.Group(),mat=new THREE.MeshStandardMaterial()
 named(new THREE.Mesh(new THREE.BoxGeometry(.31,.60,.22),mat),'NeptuneQueen-body-under-gown',root,0,1.12,0)
 named(new THREE.Mesh(new THREE.BoxGeometry(.40,.30,.30),mat),'anatomical-head',root,.16,1.60,.13)
 for(const side of [-1,1])named(new THREE.Mesh(new THREE.CylinderGeometry(.064,.048,.83,12,20),mat),side<0?'NeptuneQueen-leg001':'NeptuneQueen-leg',root,side*.077,.505,0)
 const bounds=avatarBodyBounds(root);assert.ok(Math.abs(bounds.center.x)<1e-10);assert.ok(Math.abs(bounds.center.z)<1e-10)
 const rig=bindStaticAvatar(root)
 for(const name of ['NeptuneQueen-leg','NeptuneQueen-leg001']){
  const mesh=root.getObjectByName(name) as THREE.SkinnedMesh,indices=mesh.geometry.attributes.skinIndex
  const expected=name.endsWith('001')?2:5
  for(let i=0;i<indices.count;i++)assert.equal(indices.getY(i),expected,'one anatomical leg must not contain both leg chains')
 }
 for(let i=0;i<180;i++)rig.update(1/60,1)
 assert.ok(rig.legs[1].thigh.position.x-rig.legs[0].thigh.position.x>.19)
 assert.ok(WALK_SPEED>=2.8 && WALK_SPEED<=3.2)
 rig.dispose();disposeObject(root)
})

test('the source rotor-module hierarchy stays with the complete fan and central hand vertices are fully hand-weighted',()=>{
 const root=new THREE.Group(),mat=new THREE.MeshStandardMaterial()
 named(new THREE.Mesh(new THREE.BoxGeometry(.30,.5,.2),mat),'Torso',root,0,1.2)
 named(new THREE.Mesh(new THREE.SphereGeometry(.045,10,8),mat),'anatomical-hand-right',root,.13,1.1,-.28)
 named(new THREE.Mesh(new THREE.PlaneGeometry(.40,.35),mat),'NeptuneQueen-pleated-fan',root,.13,1.29,-.28)
 named(new THREE.Mesh(new THREE.CylinderGeometry(.008,.008,.07),mat),'NeptuneQueen-fan-grip-handle',root,.13,1.1,-.28)
 const module=new THREE.Group();module.name='HEX_ROTOR_MODULE_00';root.add(module)
 named(new THREE.Mesh(new THREE.BoxGeometry(.04,.01,.01),mat),'BLADE_MASTER',module,.13,1.41,-.27)
 named(new THREE.Mesh(new THREE.TorusGeometry(.035,.005),mat),'HEX_ROTOR_MASTER_FRAME',module,.13,1.41,-.27)
 const rig=bindStaticAvatar(root);assert.equal(rig.fanParts,4)
 const hand=root.getObjectByName('anatomical-hand-right') as THREE.SkinnedMesh
 const ids=hand.geometry.attributes.skinIndex,weights=hand.geometry.attributes.skinWeight
 for(let i=0;i<ids.count;i++){assert.equal(ids.getZ(i),13);assert.equal(weights.getZ(i),1)}
 const blade=root.getObjectByName('BLADE_MASTER')!,frame=root.getObjectByName('HEX_ROTOR_MASTER_FRAME')!
 assert.equal(blade.parent,frame.parent);assert.equal(blade.parent?.name,'Original_Queen_Fan_Complete')
 rig.update(.05,1,false,false,true);assert.ok(blade.getWorldPosition(new THREE.Vector3()).distanceTo(frame.getWorldPosition(new THREE.Vector3()))<.001)
 rig.dispose();disposeObject(root)
})

test('a full-size rover digs a visible deep crater, lifts a full load automatically and has a front-quarter work camera',()=>{
 for(const yaw of [0,Math.PI/2,.65]){
  const car=createSolarVehicle(),field=createSandField(),desert=createDesertScene(field)
  car.position.set(27,.20,26);car.rotation.y=yaw
  const machine=createBackhoe(car);machine.setEnabled(true);machine.update(.05,field)
  const initial=machine.contact(),before=field.heightAt(initial.x,initial.z)
  machine.setAction('dig');for(let i=0;i<900;i++)machine.update(1/60,field)
  assert.ok(machine.load.amount>1.4,`full-size bucket must not stall at 42 L: ${machine.load.amount}`)
  assert.equal(machine.action,'carry');assert.ok(machine.contact().y>.90)
  assert.ok(field.heightAt(initial.x,initial.z)<before-.45,'actual central crater must exceed 45 cm')
  desert.sync();desert.root.updateMatrixWorld(true)
  const hit=new THREE.Raycaster(new THREE.Vector3(initial.x,8,initial.z),new THREE.Vector3(0,-1,0)).intersectObject(desert.mesh)[0]
  assert.ok(hit && hit.point.y<before-.45,'the rendered surface, not just the counter, must be lower')
  assert.ok(Math.abs(field.volumeDelta()+machine.load.amount)<1e-8)
  const view=excavationCamera(car,machine.contact(),false)
  const forward=new THREE.Vector3(0,0,-1).applyAxisAngle(new THREE.Vector3(0,1,0),yaw)
  assert.ok(view.position.clone().sub(view.target).dot(forward)>2,'camera is beyond the front bucket, not behind the cab')
  const camera=new THREE.PerspectiveCamera(60,1.3,.1,100);camera.position.copy(view.position);camera.lookAt(view.target);camera.updateMatrixWorld(true)
  const projected=hit.point.clone().project(camera)
  assert.ok(Math.abs(projected.x)<.85 && Math.abs(projected.y)<.85,'hole is framed inside the working viewport')
  let panels=0;car.traverse(o=>{if(/PV.*panel/i.test(o.name))panels++});assert.ok(panels>=10)
  const bucket=car.getObjectByName('front-loader-bucket')!;assert.ok(new THREE.Box3().setFromObject(bucket).getSize(new THREE.Vector3()).length()>3)
  disposeObject(car);disposeObject(desert.root)
 }
})

test('view dragging is separated from chassis yaw and the camera toolbar shares the single equipment drawer',async()=>{
 const source=await readFile(new URL('../src/components/StartingWorld.tsx',import.meta.url),'utf8')
 assert.match(source,/if \(ride\) vehicleViewYaw -= dx/)
 assert.match(source,/driving && !inventoryOpen && <div className="vehicle-tools"/)
 assert.match(source,/inventoryOpen && <div className="equipment-panel"[\s\S]*<div className="world-actions">/)
 assert.match(source,/!driving && <div className="world-special-actions">/)
 assert.match(source,/excavationCamera\(ride.group, machine.contact\(\)/)
 assert.match(source,/vehicleHud.capacity/)
})


test('fast travel uses a jogging support phase instead of six frantic walking steps per second',()=>{
 assert.ok(gaitFrequency(1)*2>=3 && gaitFrequency(1)*2<=4)
 assert.ok(gaitStance(1)<.5 && gaitStance(.5)>=.5)
 const phase=.42,stance=gaitStance(1)
 assert.ok(footCycle(phase,1,stance).lift>0 && footCycle(phase+.5,1,stance).lift>0,'jog has an actual flight interval')
})
