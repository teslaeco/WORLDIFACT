import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";

const parts = Array.from({ length: 10 }, (_, index) =>
  new URL(`../public/world-assets/giant-building/part-${String(index).padStart(2, "0")}.b64`, import.meta.url),
);
const output = new URL("../public/world-assets/giant-building/giant-tower.glb", import.meta.url);
const EXPECTED_SHA256 = "5cdb61971ce42634acfb3759a73a8ff01f94cb71b18f8feb5df436d754e443d2";
const EXPECTED_BYTES = 585_484;

const encoded = (await Promise.all(parts.map(url => readFile(url, "utf8")))).join("");
if (!/^[A-Za-z0-9+/=]+$/.test(encoded)) throw new Error("Giant Tower transport contains invalid base64.");
const packed = Buffer.from(encoded, "base64");
const glb = gunzipSync(packed);
if (glb.length !== EXPECTED_BYTES) throw new Error(`Giant Tower GLB length mismatch: ${glb.length}.`);
if (glb.subarray(0, 4).toString("ascii") !== "glTF" || glb.readUInt32LE(4) !== 2 || glb.readUInt32LE(8) !== glb.length)
  throw new Error("Giant Tower GLB container is invalid.");
const sha = createHash("sha256").update(glb).digest("hex");
if (sha !== EXPECTED_SHA256) throw new Error(`Giant Tower GLB hash mismatch: ${sha}.`);
await writeFile(output, glb);
console.log(`Prepared Giant Tower direct GLB: ${glb.length} bytes · ${sha}`);
