/** Read-only transport check; no rendering, generation, credentials or model export. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const base = new URL(process.argv[2] || 'https://worldifact.xodobrox.workers.dev');
assert.equal(base.protocol, 'https:');
const url = new URL('/api/avatar/neptune-queen', base);
const expected = '1bbc9311605543b459318f212e791d05fbfa5450820e3433c4145d885ee948ba';
for (let attempt = 1; attempt <= 2; attempt++) {
  const start = performance.now();
  const response = await fetch(url, { headers: { 'Accept-Encoding': 'gzip' }, redirect: 'error', signal: AbortSignal.timeout(120_000) });
  const headersMs = performance.now() - start;
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('X-WORLDIFACT-Source-Job'), '99397623-e45c-48dc-95ec-6f84446a54d5');
  assert.equal(response.headers.get('Content-Encoding'), 'gzip');
  const bytes = new Uint8Array(await response.arrayBuffer()); // Fetch automatically decompresses.
  assert.equal(bytes.byteLength, 27_676_800);
  const hash = createHash('sha256').update(bytes).digest('hex');
  assert.equal(hash, expected, 'Decoded Queen must be byte-identical, not regenerated or simplified.');
  const wireBytes = Number(response.headers.get('Content-Length')) || null;
  if (wireBytes !== null) assert.ok(wireBytes < bytes.byteLength);
  console.log(JSON.stringify({ attempt, status: response.status, cache: response.headers.get('X-WORLDIFACT-Avatar-Cache'),
    headersMs: Math.round(headersMs), totalMs: Math.round(performance.now() - start), decodedBytes: bytes.byteLength, wireBytes, sha256: hash }));
  if (attempt === 1) await new Promise(resolve => setTimeout(resolve, 1200));
}
