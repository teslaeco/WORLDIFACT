import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { packExactTower, TOWER_BYTES } from '../scripts/prepare-world-assets.mjs';

test('lossless tower transport retains every owner GLB byte and cuts download size', () => {
  const original = readFileSync(new URL('../public/world-assets/giant-building/terrace-tower-e7e96cc3.glb', import.meta.url));
  const packed = packExactTower(original);
  assert.ok(packed.length < original.length * .45);
  assert.deepEqual(gunzipSync(packed, { maxOutputLength: TOWER_BYTES }), original);
  const changed = original.slice(); changed[changed.length - 1] ^= 1;
  assert.throws(() => packExactTower(changed), /changed/);
});
