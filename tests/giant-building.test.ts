import test from "node:test";
import assert from "node:assert/strict";
import {
  GIANT_BUILDING_ENTRANCE,
  GIANT_BUILDING_FOOTPRINT,
  GIANT_BUILDING_HEIGHT,
  GIANT_BUILDING_POSITION,
  GIANT_BUILDING_SCALE,
  GIANT_BUILDING_PARTS,
  GIANT_BUILDING_URL,
  GIANT_BUILDING_GAME_BYTES,
  GIANT_INTERIOR_BOUNDS,
  GIANT_INTERIOR_EXIT,
  GIANT_INTERIOR_SPAWN,
  clampGiantInterior,
  nearGiantBuildingEntrance,
  nearGiantInteriorExit,
  resolveGiantBuildingCollision,
} from "../src/lib/giantBuilding.ts";

test("giant building is a large landmark away from spawn, river portals and desert worksite", () => {
  assert.equal(GIANT_BUILDING_SCALE, 5.5);
  assert.ok(GIANT_BUILDING_HEIGHT > 50);
  assert.ok(GIANT_BUILDING_POSITION.x < -10);
  assert.ok(GIANT_BUILDING_POSITION.z < -14);
  assert.ok(GIANT_BUILDING_FOOTPRINT.maxZ < -7);
  assert.ok(GIANT_BUILDING_FOOTPRINT.minX > -35);
  assert.ok(GIANT_BUILDING_FOOTPRINT.maxX < -8);
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

test("generated interior bounds are navigable and exit returns through a dedicated marker", () => {
  const clamped = clampGiantInterior({ x: 999, z: -999 });
  assert.equal(clamped.x, GIANT_INTERIOR_BOUNDS.maxX);
  assert.equal(clamped.z, GIANT_INTERIOR_BOUNDS.minZ);
  assert.ok(GIANT_INTERIOR_SPAWN.z < GIANT_INTERIOR_EXIT.z);
  assert.equal(nearGiantInteriorExit(GIANT_INTERIOR_EXIT), true);
  assert.equal(nearGiantInteriorExit({ x: 0, z: -5 }), false);
});


test("giant building runtime manifest uses the complete reviewed ten-part package", () => {
  assert.equal(GIANT_BUILDING_PARTS.length, 10);
  assert.equal(GIANT_BUILDING_PARTS[0], "/world-assets/giant-building/part-00.b64");
  assert.equal(GIANT_BUILDING_PARTS[9], "/world-assets/giant-building/part-09.b64");
  assert.equal(new Set(GIANT_BUILDING_PARTS).size, 10);
});


test("giant building runtime uses one direct verified GLB for mobile delivery", () => {
  assert.equal(GIANT_BUILDING_URL, "/world-assets/giant-building/giant-tower.glb");
  assert.equal(GIANT_BUILDING_GAME_BYTES, 585_484);
  assert.ok(Math.hypot(GIANT_BUILDING_POSITION.x, GIANT_BUILDING_POSITION.z - 17) < 42);
  assert.ok(Math.hypot(GIANT_BUILDING_ENTRANCE.x, GIANT_BUILDING_ENTRANCE.z - 17) < 32);
});
