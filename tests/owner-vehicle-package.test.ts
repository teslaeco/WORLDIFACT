import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

const EXPECTED_GAME_SHA256 = "7f27b281103325aa6f2aa58fcc396be7cf319bc683a91c4798ca374d592d70c3";
const PARTS = Array.from({ length: 6 }, (_, index) =>
  new URL(`../public/world-assets/owner-landship/part-${String(index).padStart(2, "0")}.b64`, import.meta.url),
);

test("owner Mars solar landship GAME package reconstructs the reviewed GLB", () => {
  const encoded = PARTS.map(url => readFileSync(url, "utf8")).join("");
  assert.equal(encoded.length, 284_304);
  assert.match(encoded, /^[A-Za-z0-9+/=]+$/);
  const packed = Buffer.from(encoded, "base64");
  assert.equal(packed.length, 213_226);
  const glb = gunzipSync(packed);
  assert.equal(glb.length, 1_291_820);
  assert.equal(glb.subarray(0, 4).toString("ascii"), "glTF");
  assert.equal(glb.readUInt32LE(4), 2);
  assert.equal(glb.readUInt32LE(8), glb.length);
  assert.equal(createHash("sha256").update(glb).digest("hex"), EXPECTED_GAME_SHA256);
});

test("owner landship transport remains bounded to six static parts", () => {
  for (const url of PARTS) {
    const part = readFileSync(url, "utf8");
    assert.ok(part.length > 0);
    assert.ok(part.length <= 48_000);
  }
});
