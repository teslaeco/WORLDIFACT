import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const JOB_ID = "e7e96cc3-8ad6-4ce8-996a-a4292407bc24";
const endpoint = (process.env.ORACLE_ENDPOINT || "").replace(/\/$/, "");
const token = process.env.ORACLE_API_TOKEN || "";
if (!/^https:\/\/[^/]+$/.test(endpoint)) throw new Error("ORACLE_ENDPOINT must be one HTTPS origin.");
if (token.length < 16 || token.length > 512) throw new Error("ORACLE_API_TOKEN is unavailable.");

const GLB = {
  path: "/world-assets/giant-building/terrace-tower-e7e96cc3.glb",
  bytes: 21_047_056,
  sha256: "0321c8f76c84d53a33f6fed20d128cd3460b3e24f87ff4bb36ee92f25cf3a3c6",
};
const FBX = {
  route: "fbx",
  path: new URL("../public/world-assets/giant-building/terrace-tower-e7e96cc3.fbx", import.meta.url),
  publicPath: "/world-assets/giant-building/terrace-tower-e7e96cc3.fbx",
  bytes: 10_186_796,
  sha256: "cef2704287ebc78e1d6a36fe01fa0f167571909511e922f6618dab1108d884eb",
};
const PBR = {
  route: "pbr",
  path: new URL("../public/world-assets/giant-building/terrace-tower-e7e96cc3.textures.zip", import.meta.url),
  publicPath: "/world-assets/giant-building/terrace-tower-e7e96cc3.textures.zip",
  bytes: 3_673_160,
  sha256: "b6826b0fa9d6cfd72bfbe7733ad66e3b6071833c52346a2367ee4f2fedae49cf",
};

const headers = { Authorization: `Bearer ${token}` };
const statusResponse = await fetch(`${endpoint}/v1/jobs/${JOB_ID}`, {
  headers: { ...headers, Accept: "application/json" },
  redirect: "error",
  signal: AbortSignal.timeout(30_000),
});
if (!statusResponse.ok) throw new Error(`Oracle job status HTTP ${statusResponse.status}.`);
const status = await statusResponse.json();
const job = status?.job && typeof status.job === "object" ? status.job : status;
if (job?.id !== JOB_ID || job?.state !== "succeeded")
  throw new Error(`Oracle job is not succeeded: ${job?.state || "unknown"}.`);

async function fetchExact(spec) {
  const response = await fetch(`${endpoint}/v1/jobs/${JOB_ID}/exports/${spec.route}`, {
    headers: { ...headers, Accept: "*/*" },
    redirect: "error",
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`Oracle ${spec.route} export HTTP ${response.status}.`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (bytes.byteLength !== spec.bytes) throw new Error(`${spec.route} byte length mismatch: ${bytes.byteLength}.`);
  if (sha256 !== spec.sha256) throw new Error(`${spec.route} SHA-256 mismatch: ${sha256}.`);
  await writeFile(spec.path, bytes);
  console.log(`PASS: ${spec.route} ${bytes.byteLength} bytes · ${sha256}`);
  return { path: spec.publicPath, bytes: bytes.byteLength, sha256 };
}

const fbx = await fetchExact(FBX);
const textures = await fetchExact(PBR);
const manifestUrl = new URL("../public/world-assets/giant-building/current.json", import.meta.url);
const previous = JSON.parse(await readFile(manifestUrl, "utf8"));
await writeFile(manifestUrl, JSON.stringify({
  ...previous,
  revision: 3,
  installedAt: new Date().toISOString(),
  label: "Terrace Tower",
  source: "OWNER_GENERATED_WORLDIFACT_ORACLE_JOB",
  jobId: JOB_ID,
  glb: GLB,
  fbx,
  textures,
  note: "Exact owner-selected GLB, FBX and texture ZIP. Existing succeeded job exports only; no new AI generation requested."
}, null, 2) + "\n");
