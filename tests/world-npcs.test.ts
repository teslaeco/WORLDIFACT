import test from "node:test";
import assert from "node:assert/strict";
import { FORGE_WORKER_SOURCE, forgeNpcPlans } from "../src/lib/worldNpcs.ts";
import { GRAND_DESERT, MOUNTAIN_COAST } from "../src/lib/worldExpansion.ts";

test("ForgeMPC2 worker source is pinned and explicitly generic", () => {
  assert.equal(FORGE_WORKER_SOURCE.repository, "teslaeco/Froge-MPC-2-test");
  assert.match(FORGE_WORKER_SOURCE.commit, /^[a-f0-9]{40}$/);
  assert.equal(FORGE_WORKER_SOURCE.gitBlobSha, "25d3a7f62fb97844843e3007d498a3d93a927d42");
  assert.equal(FORGE_WORKER_SOURCE.bytes, 10_343_368);
  assert.equal(FORGE_WORKER_SOURCE.sha256, "4b7e83d07723be958e7325f1cd7afc509ebc72d61a6357925c824ac716052adf");
  assert.match(FORGE_WORKER_SOURCE.url, new RegExp(FORGE_WORKER_SOURCE.commit));
  assert.match(FORGE_WORKER_SOURCE.label, /generic adult/i);
});

test("mobile NPC cap is four and desktop work is distributed across both new zones", () => {
  const mobile = forgeNpcPlans(true), desktop = forgeNpcPlans(false);
  assert.equal(mobile.length, 4);
  assert.equal(desktop.length, 7);
  assert.equal(new Set(desktop.map(item => item.id)).size, desktop.length);
  assert.ok(desktop.some(item => item.from.x >= GRAND_DESERT.minX));
  assert.ok(desktop.some(item => item.from.x <= MOUNTAIN_COAST.maxX));
  assert.ok(desktop.some(item => item.task === "planting"));
  assert.ok(desktop.some(item => item.task === "building"));
  assert.ok(desktop.some(item => item.task === "carrying"));
  for (const plan of desktop) for (const point of [plan.from, plan.to]) {
    assert.ok(Math.abs(point.x) < 150 && Math.abs(point.z) < 120);
  }
});
