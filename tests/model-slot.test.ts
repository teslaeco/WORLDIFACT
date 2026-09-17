import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Group, Mesh, BoxGeometry, MeshStandardMaterial, Texture } from 'three'
import { createModelSlot } from '../src/lib/modelSlot.ts'
import { disposeObject } from '../src/lib/worldGeometry.ts'

// Object lifecycle tests; no browser/WebGL rendering or generated-model claim.
test('a late old-session model cannot replace the current model or survive cancellation', () => {
  const released: object[] = []
  const oldSlot = createModelSlot<object>(model => released.push(model))
  const currentSlot = createModelSlot<object>(model => released.push(model))
  const stale = {}, current = {}
  oldSlot.dispose()
  assert.equal(currentSlot.replace(current), true)
  assert.equal(oldSlot.replace(stale), false)
  assert.equal(oldSlot.current, null)
  assert.equal(currentSlot.current, current)
  assert.deepEqual(released, [stale])
  oldSlot.replace(stale); oldSlot.dispose()
  assert.deepEqual(released, [stale], 'stale resources are released once')
  currentSlot.dispose()
  assert.deepEqual(released, [stale, current])
})

test('replacing a model releases only its predecessor and never reuses released resources', () => {
  const released: object[] = []
  const slot = createModelSlot<object>(model => released.push(model))
  const first = {}, second = {}
  assert.equal(slot.replace(first), true)
  assert.equal(slot.replace(first), true)
  assert.deepEqual(released, [])
  assert.equal(slot.replace(second), true)
  assert.deepEqual(released, [first])
  assert.equal(slot.replace(first), false)
  assert.equal(slot.current, second)
  slot.dispose(); slot.dispose()
  assert.deepEqual(released, [first, second])
})

test('preview cleanup releases shared geometry, material and PBR textures once', () => {
  const scene = new Group()
  const geometry = new BoxGeometry()
  const texture = new Texture()
  const material = new MeshStandardMaterial({ map: texture, roughnessMap: texture })
  const root = new Group()
  root.add(new Mesh(geometry, material), new Mesh(geometry, material))
  scene.add(root)
  const count = { geometry: 0, material: 0, texture: 0 }
  geometry.addEventListener('dispose', () => { count.geometry++ })
  material.addEventListener('dispose', () => { count.material++ })
  texture.addEventListener('dispose', () => { count.texture++ })
  const slot = createModelSlot<Group>(model => { model.removeFromParent(); disposeObject(model) })
  assert.equal(slot.replace(root), true)
  slot.dispose(); slot.dispose()
  assert.equal(root.parent, null)
  assert.deepEqual(count, { geometry: 1, material: 1, texture: 1 })
})
