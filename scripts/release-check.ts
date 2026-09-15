import { createHash } from "node:crypto";
import { appendFile, readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateGenerationResult } from "../src/lib/blueprint.ts";

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
    else if (entry.isFile() && /\.(js|css)$/.test(path)) files.push(path);
  }
  return files.sort();
}

export async function checkPublishedRelease(deployment: Deployment,
  { dist = "dist", fetcher = fetch }: { dist?: string; fetcher?: ReleaseFetch } = {}) {
  const { origin, versionId } = deployment;
  const request = async (path: string, options: RequestInit = {}) => {
    let response;
    const requestHeaders = new Headers(options.headers);
    requestHeaders.set("Cache-Control", "no-cache");
    try {
      response = await fetcher(new URL(path, origin), {
        ...options, redirect: "error", signal: AbortSignal.timeout(15_000),
        headers: requestHeaders,
      });
    } catch { throw new Error(`HTTP request failed for ${path}; check deployment availability.`); }
    return response;
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
  const health = await json(await request("/api/health"), "/api/health");
  requireCheck(health.mode === "DEMO" && health.generationReady === false && health.model === null,
    "This first-release check requires DEMO with paid generation unavailable.");

  const expectedHtml = await readFile(join(dist, "index.html"));
  requireCheck(/id=["']root["']/.test(expectedHtml.toString()), "Built app entry point is missing.");
  const routes = ["/", "/privacy", "/terms", "/portal/ai-game-lab", "/portal/enchanted-ai-shop"];
  for (const path of routes) {
    const response = await request(path, { headers: { Accept: "text/html" } });
    requireCheck(response.status === 200 && response.headers.get("content-type")?.includes("text/html"),
      `${path} must deliver the HTML application entry point.`);
    requireCheck(digest(Buffer.from(await response.arrayBuffer())) === digest(expectedHtml),
      `${path} does not match the application built for this release.`);
  }
  const assets = await assetFiles(dist);
  requireCheck(assets.some((path) => path.endsWith(".js")) && assets.some((path) => path.endsWith(".css")),
    "The release must include JavaScript and CSS assets.");
  for (const path of assets) {
    const response = await request(`/${path}`);
    const mime = response.headers.get("content-type")?.split(";")[0].trim();
    requireCheck(response.status === 200 && (path.endsWith(".css") ? mime === "text/css" :
      ["text/javascript", "application/javascript"].includes(mime ?? "")),
      `${path} was not delivered with its required JavaScript/CSS content type.`);
    requireCheck(digest(Buffer.from(await response.arrayBuffer())) === digest(await readFile(join(dist, path))),
      `${path} does not match the release build.`);
  }
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
  return { origin, versionId, mode: "DEMO", htmlRoutes: routes.length, verifiedAssets: assets.length };
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
  console.log(`PASS: ${result.htmlRoutes} HTML routes, ${result.verifiedAssets} matching JS/CSS assets, API 404, DEMO generation and origin rejection. No paid API call.`);
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `url=${result.origin}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY,
    `## WORLDIFACT DEMO release\n\n[Open WORLDIFACT](${result.origin})\n\n` +
    `Cloudflare version: \`${result.versionId}\`\n\n` +
    `HTTP checks passed: ${result.htmlRoutes} application routes, ${result.verifiedAssets} JavaScript/CSS files matching the build, API 404, DEMO generation and origin rejection.\n\n` +
    "No paid API call. Browser appearance, WebGL and physical Android still require device QA.\n");
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Release check failed: ${error.message}`);
    process.exitCode = 1;
  });
}
