import { createHash } from "node:crypto";
import { appendFile, readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateGenerationResult } from "../src/lib/blueprint.ts";
import { PORTALS } from "../src/config/portals.ts";

const requireCheck: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) throw new Error(message);
};
const digest = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
type Deployment = { origin: string; versionId: string };
type ReleaseFetch = (url: URL, options: RequestInit) => Promise<Response>;

export function checkCredentialInputs(env: { CLOUDFLARE_ACCOUNT_ID?: string; CLOUDFLARE_API_TOKEN?: string }) {
  requireCheck(/^[a-f\d]{32}$/i.test(env.CLOUDFLARE_ACCOUNT_ID || ""),
    "CLOUDFLARE_ACCOUNT_ID must contain the 32-character Cloudflare Account ID, without spaces.");
  const token = env.CLOUDFLARE_API_TOKEN || "";
  requireCheck(token.length >= 20 && token.length <= 512 && !/[\s"']/.test(token),
    "CLOUDFLARE_API_TOKEN must contain only the token value, without Bearer, quotes or spaces.");
}

export function readDeployment(contents: string): Deployment {
  let entries: Array<Record<string, unknown> | null>;
  try { entries = contents.split(/\r?\n/).filter((line) => line.trim()).map((line) => JSON.parse(line)); }
  catch { throw new Error("Wrangler did not produce valid deployment records."); }
  const record = entries.findLast((entry) => entry?.type === "deploy");
  requireCheck(record?.version === 1 && record.worker_name === "worldifact" &&
    typeof record.version_id === "string" &&
    /^[a-z\d_-]{1,128}$/i.test(record.version_id),
    "No successful WORLDIFACT deployment version was recorded.");
  const origins = [...new Set((Array.isArray(record.targets) ? record.targets : [])
    .filter((target) => typeof target === "string" && /^https:\/\/worldifact\.[a-z\d-]+\.workers\.dev\/?$/.test(target))
    .map((target) => new URL(target).origin))];
  requireCheck(origins.length === 1, "Expected exactly one WORLDIFACT workers.dev deployment URL.");
  return { origin: origins[0], versionId: record.version_id };
}

async function assetFiles(dist: string, relative = "assets"): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(join(dist, relative), { withFileTypes: true })) {
    const path = `${relative}/${entry.name}`;
    if (entry.isDirectory()) files.push(...await assetFiles(dist, path));
    else if (entry.isFile() && /\.(js|css|webp|png)$/.test(path)) files.push(path);
  }
  return files.sort();
}

export async function checkPublishedRelease(deployment: Deployment,
  { dist = "dist", fetcher = fetch, retryDelaysMs = [2000, 4000, 8000, 16000] }:
  { dist?: string; fetcher?: ReleaseFetch; retryDelaysMs?: number[] } = {}) {
  const { origin, versionId } = deployment;
  const request = async (path: string, options: RequestInit = {}, manualRedirects = false) => {
    let response;
    const requestHeaders = new Headers(options.headers);
    requestHeaders.set("Cache-Control", "no-cache");
    try {
      response = await fetcher(new URL(path, origin), {
        ...options, redirect: manualRedirects ? "manual" : "error", signal: AbortSignal.timeout(15_000),
        headers: requestHeaders,
      });
    } catch { throw new Error(`HTTP request failed for ${path}; check deployment availability.`); }
    return response;
  };
  const staticResponse = async (path: string, options: RequestInit) => {
    // Cloudflare canonicalizes file.html and folder/index.html before serving
    // their original bytes. Permit only those same-origin HTML destinations.
    const original = new URL(path, origin);
    const canonical = original.pathname.endsWith(".html")
      ? original.pathname.replace(/(?:\/index)?\.html$/, "") || "/" : null;
    const allowed = new Set(canonical ? [canonical, `${canonical.replace(/\/$/, "")}/`] : []);
    const visited = new Set([original.href]);
    let current = original;
    for (let hops = 0; ; hops++) {
      const response = await request(current.pathname, options, true);
      if (response.status < 300 || response.status >= 400) return response;
      let next: URL;
      try {
        const location = response.headers.get("location");
        requireCheck(location, "Missing redirect location.");
        next = new URL(location, current);
      } catch { throw new Error(`${path} returned an invalid static redirect.`); }
      requireCheck(hops < 2 && next.origin === original.origin && !next.username && !next.password &&
        !next.search && !next.hash && allowed.has(next.pathname) && !visited.has(next.href),
        `${path} returned a noncanonical or excessive static redirect.`);
      await response.body?.cancel();
      visited.add(next.href);
      current = next;
    }
  };
  const json = async (response: Response, path: string, status = 200) => {
    requireCheck(response.status === status && response.headers.get("content-type")?.includes("application/json"),
      `${path} must return JSON with HTTP ${status}.`);
    let value: unknown;
    try { value = await response.json(); }
    catch { throw new Error(`${path} returned invalid JSON.`); }
    requireCheck(value && typeof value === "object" && !Array.isArray(value), `${path} returned an invalid JSON object.`);
    return value as Record<string, unknown>;
  };
  const matchingAsset = async (path: string, expectedHash: string, types: string[], options: RequestInit = {}) => {
    // Newly deployed static assets can briefly reach an edge after the Worker.
    // Retry only idempotent reads, never generation or other POST requests.
    for (let attempt = 0; ; attempt++) {
      const response = await staticResponse(path, options);
      const mime = response.headers.get("content-type")?.split(";")[0].trim();
      const validType = response.status === 200 && types.includes(mime ?? "");
      const matches = validType && digest(Buffer.from(await response.arrayBuffer())) === expectedHash;
      if (matches) return;
      if (attempt >= retryDelaysMs.length) throw new Error(`${path} does not match the copied application / release build or required content type.`);
      await new Promise(resolve => setTimeout(resolve, retryDelaysMs[attempt]));
    }
  };
  const health = await json(await request("/api/health"), "/api/health");
  const demoHealth = health.mode === "DEMO" && health.generationReady === false && health.model === null;
  const liveHealth = health.mode === "READY" && health.generationReady === true && health.model === "gpt-6-astra";
  requireCheck(demoHealth || liveHealth,
    "Release health must be either reviewed DEMO or authorized READY gpt-6-astra.");

  const expectedHtml = await readFile(join(dist, "index.html"));
  requireCheck(/id=["']root["']/.test(expectedHtml.toString()), "Built app entry point is missing.");
  const platform = await json(await request("/api/platform"), "/api/platform");
  requireCheck(platform.cloudflare === "RESPONDING" && typeof platform.ownerChecks === "boolean",
    "Platform status endpoint did not return its contract");
  const routes = ["/", "/control", "/privacy", "/terms", "/terra", "/chess/shop", "/builder", "/make", ...PORTALS.map(portal => portal.route)];
  for (const path of routes) {
    await matchingAsset(path, digest(expectedHtml), ["text/html"], { headers: { Accept: "text/html" } });
  }
  const assets = await assetFiles(dist);
  requireCheck(assets.some((path) => path.endsWith(".js")) && assets.some((path) => path.endsWith(".css")),
    "The release must include JavaScript and CSS assets.");
  for (const path of assets) {
    const types = path.endsWith(".webp") ? ["image/webp"] : path.endsWith(".png") ? ["image/png"] : path.endsWith(".css") ? ["text/css"] : ["text/javascript", "application/javascript"];
    await matchingAsset(`/${path}`, digest(await readFile(join(dist, path))), types);
  }
  const foundation = JSON.parse(await readFile(join(dist, "foundation-release.json"), "utf8")) as {
    files: Array<{ path: string; bytes: number; sha256: string }>;
  };
  requireCheck(Array.isArray(foundation.files) && foundation.files.length <= 1500,
    "The assembled application manifest is missing or invalid.");
  for (const path of ["/apps/chess/index.html", "/apps/chess/guest.html", "/apps/iss/index.html", "/apps/terra/index.html"]) {
    requireCheck(foundation.files.some(file => file.path === path), `Missing original application: ${path}`);
  }
  const foundationFiles = [...foundation.files];
  await Promise.all(Array.from({ length: 4 }, async () => {
    for (let file = foundationFiles.pop(); file; file = foundationFiles.pop()) {
      const path = file.path;
      requireCheck(/^\/apps\/(chess|iss|terra)\/[a-z\d_./+ -]+$/i.test(path) && !path.includes(".."), "Invalid foundation asset path.");
      const local = await readFile(join(dist, path.slice(1)));
      requireCheck(local.length === file.bytes && digest(local) === file.sha256, `${path} changed after assembly.`);
      const expected = path.endsWith(".html") ? ["text/html"] : path.endsWith(".css") ? ["text/css"] :
        path.endsWith(".js") ? ["application/javascript", "text/javascript"] : path.endsWith(".wasm") ? ["application/wasm"] :
        ["model/gltf-binary", "application/octet-stream"];
      await matchingAsset(path, file.sha256, expected);
    }
  }));
  await json(await request("/api/release-check-missing"), "/api/release-check-missing", 404);
  // Always send explicit DEMO, even when checking a mistakenly enabled deployment.
  // No provider secret or access token is available to this workflow step.
  const options = {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({ prompt: "Create a red rover village", mode: "demo" }),
  };
  const body = await json(await request("/api/blueprint", options), "/api/blueprint");
  const scene = validateGenerationResult(body);
  requireCheck(scene.mode === "DEMO" && scene.provenance === "MOCK" && scene.model === null,
    "The DEMO endpoint returned incorrect provenance.");
  const rejected = await request("/api/blueprint", {
    ...options, headers: { ...options.headers, Origin: "https://invalid-origin.example" },
  });
  await json(rejected, "Cross-origin blueprint request", 403);
  return { origin, versionId, mode: liveHealth ? "LIVE" : "DEMO", htmlRoutes: routes.length, verifiedAssets: assets.length, foundationAssets: foundation.files.length };
}

async function main() {
  if (process.argv[2] === "credentials") {
    checkCredentialInputs(process.env);
    console.log("PASS: both deployment inputs are present and have the expected format. Cloudflare will verify authorization during deployment.");
    return;
  }
  requireCheck(process.argv[2] === "smoke" && process.env.WRANGLER_OUTPUT_FILE_PATH,
    "Use release-check.ts credentials, or smoke with WRANGLER_OUTPUT_FILE_PATH.");
  const deployment = readDeployment(await readFile(process.env.WRANGLER_OUTPUT_FILE_PATH, "utf8"));
  console.log(`Deployed URL: ${deployment.origin}`);
  console.log(`Cloudflare version: ${deployment.versionId}`);
  const result = await checkPublishedRelease(deployment);
  console.log(`PASS: ${result.mode} release; ${result.htmlRoutes} HTML routes, ${result.verifiedAssets} matching hub assets, ${result.foundationAssets} original app entries/assets, API 404, explicit DEMO generation path and origin rejection. No paid API call.`);
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `url=${result.origin}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY,
    `## WORLDIFACT ${result.mode} release\n\n[Open WORLDIFACT](${result.origin})\n\n` +
    `Cloudflare version: \`${result.versionId}\`\n\n` +
    `HTTP checks passed: ${result.htmlRoutes} application routes, ${result.verifiedAssets} hub files, ${result.foundationAssets} copied application entries/assets matching the build, API 404, DEMO generation and origin rejection.\n\n` +
    "No paid API call. Browser appearance, WebGL and physical Android still require device QA.\n");
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Release check failed: ${error.message}`);
    process.exitCode = 1;
  });
}
