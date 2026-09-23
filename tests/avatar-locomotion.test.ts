import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { bindStaticAvatar, footCycle, legAngles } from '../src/lib/avatarLocomotion.ts'

function fixture() {
  const root = new THREE.Group()
  root.position.set(4, 0, 17); root.rotation.y = .7
  const material = new THREE.MeshStandardMaterial(); material.name = 'original_skin'
  const add = (name: string, geometry: THREE.BufferGeometry, x: number, y: number, z = 0) => {
    const mesh = new THREE.Mesh(geometry, material); mesh.name = name; mesh.position.set(x, y, z); root.add(mesh); return mesh
  }
  const legs = [-1, 1].map(s => add(`leg_${s}`, new THREE.CylinderGeometry(.065, .06, .80, 12, 20), s * .11, .48))
  add('torso', new THREE.BoxGeometry(.32, .5, .17), 0, 1.2)
  add('LeftArm', new THREE.CylinderGeometry(.05, .04, .45, 12), -.27, 1.12, -.15)
  const hand = add('LeftHand', new THREE.SphereGeometry(.055, 10, 10), -.30, 1.08, -.30)
  const fan = add('hand_fan_surface', new THREE.PlaneGeometry(.45, .50, 8, 8), -.3, 1.33, -.30)
  const ribs = add('fan_ribs', new THREE.BoxGeometry(.03, .48, .03), -.3, 1.33, -.29)
  root.updateMatrixWorld(true)
  return { root, legs, material, fan, ribs, hand }
}
test('static original keeps all triangles, positions, UVs and material identity while gaining valid skin weights', () => {
  const f = fixture()
  const originals = f.legs.map(m => ({ name: m.name, pos: m.geometry.getAttribute('position').array.slice(), uv: m.geometry.getAttribute('uv').array.slice(), index: m.geometry.index!.array.slice() }))
  const rig = bindStaticAvatar(f.root)
  for (const original of originals) {
    const mesh = f.root.getObjectByName(original.name) as THREE.SkinnedMesh
    assert.equal(mesh.isSkinnedMesh, true); assert.equal(mesh.material, f.material)
    assert.deepEqual(mesh.geometry.getAttribute('position').array, original.pos)
    assert.deepEqual(mesh.geometry.getAttribute('uv').array, original.uv)
    assert.deepEqual(mesh.geometry.index!.array, original.index)
    const weights = mesh.geometry.getAttribute('skinWeight')
    for (let i = 0; i < weights.count; i++) assert.ok(Math.abs(weights.getX(i) + weights.getY(i) + weights.getZ(i) + weights.getW(i) - 1) < 1e-6)
    // Bind pose preserves the original actual vertex even on a translated/rotated root.
    const vertex = new THREE.Vector3().fromBufferAttribute(mesh.geometry.getAttribute('position'), 0)
    const transformed = mesh.applyBoneTransform(0, vertex.clone())
    assert.ok(transformed.distanceTo(vertex) < 1e-5)
  }
  rig.dispose()
})
test('walking has alternating planted and lifted feet, bent knees, level ankles and finite joint angles', () => {
  for (let i = 0; i < 80; i++) {
    const phase = i / 80, left = footCycle(phase, 1), right = footCycle(phase + .5, 1)
    assert.ok(left.lift === 0 || right.lift === 0)
    const angle = legAngles(left.z, left.lift, .065)
    assert.ok(angle.knee < -.01)
    assert.ok(Math.abs(angle.hip + angle.knee + angle.ankle) < 1e-10)
    assert.ok(Object.values(angle).every(Number.isFinite))
    const y = .90 - .065 - .41 * Math.cos(angle.hip) - .41 * Math.cos(angle.hip + angle.knee)
    assert.ok(Math.abs(y - (.08 + left.lift)) < 1e-6)
  }
})
test('all original named fan parts stay visible and follow the lowered hand rather than the chest', () => {
  const f = fixture(), rig = bindStaticAvatar(f.root)
  assert.equal(rig.fanParts, 2); assert.equal(rig.fanAttached, true)
  rig.update(1 / 60, 0)
  assert.equal(f.fan.visible, true); assert.equal(f.ribs.visible, true)
  const hand = rig.arms[0].hand.getWorldPosition(new THREE.Vector3()); f.root.worldToLocal(hand)
  assert.ok(hand.y < .95, `hand must be lowered: ${hand.y}`)
  const fan = f.fan.getWorldPosition(new THREE.Vector3()); f.root.worldToLocal(fan)
  assert.ok(fan.y < hand.y, `fan points downward: ${fan.y} < ${hand.y}`)
  const previous = f.fan.getWorldPosition(new THREE.Vector3())
  rig.update(.05, 1)
  assert.ok(f.fan.getWorldPosition(new THREE.Vector3()).distanceTo(previous) > .001)
  rig.dispose()
})
test('a multi-material body is not detached merely because it includes a fan material slot', () => {
  const f = fixture(), skin = new THREE.MeshStandardMaterial(), fan = new THREE.MeshStandardMaterial(); fan.name = 'fan_surface'
  const mixed = new THREE.Mesh(new THREE.BoxGeometry(.3, .5, .2), [skin, fan]); mixed.name = 'Body'; mixed.position.y = 1.1; f.root.add(mixed)
  const rig = bindStaticAvatar(f.root)
  assert.equal(rig.fanParts, 2)
  assert.ok(f.root.getObjectByName('Body') instanceof THREE.SkinnedMesh)
  rig.dispose()
})
