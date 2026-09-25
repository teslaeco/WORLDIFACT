import test from "node:test";
import assert from "node:assert/strict";
import {
  OWNER_VEHICLE_CAMERA_SCALE,
  OWNER_VEHICLE_DRIVE_SCALE,
  OWNER_VEHICLE_EXIT_OFFSET,
  OWNER_VEHICLE_POSITION,
  OWNER_VEHICLE_ROTATION,
  OWNER_VEHICLE_RUNTIME_ID,
  OWNER_VEHICLE_SCALE,
  OWNER_VEHICLE_SEAT_OFFSET,
  OWNER_VEHICLE_SOURCE_EXTENT,
  OWNER_VEHICLE_SPEED,
  OWNER_VEHICLE_TURN_SPEED,
  resolveOwnerVehicleCollision,
} from "../src/lib/ownerVehicle.ts";
import { meadowBlueprint } from "../src/lib/blueprint.ts";
import { PORTALS } from "../src/config/portals.ts";

test("owner Mars solar landship is placed beside the existing photovoltaic explorer without overlapping portals", () => {
  assert.equal(OWNER_VEHICLE_SCALE, 0.23);
  assert.equal(OWNER_VEHICLE_ROTATION, 0);
  const rover = meadowBlueprint().objects.find(object => object.id === "rover-1")!;
  assert.ok(Math.hypot(rover.x - OWNER_VEHICLE_POSITION.x, rover.z - OWNER_VEHICLE_POSITION.z) < 8);
  assert.ok(Math.hypot(rover.x - OWNER_VEHICLE_POSITION.x, rover.z - OWNER_VEHICLE_POSITION.z) > 5);
  assert.ok(Math.hypot(OWNER_VEHICLE_POSITION.x, OWNER_VEHICLE_POSITION.z - 17) > 5.5);
  const halfLength = OWNER_VEHICLE_SOURCE_EXTENT.z * OWNER_VEHICLE_SCALE / 2;
  assert.ok(OWNER_VEHICLE_POSITION.z - halfLength > 7);
  for (const portal of PORTALS) assert.ok(Math.hypot(portal.position.x - OWNER_VEHICLE_POSITION.x, portal.position.z - OWNER_VEHICLE_POSITION.z) > 8);
});

test("owner vehicle collision blocks its body but leaves a clear walking lane beside it", () => {
  const old = { x: -4, z: OWNER_VEHICLE_POSITION.z };
  const blocked = resolveOwnerVehicleCollision(old, { x: OWNER_VEHICLE_POSITION.x, z: OWNER_VEHICLE_POSITION.z });
  assert.deepEqual(blocked, old);
  const free = resolveOwnerVehicleCollision(old, { x: 4, z: OWNER_VEHICLE_POSITION.z });
  assert.deepEqual(free, { x: 4, z: OWNER_VEHICLE_POSITION.z });
});


test("owner landship exposes bounded GAME driving parameters", () => {
  assert.equal(OWNER_VEHICLE_RUNTIME_ID, "owner-mars-solar-landship");
  assert.ok(OWNER_VEHICLE_DRIVE_SCALE > 1);
  assert.ok(OWNER_VEHICLE_SPEED > 0 && OWNER_VEHICLE_SPEED <= 12);
  assert.ok(OWNER_VEHICLE_TURN_SPEED > 0 && OWNER_VEHICLE_TURN_SPEED <= 2);
  assert.ok(OWNER_VEHICLE_CAMERA_SCALE >= 1);
  assert.ok(OWNER_VEHICLE_SEAT_OFFSET.y > 0.8);
  assert.ok(Math.abs(OWNER_VEHICLE_EXIT_OFFSET.x) > 2);
});

test("owner landship collision follows the vehicle after it drives away from spawn", () => {
  const pose = { x: 12, z: -8, rotation: Math.PI / 2 };
  const old = { x: 8, z: -8 };
  const blockedAtNewPose = resolveOwnerVehicleCollision(old, { x: 12, z: -8 }, 0.6, pose);
  assert.deepEqual(blockedAtNewPose, old);
  const oldSpawnNowFree = resolveOwnerVehicleCollision(old, { x: OWNER_VEHICLE_POSITION.x, z: OWNER_VEHICLE_POSITION.z }, 0.6, pose);
  assert.deepEqual(oldSpawnNowFree, { x: OWNER_VEHICLE_POSITION.x, z: OWNER_VEHICLE_POSITION.z });
});
