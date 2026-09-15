import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { meadowBlueprint, demoBlueprint } from '../src/lib/blueprint.ts';
import { createPlayerAvatar } from '../src/lib/playerAvatar.ts';
import { createWorldObject, updateWorldObject, disposeObject } from '../src/lib/worldGeometry.ts';
import { PORTALS } from '../src/config/portals.ts';
import { avoidVehicleBodies } from '../src/lib/movement.ts';

test('walking stops before rotated vehicle bodies but can approach the driver door', () => {
  const car = { ...meadowBlueprint().objects[0], x: 0, z: 0, rotation: 0 };
  assert.ok(avoidVehicleBodies({ x: -4, z: 0 }, { x: 4, z: 0 }, [car]).x <= -1.65);
  const approach = avoidVehicleBodies({ x: -4, z: 0 }, { x: -2.15, z: .25 }, [car]);
  assert.ok(Math.hypot(approach.x + 2.15, approach.z - .25) < 1e-8);
  const rotated = avoidVehicleBodies({ x: 0, z: -4 }, { x: 0, z: 4 }, [{ ...car, rotation: 90 }]);
  assert.ok(rotated.z <= -1.65);
});

test('the open meadow has no buildings and every portal shares the river line', () => {
  assert.ok(meadowBlueprint().objects.every(o => o.kind !== 'habitat'));
  assert.equal(meadowBlueprint().objects.filter(o => o.kind === 'rover').length, 1);
  assert.equal(new Set(PORTALS.map(p => p.position.z)).size, 1);
  const sorted = PORTALS.map(p => p.position.x).sort((a, b) => a - b);
  assert.ok(sorted.slice(1).every((x, i) => x - sorted[i] >= 8));
  assert.ok(demoBlueprint('usuń domki i most').objects.every(o => o.kind !== 'habitat'));
});

test('vehicle has distinct hinged doors, four complete wheels and fits its collision radius', () => {
  const spec = meadowBlueprint().objects[0];
  const car = createWorldObject({ ...spec, x: 0, z: 0, rotation: 0 });
  updateWorldObject(car, { ...spec, x: 0, z: 0, rotation: 0, color: '#ff0000' });
  let tinted = 0;
  car.traverse(part => {
    if (part instanceof THREE.Mesh && part.material instanceof THREE.MeshStandardMaterial && part.material.name === 'worldifact-object-color') {
      assert.equal(part.material.color.getHexString(), 'ff0000'); tinted++;
    }
  });
  assert.ok(tinted > 0, 'existing object color editing remains available on vehicle trim');
  const driver = car.getObjectByName('driver-door')!;
  const passenger = car.getObjectByName('passenger-door')!;
  assert.ok(driver && passenger && driver !== passenger);
  const edge = new THREE.Vector3(0, 0, 1.9);
  driver.rotation.y = -1.1;
  driver.updateWorldMatrix(true, true);
  driver.localToWorld(edge);
  assert.ok(edge.x < -2.8, 'open driver door swings out of the cabin');
  driver.rotation.y = 0;
  const wheels = car.children.filter(o => o.name === 'wheel');
  assert.equal(wheels.length, 4);
  assert.ok(wheels.every(w => w.children.length >= 3));
  const bounds = new THREE.Box3().setFromObject(car);
  assert.ok(Math.hypot(Math.max(Math.abs(bounds.min.x), bounds.max.x), Math.max(Math.abs(bounds.min.z), bounds.max.z)) < 3);
  assert.ok(bounds.min.y >= -.001);
  disposeObject(car);
});

test('animation mannequin has a standing height and seated animation stays finite', () => {
  const avatar = createPlayerAvatar();
  const bounds = new THREE.Box3().setFromObject(avatar.root);
  assert.ok(bounds.min.y >= -.04 && bounds.max.y > 1.7 && bounds.max.y < 2);
  for (const seated of [false, true]) for (const time of [0, .4, 1.1]) {
    avatar.update(time, .8, seated, .5);
    avatar.root.updateMatrixWorld(true);
    avatar.root.traverse(part => assert.ok(part.matrixWorld.elements.every(Number.isFinite)));
  }
  disposeObject(avatar.root);
});
