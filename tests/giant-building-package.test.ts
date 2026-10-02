import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  GIANT_BUILDING_GAME_BYTES,
  GIANT_BUILDING_GAME_SHA256,
  GIANT_BUILDING_RUNTIME_PROFILE,
  GIANT_BUILDING_SOURCE_SHA256,
} from "../src/lib/giantBuilding.ts";

const DIRECT = new URL("../public/world-assets/giant-building/terrace-tower-e7e96cc3.glb", import.meta.url);
const MANIFEST = new URL("../public/world-assets/giant-building/current.json", import.meta.url);

test("portal-world tower package is the exact owner-selected GLB", () => {
  assert.equal(GIANT_BUILDING_RUNTIME_PROFILE, "owner-exact-glb-v1");
  assert.equal(GIANT_BUILDING_GAME_SHA256, GIANT_BUILDING_SOURCE_SHA256);
  const glb = readFileSync(DIRECT);
  assert.equal(glb.length, GIANT_BUILDING_GAME_BYTES);
  assert.equal(glb.subarray(0, 4).toString("ascii"), "glTF");
  assert.equal(glb.readUInt32LE(4), 2);
  assert.equal(glb.readUInt32LE(8), glb.length);
  assert.equal(createHash("sha256").update(glb).digest("hex"), GIANT_BUILDING_GAME_SHA256);
});

test("portal building manifest identifies the exact existing Oracle artifact", () => {
  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  assert.equal(manifest.jobId, "e7e96cc3-8ad6-4ce8-996a-a4292407bc24");
  assert.equal(manifest.sha256, "0321c8f76c84d53a33f6fed20d128cd3460b3e24f87ff4bb36ee92f25cf3a3c6");
  assert.equal(manifest.bytes, 21_047_056);
  assert.equal(manifest.source, "OWNER_GENERATED_WORLDIFACT_ORACLE_JOB");
});

test("owner tower retains all 110 meshes, 12 materials and 10 embedded textures without external dependencies", () => {
  const original = readFileSync(DIRECT);
  const doc = JSON.parse(original.subarray(20, 20 + original.readUInt32LE(12)).toString('utf8'));
  assert.equal(doc.meshes.length, 110); assert.equal(doc.materials.length, 12); assert.equal(doc.images.length, 10);
  assert.ok(doc.images.every((image: { uri?: string; bufferView?: number }) => !image.uri && Number.isInteger(image.bufferView)));
  assert.ok(doc.buffers.every((buffer: { uri?: string }) => !buffer.uri));
  assert.ok(doc.meshes.every((mesh: { primitives: unknown[] }) => mesh.primitives.length > 0));
});
