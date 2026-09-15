import { test } from "node:test";
import assert from "node:assert/strict";
import { JoystickInput, joystickAxes, movementAxes, STILL } from "../src/lib/gameControls.ts";
import { enteredPortal, nearestPortal } from "../src/lib/portalNavigation.ts";
import { PORTALS } from "../src/config/portals.ts";
import { demoBlueprint } from "../src/lib/blueprint.ts";
import { movePlayer } from "../src/lib/movement.ts";

test("water portals open on walking from either side, sideways, and across a skipped frame", () => {
  const gate = [{ id: "lab", position: { x: 0, z: 0 } }];
  for (const [from, to] of [
    [{ x: 0, z: 2 }, { x: 0, z: 1 }],
    [{ x: 0, z: -2 }, { x: 0, z: -1 }],
    [{ x: 2, z: 0 }, { x: 1, z: 0 }],
    [{ x: 0, z: 5 }, { x: 0, z: -5 }],
  ]) assert.equal(enteredPortal(from, to, gate)?.id, "lab");
  assert.equal(enteredPortal({ x: 2, z: 5 }, { x: 2, z: -5 }, gate), undefined);
  assert.equal(enteredPortal({ x: 0, z: 0 }, { x: 0, z: 0 }, gate), undefined);
});

test("portal selection follows travel order, ignores current destination and selects the closest action", () => {
  const gates = [
    { id: "far", position: { x: 0, z: -4 } },
    { id: "near", position: { x: 0, z: 0 } },
  ];
  assert.equal(enteredPortal({ x: 0, z: 5 }, { x: 0, z: -10 }, gates)?.id, "near");
  assert.equal(enteredPortal({ x: 0, z: 5 }, { x: 0, z: -10 }, gates, "near")?.id, "far");
  assert.equal(nearestPortal({ x: 0, z: -1 }, gates)?.id, "near");
  assert.equal(nearestPortal({ x: 0, z: -1 }, gates, "near")?.id, "far");
});

test("all five configured water entrances are reachable from spawn through actual village collision", () => {
  const habitats = demoBlueprint("village forest").objects.filter(spec => spec.kind === "habitat")
    .map(spec => ({ spec, doorOpen: false }));
  const spawn = { x: 0, z: 17 };
  for (const portal of PORTALS) {
    const end = movePlayer(spawn, portal.position, habitats);
    assert.ok(Math.hypot(end.x - portal.position.x, end.z - portal.position.z) < 0.01, portal.id);
    assert.equal(enteredPortal(spawn, end, PORTALS)?.id, portal.id);
  }
});

test("analogue movement preserves slow walking and limits diagonals and combined keyboard input", () => {
  assert.deepEqual(joystickAxes(1, 1, 40), STILL);
  const slow = joystickAxes(0, -20, 40);
  assert.ok(slow.forward > 0 && slow.forward < 0.5);
  assert.deepEqual(movementAxes({}, slow), slow);
  assert.equal(joystickAxes(0, -200, 40).forward, 1);
  const diagonal = movementAxes({ w: true, d: true }, joystickAxes(40, -40, 40));
  assert.ok(Math.abs(Math.hypot(diagonal.side, diagonal.forward) - 1) < 0.00001);
  assert.deepEqual(joystickAxes(NaN, 10, 0), STILL);
});

test("a camera finger cannot hijack or release the movement joystick; cancel and blur stop it", () => {
  const stick = new JoystickInput();
  assert.equal(stick.start(41, 100, 200, 40), true);
  stick.move(41, 100, 160);
  assert.equal(stick.axes.forward, 1);
  assert.equal(stick.start(72, 600, 200, 40), false);
  assert.equal(stick.move(72, 640, 200), false);
  assert.equal(stick.end(72), false);
  assert.equal(stick.axes.forward, 1);
  assert.equal(stick.end(41), true);
  assert.deepEqual(stick.axes, STILL);
  assert.deepEqual(stick.offset, { x: 0, y: 0 });
  stick.start(73, 0, 0, 40);
  stick.move(73, 40, 0);
  stick.reset();
  assert.deepEqual(stick.axes, STILL);
  assert.equal(stick.move(73, 40, 0), false);
});
