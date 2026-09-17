export type Point3 = readonly [number, number, number]
export type ModelBounds = { min: Point3; max: Point3 }
export type ModelView = 'all' | 'front' | 'left' | 'right' | 'back' | 'face' | 'clothes' | 'shoes'
export type ModelFrame = {
  target: Point3; position: Point3; direction: Point3; right: Point3; up: Point3
  near: number; far: number; minDistance: number; maxDistance: number; distance: number
  bounds: ModelBounds
}
const dot = (a: Point3, b: Point3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const sub = (a: Point3, b: Point3): Point3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const cross = (a: Point3, b: Point3): Point3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const unit = (v: Point3): Point3 => { const length = Math.hypot(...v); return [v[0] / length, v[1] / length, v[2] / length] }
const middle = (b: ModelBounds): Point3 => [0, 1, 2].map(i => b.min[i] / 2 + b.max[i] / 2) as [number, number, number]
function corners(b: ModelBounds): Point3[] {
  const result: Point3[] = []
  for (const x of [b.min[0], b.max[0]]) for (const y of [b.min[1], b.max[1]]) for (const z of [b.min[2], b.max[2]]) result.push([x, y, z])
  return result
}
const directions: Record<ModelView, Point3> = {
  all: [0.55, 0.18, 1.7], front: [0, 0, 1], left: [-1, 0, 0], right: [1, 0, 0],
  back: [0, 0, -1], face: [0.12, 0, 1], clothes: [0.25, 0.08, 1], shoes: [0.2, 0.45, 1],
}

/** Fit an authored bounds region; never scale geometry or change material/UV data.
 * Uses the vertical FOV and aspect, then checks all eight bounds corners.
 * Detail regions are heuristics for upright +Y characters, not anatomical detection.
 */
export function frameModel(source: ModelBounds, aspect: number, fovDegrees = 40, view: ModelView = 'all', person = false): ModelFrame {
  const values = [...source.min, ...source.max]
  if (source.min.length !== 3 || source.max.length !== 3 || !values.every(Number.isFinite) || [0, 1, 2].some(i => source.min[i] > source.max[i])) throw new Error('Model bounds must be finite and ordered.')
  if (!Number.isFinite(aspect) || aspect <= 0 || !Number.isFinite(fovDegrees) || fovDegrees <= 0 || fovDegrees >= 180) throw new Error('Camera aspect and field of view are invalid.')
  if (!Object.hasOwn(directions, view)) throw new Error('Unknown model view.')
  const size = sub(source.max, source.min), scale = Math.max(...size)
  if (!Number.isFinite(scale) || scale <= 0) throw new Error('Model bounds have no usable extent.')
  const min: [number, number, number] = [...source.min], max: [number, number, number] = [...source.max]
  if (person && ['face', 'clothes', 'shoes'].includes(view)) {
    const [low, high, breadth] = view === 'face' ? [0.8, 1, 0.38] : view === 'shoes' ? [0, 0.2, 0.85] : [0.38, 0.84, 1]
    const center = middle(source)
    min[1] = source.min[1] + size[1] * low; max[1] = source.min[1] + size[1] * high
    min[0] = center[0] - size[0] * breadth / 2; max[0] = center[0] + size[0] * breadth / 2
  }
  const bounds = { min, max }, target = middle(bounds)
  const direction = unit(directions[view]), right = unit(cross([0, 1, 0], direction)), up = unit(cross(direction, right))
  const tanV = Math.tan(fovDegrees * Math.PI / 360), tanH = tanV * aspect
  const padding = 1.12
  const focusScale = Math.max(...sub(max, min), scale * 1e-6)
  let distance = focusScale * 0.05
  for (const point of corners(bounds)) {
    const offset = sub(point, target), depth = dot(offset, direction)
    distance = Math.max(distance, depth + padding * Math.abs(dot(offset, right)) / tanH,
      depth + padding * Math.abs(dot(offset, up)) / tanV, depth + focusScale * 0.02)
  }
  const position: Point3 = [target[0] + direction[0] * distance, target[1] + direction[1] * distance, target[2] + direction[2] * distance]
  const minDistance = Math.min(distance * 0.5, focusScale * 0.05)
  // A fixed scale * 12 cap previously undid the fit on very narrow viewports.
  const maxDistance = Math.max(scale * 12, distance * 4)
  const radius = Math.max(...corners(source).map(point => Math.hypot(...sub(point, target))))
  const near = minDistance / 100, far = maxDistance + radius * 1.1
  if (![...target, ...position, distance, near, far, minDistance, maxDistance].every(Number.isFinite) || near <= 0 || far <= near) throw new Error('Model extent cannot be framed safely.')
  return { target, position, direction, right, up, distance, near, far, minDistance, maxDistance, bounds }
}
