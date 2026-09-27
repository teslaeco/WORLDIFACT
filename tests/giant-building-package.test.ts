import test from "node:test";
import assert from "node:assert/strict";
import {
  GIANT_BUILDING_FLOORS,
  GIANT_BUILDING_RUNTIME_PROFILE,
  GIANT_BUILDING_SOURCE_SHA256,
} from "../src/lib/giantBuilding.ts";

test("portal-world tower uses compact source-derived geometry instead of the retired static package", () => {
  assert.equal(GIANT_BUILDING_RUNTIME_PROFILE, "owner-source-footprint-v1");
  assert.equal(GIANT_BUILDING_SOURCE_SHA256, "0321c8f76c84d53a33f6fed20d128cd3460b3e24f87ff4bb36ee92f25cf3a3c6");
  assert.equal(GIANT_BUILDING_FLOORS.length, 10);
  assert.ok(GIANT_BUILDING_FLOORS.reduce((sum, floor) => sum + floor.points.length, 0) > 100);
});

test("upper source-derived tower cap is narrower than the irregular lower massing", () => {
  const width = (index: number) => {
    const xs = GIANT_BUILDING_FLOORS[index].points.map(point => point[0]);
    return Math.max(...xs) - Math.min(...xs);
  };
  assert.ok(width(9) < width(0));
  assert.ok(width(8) < width(0));
});
