import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const profile = JSON.parse(await readFile(new URL('../deploy/runpod/profile.example.json', import.meta.url), 'utf8'))

test('RunPod GPU must remain fully off when no WORLDIFACT generation job is queued', () => {
  assert.equal(profile.revision, 'worldifact-runpod-flex-profile-v1')
  assert.equal(profile.endpointType, 'queue-based')
  assert.equal(profile.activeWorkers, 0, '24/7 Active workers are prohibited')
  assert.equal(profile.idleTimeoutSeconds, 5, 'idle GPU must scale down promptly')
})

test('one generation worker maximum, without idle prewarm or surprise upgrades', () => {
  assert.equal(profile.maxWorkers, 1, 'must cap to one concurrent billed GPU worker')
  assert.equal(profile.gpusPerWorker, 1)
  assert.equal(profile.handlerConcurrency, 1)
  assert.equal(profile.automaticUpgrade, false)
})

test('profile is a nonprovisioning checklist; no silently selected paid GPU', () => {
  assert.equal(profile.status, 'NOT_PROVISIONED')
  assert.equal(profile.nativeRuntimeVerified, false)
  assert.equal(profile.selectedGpu, null)
  assert.equal(profile.imageDigest, null)
  assert.equal(profile.verifiedRateMicroUsdPerSecond, null)
})
