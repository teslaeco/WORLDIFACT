import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createJumpState, requestJump, stepJump, jumpAnimation, FLIP_DURATION } from '../src/lib/playerJump.ts'
import { bindStaticAvatar } from '../src/lib/avatarLocomotion.ts'
import { gaitPose } from '../src/lib/avatarPose.ts'
import { disposeObject } from '../src/lib/worldGeometry.ts'

function queen(){
 const root=new THREE.Group()
 const part=(name:string,x:number,y:number,z:number,geometry:THREE.BufferGeometry)=>{
   const m=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:0x37a8a0}));m.name=name;m.position.set(x,y,z);root.add(m);return m
 }
 part('Torso',0,1.2,0,new THREE.BoxGeometry(.3,.5,.16))
 for(const side of [-1,1]){
   part(`${side<0?'Left':'Right'}Leg`,side*.11,.47,0,new THREE.CylinderGeometry(.059,.035,.79,14,14))
   part(`${side<0?'Left':'Right'}Shoe`,side*.11,.07,-.025,new THREE.SphereGeometry(.07,12,8))
 }
 part('Hand',-.32,1.08,-.30,new THREE.SphereGeometry(.05,10,8))
 part('LowerArm',-.29,1.16,-.16,new THREE.CylinderGeometry(.04,.035,.28,10))
 const fan=new THREE.Group();fan.name='Original_HandFan';root.add(fan)
 const surface=new THREE.Mesh(new THREE.PlaneGeometry(.44,.42),new THREE.MeshStandardMaterial({color:0x148476}));surface.position.set(-.32,1.28,-.30);fan.add(surface)
 const rib=new THREE.Mesh(new THREE.BoxGeometry(.009,.42,.009),surface.material);rib.position.copy(surface.position).add(new THREE.Vector3(.12,0,0));fan.add(rib)
 return {root,fan,surface,rib}
}

test('takeoff has anticipation, mid-flip tucks knees, and landing absorbs impact',()=>{
 const s=createJumpState();requestJump(s);stepJump(s,.05)
 assert.equal(s.height,0);assert.ok(jumpAnimation(s).crouch>.9)
 requestJump(s);for(let i=0;i<19;i++)stepJump(s,1/60)
 const middle=jumpAnimation(s);assert.ok(middle.airborne && middle.tuck>.95)
 const pose=gaitPose(0,0,middle);assert.ok(pose.legs.every(l=>l.knee<-2 && l.hip>1.4))
 while(s.flipTime<FLIP_DURATION)stepJump(s,1/60)
 assert.ok(jumpAnimation(s).tuck<.3,'unfold before touching the ground')
 for(let i=0;i<100&&s.jumps;i++)stepJump(s,1/60)
 assert.equal(s.height,0);stepJump(s,.05);assert.ok(jumpAnimation(s).crouch>.6)
 for(let i=0;i<20;i++)stepJump(s,1/60)
 assert.equal(jumpAnimation(s).crouch,0)
})

test('pelvis height changes with stride rather than holding a permanent walking squat',()=>{
 const drops=Array.from({length:100},(_,i)=>gaitPose(i/100,1).drop)
 assert.ok(Math.max(...drops)<.07)
 assert.ok(Math.min(...drops)<.012)
 assert.ok(Math.max(...drops)-Math.min(...drops)>.04)
})

test('source legs remain separate, whole shoes follow their own ankles, and tuck articulates source vertices',()=>{
 const {root}=queen(),rig=bindStaticAvatar(root)
 const left=root.getObjectByName('LeftLeg') as THREE.SkinnedMesh,right=root.getObjectByName('RightLeg') as THREE.SkinnedMesh
 const sourceLeft=left.geometry.attributes.position.array.slice()
 for(let i=0;i<80;i++)rig.update(1/60,1)
 assert.ok(rig.legs[1].thigh.position.x-rig.legs[0].thigh.position.x>.25)
 for(const name of ['LeftShoe','RightShoe']){
   const shoe=root.getObjectByName(name) as THREE.SkinnedMesh,expected=name.startsWith('Left')?4:7
   const ids=shoe.geometry.attributes.skinIndex,weights=shoe.geometry.attributes.skinWeight
   for(let i=0;i<ids.count;i++){assert.equal(ids.getW(i),expected);assert.equal(weights.getW(i),1)}
 }
 rig.update(.05,0,false,false,false,true,{airborne:true,tuck:1,crouch:0})
 assert.ok(rig.legs.every(l=>l.knee.rotation.x<-2 && l.thigh.rotation.x>1.4))
 assert.ok(rig.legs[0].ankle.getWorldPosition(new THREE.Vector3()).distanceTo(rig.hips.getWorldPosition(new THREE.Vector3()))<.47)
 assert.deepEqual(left.geometry.attributes.position.array,sourceLeft)
 assert.ok(left.geometry.attributes.position!==right.geometry.attributes.position)
 rig.dispose();disposeObject(root)
})

test('unnamed primitives under the original fan stay together in the same hand with no added rotors',()=>{
 const {root,surface,rib}=queen(),vertices=surface.geometry.attributes.position.array.slice(),color=surface.material.color.getHex()
 root.updateMatrixWorld(true)
 const initialDistance=surface.getWorldPosition(new THREE.Vector3()).distanceTo(rib.getWorldPosition(new THREE.Vector3()))
 const rig=bindStaticAvatar(root);assert.equal(rig.fanParts,2);assert.ok(rig.fanAttached)
 for(const flying of [false,true,false]){
   for(let i=0;i<100;i++)rig.update(1/60,.7,false,false,flying)
   assert.equal(surface.parent,rib.parent)
   assert.ok(Math.abs(surface.getWorldPosition(new THREE.Vector3()).distanceTo(rib.getWorldPosition(new THREE.Vector3()))-initialDistance)<1e-8)
   assert.ok(surface.visible&&rib.visible)
 }
 const names:string[]=[];root.traverse(o=>names.push(o.name));assert.ok(!names.some(n=>/rotor|impeller/i.test(n)))
 assert.equal(surface.material.color.getHex(),color);assert.deepEqual(surface.geometry.attributes.position.array,vertices)
 rig.dispose();disposeObject(root)
})
