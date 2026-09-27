import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";

const JOB_ID = "e7e96cc3-8ad6-4ce8-996a-a4292407bc24";
const EXPECTED_SHA256 = "0321c8f76c84d53a33f6fed20d128cd3460b3e24f87ff4bb36ee92f25cf3a3c6";
const EXPECTED_BYTES = 21_047_056;
const TARGET = new URL("../public/world-assets/giant-building/giant-tower.glb", import.meta.url);
const MANIFEST = new URL("../public/world-assets/giant-building/current.json", import.meta.url);

const endpoint = (process.env.ORACLE_ENDPOINT || "").replace(/\/$/, "");
const token = process.env.ORACLE_API_TOKEN || "";
if (!/^https:\/\/[^/]+$/.test(endpoint)) throw new Error("ORACLE_ENDPOINT must be one HTTPS origin.");
if (token.length < 16 || token.length > 512) throw new Error("ORACLE_API_TOKEN is unavailable.");

const headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };
const statusResponse = await fetch(`${endpoint}/v1/jobs/${JOB_ID}`, {
  headers, redirect: "error", signal: AbortSignal.timeout(30_000),
});
if (!statusResponse.ok) throw new Error(`Oracle job status HTTP ${statusResponse.status}.`);
const status = await statusResponse.json();
const upstreamJob = status?.job && typeof status.job === "object" ? status.job : status;
if (upstreamJob?.id !== JOB_ID || upstreamJob?.state !== "succeeded")
  throw new Error(`Oracle job is not succeeded: ${upstreamJob?.state || "unknown"}.`);

const modelResponse = await fetch(`${endpoint}/v1/jobs/${JOB_ID}/model`, {
  headers: { Authorization: `Bearer ${token}`, Accept: "model/gltf-binary, application/octet-stream" },
  redirect: "error", signal: AbortSignal.timeout(120_000),
});
if (!modelResponse.ok) throw new Error(`Oracle model HTTP ${modelResponse.status}.`);
const bytes = new Uint8Array(await modelResponse.arrayBuffer());
if (bytes.byteLength !== EXPECTED_BYTES) throw new Error(`Owner building byte length changed: ${bytes.byteLength}.`);
if (bytes[0] !== 0x67 || bytes[1] !== 0x6c || bytes[2] !== 0x54 || bytes[3] !== 0x46)
  throw new Error("Owner building is not a GLB.");
const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
if (view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== bytes.byteLength)
  throw new Error("Owner building GLB header is invalid.");
const sha256 = createHash("sha256").update(bytes).digest("hex");
if (sha256 !== EXPECTED_SHA256) throw new Error(`Owner building SHA-256 changed: ${sha256}.`);

await mkdir(new URL("../public/world-assets/giant-building/", import.meta.url), { recursive: true });
await writeFile(TARGET, bytes);
await writeFile(MANIFEST, JSON.stringify({
  revision: 2,
  installedAt: new Date().toISOString(),
  source: "OWNER_GENERATED_WORLDIFACT_ORACLE_JOB",
  jobId: JOB_ID,
  fileName: "WORLDIFACT-e7e96cc3-8ad6-4ce8-996a-a4292407bc24.glb",
  sha256,
  bytes: bytes.byteLength,
  note: "Exact owner-selected GLB. No new AI generation was requested by ingestion."
}, null, 2) + "\n");
console.log(`PASS: installed owner-selected portal building ${bytes.byteLength} bytes · ${sha256}`);
