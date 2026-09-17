import { test } from 'node:test'
import assert from 'node:assert/strict'
import { frameModel, type ModelBounds, type ModelFrame, type ModelView } from '../src/lib/modelFraming.ts'

const person: ModelBounds = { min: [-0.45, 0, -0.2], max: [0.45, 1.65, 0.2] }
const dot = (a: readonly number[], b: readonly number[]) => a.reduce((sum, v, i) => sum + v * b[i], 0)
function projectedExtent(frame: ModelFrame, aspect: number, fov = 40) {
  let largest = 0
  for (const x of [frame.bounds.min[0], frame.bounds.max[0]]) for (const y of [frame.bounds.min[1], frame.bounds.max[1]]) for (const z of [frame.bounds.min[2], frame.bounds.max[2]]) {
    const offset = [x - frame.position[0], y - frame.position[1], z - frame.position[2]]
    const depth = -dot(offset, frame.direction)
    assert.ok(depth > frame.near && depth < frame.far, `clipped corner, depth=${depth}`)
    const v = Math.tan(fov * Math.PI / 360)
    largest = Math.max(largest, Math.abs(dot(offset, frame.right) / (depth * v * aspect)), Math.abs(dot(offset, frame.up) / (depth * v)))
  }
  return largest
}

test('all review views keep their complete bounds inside portrait, landscape and narrow viewports', () => {
  const views: ModelView[] = ['all', 'front', 'left', 'right', 'back', 'face', 'clothes', 'shoes']
  const shapes: ModelBounds[] = [person, { min: [-8, -0.1, -0.1], max: [8, 0.1, 0.1] }, { min: [0, 0, 0], max: [2, 2, 0] }]
  for (const shape of shapes) for (const aspect of [0.03, 0.25, 9 / 16, 1, 16 / 9, 5]) for (const view of views) {
    const frame = frameModel(shape, aspect, 40, view, shape === person)
    assert.ok(projectedExtent(frame, aspect) <= 1 / 1.12 + 1e-8, `${view}/${aspect}`)
    assert.ok(frame.distance >= frame.minDistance && frame.distance <= frame.maxDistance)
  }
})

test('view limits preserve the fit even when the required distance exceeds the old scale cap', () => {
  const frame = frameModel(person, 0.03, 40, 'front')
  assert.ok(frame.distance > 1.65 * 12)
  assert.ok(frame.maxDistance > frame.distance)
  assert.ok(projectedExtent(frame, 0.03) < 1)
})

test('framing is scale/translation invariant and never mutates the authored model bounds', () => {
  const serialized = JSON.stringify(person), base = frameModel(person, 0.6, 40, 'face', true)
  for (const scale of [1e-7, 0.01, 1, 1000, 1e7]) {
    const delta = [3 * scale, -9 * scale, 17 * scale]
    const transformed: ModelBounds = {
      min: person.min.map((v, i) => v * scale + delta[i]) as [number, number, number],
      max: person.max.map((v, i) => v * scale + delta[i]) as [number, number, number],
    }
    const frame = frameModel(transformed, 0.6, 40, 'face', true)
    assert.ok(Math.abs(frame.distance / scale - base.distance) < 1e-8)
    assert.ok(Math.abs(frame.near / scale - base.near) < 1e-8)
    assert.ok(projectedExtent(frame, 0.6) < 1)
  }
  assert.equal(JSON.stringify(person), serialized)
})

test('face framing can inspect detail without the old whole-body minimum distance', () => {
  const all = frameModel(person, 1, 40, 'front', true)
  const face = frameModel(person, 1, 40, 'face', true)
  assert.ok(face.distance < 1.65 * 0.8)
  assert.ok(face.distance < all.distance / 2)
  assert.ok(projectedExtent(face, 1) < 1)
  const object = frameModel(person, 1, 40, 'face', false)
  assert.deepEqual(object.bounds, person, 'untyped models must not be cropped as characters')
})

test('recomputing a selected view after rotation of the viewport fits the same source region', () => {
  for (const view of ['front', 'left', 'right', 'back', 'face'] as ModelView[]) {
    const wide = frameModel(person, 16 / 9, 40, view, true)
    const tall = frameModel(person, 9 / 16, 40, view, true)
    assert.deepEqual(tall.bounds, wide.bounds)
    assert.deepEqual(tall.direction, wide.direction)
    assert.ok(projectedExtent(tall, 9 / 16) < 1)
  }
})

test('invalid bounds and camera values are rejected rather than returning NaN transforms', () => {
  for (const aspect of [0, -1, NaN, Infinity]) assert.throws(() => frameModel(person, aspect))
  for (const fov of [0, 180, -10, NaN]) assert.throws(() => frameModel(person, 1, fov))
  for (const bad of [{ min: [0, 0, 0], max: [0, 0, 0] }, { min: [2, 0, 0], max: [1, 1, 1] }, { min: [NaN, 0, 0], max: [1, 1, 1] }] as ModelBounds[]) assert.throws(() => frameModel(bad, 1))
  assert.throws(() => frameModel(person, 1, 40, 'unknown' as ModelView))
})
