import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
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
  await mkdir(join(dist, "world-assets"));
  const files = new Map([
    ["/index.html", '<html><title>WORLDIFACT</title><div id="root"></div><script src="/assets/app.js"></script></html>'],
    ["/assets/app.js", "export const worldifact = true;"],
    ["/assets/app.css", "body { color: white; }"],
    ["/assets/lazy.js", "export const portal = true;"],
    ["/assets/lake.webp", "RIFF mock texture bytes"],
    ["/world-assets/polyhedron-led.gltf", '{"asset":{"version":"2.0"},"fixture":"bundled original model bytes"}'],
    ["/world-assets/polyhedron-led-poster.svg", '<svg xmlns="http://www.w3.org/2000/svg"><title>Exact model poster fixture</title></svg>'],
    ["/apps/chess/index.html", '<html>Existing chess app<script src="./game.js"></script></html>'],
    ["/apps/chess/guest.html", '<html>Existing guest app<script src="./game.js"></script></html>'],
    ["/apps/chess/game.js", "export const originalChess = true;"],
    ["/apps/iss/index.html", '<html>Existing ISS application</html>'],
    ["/apps/terra/index.html", '<html>Existing Terra application</html>'],
  ]);
  for (const app of ["chess", "iss", "terra"]) await mkdir(join(dist, "apps", app), { recursive: true });
  for (const [path, contents] of files) await writeFile(join(dist, path.slice(1)), contents);
  await writeFile(join(dist, "foundation-release.json"), JSON.stringify({ files: [...files]
    .filter(([path]) => path.startsWith("/apps/"))
    .map(([path, content]) => ({ path, bytes: Buffer.byteLength(content), sha256: createHash("sha256").update(content).digest("hex") })) }));
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
      "Content-Type": !asset || url.pathname.endsWith(".html") ? "text/html" : (url.pathname.endsWith(".webp") ? "image/webp" : url.pathname.endsWith(".gltf") ? "model/gltf+json" : url.pathname.endsWith(".svg") ? "image/svg+xml" : url.pathname.endsWith(".css") ? "text/css" : "text/javascript"),
    } });
  };
  return { dist, files, requests, fetcher, retryDelaysMs: [], providerCalls: () => providerCalls };
}

test("release smoke verifies deep links and lazy assets and only sends DEMO without secrets", async (t) => {
  const f = await fixture(t);
  const result = await checkPublishedRelease({ origin, versionId }, f);
  assert.equal(result.htmlRoutes, 16);
  assert.equal(result.verifiedAssets, 6);
  assert.equal(result.foundationAssets, 5);
  assert.equal(f.providerCalls(), 0);
  for (const path of ["/world", "/login", "/account/credits", "/world-assets/polyhedron-led.gltf", "/world-assets/polyhedron-led-poster.svg"]) {
    assert.ok(f.requests.some(request => new URL(request.url).pathname === path), `${path} must be checked`);
  }
  const posts = f.requests.filter((request) => request.method === "POST");
  assert.equal(posts.length, 2);
  for (const request of posts) {
    assert.equal((await request.json() as { mode: string }).mode, "demo");
    assert.equal(request.headers.has("Authorization"), false);
    assert.equal(request.headers.has("X-WORLDIFACT-Access"), false);
  }
});

test("copied HTML follows Cloudflare canonical paths while preserving hashes and API redirect policy", async (t) => {
  const f = await fixture(t);
  const canonicalFiles = new Map([
    ["/apps/chess/", "/apps/chess/index.html"],
    ["/apps/chess/guest", "/apps/chess/guest.html"],
    ["/apps/iss/", "/apps/iss/index.html"],
    ["/apps/terra/", "/apps/terra/index.html"],
  ]);
  const seen: string[] = [];
  let stale = false;
  const fetcher = async (url: URL, init: RequestInit) => {
    seen.push(url.pathname);
    assert.equal(init.redirect, url.pathname.startsWith("/api/") ? "error" : "manual");
    if (url.pathname.endsWith("/index.html")) {
      return new Response(null, { status: 307, headers: { Location: origin + url.pathname.slice(0, -11) } });
    }
    if (["/apps/chess", "/apps/iss", "/apps/terra"].includes(url.pathname)) {
      return new Response(null, { status: 307, headers: { Location: url.pathname + "/" } });
    }
    if (url.pathname === "/apps/chess/guest.html") {
      return new Response(null, { status: 307, headers: { Location: "./guest" } });
    }
    const source = canonicalFiles.get(url.pathname);
    if (source) return new Response(stale ? "<html>Stale app</html>" : f.files.get(source), {
      headers: { "Content-Type": "text/html" },
    });
    return f.fetcher(url, init);
  };
  const result = await checkPublishedRelease({ origin, versionId }, { ...f, fetcher });
  assert.equal(result.foundationAssets, 5);
  for (const path of canonicalFiles.keys()) assert.ok(seen.includes(path), path);
  assert.equal(f.requests.filter(request => request.method === "POST").length, 2);
  assert.equal(f.providerCalls(), 0);
  stale = true;
  await assert.rejects(checkPublishedRelease({ origin, versionId }, { ...f, fetcher }), /does not match/);
});

test("static checks reject external, unrelated, credentialed and cyclic redirects", async (t) => {
  const f = await fixture(t);
  for (const [path, location] of [
    ["/apps/chess/index.html", "https://other.example/apps/chess/"],
    ["/apps/chess/index.html", "/"],
    ["/apps/chess/index.html", "/apps/chess/?token=private"],
    ["/apps/chess/index.html", "/apps/chess/#fragment"],
    ["/apps/chess/index.html", origin.replace("https://", "https://user:password@") + "/apps/chess/"],
    ["/apps/chess/index.html", "/apps/chess/index.html"],
    ["/assets/app.js", "/assets/renamed.js"],
  ]) {
    const destinations: string[] = [];
    const target = new URL(location, origin).href;
    let targetReadsBeforeRedirect = 0;
    const fetcher = async (url: URL, init: RequestInit) => {
      destinations.push(url.href);
      if (url.pathname === path) {
        targetReadsBeforeRedirect = destinations.filter(value => value === target).length;
        return new Response(null, { status: 307, headers: { Location: location } });
      }
      return f.fetcher(url, init);
    };
    await assert.rejects(checkPublishedRelease({ origin, versionId }, { ...f, fetcher }), /noncanonical/);
    assert.equal(destinations.filter(value => value === target).length, targetReadsBeforeRedirect);
  }
  const sequence: string[] = [];
  const fetcher = async (url: URL, init: RequestInit) => {
    if (url.pathname.startsWith("/apps/chess") && !url.pathname.endsWith(".js") && !url.pathname.includes("guest")) {
      sequence.push(url.pathname);
      return new Response(null, { status: 307, headers: { Location: url.pathname === "/apps/chess" ? "/apps/chess/" : "/apps/chess" } });
    }
    return f.fetcher(url, init);
  };
  await assert.rejects(checkPublishedRelease({ origin, versionId }, { ...f, fetcher }), /excessive/);
  assert.deepEqual(sequence, ["/apps/chess/index.html", "/apps/chess", "/apps/chess/"]);
  assert.equal(f.providerCalls(), 0);
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

test("release smoke accepts authorized READY health while still exercising only explicit DEMO generation", async (t) => {
  const f = await fixture(t);
  const fetcher = async (url: URL, init: RequestInit) => url.pathname === "/api/health"
    ? Response.json({ mode: "READY", generationReady: true, publicPilot: true, model: "gpt-6-astra" }) : f.fetcher(url, init);
  const result = await checkPublishedRelease({ origin, versionId }, { ...f, fetcher });
  assert.equal(result.mode, "LIVE");
  const posts = f.requests.filter((request) => request.method === "POST");
  assert.equal(posts.length, 2);
  for (const request of posts) assert.equal((await request.json() as { mode: string }).mode, "demo");
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

test("release requires both bundled sculpture files with exact build bytes and a valid content type", async (t) => {
  for (const [path, mime] of [["/world-assets/polyhedron-led.gltf", "model/gltf+json"], ["/world-assets/polyhedron-led-poster.svg", "image/svg+xml"]]) {
    for (const variant of ["html", "stale", "wrong-mime", "missing"]) {
      const f = await fixture(t);
      const fetcher = async (url: URL, init: RequestInit) => url.pathname === path
        ? new Response(variant === "html" ? "<html>SPA fallback</html>" : variant === "stale" ? "previous model revision" : f.files.get(path), {
          status: variant === "missing" ? 404 : 200,
          headers: { "Content-Type": variant === "html" || variant === "wrong-mime" ? "text/html" : mime },
        }) : f.fetcher(url, init);
      await assert.rejects(checkPublishedRelease({ origin, versionId }, { ...f, fetcher }), error => error instanceof Error && error.message.includes(path));
      assert.equal(f.providerCalls(), 0);
      assert.equal(f.requests.some(request => new URL(request.url).pathname === "/api/decor/polyhedron.glb"), false);
    }
  }
});

test("release rejects a portal wrapper masquerading as a copied original app", async (t) => {
  const f = await fixture(t);
  const fetcher = async (url: URL, init: RequestInit) => url.pathname === '/apps/chess/guest.html'
    ? new Response(f.files.get('/index.html'), { headers: { 'Content-Type': 'text/html' } }) : f.fetcher(url, init);
  await assert.rejects(checkPublishedRelease({ origin, versionId }, { ...f, fetcher }), /copied application/);
  assert.equal(f.providerCalls(), 0);
});

test('release briefly retries stale edge HTML but never retries generation POSTs', async (t) => {
  const f = await fixture(t);
  let reads = 0;
  const fetcher = async (url: URL, init: RequestInit) => {
    if (url.pathname === '/' && ++reads <= 2) return new Response('<html>Previous release</html>', { headers: { 'Content-Type': 'text/html' } });
    return f.fetcher(url, init);
  };
  const result = await checkPublishedRelease({ origin, versionId }, { ...f, fetcher, retryDelaysMs: [0, 0] });
  assert.equal(reads, 3);
  assert.equal(result.foundationAssets, 5);
  assert.equal(f.requests.filter(request => request.method === 'POST').length, 2);
  assert.equal(f.providerCalls(), 0);
  await assert.rejects(checkPublishedRelease({ origin, versionId }, {
    ...f, retryDelaysMs: [0], fetcher: async (url, init) => url.pathname === '/'
      ? new Response('<html>Always stale</html>', { headers: { 'Content-Type': 'text/html' } }) : f.fetcher(url, init),
  }), /does not match/);
});
