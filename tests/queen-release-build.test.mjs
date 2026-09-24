import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyQueen } from '../scripts/prepare-queen-release.mjs';
import { QUEEN_DECODED_BYTES } from '../server/queen-release.ts';
test('build refuses truncated or same-size substituted Queen before publication', () => {
  assert.throws(() => verifyQueen(Buffer.alloc(100)), /Original Queen changed/);
  assert.throws(() => verifyQueen(Buffer.alloc(QUEEN_DECODED_BYTES)), /Original Queen changed/);
});
