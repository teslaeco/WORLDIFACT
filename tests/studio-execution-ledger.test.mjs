import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

test('per-model cost ledger enforces concurrent caps, immutable selection and sealed uncertainty', () => {
  const result = spawnSync('python3', ['-B', 'tools/model_execution/test_studio_execution.py'], {
    cwd: fileURLToPath(new URL('../', import.meta.url)), encoding: 'utf8', timeout: 20000,
    env: { PATH: process.env.PATH, PYTHONDONTWRITEBYTECODE: '1' },
  })
  assert.equal(result.status, 0, result.stderr || result.error?.message)
  assert.match(result.stderr, /Ran 7 tests/)
})
