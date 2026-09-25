import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

const EXPECTED_GAME_SHA256 = "5cdb61971ce42634acfb3759a73a8ff01f94cb71b18f8feb5df436d754e443d2";
const PARTS = Array.from({ length: 10 }, (_, index) => new URL(`../public/world-assets/giant-building/part-${String(index).padStart(2, "0")}.b64`, import.meta.url));
const DIRECT = new URL("../public/world-assets/giant-building/giant-tower.glb", import.meta.url);

test("giant tower GAME package reconstructs the reviewed GLB exactly", () => {
  const encoded = PARTS.map((url) => readFileSync(url, "utf8")).join("");
  assert.equal(encoded.length, 470_552);
  assert.match(encoded, /^[A-Za-z0-9+/=]+$/);

  const packed = Buffer.from(encoded, "base64");
  assert.equal(packed.length, 352_913);

  const glb = gunzipSync(packed);
  assert.equal(glb.length, 585_484);
  assert.equal(glb.subarray(0, 4).toString("ascii"), "glTF");
  assert.equal(glb.readUInt32LE(4), 2);
  assert.equal(glb.readUInt32LE(8), glb.length);
  assert.equal(createHash("sha256").update(glb).digest("hex"), EXPECTED_GAME_SHA256);
});

test("giant tower transport remains bounded to ten static parts", () => {
  for (const url of PARTS) {
    const part = readFileSync(url, "utf8");
    assert.ok(part.length > 0);
    assert.ok(part.length <= 48_000);
  }
});


test("build preparation publishes the same reviewed Giant Tower GLB directly", () => {
  const direct = readFileSync(DIRECT);
  assert.equal(direct.length, 585_484);
  assert.equal(createHash("sha256").update(direct).digest("hex"), EXPECTED_GAME_SHA256);
  assert.equal(direct.subarray(0, 4).toString("ascii"), "glTF");
  assert.equal(direct.readUInt32LE(8), direct.length);
});
