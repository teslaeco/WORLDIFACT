import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { hasStudioArtifactHeader, validateStudioArtifactHeader, type StudioArtifactFormat } from '../src/lib/studioArtifact.ts'

test('real repository GLB, FBX and texture archives have recognized content', async () => {
  for (const [format, suffix] of [['model', 'glb'], ['fbx', 'fbx'], ['pbr', 'textures.zip']] as const) {
    const file = await readFile(new URL('../public/world-assets/giant-building/terrace-tower-e7e96cc3.' + suffix, import.meta.url))
    assert.ok(hasStudioArtifactHeader(format, file.subarray(0, 1024), file.length), format)
    await validateStudioArtifactHeader(format, new Blob([file]))
  }
})

test('HTTP 200 HTML, JSON, empty and wrong-format payloads never become model downloads', async () => {
  for (const format of ['model', 'fbx', 'blend', 'pbr'] as StudioArtifactFormat[])
    for (const text of ['', '<html>worker error</html>', '{"error":"export failed"}', 'arbitrary data'])
      await assert.rejects(validateStudioArtifactHeader(format, new Blob([text])), /does not match/)
  await assert.rejects(validateStudioArtifactHeader('blend', new Blob(['; FBX 7.4.0 project file\nFBXHeaderExtension: {\n}'])), /does not match/)
})

test('Blender headers and supported compressed envelopes are recognized without claiming full decoding', () => {
  for (const endian of ['v', 'V']) for (const pointer of ['_', '-']) {
    const bytes = new TextEncoder().encode(`BLENDER${pointer}${endian}405DATA`)
    assert.equal(hasStudioArtifactHeader('blend', bytes, bytes.length), true)
  }
  assert.equal(hasStudioArtifactHeader('blend', new TextEncoder().encode('BLENDER?xBADxxx'), 14), false)
  for (const prefix of [[31, 139, 8], [40, 181, 47, 253]]) {
    const bytes = new Uint8Array(32); bytes.set(prefix)
    assert.equal(hasStudioArtifactHeader('blend', bytes, bytes.length), true)
  }
})

test('truncated, wrong-version and wrong-length GLB containers are refused', () => {
  const bytes = new Uint8Array(24), view = new DataView(bytes.buffer)
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, 24, true)
  assert.equal(hasStudioArtifactHeader('model', bytes, 24), true)
  assert.equal(hasStudioArtifactHeader('model', bytes.subarray(0, 11), 24), false)
  assert.equal(hasStudioArtifactHeader('model', bytes, 25), false)
  view.setUint32(4, 1, true)
  assert.equal(hasStudioArtifactHeader('model', bytes, 24), false)
})
