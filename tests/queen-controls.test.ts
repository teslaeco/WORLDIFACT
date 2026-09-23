import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createJumpState, requestJump, stepJump, resetJump, jumpFlipAngle } from '../src/lib/playerJump.ts'
import { addFanRotors, polishQueenFootwear, orientQueenForGameplay } from '../src/lib/queenDetails.ts'
import { bindStaticAvatar } from '../src/lib/avatarLocomotion.ts'
import { createMeadowGrass } from '../src/lib/meadowGrass.ts'
import { inRiver } from '../src/lib/waterPhysics.ts'

function jumpPeak(double: boolean, dt: number) {
  const s = createJumpState(); requestJump(s)
  if (double) requestJump(s)
  let peak = 0
  for (let i=0;i<240;i++) { stepJump(s,dt); peak = Math.max(peak,s.height) }
  assert.equal(s.jumps,0); assert.equal(s.velocity,0); assert.equal(s.height,0)
  return peak
}
test('two immediate taps produce a higher double jump, a complete flip, and no third jump', () => {
  const s=createJumpState()
  assert.equal(requestJump(s),true); assert.equal(requestJump(s),true)
  assert.equal(requestJump(s),false)
  for (let i=0;i<35;i++) stepJump(s,1/60)
  assert.ok(Math.abs(jumpFlipAngle(s)-Math.PI*2)<1e-9)
  assert.equal(jumpFlipAngle(s,true),0)
  assert.ok(jumpPeak(true,1/60)>jumpPeak(false,1/60)*1.4)
})
test('a late second press boosts upward; landing and blocked actions clear allowances safely', () => {
  const s=createJumpState(); requestJump(s)
  for(let i=0;i<35;i++)stepJump(s,1/60)
  assert.ok(s.velocity<0); assert.equal(requestJump(s),true); assert.ok(s.velocity>0)
  resetJump(s); assert.equal(requestJump(s,false),false); assert.deepEqual(s,createJumpState())
  assert.ok(Math.abs(jumpPeak(true,1/30)-jumpPeak(true,1/120))<.02)
  requestJump(s); stepJump(s,NaN); assert.ok(Object.values(s).every(Number.isFinite))
})
test('original Queen +Z facing becomes movement -Z without editing vertices or UVs', () => {
  const root=new THREE.Group(), mesh=new THREE.Mesh(new THREE.BoxGeometry(.2,1,.1))
  root.add(mesh); const vertices=mesh.geometry.attributes.position.array.slice()
  orientQueenForGameplay(root)
  const front=new THREE.Vector3(0,0,1).applyQuaternion(root.quaternion)
  assert.ok(front.z<-.999); assert.deepEqual(mesh.geometry.attributes.position.array,vertices)
  for(const yaw of [0,.6,Math.PI,-Math.PI/2]) {
    const facing=front.clone().applyAxisAngle(new THREE.Vector3(0,1,0),yaw)
    const movement=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw))
    assert.ok(facing.dot(movement)>.999)
  }
})
test('fan has five six-blade rotor units per side, stays the original surface and rotates only its impellers', () => {
  const fan=new THREE.Group(), original=new THREE.Mesh(new THREE.PlaneGeometry(.5,.4))
  fan.add(original); const positions=original.geometry.attributes.position.array.slice()
  const devices=addFanRotors(fan,[original])
  assert.equal(devices.rotors.length,10)
  for(const rotor of devices.rotors) assert.equal(rotor.children.length,6)
  devices.update(.05,true)
  assert.ok(devices.rotors.every(r=>r.rotation.z>0)); assert.ok(original.visible)
  assert.deepEqual(original.geometry.attributes.position.array,positions)
})
test('the actual fan-side arm rises above the head in flight and returns beside the hip', () => {
  for(const side of [-1,1]) {
    const root=new THREE.Group()
    const add=(name:string,geometry:THREE.BufferGeometry,x:number,y:number,z:number)=>{
      const m=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial());m.name=name;m.position.set(x,y,z);root.add(m);return m
    }
    add('Torso',new THREE.BoxGeometry(.3,.5,.16),0,1.2,0)
    add('Hand',new THREE.SphereGeometry(.05,8,8),side*.30,1.08,-.3)
    add('Arm',new THREE.CylinderGeometry(.05,.04,.45,8),side*.27,1.12,-.15)
    const surface=add('FanSurface',new THREE.PlaneGeometry(.45,.5),side*.3,1.33,-.3)
    const rig=bindStaticAvatar(root), arm=rig.arms[rig.fanArmIndex]
    assert.ok(arm)
    rig.update(.05,0); const low=arm.hand.getWorldPosition(new THREE.Vector3()).y
    assert.ok(low<.95)
    for(let i=0;i<80;i++)rig.update(1/60,0,false,false,true)
    assert.ok(arm.hand.getWorldPosition(new THREE.Vector3()).y>1.78)
    assert.ok(surface.getWorldPosition(new THREE.Vector3()).y>1.78)
    for(let i=0;i<100;i++)rig.update(1/60,0)
    assert.ok(arm.hand.getWorldPosition(new THREE.Vector3()).y<.95)
    root.traverse(o=>assert.ok(o.matrixWorld.elements.every(Number.isFinite)))
    rig.dispose()
  }
})
test('shoe finish preserves maps and topology without creating box-shaped replacement footwear', () => {
  const shoe=new THREE.Mesh(new THREE.SphereGeometry(.1),new THREE.MeshStandardMaterial({roughness:1}))
  shoe.name='RoyalShoes'; const original=shoe.geometry, material=shoe.material
  polishQueenFootwear(shoe)
  assert.equal(shoe.geometry,original);assert.notEqual(shoe.material,material)
  assert.equal(shoe.material.roughness,.4); assert.equal(material.roughness,1)
})
test('mobile meadow uses a bounded instanced draw and no grass appears in the river', () => {
  const grass=createMeadowGrass(true), matrix=new THREE.Matrix4(), position=new THREE.Vector3()
  assert.equal(grass.isInstancedMesh,true);assert.ok(grass.count<=1500)
  for(let i=0;i<grass.count;i++) {
    grass.getMatrixAt(i,matrix); position.setFromMatrixPosition(matrix)
    assert.ok(!inRiver(position)); assert.ok(matrix.elements.every(Number.isFinite))
  }
})

test('flip pivot keeps the hips fixed and never rotates the movement/camera root', async () => {
  const { createPlayerAvatar } = await import('../src/lib/playerAvatar.ts')
  const avatar=createPlayerAvatar('rapper'), hip=new THREE.Vector3(0,.9,0)
  avatar.root.position.set(4,2,17);avatar.root.rotation.y=.6
  const pivot=avatar.root.getObjectByName('avatar-hip-pivot')!
  avatar.root.updateMatrixWorld(true);const before=pivot.localToWorld(hip.clone())
  avatar.update(1,0,false,0,false,false,Math.PI)
  avatar.root.updateMatrixWorld(true)
  assert.ok(pivot.localToWorld(hip.clone()).distanceTo(before)<1e-8)
  assert.equal(avatar.root.rotation.x,0);assert.equal(avatar.root.rotation.y,.6)
  avatar.dispose()
})
test('the real petition rule overrides inherited account links and has readable text contrast', async () => {
  const { readFile } = await import('node:fs/promises')
  const css=await readFile(new URL('../src/components/BrandShowcase.css',import.meta.url),'utf8')
  const rule=css.match(/\.account-universe \.brand-showcase \.iss-petition-sign:visited\s*\{([^}]+)\}/)![1]
  const fg=rule.match(/color:\s*(#[0-9a-f]{6})/i)![1],bg=rule.match(/background:\s*(#[0-9a-f]{6})/i)![1]
  const luminance=(hex:string)=>{
    const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4)
    return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722
  }
  assert.ok((luminance(bg)+.05)/(luminance(fg)+.05)>10)
})
