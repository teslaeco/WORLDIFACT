import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const UPSTREAM = "https://raw.githubusercontent.com/teslaeco/Froge-MPC-2-test/bac2827fc1ec31e71dc0f5c586df43c507338725/public/models/rapper-v10.glb";
const OUTPUT_DIR = new URL("../public/world-assets/forge/", import.meta.url);
const OUTPUT = new URL("../public/world-assets/forge/rapper-v10.glb", import.meta.url);
const EXPECTED_BYTES = 10_343_368;
const EXPECTED_SHA256 = "4b7e83d07723be958e7325f1cd7afc509ebc72d61a6357925c824ac716052adf";

function validate(bytes) {
  if (bytes.length !== EXPECTED_BYTES) throw new Error(`Forge worker length mismatch: ${bytes.length}.`);
  if (bytes.subarray(0, 4).toString("ascii") !== "glTF" || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length)
    throw new Error("Forge worker GLB container is invalid.");
  const sha = createHash("sha256").update(bytes).digest("hex");
  if (sha !== EXPECTED_SHA256) throw new Error(`Forge worker GLB hash mismatch: ${sha}.`);
  return sha;
}

let existing = null;
try { existing = await readFile(OUTPUT); } catch { /* Hydrate below. */ }
if (existing) {
  try {
    const sha = validate(existing);
    console.log(`Forge worker already prepared: ${existing.length} bytes · ${sha}`);
    process.exit(0);
  } catch { /* Replace only with the exact immutable upstream bytes. */ }
}

const response = await fetch(UPSTREAM, { redirect: "error", signal: AbortSignal.timeout(90_000) });
if (!response.ok) throw new Error(`Forge worker upstream HTTP ${response.status}.`);
const bytes = Buffer.from(await response.arrayBuffer());
const sha = validate(bytes);
await mkdir(OUTPUT_DIR, { recursive: true });
await writeFile(OUTPUT, bytes);
console.log(`Prepared same-origin Forge worker GLB: ${bytes.length} bytes · ${sha}`);
