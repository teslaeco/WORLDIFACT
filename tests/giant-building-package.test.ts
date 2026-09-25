import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

const EXPECTED_GAME_SHA256 = "032d4cb75880d75d8b78493fe75babefea64676b041389fe23e17a362d982ccd";
const PARTS = ["00", "01", "02", "03"].map((part) => new URL(`../public/world-assets/giant-building/part-${part}.b64`, import.meta.url));

test("giant tower GAME package reconstructs the reviewed GLB exactly", () => {
  const encoded = PARTS.map((url) => readFileSync(url, "utf8")).join("");
  assert.equal(encoded.length, 79_120);
  assert.match(encoded, /^[A-Za-z0-9+/=]+$/);

  const packed = Buffer.from(encoded, "base64");
  assert.ok(packed.length >= 50_000 && packed.length <= 70_000);

  const glb = gunzipSync(packed);
  assert.equal(glb.length, 98_392);
  assert.equal(glb.subarray(0, 4).toString("ascii"), "glTF");
  assert.equal(glb.readUInt32LE(4), 2);
  assert.equal(glb.readUInt32LE(8), glb.length);
  assert.equal(createHash("sha256").update(glb).digest("hex"), EXPECTED_GAME_SHA256);
});

test("giant tower transport remains bounded to four small static parts", () => {
  for (const url of PARTS) {
    const part = readFileSync(url, "utf8");
    assert.ok(part.length > 0);
    assert.ok(part.length <= 25_000);
  }
});
