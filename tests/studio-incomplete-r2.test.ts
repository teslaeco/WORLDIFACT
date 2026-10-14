import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detailedGLBFixture } from './detailed-studio-fixture.ts'
import {
  MAX_INCOMPLETE_R2_GLB_BYTES, incompleteBackupEnabled, readRetainedIncompleteBackup,
  preserveRetainedIncompleteBackup, type IncompleteGlbR2Bucket,
} from '../server/studioIncompleteR2.ts'

const ALICE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const BOB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const JOB = 'c5555555-1111-4111-8111-222222222222'
const hex = (bytes: ArrayBuffer) => Buffer.from(bytes).toString('hex')
const sha = async (bytes: ArrayBuffer) => hex(await crypto.subtle.digest('SHA-256', bytes))

function privateBucket() {
  const stored = new Map<string, { bytes: Uint8Array; metadata: Record<string, string> }>()
  const stats = { gets: 0, puts: 0 }
  const bucket: IncompleteGlbR2Bucket = {
    async get(key) {
      stats.gets++
      const entry = stored.get(key)
      if (!entry) return null
      return {
        size: entry.bytes.byteLength, customMetadata: { ...entry.metadata },
        async arrayBuffer() { return entry.bytes.slice().buffer },
      }
    },
    async put(key, buffer, options) {
      stats.puts++
      assert.equal(await sha(buffer), options.sha256, 'R2 integrity header is bound to actual original GLB')
      assert.equal(options.httpMetadata.contentType, 'model/gltf-binary')
      stored.set(key, { bytes: new Uint8Array(buffer.slice(0)), metadata: { ...options.customMetadata } })
      return { size: buffer.byteLength }
    },
  }
  return { bucket, stored, stats }
}

test('off by default: unconfigured storage never performs any private bucket request', async () => {
  const buffer = detailedGLBFixture().buffer
  const digest = await sha(buffer)
  const bucket = privateBucket()
  const env = { INCOMPLETE_GLB_BACKUP: bucket.bucket }
  assert.equal(incompleteBackupEnabled(env), false)
  assert.equal(await preserveRetainedIncompleteBackup(env, ALICE, JOB, digest, buffer), false)
  assert.equal(await readRetainedIncompleteBackup(env, ALICE, JOB, digest), null)
  assert.deepEqual(bucket.stats, { gets: 0, puts: 0 })
})

test('original geometry is stored privately, reread, sha-bound and idempotent without a generation', async () => {
  const bucket = privateBucket()
  const env = { ENABLE_INCOMPLETE_R2_BACKUP: 'true', INCOMPLETE_GLB_BACKUP: bucket.bucket }
  const buffer = detailedGLBFixture().buffer
  const digest = await sha(buffer)
  assert.equal(await preserveRetainedIncompleteBackup(env, ALICE, JOB, digest, buffer), true)
  assert.equal(bucket.stats.puts, 1)
  assert.deepEqual(Buffer.from((await readRetainedIncompleteBackup(env, ALICE, JOB, digest))!),
    Buffer.from(buffer))
  assert.equal(await preserveRetainedIncompleteBackup(env, ALICE, JOB, digest, buffer), true)
  assert.equal(bucket.stats.puts, 1, 'Same signed job and same checksum must not cause a duplicate write')
  assert.equal(await readRetainedIncompleteBackup(env, BOB, JOB, digest), null,
    'Different account cannot address the owner-scoped storage key')
  assert.ok([...bucket.stored.keys()][0].includes(ALICE + '/' + JOB + '/' + digest))
})

test('R2 backup cannot return changed bytes or forged ownership metadata', async () => {
  const bucket = privateBucket(), env = { ENABLE_INCOMPLETE_R2_BACKUP: 'true', INCOMPLETE_GLB_BACKUP: bucket.bucket }
  const buffer = detailedGLBFixture().buffer, digest = await sha(buffer)
  assert.equal(await preserveRetainedIncompleteBackup(env, ALICE, JOB, digest, buffer), true)
  const entry = [...bucket.stored.values()][0]
  entry.bytes[entry.bytes.byteLength - 1] ^= 1
  await assert.rejects(readRetainedIncompleteBackup(env, ALICE, JOB, digest), /SHA-256/)
  await assert.rejects(preserveRetainedIncompleteBackup(env, ALICE, JOB, digest, buffer), /SHA-256/,
    'Corrupt existing archive must not silently be overwritten')
  assert.equal(bucket.stats.puts, 1)
  entry.bytes[entry.bytes.byteLength - 1] ^= 1
  entry.metadata.owner = BOB
  await assert.rejects(readRetainedIncompleteBackup(env, ALICE, JOB, digest), /metadata/)
})

test('invalid ownership identifiers, source checksum, absent readback and oversize are never certified', async () => {
  const bucket = privateBucket(), env = { ENABLE_INCOMPLETE_R2_BACKUP: 'true', INCOMPLETE_GLB_BACKUP: bucket.bucket }
  const buffer = detailedGLBFixture().buffer, digest = await sha(buffer)
  await assert.rejects(readRetainedIncompleteBackup(env, '../other', JOB, digest), /Invalid owner/)
  await assert.rejects(preserveRetainedIncompleteBackup(env, ALICE, JOB, 'bad-hash', buffer), /Invalid owner|SHA-256/)
  await assert.rejects(preserveRetainedIncompleteBackup(env, ALICE, JOB, 'f'.repeat(64), buffer), /SHA-256/)
  assert.equal(await preserveRetainedIncompleteBackup(env, ALICE, JOB, digest,
    new ArrayBuffer(MAX_INCOMPLETE_R2_GLB_BYTES + 1)), false)
  assert.equal(bucket.stats.puts, 0)
  let put = 0
  const vanishing: IncompleteGlbR2Bucket = {
    async get() { return null },
    async put(_key, value) { put++; return { size: value.byteLength } },
  }
  await assert.rejects(
    preserveRetainedIncompleteBackup({ ENABLE_INCOMPLETE_R2_BACKUP: 'true', INCOMPLETE_GLB_BACKUP: vanishing },
      ALICE, JOB, digest, buffer),
    /readback was unavailable/)
  assert.equal(put, 1)
})
