// Prepare the SAME already public game avatar at build time, never per visitor.
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { QUEEN_RELEASE_PATH, QUEEN_SHA256, QUEEN_DECODED_BYTES } from '../server/queen-release.ts';
const origin = 'https://worldifact.xodobrox.workers.dev';
const output = `dist${QUEEN_RELEASE_PATH}`;
export function verifyQueen(bytes) {
  if (bytes.length !== QUEEN_DECODED_BYTES || createHash('sha256').update(bytes).digest('hex') !== QUEEN_SHA256)
    throw new Error('Original Queen changed: review and pin a new revision before release.');
  return bytes;
}
async function readBounded(response, maximum) {
  if (response.status !== 200 || !response.body) { await response.body?.cancel(); throw new Error('Queen release source unavailable.'); }
  const reader = response.body.getReader(), chunks = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength; if (size > maximum) throw new Error('Queen release source too large.');
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  finally { reader.releaseLock(); }
}
export async function prepareQueenRelease() {
  let bytes;
  try { bytes = verifyQueen(gunzipSync(await readFile(output), { maxOutputLength: QUEEN_DECODED_BYTES })); }
  catch { /* Hydrate the pinned original rather than trusting an absent/old local file. */ }
  if (!bytes) {
    // Prefer the immutable public release. The legacy read-only API is needed
    // only to bootstrap the first release. No redirects, credentials or writes.
    try {
      const response = await fetch(`${origin}${QUEEN_RELEASE_PATH}`, { redirect: 'error', signal: AbortSignal.timeout(60000) });
      const type = response.headers.get('content-type') ?? '';
      if (!/application\/(?:x-)?gzip|application\/octet-stream/.test(type)) { await response.body?.cancel(); throw new Error('No pinned release yet.'); }
      bytes = verifyQueen(gunzipSync(await readBounded(response, 25 * 1024 * 1024), { maxOutputLength: QUEEN_DECODED_BYTES }));
    } catch { /* Fixed original API fallback; successful bytes still require SHA-256. */ }
  }
  for (let attempt = 0; !bytes && attempt < 6; attempt++) {
    const response = await fetch(`${origin}/api/avatar/neptune-queen`, {
      headers: { 'Accept-Encoding': 'gzip' }, redirect: 'error', signal: AbortSignal.timeout(90000),
    });
    if ([500, 502, 503, 504].includes(response.status)) {
      await response.body?.cancel();
      if (attempt === 5) throw new Error('Current Queen is unavailable; do not publish a missing avatar.');
      await new Promise(resolve => setTimeout(resolve, 2000 * (attempt + 1))); continue;
    }
    if (!['model/gltf-binary', 'application/octet-stream'].includes(response.headers.get('content-type')?.split(';')[0] ?? '')) {
      await response.body?.cancel(); throw new Error('Queen source is not a GLB.');
    }
    bytes = verifyQueen(await readBounded(response, QUEEN_DECODED_BYTES));
  }
  if (!bytes) throw new Error('Missing original Queen.');
  const encoded = gzipSync(bytes, { level: 6 });
  if (encoded.length > 25 * 1024 * 1024) throw new Error('Queen release exceeds the asset size limit.');
  verifyQueen(gunzipSync(encoded, { maxOutputLength: QUEEN_DECODED_BYTES }));
  await mkdir(dirname(output), { recursive: true });
  await writeFile(`${output}.part`, encoded); await rename(`${output}.part`, output);
  console.log(`PASS: exact Queen release ${QUEEN_SHA256}: ${bytes.length} decoded bytes, ${encoded.length} wire bytes; no source model committed.`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await prepareQueenRelease();
