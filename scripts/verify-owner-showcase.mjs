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
  return { models: OWNER_MODELS.length, exactCorrectedBytes: true, embeddedTextures: true }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await verifyOwnerShowcase(process.argv[2] || 'dist')))
}
