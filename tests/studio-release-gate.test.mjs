import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'

const gate = fileURLToPath(new URL('../scripts/studio-release-gate.sh', import.meta.url))
function command(cwd, binary, args) {
  return spawnSync(binary, args, { cwd, encoding: 'utf8', timeout: 15000, env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1' } })
}
function git(cwd, ...args) {
  const result = command(cwd, 'git', args)
  assert.equal(result.status, 0, result.stderr || String(result.error))
  return result.stdout.trim()
}

test('actual release gate preserves shallow parents, rejects stale main, and fails visibly on missing history', () => {
  const root = mkdtempSync(join(tmpdir(), 'worldifact-git-gate-'))
  try {
    const remote = join(root, 'origin.git'), source = join(root, 'source'), checkout = join(root, 'checkout')
    git(root, 'init', '--bare', remote)
    git(root, 'init', '-b', 'main', source)
    git(source, 'config', 'user.email', 'fixture@example.invalid')
    git(source, 'config', 'user.name', 'Local test fixture')
    writeFileSync(join(source, 'README'), 'base')
    git(source, 'add', '.'); git(source, 'commit', '-m', 'base')
    mkdirSync(join(source, 'ops'))
    writeFileSync(join(source, 'ops/STUDIO_RESUME_ORIGINAL_SIX_20260917'), 'same approved ceiling')
    git(source, 'add', '.'); git(source, 'commit', '-m', 'approved marker')
    git(source, 'remote', 'add', 'origin', pathToFileURL(remote).href)
    git(source, 'push', 'origin', 'main')
    git(root, 'clone', '--depth=2', '--branch', 'main', pathToFileURL(remote).href, checkout)
    const parent = git(checkout, 'rev-parse', 'HEAD^1')
    const first = command(checkout, 'bash', [gate])
    assert.equal(first.status, 0, first.stderr)
    assert.equal(first.stdout.trim(), 'true')
    assert.equal(git(checkout, 'rev-parse', 'HEAD^1'), parent, 'read-only remote inspection must preserve checkout history')
    assert.equal(command(checkout, 'bash', [gate, 'current']).stdout.trim(), 'true')

    // Reproduce the deployed defect: a depth-one fetch truncates parent history.
    git(checkout, 'fetch', '--depth=1', 'origin', 'main')
    assert.notEqual(command(checkout, 'git', ['rev-parse', '--verify', 'HEAD^1']).status, 0)
    const missing = command(checkout, 'bash', [gate])
    assert.notEqual(missing.status, 0, 'missing history cannot be mistaken for a successful skipped marker')
    assert.notEqual(missing.stdout.trim(), 'false')

    writeFileSync(join(source, 'README'), 'newer unrelated documentation')
    git(source, 'add', '.'); git(source, 'commit', '-m', 'newer main')
    git(source, 'push', 'origin', 'main')
    const stale = command(checkout, 'bash', [gate])
    assert.equal(stale.status, 0, stale.stderr)
    assert.equal(stale.stdout.trim(), 'false', 'an obsolete release cannot deploy')

    const latest = join(root, 'latest')
    git(root, 'clone', '--depth=2', '--branch', 'main', pathToFileURL(remote).href, latest)
    assert.equal(command(latest, 'bash', [gate]).stdout.trim(), 'false', 'unrelated commits cannot re-arm the marker')
    assert.equal(command(latest, 'bash', [gate, 'current']).stdout.trim(), 'true')
  } finally { rmSync(root, { recursive: true, force: true }) }
  // All remotes are local file:// fixtures. No GitHub, Oracle or AI request.
})
