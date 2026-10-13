import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'

test('Oracle durable inbox survives process death, concurrency, SQLite busy/full and immutable replay', () => {
  const result = spawnSync('python3', ['-B', '-m', 'unittest', 'discover', '-s', 'tools/oracle_admission', '-p', 'test_durable_inbox.py', '-v'], {
    cwd: new URL('..', import.meta.url), encoding: 'utf8', timeout: 30000,
    env: { PATH: process.env.PATH, PYTHONDONTWRITEBYTECODE: '1' },
  })
  assert.equal(result.status, 0, result.stderr || result.error?.message)
  assert.match(result.stderr, /Ran \d+ tests/)
  assert.match(result.stderr, /\nOK\s*$/)
})
