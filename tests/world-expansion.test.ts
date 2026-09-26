import test from "node:test";
import assert from "node:assert/strict";
import { PORTALS } from "../src/config/portals.ts";
import { GRAND_DESERT, MOUNTAIN_COAST, WORLD_BOUND, expandedGroundHeight, expandedWorldContains, expandedZoneName } from "../src/lib/worldExpansion.ts";

test("expanded zones stay outside the five-portal central hub and inside the world boundary", () => {
  assert.ok(GRAND_DESERT.minX > 45);
  assert.ok(MOUNTAIN_COAST.maxX < -45);
  assert.equal(WORLD_BOUND, 174);
  for (const portal of PORTALS) {
    assert.ok(portal.position.x < GRAND_DESERT.minX - 15, portal.id);
    assert.ok(portal.position.x > MOUNTAIN_COAST.maxX + 15, portal.id);
  }
  assert.equal(expandedZoneName(90, 20), "Grand Desert");
  assert.match(expandedZoneName(-90, 20), /Mountain Coast/);
  assert.equal(expandedZoneName(0, 17), "Riverlight meadow");
  assert.equal(expandedWorldContains(173, 0), true);
  assert.equal(expandedWorldContains(175, 0), false);
});

test("Grand Desert ground is finite, raised and joins the central meadow gently", () => {
  assert.ok(expandedGroundHeight(GRAND_DESERT.minX, 0) >= 0);
  assert.ok(expandedGroundHeight(100, 20) > .2);
  assert.equal(expandedGroundHeight(0, 0), 0);
  for (let x = 52; x <= 170; x += 13) for (let z = -120; z <= 120; z += 31)
    assert.ok(Number.isFinite(expandedGroundHeight(x, z)));
});
