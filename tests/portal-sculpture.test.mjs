import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import * as THREE from 'three'
import { loadPortalSculpture, clonePortalSculpture, rotatePortalSculpture, PORTAL_SCULPTURE_URL, SCULPTURE_CYCLE_SECONDS } from '../src/lib/portalSculpture.ts'

const assetPath = new URL('../public/world-assets/polyhedron-led.gltf', import.meta.url)
const manifestPath = new URL('../public/world-assets/polyhedron-led.provenance.json', import.meta.url)
const sha = value => createHash('sha256').update(value).digest('hex')

test('Bundled LED sculpture retains every reviewed accessor, mesh and node transform without texture/external dependencies', async () => {
  const bytes = await readFile(assetPath), asset = JSON.parse(bytes), proof = JSON.parse(await readFile(manifestPath, 'utf8'))
  assert.equal(proof.sourceSha256, 'c0b756d4c92744189a4161f19bbf5b3c7629de30a1196a09f05c1ed94276749a')
  assert.equal(proof.sourceBytes, 9807116)
  assert.equal(bytes.length, proof.assetBytes)
  assert.equal(sha(bytes), proof.assetSha256)
  assert.equal(asset.meshes.length, 48)
  assert.equal(asset.nodes.length, 49)
  assert.equal(asset.accessors.length, 192)
  assert.equal(proof.triangles, 2976)
  assert.equal(sha(JSON.stringify(asset.meshes)), proof.meshDefinitionSha256)
  assert.equal(sha(JSON.stringify(asset.nodes)), proof.nodeDefinitionSha256)
  assert.equal(sha(JSON.stringify(asset.scenes)), proof.sceneDefinitionSha256)
  assert.equal(asset.images, undefined)
  assert.equal(asset.textures, undefined)
  assert.equal(asset.extensionsRequired, undefined)
  assert.equal(asset.buffers.length, 1)
  assert.match(asset.buffers[0].uri, /^data:application\/octet-stream;base64,/)
  const binary = Buffer.from(asset.buffers[0].uri.split(',')[1], 'base64')
  assert.equal(binary.length, asset.buffers[0].byteLength)
  assert.equal(sha(binary), proof.geometryBufferSha256)
  for (let i = 0; i < asset.accessors.length; i++) {
    const { bufferView, ...definition } = asset.accessors[i], view = asset.bufferViews[bufferView]
    assert.deepEqual(definition, proof.accessors[i].definition, `Original accessor ${i} definition changed`)
    assert.equal(sha(binary.subarray(view.byteOffset, view.byteOffset + view.byteLength)), proof.accessors[i].viewSha256, `Original accessor ${i} bytes changed`)
  }
  assert.ok(bytes.length < 250000, 'Decorative geometry must remain small enough for the login screen')
})

test('The actual GLTF loader parses the bundled model, retains 48 open-frame meshes and rotates XYZ in five seconds', async () => {
  const originalFetch = globalThis.fetch, originalProgressEvent = globalThis.ProgressEvent
  const requests = []
  globalThis.ProgressEvent = class extends Event { constructor(type, values) { super(type); Object.assign(this, values) } }
  globalThis.fetch = async (input, init) => {
    const url = String(input instanceof Request ? input.url : input)
    requests.push(url)
    if (url === PORTAL_SCULPTURE_URL) return new Response(await readFile(assetPath), { headers: { 'Content-Type': 'model/gltf+json' } })
    assert.ok(url.startsWith('data:'), 'The sculpture must never request an external runtime asset')
    return originalFetch(input, init)
  }
  try {
    const model = await loadPortalSculpture(undefined, 3.35), meshes = []
    model.traverse(node => { if (node.isMesh) meshes.push(node) })
    assert.equal(meshes.length, 48)
    assert.equal(meshes.reduce((sum, mesh) => sum + mesh.geometry.index.count / 3, 0), 2976)
    assert.equal(meshes.every(mesh => mesh.userData.no_fill_panels === true), true)
    assert.equal(requests[0], '/world-assets/polyhedron-led.gltf')
    const extent = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3())
    assert.ok(Math.abs(Math.max(extent.x, extent.y, extent.z) - 3.35) < 1e-6)
    rotatePortalSculpture(model, 0); const start = model.rotation.clone()
    rotatePortalSculpture(model, 1.25)
    for (const axis of ['x', 'y', 'z']) assert.ok(Math.abs(model.rotation[axis] - start[axis] - Math.PI / 2) < 1e-8)
    rotatePortalSculpture(model, SCULPTURE_CYCLE_SECONDS)
    assert.deepEqual(model.rotation.toArray(), start.toArray())
    const clone = clonePortalSculpture(model, ['#ff4777', '#cc66ff']), copies = []
    clone.traverse(node => { if (node.isMesh) copies.push(node) })
    assert.equal(copies.length, 48)
    assert.equal(copies[0].geometry, meshes[0].geometry)
    assert.notEqual(copies[0].material, meshes[0].material)
    assert.equal(copies[0].material.color.getHexString(), 'ff4777')
  } finally {
    globalThis.fetch = originalFetch
    if (originalProgressEvent) globalThis.ProgressEvent = originalProgressEvent
    else delete globalThis.ProgressEvent
  }
})

test('No-WebGL poster is a pinned projection of the complete original mesh', async () => {
  const poster = await readFile(new URL('../public/world-assets/polyhedron-led-poster.svg', import.meta.url), 'utf8')
  const proof = JSON.parse(await readFile(manifestPath, 'utf8'))
  assert.equal(sha(poster), proof.posterSha256)
  assert.equal((poster.match(/<polygon /g) ?? []).length, proof.triangles)
  assert.match(poster, /Static view of the original FORGE open-frame polyhedron/)
  assert.doesNotMatch(poster, /<script|<image|foreignObject|href=/i)
})
