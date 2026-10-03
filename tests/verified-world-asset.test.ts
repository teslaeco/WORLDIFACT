import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { abortable, abortableResource, createVerifiedWorldAsset, WorldAssetCompressionError, type WorldAssetProgress } from '../src/lib/verifiedWorldAsset.ts';

const fixture = () => {
  const bytes = new Uint8Array(1024);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, bytes.length, true);
  return bytes;
};
const bytes = fixture();
const descriptor = { url: '/world-assets/owner.glb', bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), label: 'Owner model' };

test('parallel world consumers share one bounded GET and cache only SHA-256 verified original bytes', async () => {
  const asset = createVerifiedWorldAsset(descriptor);
  let calls = 0;
  const progress: WorldAssetProgress[] = [];
  const fetcher = (async (url, init) => {
    calls++; assert.equal(url, descriptor.url); assert.equal(init?.cache, 'force-cache'); assert.equal(init?.redirect, 'error'); assert.equal(init?.credentials, 'same-origin');
    return new Response(bytes);
  }) as typeof fetch;
  const [first, second] = await Promise.all([asset.load({ fetcher, onProgress: value => progress.push(value) }), asset.load({ fetcher })]);
  assert.deepEqual(new Uint8Array(first), bytes); assert.equal(first, second);
  assert.equal(await asset.load({ fetcher }), first); assert.equal(calls, 1);
  assert.equal(progress.at(-1)?.phase, 'downloaded'); assert.equal(progress.at(-1)?.loaded, bytes.length);
  assert.ok(progress.some(value => value.phase === 'verifying'));
});

test('gzip transport reconstructs byte-identical geometry/material payload before verification', async () => {
  const asset = createVerifiedWorldAsset({ ...descriptor, gzipUrl: `${descriptor.url}.gz` });
  let requested = '';
  const result = await asset.load({ fetcher: (async url => { requested = String(url); return new Response(gzipSync(bytes), { headers: { 'content-type': 'application/gzip' } }); }) as typeof fetch });
  assert.equal(requested, `${descriptor.url}.gz`); assert.deepEqual(new Uint8Array(result), bytes);
});

test('HTML, oversized, truncated and same-size corrupt bytes cannot poison the cache', async () => {
  const asset = createVerifiedWorldAsset(descriptor);
  const corrupt = bytes.slice(); corrupt[40] = 99;
  const invalid = [new Response('<html>fallback</html>', { headers: { 'content-type': 'text/html' } }), new Response(new Uint8Array(bytes.length + 1)), new Response(bytes.slice(0, 20)), new Response(corrupt)];
  for (const response of invalid) await assert.rejects(asset.load({ fetcher: (async () => response) as typeof fetch }));
  assert.deepEqual(new Uint8Array(await asset.load({ fetcher: (async () => new Response(bytes)) as typeof fetch })), bytes);
});

test('cancelling one world subscriber does not abort another; last cancellation aborts underlying GET', async () => {
  const asset = createVerifiedWorldAsset(descriptor);
  const first = new AbortController(), second = new AbortController();
  let networkSignal: AbortSignal | undefined;
  const fetcher = ((_url, init) => { networkSignal = init!.signal!; return new Promise(() => {}); }) as typeof fetch;
  const a = asset.load({ signal: first.signal, fetcher }), b = asset.load({ signal: second.signal, fetcher });
  await Promise.resolve();
  first.abort(); await assert.rejects(a, { name: 'AbortError' }); assert.equal(networkSignal!.aborted, false);
  second.abort(); await assert.rejects(b, { name: 'AbortError' }); assert.equal(networkSignal!.aborted, true);
  assert.deepEqual(new Uint8Array(await asset.load({ fetcher: (async () => new Response(bytes)) as typeof fetch })), bytes);
});

test('first-byte and mid-stream stalls settle with a retryable timeout instead of an endless loading status', async () => {
  for (const mode of ['headers', 'body']) {
    const asset = createVerifiedWorldAsset(descriptor, { firstByteMs: 20, stallMs: 20, totalMs: 80 });
    let cancelled = false;
    const fetcher = (async () => mode === 'headers' ? new Promise<Response>(() => {}) : new Response(new ReadableStream({ start(controller) { controller.enqueue(bytes.slice(0, 20)); }, cancel() { cancelled = true; } }))) as typeof fetch;
    await assert.rejects(asset.load({ fetcher }), { name: 'TimeoutError' });
    if (mode === 'body') assert.equal(cancelled, true);
    assert.deepEqual(new Uint8Array(await asset.load({ fetcher: (async () => new Response(bytes)) as typeof fetch })), bytes);
  }
});

test('synchronous fetch failure and already-cancelled mounts remain recoverable without orphan requests', async () => {
  const asset = createVerifiedWorldAsset(descriptor);
  await assert.rejects(asset.load({ fetcher: (() => { throw new Error('network unavailable'); }) as typeof fetch }), /network unavailable/);
  const controller = new AbortController(); controller.abort(); let calls = 0;
  await assert.rejects(asset.load({ signal: controller.signal, fetcher: (async () => { calls++; return new Response(bytes); }) as typeof fetch }), { name: 'AbortError' });
  assert.equal(calls, 0);
  assert.deepEqual(new Uint8Array(await asset.load({ fetcher: (async () => new Response(bytes)) as typeof fetch })), bytes);
});

test('retry bypasses a corrupt cached response instead of reusing it forever', async () => {
  const asset = createVerifiedWorldAsset(descriptor), policies: (RequestInit['cache'] | undefined)[] = [];
  const corrupt = bytes.slice(); corrupt[40] = 42;
  const fetcher = (async (_url, init) => { policies.push(init?.cache); return new Response(init?.cache === 'reload' ? bytes : corrupt); }) as typeof fetch;
  await assert.rejects(asset.load({ fetcher }), /hash mismatch/);
  assert.deepEqual(new Uint8Array(await asset.load({ fetcher })), bytes);
  assert.deepEqual(policies, ['force-cache', 'reload']);
});

test('total deadline stops an endless slow stream even when every chunk resets the stall timer', async () => {
  const asset = createVerifiedWorldAsset(descriptor, { firstByteMs: 50, stallMs: 50, totalMs: 55 });
  let cancelled = false, interval: ReturnType<typeof setInterval>;
  const body = new ReadableStream<Uint8Array>({
    start(controller) { interval = setInterval(() => controller.enqueue(new Uint8Array(1)), 5); },
    cancel() { cancelled = true; clearInterval(interval); },
  });
  try { await assert.rejects(asset.load({ fetcher: (async () => new Response(body)) as typeof fetch }), { name: 'TimeoutError' }); }
  finally { clearInterval(interval!); }
  assert.equal(cancelled, true);
});


test('cancelled decoding disposes late resources and the resolution/abort microtask race exactly once', async () => {
  for (const timing of ['late', 'boundary', 'already-aborted']) {
    const controller = new AbortController(); let released = 0;
    let complete!: (value: object) => void;
    const resource = {}, decoding = new Promise<object>(resolve => { complete = resolve; });
    if (timing === 'already-aborted') controller.abort();
    const result = abortableResource(decoding, controller.signal, value => { assert.equal(value, resource); released++; });
    const rejected = assert.rejects(result, { name: 'AbortError' });
    if (timing === 'boundary') { complete(resource); queueMicrotask(() => controller.abort()); }
    else { controller.abort(); await rejected; complete(resource); }
    await rejected;
    await Promise.resolve(); await Promise.resolve();
    assert.equal(released, 1, timing);
  }
  const controller = new AbortController(); let released = 0; const resource = {};
  assert.equal(await abortableResource(Promise.resolve(resource), controller.signal, () => released++), resource);
  controller.abort(); assert.equal(released, 0, 'successfully delivered resource belongs to the scene');
});


test('browsers without gzip stream support receive the exact uncompressed owner asset', async () => {
  const original = globalThis.DecompressionStream;
  Object.defineProperty(globalThis, 'DecompressionStream', { value: undefined, configurable: true, writable: true });
  try {
    let requested = '';
    const asset = createVerifiedWorldAsset({ ...descriptor, gzipUrl: `${descriptor.url}.gz` });
    assert.deepEqual(new Uint8Array(await asset.load({ fetcher: (async url => { requested = String(url); return new Response(bytes); }) as typeof fetch })), bytes);
    assert.equal(requested, descriptor.url);
  } finally { globalThis.DecompressionStream = original; }
});

test('unavailable or undecodable gzip switches to the original path, with unchanged final hash requirement', async () => {
  for (const mode of ['missing', 'invalid']) {
    const asset = createVerifiedWorldAsset({ ...descriptor, gzipUrl: `${descriptor.url}.gz` });
    const paths: string[] = [];
    const fetcher = (async url => { paths.push(String(url)); return String(url).endsWith('.gz') ? new Response('not gzip', { status: mode === 'missing' ? 404 : 200 }) : new Response(bytes); }) as typeof fetch;
    await assert.rejects(asset.load({ fetcher }), WorldAssetCompressionError);
    assert.deepEqual(new Uint8Array(await asset.load({ fetcher })), bytes);
    assert.deepEqual(paths, [`${descriptor.url}.gz`, descriptor.url]);
  }
});

test('already aborted operations still observe a later underlying rejection', async () => {
  const controller = new AbortController(); controller.abort();
  let fail!: (error: Error) => void;
  const pending = new Promise((_, reject) => { fail = reject; });
  await assert.rejects(abortable(pending, controller.signal), { name: 'AbortError' });
  fail(new Error('late decode rejection'));
  await new Promise(resolve => setTimeout(resolve, 0));
});
