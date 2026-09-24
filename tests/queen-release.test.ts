import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync, gunzipSync } from 'node:zlib';
import { readFile } from 'node:fs/promises';
import { avatarApi } from '../server/avatar.ts';
import { avatarAcceptsGzip, QUEEN_RELEASE_PATH, QUEEN_DECODED_BYTES } from '../server/queen-release.ts';
const url = 'https://worldifact.test/api/avatar/neptune-queen';
const source = new Uint8Array(4096); const gzip = gzipSync(source);
const configured = { ORACLE_ENDPOINT: 'https://queen.trycloudflare.com', ORACLE_API_TOKEN: 'never-forward-this' };
const failFetch = (async () => { throw new Error('Must not contact Oracle for the deployed Queen.'); }) as typeof fetch;
function asset(body: ConstructorParameters<typeof Response>[0] = gzip) {
  return new Response(body, { headers: { 'Content-Type': 'application/gzip', 'Content-Length': String(gzip.length) } });
}
test('deployed Queen forwards the release stream without buffering, compression, cookies or Oracle calls', async () => {
  let reads = 0, assetCalls = 0;
  const body = new ReadableStream<Uint8Array>({ pull(controller) { reads++; controller.enqueue(gzip); controller.close(); } }, { highWaterMark: 0 });
  const env = { ...configured, ASSETS: { async fetch(request: Request) {
    assetCalls++; assert.equal(new URL(request.url).pathname, QUEEN_RELEASE_PATH); assert.equal(new URL(request.url).search, '');
    assert.equal(request.headers.get('Authorization'), null); assert.equal(request.headers.get('Cookie'), null);
    assert.equal(request.headers.get('Range'), null); assert.equal(request.headers.get('Accept-Encoding'), 'identity');
    return asset(body);
  } } };
  const response = (await avatarApi(new Request(url + '?noise=user', { headers: { 'Accept-Encoding': 'gzip', Cookie: 'private', Range: 'bytes=0-1' } }), env, failFetch))!;
  assert.equal(response.status, 200); assert.equal(reads, 0); assert.equal(assetCalls, 1);
  assert.equal(response.headers.get('X-WORLDIFACT-Avatar-Cache'), 'STATIC'); assert.equal(response.headers.get('Content-Encoding'), 'gzip');
  assert.deepEqual(new Uint8Array(gunzipSync(await response.arrayBuffer())), source); assert.equal(reads, 1);
});
test('release identity and HEAD honor original Cloudflare negotiation and retain exact bytes', async () => {
  const env = { ...configured, ASSETS: { async fetch(request: Request) { return asset(request.method === 'HEAD' ? null : gzip); } } };
  const request = new Request(url, { headers: { 'Accept-Encoding': 'gzip, br' } });
  Object.defineProperty(request, 'cf', { value: { clientAcceptEncoding: 'gzip;q=0, identity' } });
  assert.equal(avatarAcceptsGzip(request), false);
  const response = (await avatarApi(request, env, failFetch))!;
  assert.equal(response.headers.get('Content-Encoding'), null); assert.deepEqual(new Uint8Array(await response.arrayBuffer()), source);
  const head = (await avatarApi(new Request(url, { method: 'HEAD' }), env, failFetch))!;
  assert.equal(head.body, null); assert.equal(head.headers.get('Content-Length'), String(QUEEN_DECODED_BYTES));
});
test('missing or partial release fails closed without heavy on-demand fallback; configuration remains required', async () => {
  let calls = 0;
  for (const invalid of [new Response('<html>SPA</html>', { headers: { 'Content-Type': 'text/html' } }), new Response(null, { status: 302 }), new Response(gzip, { status: 206 }), new Response(gzip, { headers: { 'Content-Type': 'application/gzip', 'Content-Length': String(26 * 1024 * 1024) } })]) {
    const env = { ...configured, ASSETS: { async fetch() { calls++; return invalid; } } };
    const response = (await avatarApi(new Request(url), env, failFetch))!;
    assert.equal(response.status, 502); assert.equal(response.headers.get('Cache-Control'), 'no-store');
  }
  const response = (await avatarApi(new Request(url), { ASSETS: { async fetch() { calls++; return asset(); } } }, failFetch))!;
  assert.equal(response.status, 503); assert.equal(calls, 4);
});
test('release gate is part of every production build and does not publish source binaries into git', async () => {
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  assert.equal(pkg.scripts.postbuild, 'node scripts/prepare-queen-release.mjs');
  assert.ok((await readFile('.gitignore', 'utf8')).split('\n').includes('dist'));
});

// Production ASSETS binding omits Content-Length; this is not an invalid model.
test('headerless internal static streams and HEAD remain valid without buffering or an invented wire size', async () => {
  const env = { ...configured, ASSETS: { async fetch(request: Request) {
    return new Response(request.method === 'HEAD' ? null : gzip, { headers: { 'Content-Type': 'application/gzip' } });
  } } };
  for (const method of ['GET', 'HEAD']) {
    const response = (await avatarApi(new Request(url, { method, headers: { 'Accept-Encoding': 'gzip' } }), env, failFetch))!;
    assert.equal(response.status, 200); assert.equal(response.headers.get('Content-Length'), null);
    assert.equal(response.headers.get('X-WORLDIFACT-Avatar-Cache'), 'STATIC');
    assert.equal(response.headers.get('Content-Encoding'), 'gzip');
    if (method === 'GET') assert.deepEqual(new Uint8Array(gunzipSync(await response.arrayBuffer())), source);
    else assert.equal(response.body, null);
  }
});
