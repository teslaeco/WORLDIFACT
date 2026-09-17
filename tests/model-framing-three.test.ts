import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PerspectiveCamera, Vector3 } from 'three'
import { frameModel, type ModelBounds, type ModelView } from '../src/lib/modelFraming.ts'

// CPU-side projection tests; no WebGL renderer, browser or paid model generation.
test('actual Three camera projects every framed corner inside the clip volume', () => {
  for (const scale of [1e-7, 0.1, 1, 1e7]) for (const aspect of [0.03, 0.5625, 1, 1.777, 5]) {
    const bounds: ModelBounds = { min: [-0.5 * scale, 0, -0.2 * scale], max: [0.5 * scale, 1.65 * scale, 0.2 * scale] }
    for (const view of ['all', 'front', 'left', 'right', 'back', 'face', 'clothes', 'shoes'] as ModelView[]) {
      const frame = frameModel(bounds, aspect, 40, view, true)
      const camera = new PerspectiveCamera(40, aspect, frame.near, frame.far)
      camera.position.set(...frame.position)
      camera.lookAt(...frame.target)
      camera.updateProjectionMatrix()
      camera.updateMatrixWorld(true)
      for (const x of [frame.bounds.min[0], frame.bounds.max[0]]) for (const y of [frame.bounds.min[1], frame.bounds.max[1]]) for (const z of [frame.bounds.min[2], frame.bounds.max[2]]) {
        const point = new Vector3(x, y, z).project(camera)
        assert.ok(point.toArray().every(Number.isFinite))
        assert.ok(Math.abs(point.x) <= 1 / 1.12 + 1e-6 && Math.abs(point.y) <= 1 / 1.12 + 1e-6, `${view}/${aspect}/${scale}`)
        assert.ok(point.z > -1 && point.z < 1)
      }
    }
  }
})

test('model fit honours effective FOV when the camera already has a zoom factor', () => {
  const bounds: ModelBounds = { min: [-1, -2, -0.5], max: [1, 2, 0.5] }
  const camera = new PerspectiveCamera(40, 0.5)
  camera.zoom = 2
  const frame = frameModel(bounds, camera.aspect, camera.getEffectiveFOV(), 'front')
  camera.near = frame.near; camera.far = frame.far
  camera.position.set(...frame.position); camera.lookAt(...frame.target)
  camera.updateProjectionMatrix(); camera.updateMatrixWorld(true)
  for (const x of [-1, 1]) for (const y of [-2, 2]) for (const z of [-0.5, 0.5]) {
    const point = new Vector3(x, y, z).project(camera)
    assert.ok(Math.abs(point.x) < 1 && Math.abs(point.y) < 1 && Math.abs(point.z) < 1)
  }
})
