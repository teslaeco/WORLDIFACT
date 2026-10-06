import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { setImmediate as nextTick } from 'node:timers/promises'
import { exportBlueprintGlb } from '../src/lib/blueprintExport.ts'
import { inspectGLB } from '../src/lib/glb.ts'
import { saveBlueprintModel, saveStudioModel, listStudioModels, readStudioModel, STUDIO_ARCHIVE_SIGNAL_KEY } from '../src/lib/studioArchive.ts'
import { archiveStorage, generation } from './studio-archive-helper.mjs'

const prompt = '  Original private prompt\nBlue roof\tFour reference views  '

test('real SOL/LUNA/ASTRA procedural exports save exact original bytes and complete provenance locally', async () => {
  const f = archiveStorage()
  try {
    for (const model of ['gpt-6-sol', 'gpt-6.1-sol', 'gpt-6-luna', 'gpt-6-astra']) {
      const result = generation(model), original = structuredClone(result), buffer = await exportBlueprintGlb(result.blueprint)
      assert.ok(inspectGLB(buffer).triangles > 0)
      const blob = new Blob([buffer], { type: 'model/gltf-binary' }), entry = await saveBlueprintModel(result, prompt, blob)
      assert.match(entry.id, /^blueprint:[a-f0-9]{64}$/)
      assert.equal(entry.id, `blueprint:${createHash('sha256').update(result.requestId).digest('hex')}`)
      assert.equal(entry.source, 'blueprint'); assert.deepEqual(entry.generation, original); assert.equal(entry.prompt, prompt)
      assert.equal(entry.sha256, createHash('sha256').update(new Uint8Array(buffer)).digest('hex'))
      assert.equal(entry.byteLength, buffer.byteLength); assert.equal(entry.review, 'UNREVIEWED')
      for (const absent of ['receipt', 'ticket', 'accountVerified', 'owner', 'generationProfile']) assert.equal(Object.hasOwn(entry, absent), false)
      const saved = await readStudioModel(entry.id)
      assert.equal(saved.type, blob.type); assert.deepEqual(await saved.arrayBuffer(), buffer)
      result.blueprint.title = 'Later edit must not rewrite provenance'
      assert.deepEqual((await listStudioModels()).find(item => item.id === entry.id).generation, original)
    }
    assert.equal((await listStudioModels()).length, 4)
    assert.equal(f.events.length, 4); assert.ok(f.signals.every(item => item.key === STUDIO_ARCHIVE_SIGNAL_KEY))
  } finally { f.close() }
})

test('concurrent remount/recovery deduplicates the request and retains original prompt, evidence, bytes and timestamp', async () => {
  const f = archiveStorage(), result = generation(), blob = new Blob([await exportBlueprintGlb(result.blueprint)])
  try {
    const original = await saveBlueprintModel(result, prompt, blob)
    const reordered = Object.fromEntries(Object.entries(structuredClone(result)).reverse())
    const retained = await Promise.all(Array.from({ length: 4 }, () => saveBlueprintModel(reordered, 'Recovered account result. Original description unavailable here.', blob)))
    assert.ok(retained.every(entry => JSON.stringify(entry) === JSON.stringify(original)))
    assert.equal(f.stores.get('metadata').size, 1); assert.equal(f.stores.get('models').size, 1)
    assert.deepEqual(await (await readStudioModel(original.id)).arrayBuffer(), await blob.arrayBuffer())
    const changed = structuredClone(result); changed.evidence.providerResponseId = 'resp_other'
    await assert.rejects(saveBlueprintModel(changed, prompt, blob), /generation evidence.*not overwritten/)
    await assert.rejects(saveBlueprintModel(result, prompt, new Blob(['different bytes'])), /not overwritten/)
    assert.deepEqual((await listStudioModels())[0], original)
  } finally { f.close() }
})

test('legacy detailed archive entries and profiles survive exact-byte retries without new provenance claims', async () => {
  const f = archiveStorage(), id = '11111111-1111-4111-8111-111111111111', blob = new Blob(['legacy exact bytes'])
  try {
    const legacy = { id, prompt: 'Original detailed model', savedAt: '2026-01-01T00:00:00.000Z', byteLength: blob.size, sha256: createHash('sha256').update('legacy exact bytes').digest('hex'), review: 'UNREVIEWED', generationProfile: 'fast-draft-v1' }
    f.stores.get('metadata').set(id, legacy); f.stores.get('models').set(id, blob)
    const entry = await saveStudioModel({ receipt: { id }, prompt: 'Changed display prompt' }, blob)
    assert.deepEqual(entry, legacy); assert.equal(Object.hasOwn(entry, 'source'), false)
    await saveBlueprintModel(generation('gpt-6-astra', id), prompt, new Blob(['local procedural bytes']))
    assert.equal((await listStudioModels()).length, 2)
    assert.deepEqual(await (await readStudioModel(id)).arrayBuffer(), await blob.arrayBuffer())
  } finally { f.close() }
})

test('quota failure rolls back both new records, preserves older originals and emits no false saved event', async () => {
  const f = archiveStorage(), first = generation(), blob = new Blob(['first original'])
  try {
    const prior = await saveBlueprintModel(first, prompt, blob)
    f.failWrites()
    await assert.rejects(saveBlueprintModel(generation('gpt-6-luna'), prompt, new Blob(['second'])), /could not be saved.*no older models were deleted/)
    assert.deepEqual(await listStudioModels(), [prior]); assert.equal(f.stores.get('models').size, 1); assert.equal(f.events.length, 1)
    f.failWrites(false)
    await saveBlueprintModel(generation('gpt-6-luna'), prompt, new Blob(['second']))
    assert.equal((await listStudioModels()).length, 2); assert.equal(f.events.length, 2)
  } finally { f.close() }
})

test('explicit storage cancellation and invalid or empty generation cannot create archive metadata', async () => {
  const f = archiveStorage(), controller = new AbortController()
  try {
    f.pauseOpen()
    const saving = saveBlueprintModel(generation(), prompt, new Blob(['original']), controller.signal)
    await nextTick(); controller.abort(); f.resumeOpen()
    await assert.rejects(saving, /abort/i)
    const invalid = { ...generation(), mode: 'DEMO', provenance: 'MOCK', model: null }; delete invalid.evidence; delete invalid.delivery
    await assert.rejects(saveBlueprintModel(invalid, prompt, new Blob(['demo'])), /successful LIVE/)
    await assert.rejects(saveBlueprintModel({ ...generation(), model: 'unrecognized-model' }, prompt, new Blob(['invalid'])), /provenance/)
    await assert.rejects(saveBlueprintModel(generation(), prompt, new Blob([])), /empty/)
    assert.equal(f.stores.get('metadata').size, 0); assert.equal(f.events.length, 0)
  } finally { f.close() }
})
