import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { freshState, takeBag, equipSuit, enterZone, selectItem, perform, requirement, TASKS, restoreState } from '../public/apps/iss/game-state.js';
import { makeInterior } from '../public/apps/iss/geometry.js';
import { Octree } from '../public/apps/iss/vendor/examples/jsm/math/Octree.js';
import { Capsule } from '../public/apps/iss/vendor/examples/jsm/math/Capsule.js';

test('the copied ISS engine retains all eight repair sequences and portable progress', () => {
  const state = freshState();
  assert.equal(enterZone(state, 'outside').ok, false);
  takeBag(state); equipSuit(state);
  assert.equal(TASKS.length, 8);
  for (const task of TASKS) {
    enterZone(state, task.zone);
    let steps = 0;
    while (!state.tasks[task.id].done) {
      const step = requirement(state, task.id);
      selectItem(state, step.tool);
      assert.equal(perform(state, task.id, { distance: 1.6, torque: .75 }).ok, true);
      assert.ok(++steps < 10);
    }
  }
  assert.equal(state.used, 6);
  const restored = restoreState(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(restored.tasks, state.tasks);
  assert.deepEqual(restored.items, state.items);
  assert.equal(restored.zone, 'inside');
});

test('the Terra computer is reachable without blocking the ISS corridor or repair approaches', () => {
  const interior = makeInterior();
  interior.group.updateMatrixWorld(true);
  const tree = new Octree().fromGraphNode(interior.solids);
  const capsule = (x, z) => new Capsule(new T.Vector3(x, -1.2, z), new T.Vector3(x, .3, z), .32);
  assert.ok(interior.group.getObjectByName('Terra_Observation_Computer'));
  for (let z = .8; z < 27.4; z += .2) assert.equal(!!tree.capsuleIntersect(capsule(0, z)), false);
  for (let x = 0; x > -.9; x -= .1) assert.equal(!!tree.capsuleIntersect(capsule(x, 6.5)), false);
  for (const task of TASKS.filter(t => t.zone === 'inside'))
    assert.equal(!!tree.capsuleIntersect(capsule(Math.sign(task.pos[0]) * .75, task.pos[2])), false, task.id);
});
