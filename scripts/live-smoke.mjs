// Owner-invoked, one-request proof. Never part of CI or automatic deployment.
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { validateGenerationResult } from "../src/lib/blueprint.ts";

const [origin, output, confirmation] = process.argv.slice(2);
if (!origin || !output || confirmation !== "--confirm-paid")
  throw new Error("Usage: node scripts/live-smoke.mjs APPROVED_ORIGIN OUTPUT.json --confirm-paid (one billable request)");
const url = new URL(origin);
if (url.username || url.password || url.search || url.hash || url.pathname !== "/" ||
  !(url.protocol === "https:" || (url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname))))
  throw new Error("Use the approved HTTPS origin, or a local Worker origin, without credentials or query parameters.");
const access = process.env.GENERATION_ACCESS_TOKEN;
if (!access || access.length < 32 || access.length > 256)
  throw new Error("Provide GENERATION_ACCESS_TOKEN in the environment; do not put it in command arguments.");
const health = await fetch(new URL("/api/health", url), { signal: AbortSignal.timeout(5000) }).then((r) => r.json());
if (health.generationReady !== true || health.model !== "gpt-6-astra")
  throw new Error("Live generation is not configured and allowed; no paid request sent.");
const response = await fetch(new URL("/api/blueprint", url), {
  method: "POST",
  redirect: "error",
  headers: { "Content-Type": "application/json", "X-WORLDIFACT-Access": access, Origin: url.origin },
  body: JSON.stringify({ mode: "live", prompt: "Create a moon workshop with one blue rover, two habitats and two solar arrays. Keep their entrances clear." }),
  signal: AbortSignal.timeout(40_000),
});
if (!response.ok) throw new Error(`Generation returned HTTP ${response.status}. No automatic retry was performed.`);
const result = validateGenerationResult(await response.json());
if (result.mode !== "LIVE" || !result.evidence)
  throw new Error("The response is not a live generation with provider evidence.");
const hash = createHash("sha256").update(JSON.stringify(result.blueprint)).digest("hex");
if (hash !== result.evidence.blueprintSha256) throw new Error("Scene fingerprint mismatch.");
await writeFile(output, JSON.stringify({
  origin: url.origin, verifiedAt: new Date().toISOString(), model: result.model,
  requestId: result.requestId, mode: result.mode, ...result.evidence,
  objectCount: result.blueprint.objects.length, biome: result.blueprint.biome,
  note: "Provider evidence for one API response, not a browser/device or manufacturing approval. No secret, prompt or image is included.",
}, null, 2) + "\n", { flag: "wx" });
console.log("PASS: one live Astra response, schema, provenance and scene hash. Evidence saved without secrets. Confirm billed cost in the provider dashboard.");
