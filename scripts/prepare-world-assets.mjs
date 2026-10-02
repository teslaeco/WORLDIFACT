// Lossless transport only. Preserve the owner's exact GLB, geometry and textures.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { gzipSync, gunzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
const path = new URL('../public/world-assets/giant-building/terrace-tower-e7e96cc3.glb', import.meta.url);
export const TOWER_SHA256 = '0321c8f76c84d53a33f6fed20d128cd3460b3e24f87ff4bb36ee92f25cf3a3c6';
export const TOWER_BYTES = 21_047_056;
export function packExactTower(bytes) {
  if (bytes.length !== TOWER_BYTES || createHash('sha256').update(bytes).digest('hex') !== TOWER_SHA256)
    throw new Error('Owner Terrace Tower changed. Review and pin its exact revision before release.');
  const packed = gzipSync(bytes, { level: 6 });
  const decoded = gunzipSync(packed, { maxOutputLength: TOWER_BYTES });
  if (!decoded.equals(bytes)) throw new Error('Tower lossless transport did not preserve the original.');
  return packed;
}
export async function prepareWorldAssets() {
  const bytes = await readFile(path), packed = packExactTower(bytes);
  await writeFile(new URL(`${path.href}.gz`), packed);
  console.log(`PASS: exact Terrace Tower ${bytes.length} decoded bytes, ${packed.length} wire bytes; original model unchanged.`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await prepareWorldAssets();
