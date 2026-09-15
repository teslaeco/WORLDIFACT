import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkCredentialInputs, readDeployment, checkPublishedRelease } from "../scripts/release-check.ts";
import { handle } from "../server/worker.ts";

const origin = "https://worldifact.release-fixture.workers.dev";
const versionId = "12345678-1234-1234-1234-123456789012";
const record = { type: "deploy", version: 1, worker_name: "worldifact", version_id: versionId, targets: [origin] };

test("release input errors identify fields without exposing their values", () => {
  const valid = { CLOUDFLARE_ACCOUNT_ID: "a".repeat(32), CLOUDFLARE_API_TOKEN: "test-token-".repeat(4) };
  assert.doesNotThrow(() => checkCredentialInputs(valid));
  assert.throws(() => checkCredentialInputs({ ...valid, CLOUDFLARE_API_TOKEN: `"${valid.CLOUDFLARE_API_TOKEN}"` }));
  for (const field of Object.keys(valid)) {
    const privateValue = "PRIVATE incorrect input";
    assert.throws(() => checkCredentialInputs({ ...valid, [field]: privateValue }), (error: Error) =>
      error.message.includes(field) && !error.message.includes(privateValue));
  }
});

test("only a completed deployment record for the expected Worker yields a release URL", () => {
  assert.deepEqual(readDeployment(JSON.stringify(record)), { origin, versionId });
  for (const broken of [
    { ...record, version_id: null },
    { ...record, worker_name: "unrelated" },
    { ...record, targets: ["https://worldifact.release-fixture.workers.dev.attacker.example"] },
    { ...record, targets: ["https://user:password@worldifact.release-fixture.workers.dev"] },
    { ...record, targets: ["https://worldifact.release-fixture.workers.dev/?token=private"] },
    { ...record, targets: [origin, "https://worldifact.other.workers.dev"] },
  ]) assert.throws(() => readDeployment(JSON.stringify(broken)));
  assert.throws(() => readDeployment("unparsed-private-data"), (error: Error) =>
    !error.message.includes("unparsed-private-data"));
});

async function fixture(t: { after: (callback: () => Promise<void>) => void }) {
  const dist = await mkdtemp(join(tmpdir(), "worldifact-release-"));
  t.after(() => rm(dist, { recursive: true, force: true }));
  await mkdir(join(dist, "assets"));
  const files = new Map([
    ["/index.html", '<html><title>WORLDIFACT</title><div id="root"></div><script src="/assets/app.js"></script></html>'],
    ["/assets/app.js", "export const worldifact = true;"],
    ["/assets/app.css", "body { color: white; }"],
    ["/assets/lazy.js", "export const portal = true;"],
    ["/assets/lake.webp", "RIFF mock texture bytes"],
  ]);
  for (const [path, contents] of files) await writeFile(join(dist, path.slice(1)), contents);
  const requests: Request[] = [];
  let providerCalls = 0;
  const fetcher = async (url: URL, init: RequestInit) => {
    const request = new Request(url, init);
    requests.push(request.clone());
    if (url.pathname.startsWith("/api/")) return handle(request, {}, (async () => {
      providerCalls++;
      throw new Error("Provider access is forbidden in release checks");
    }) as typeof fetch);
    const asset = files.get(url.pathname);
    return new Response(asset ?? files.get("/index.html"), { headers: {
      "Content-Type": asset ? (url.pathname.endsWith(".webp") ? "image/webp" : url.pathname.endsWith(".css") ? "text/css" : "text/javascript") : "text/html",
    } });
  };
  return { dist, files, requests, fetcher, providerCalls: () => providerCalls };
}

test("release smoke verifies deep links and lazy assets and only sends DEMO without secrets", async (t) => {
  const f = await fixture(t);
  const result = await checkPublishedRelease({ origin, versionId }, f);
  assert.equal(result.htmlRoutes, 8);
  assert.equal(result.verifiedAssets, 4);
  assert.equal(f.providerCalls(), 0);
  const posts = f.requests.filter((request) => request.method === "POST");
  assert.equal(posts.length, 2);
  for (const request of posts) {
    assert.equal((await request.json() as { mode: string }).mode, "demo");
    assert.equal(request.headers.has("Authorization"), false);
    assert.equal(request.headers.has("X-WORLDIFACT-Access"), false);
  }
});

test("release smoke rejects a lazy asset silently replaced by HTML or stale JavaScript", async (t) => {
  for (const mismatch of ["html", "stale"]) {
    const f = await fixture(t);
    const fetcher = async (url: URL, init: RequestInit) => url.pathname === "/assets/lazy.js"
      ? new Response(mismatch === "html" ? "<html>SPA fallback</html>" : "stale bundle", {
        headers: { "Content-Type": mismatch === "html" ? "text/html" : "text/javascript" },
      }) : f.fetcher(url, init);
    await assert.rejects(checkPublishedRelease({ origin, versionId }, { ...f, fetcher }), /lazy\.js/);
    assert.equal(f.providerCalls(), 0);
  }
});

test("release smoke refuses a READY health response before making a generation request", async (t) => {
  const f = await fixture(t);
  const fetcher = async (url: URL, init: RequestInit) => url.pathname === "/api/health"
    ? Response.json({ mode: "READY", generationReady: true, model: "gpt-6-astra" }) : f.fetcher(url, init);
  await assert.rejects(checkPublishedRelease({ origin, versionId }, { ...f, fetcher }), /requires DEMO/);
  assert.equal(f.requests.length, 0);
  assert.equal(f.providerCalls(), 0);
});

test("release smoke detects a missing panorama served as HTML or a stale image", async (t) => {
  for (const mime of ["text/html", "image/webp"]) {
    const f = await fixture(t);
    const fetcher = async (url: URL, init: RequestInit) => url.pathname === "/assets/lake.webp"
      ? new Response("incorrect asset", { headers: { "Content-Type": mime } }) : f.fetcher(url, init);
    await assert.rejects(checkPublishedRelease({ origin, versionId }, { ...f, fetcher }), /lake\.webp/);
    assert.equal(f.providerCalls(), 0);
  }
});
