import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { lstat, readFile, readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { OWNER_MODELS, readOwnerModel } from '../src/lib/ownerShowcase.ts'
import { inspectEmbeddedGlb } from '../src/lib/softwareModelPreview.ts'

export async function verifyOwnerShowcase(root = 'dist') {
  const directory = join(root, 'owner-models')
  assert.ok((await lstat(directory)).isDirectory())
  assert.deepEqual((await readdir(directory)).sort(), OWNER_MODELS.map(model => model.path.split('/').at(-1)).sort())
  for (const model of OWNER_MODELS) {
    const path = join(root, model.path.slice(1))
    assert.ok((await lstat(path)).isFile())
    const bytes = await readFile(path)
    assert.equal(bytes.length, model.bytes)
    assert.equal(createHash('sha256').update(bytes).digest('hex'), model.sha256)
    const blob = await readOwnerModel(model, new AbortController().signal, async () => new Response(bytes))
    const { json } = inspectEmbeddedGlb(await blob.arrayBuffer())
    assert.equal(json.images.length, 2)
    const triangles = json.meshes.reduce((sum, mesh) => sum + mesh.primitives.reduce((n, primitive) => n + json.accessors[primitive.indices].count / 3, 0), 0)
    assert.equal(triangles, model.triangles)
  }
  const renders = JSON.parse(await readFile('docs/OWNER_MODEL_RENDER_PROVENANCE_20261017.json', 'utf8')).renders
  const names = OWNER_MODELS.flatMap(model => ['three_quarter', 'front', 'side', 'back'].map(view => `${model.id}-${view}.jpg`))
  assert.deepEqual(renders.map(render => render.path).sort(), names.map(name => `public/owner-model-renders/${name}`).sort())
  assert.deepEqual((await readdir(join(root, 'owner-model-renders'))).sort(), names.sort())
  for (const render of renders) {
    const path = join(root, render.path.slice('public/'.length))
    assert.ok((await lstat(path)).isFile())
    const bytes = await readFile(path)
    assert.equal(bytes.length, render.bytes)
    assert.equal(createHash('sha256').update(bytes).digest('hex'), render.sha256)
    assert.equal(bytes.readUInt16BE(0), 0xffd8)
  }
  return { models: OWNER_MODELS.length, exactCorrectedBytes: true, embeddedTextures: true, verifiedSavedRenders: renders.length }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await verifyOwnerShowcase(process.argv[2] || 'dist')))
}
