import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createWorldAvatarSlot } from '../src/lib/worldAvatarSlot.ts';

function avatar() {
  const root = new THREE.Group(), mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  let stopped = 0, disposed = 0;
  mesh.geometry.addEventListener('dispose', () => disposed++);
  root.add(mesh);
  return { root, dispose() { stopped++; }, get stopped() { return stopped; }, get disposed() { return disposed; } };
}

test('changing or retrying a character keeps the live tower, vehicle, position and scene intact', () => {
  const scene = new THREE.Scene(), tower = new THREE.Group(), vehicle = new THREE.Group();
  scene.add(tower, vehicle);
  const first = avatar(); first.root.position.set(12, 3, -8); first.root.rotation.y = .8;
  const expectedRotation = first.root.quaternion.clone();
  const slot = createWorldAvatarSlot(scene, first);
  const replacement = avatar(); slot.replace(replacement);
  assert.equal(slot.current, replacement); assert.deepEqual(replacement.root.position.toArray(), [12, 3, -8]);
  assert.ok(replacement.root.quaternion.equals(expectedRotation));
  assert.equal(tower.parent, scene); assert.equal(vehicle.parent, scene);
  assert.equal(first.root.parent, null); assert.equal(first.stopped, 1); assert.equal(first.disposed, 1);
  const retry = avatar(); slot.replace(retry);
  assert.deepEqual(retry.root.position.toArray(), [12, 3, -8]); assert.equal(replacement.disposed, 1);
  slot.dispose(); slot.dispose(); assert.equal(retry.stopped, 1); assert.equal(retry.disposed, 1);
  assert.deepEqual(scene.children, [tower, vehicle]);
});

test('late character creation after world teardown is disposed and cannot resurrect its scene', () => {
  const scene = new THREE.Scene(), slot = createWorldAvatarSlot(scene, avatar());
  slot.dispose(); const late = avatar(); slot.replace(late);
  assert.equal(scene.children.length, 0); assert.equal(late.stopped, 1); assert.equal(late.disposed, 1);
});
