import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { readFile } from 'node:fs/promises'
import { createAvatarEquipment, hideEmbeddedFanNodes, nextEquipmentMode } from '../src/lib/playerEquipment.ts'
import { inRiver, nextWaterMode, riverHalfWidth, SWIM_SPEED, FLIGHT_SPEED } from '../src/lib/waterPhysics.ts'

test('river bounds are finite and a missed portal transitions land -> falling -> swimming -> land', () => {
  for (const x of [-42, -10, 0, 10, 42]) assert.ok(riverHalfWidth(x) > 4 && riverHalfWidth(x) < 5.2)
  const portals = [{ position: { x: 0, z: 2.7 } }]
  assert.equal(inRiver({ x: 0, z: 0 }), true)
  assert.equal(inRiver({ x: 0, z: 7 }), false)
  assert.equal(nextWaterMode('land', { x: 8, z: 0 }, portals, 1.8, 'stowed'), 'falling')
  assert.equal(nextWaterMode('falling', { x: 8, z: 0 }, portals, 1.8, 'stowed'), 'falling')
  assert.equal(nextWaterMode('swimming', { x: 8, z: 7 }, portals, 1.8, 'stowed'), 'land')
  assert.equal(nextWaterMode('swimming', { x: 8, z: 0 }, portals, 1.8, 'flight'), 'land')
  assert.ok(SWIM_SPEED < FLIGHT_SPEED)
})

test('portal disk never forces a new swim transition so portal crossing can remain authoritative', () => {
  const portals = [{ position: { x: 0, z: 2.7 } }]
  assert.equal(nextWaterMode('land', { x: 0, z: 2.7 }, portals, 1.8, 'stowed'), 'land')
  assert.equal(nextWaterMode('swimming', { x: 0, z: 2.7 }, portals, 1.8, 'stowed'), 'swimming')
})

test('fan equipment toggles drone and shoulder flight mutually exclusively', () => {
  assert.equal(nextEquipmentMode('stowed', 'toggle-drone'), 'drone')
  assert.equal(nextEquipmentMode('drone', 'toggle-drone'), 'stowed')
  assert.equal(nextEquipmentMode('drone', 'toggle-flight'), 'flight')
  assert.equal(nextEquipmentMode('flight', 'toggle-flight'), 'stowed')
  assert.equal(nextEquipmentMode('flight', 'stow'), 'stowed')
})

test('avatar equipment starts fan-free and only exposes shoulder fans in flight mode', () => {
  const avatar = new THREE.Group()
  const equipment = createAvatarEquipment(avatar)
  const left = avatar.getObjectByName('shoulder-fan-left')!
  const right = avatar.getObjectByName('shoulder-fan-right')!
  assert.equal(left.visible, false)
  assert.equal(right.visible, false)
  equipment.setFlightFans(true)
  assert.equal(left.visible, true)
  assert.equal(right.visible, true)
  equipment.setFlightFans(false)
  assert.equal(left.visible, false)
  assert.equal(right.visible, false)
})

test('separately named embedded fan nodes can be hidden without hiding the character root', () => {
  const root = new THREE.Group(); root.name = 'queen-root'
  const body = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial())
  body.name = 'Body'
  const fan = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial())
  fan.name = 'Peacock_Fan.001'
  root.add(body, fan)
  assert.equal(hideEmbeddedFanNodes(root), 1)
  assert.equal(root.visible, true)
  assert.equal(body.visible, true)
  assert.equal(fan.visible, false)
})


test('shared world integrates splash, swimming, drone, shoulder flight and swimmer portal flow', async () => {
  const source = await readFile(new URL('../src/components/StartingWorld.tsx', import.meta.url), 'utf8')
  assert.match(source, /splashAt\(player\.x, player\.z/)
  assert.match(source, /nextWaterMode\(waterMode, player, PORTALS, PORTAL_RADIUS, equipmentMode\)/)
  assert.match(source, /enteredPortal\(old, player, PORTALS, activePortalId\)/)
  assert.match(source, /createFanDrone\(\)/)
  assert.match(source, /equipmentMode === "drone"/)
  assert.match(source, /equipmentMode === "flight"/)
  assert.match(source, /Fan 1 · Throw \/ drone/)
  assert.match(source, /Fan 2 · Mount both \/ fly/)
})
