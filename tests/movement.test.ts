import { test } from "node:test";
import assert from "node:assert/strict";
import { movePlayer, findRoverExit } from "../src/lib/movement.ts";
import { demoBlueprint } from "../src/lib/blueprint.ts";
const habitat = { ...demoBlueprint().objects[0], x: 0, z: 0, rotation: 0, scale: 1 };

test("closed doors and thin scaled walls stop movement along the whole path", () => {
  for (const scale of [0.4, 1, 3]) {
    const obstacles = [{ spec: { ...habitat, scale }, doorOpen: false }];
    const result = movePlayer({ x: 0, z: 4 * scale }, { x: 0, z: 0 }, obstacles);
    assert.ok(result.z >= 2.55 * scale - 0.001);
    const throughSide = movePlayer({ x: -4 * scale, z: 0 }, { x: 4 * scale, z: 0 }, obstacles);
    assert.ok(throughSide.x <= -2.9 * scale + 0.001);
  }
});
test("an open door permits walking in and out, including rotated buildings", () => {
  for (const rotation of [0, 90, 180, 330]) {
    const angle = rotation * Math.PI / 180;
    const outside = { x: 4 * Math.sin(angle), z: 4 * Math.cos(angle) };
    const obstacles = [{ spec: { ...habitat, rotation }, doorOpen: true }];
    const inside = movePlayer(outside, { x: 0, z: 0 }, obstacles);
    assert.ok(Math.hypot(inside.x, inside.z) < 0.001);
    const exit = movePlayer(inside, outside, obstacles);
    assert.ok(Math.hypot(exit.x - outside.x, exit.z - outside.z) < 0.001);
  }
});
test("rover collision includes its body radius and cannot use pedestrian doors", () => {
  const result = movePlayer({ x: 0, z: 10 }, { x: 0, z: 0 }, [{ spec: habitat, doorOpen: true }], 2.85);
  assert.ok(result.z >= 5.4 - 0.001);
  assert.deepEqual(movePlayer({ x: 35, z: 35 }, { x: 100, z: 100 }, [], 3), { x: 39, z: 39 });
});
test("rover exit avoids buildings and world edges", () => {
  const exit = findRoverExit({ x: 40, z: 0 }, 0, 1, []);
  assert.ok(exit && Math.abs(exit.x) <= 41.5 && Math.abs(exit.z) <= 41.5);
  assert.equal(findRoverExit({ x: 0, z: 0 }, 0, 0.4, [{ spec: { ...habitat, scale: 3 }, doorOpen: false }]), null);
});
