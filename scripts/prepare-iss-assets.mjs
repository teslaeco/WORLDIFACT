// Hydrate the owner's existing public ISS models/vendor, without regenerating assets.
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
const manifest = JSON.parse(await readFile('config/foundation-assets.json', 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
for (const entry of manifest.files) {
  if (!/^public\/apps\/iss\/(assets|vendor)\/[A-Za-z0-9_./-]+$/.test(entry.path) || entry.path.includes('..') ||
      !Number.isInteger(entry.bytes) || entry.bytes > 25 * 1024 * 1024 || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw Error('Invalid ISS asset manifest');
  const url = new URL(entry.url);
  if (url.origin !== 'https://fix-iss-repair-game.terraformingplanet.chatgpt.site' || url.search || url.hash) throw Error('Unexpected ISS source');
  let bytes;
  try { bytes = await readFile(entry.path); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (bytes?.length === entry.bytes && hash(bytes) === entry.sha256) continue;
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(45000) });
  if (!response.ok || response.headers.get('content-type')?.includes('text/html')) throw Error(`ISS source did not return ${entry.path}`);
  const chunks = []; let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > entry.bytes) throw Error(`Oversized ISS asset: ${entry.path}`);
    chunks.push(chunk);
  }
  bytes = Buffer.concat(chunks);
  if (bytes.length !== entry.bytes || hash(bytes) !== entry.sha256) throw Error(`ISS source changed: ${entry.path}. Review and pin a new revision.`);
  await mkdir(dirname(entry.path), { recursive: true });
  await writeFile(`${entry.path}.part`, bytes);
  await rename(`${entry.path}.part`, entry.path);
}
console.log(`PASS: ${manifest.files.length} existing ISS models/vendor files match the pinned bytes and SHA-256 hashes.`);
