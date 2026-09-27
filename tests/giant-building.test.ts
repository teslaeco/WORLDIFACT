import test from "node:test";
import assert from "node:assert/strict";
import {
  GIANT_BUILDING_ENTRANCE,
  GIANT_BUILDING_FLOORS,
  GIANT_BUILDING_FOOTPRINT,
  GIANT_BUILDING_HEIGHT,
  GIANT_BUILDING_POSITION,
  GIANT_BUILDING_RUNTIME_PROFILE,
  GIANT_BUILDING_SCALE,
  GIANT_BUILDING_SOURCE_BYTES,
  GIANT_BUILDING_SOURCE_FLOORS,
  GIANT_BUILDING_SOURCE_SHA256,
  GIANT_BUILDING_SOURCE_TRIANGLES,
  GIANT_BUILDING_SOURCE_VERTICES,
  GIANT_INTERIOR_BOUNDS,
  GIANT_INTERIOR_EXIT,
  GIANT_INTERIOR_SPAWN,
  clampGiantInterior,
  nearGiantBuildingEntrance,
  nearGiantInteriorExit,
  resolveGiantBuildingCollision,
} from "../src/lib/giantBuilding.ts";

test("attached terrace tower replaces the previous portal-world landmark", () => {
  assert.equal(GIANT_BUILDING_SOURCE_SHA256, "0321c8f76c84d53a33f6fed20d128cd3460b3e24f87ff4bb36ee92f25cf3a3c6");
  assert.equal(GIANT_BUILDING_SOURCE_BYTES, 21_047_056);
  assert.equal(GIANT_BUILDING_SOURCE_VERTICES, 491_138);
  assert.equal(GIANT_BUILDING_SOURCE_TRIANGLES, 264_680);
  assert.equal(GIANT_BUILDING_SOURCE_FLOORS, 10);
  assert.equal(GIANT_BUILDING_FLOORS.length, 10);
  assert.equal(GIANT_BUILDING_RUNTIME_PROFILE, "owner-source-footprint-v1");
});

test("terrace tower remains a large landmark clear of the aligned water portals", () => {
  assert.equal(GIANT_BUILDING_SCALE, 5.5);
  assert.ok(GIANT_BUILDING_HEIGHT > 50);
  assert.ok(GIANT_BUILDING_POSITION.x < -10);
  assert.ok(GIANT_BUILDING_POSITION.z < -14);
  assert.ok(GIANT_BUILDING_FOOTPRINT.maxZ < -5);
  assert.ok(GIANT_BUILDING_FOOTPRINT.minX > -35);
  assert.ok(GIANT_BUILDING_FOOTPRINT.maxX < -4);
  assert.ok(Math.hypot(GIANT_BUILDING_ENTRANCE.x, GIANT_BUILDING_ENTRANCE.z - 17) > 20);
});

test("exterior collision keeps player out of tower body while leaving entrance approach outside", () => {
  const old = { x: GIANT_BUILDING_FOOTPRINT.maxX + 2, z: GIANT_BUILDING_POSITION.z };
  const blocked = resolveGiantBuildingCollision(old, { x: GIANT_BUILDING_POSITION.x, z: GIANT_BUILDING_POSITION.z });
  assert.deepEqual(blocked, old);
  const free = resolveGiantBuildingCollision(old, { x: GIANT_BUILDING_ENTRANCE.x, z: GIANT_BUILDING_ENTRANCE.z });
  assert.deepEqual(free, GIANT_BUILDING_ENTRANCE);
  assert.equal(nearGiantBuildingEntrance({ x: GIANT_BUILDING_ENTRANCE.x + 1, z: GIANT_BUILDING_ENTRANCE.z }), true);
});

test("source-derived floor profiles are finite, stacked and visibly irregular", () => {
  assert.equal(GIANT_BUILDING_FLOORS[0].y0, 0);
  assert.equal(GIANT_BUILDING_FLOORS.at(-1)?.y1, 9);
  let previous = 0;
  const signatures = new Set<string>();
  for (const floor of GIANT_BUILDING_FLOORS) {
    assert.ok(floor.y0 >= previous - 1e-9);
    assert.ok(floor.y1 > floor.y0);
    assert.ok(floor.points.length >= 8);
    for (const point of floor.points) assert.ok(point.every(Number.isFinite));
    const xs = floor.points.map(point => point[0]), zs = floor.points.map(point => point[1]);
    assert.ok(Math.max(...xs) - Math.min(...xs) > 2);
    assert.ok(Math.max(...zs) - Math.min(...zs) > 2);
    signatures.add(JSON.stringify(floor.points));
    previous = floor.y1;
  }
  assert.equal(signatures.size, 10, "floors must not collapse into a repeated generic tower");
});

test("generated interior bounds are navigable and exit returns through a dedicated marker", () => {
  const clamped = clampGiantInterior({ x: 999, z: -999 });
  assert.equal(clamped.x, GIANT_INTERIOR_BOUNDS.maxX);
  assert.equal(clamped.z, GIANT_INTERIOR_BOUNDS.minZ);
  assert.ok(GIANT_INTERIOR_SPAWN.z < GIANT_INTERIOR_EXIT.z);
  assert.equal(nearGiantInteriorExit(GIANT_INTERIOR_EXIT), true);
  assert.equal(nearGiantInteriorExit({ x: 0, z: -5 }), false);
});
